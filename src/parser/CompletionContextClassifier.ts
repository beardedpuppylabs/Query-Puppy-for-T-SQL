import type {
  DocumentSemanticModel,
  ScopedRowSource,
} from "./DocumentSemanticAnalyzer.js";
import { tokenizeSql, type SqlToken } from "./SqlTokenizer.js";

export type CompletionClause =
  | "select"
  | "where"
  | "joinOn"
  | "groupBy"
  | "having"
  | "orderBy"
  | "functionArgument"
  | "window"
  | "windowPartitionBy"
  | "windowOrderBy"
  | "unknown";

export interface JoinConditionContext {
  readonly currentRightRowSource?: ScopedRowSource;
  readonly leftVisibleRowSources: readonly ScopedRowSource[];
  readonly outerRowSources: readonly ScopedRowSource[];
  readonly visibleAtCursor: readonly ScopedRowSource[];
  readonly joinRange: { readonly start: number; readonly end: number };
  readonly conditionRange: { readonly start: number; readonly end: number };
}

export interface ClauseCompletionContext {
  readonly clause: CompletionClause;
  readonly expression: boolean;
  readonly allowProjectionAliases: boolean;
  readonly finalSetOrderBy: boolean;
  readonly join?: JoinConditionContext;
}

export interface CompletionDomainPolicy {
  readonly allowColumns: boolean;
  readonly allowRowSourceAliases: boolean;
  readonly allowScalarFunctions: boolean;
  readonly allowRowSources: boolean;
  readonly allowSchemas: boolean;
  readonly allowDatabases: boolean;
  readonly allowProcedures: boolean;
  readonly allowProjectionAliases: boolean;
}

export function completionDomainPolicy(
  context: ClauseCompletionContext,
): CompletionDomainPolicy {
  return {
    allowColumns: context.expression,
    allowRowSourceAliases: context.expression && !context.finalSetOrderBy,
    allowScalarFunctions: context.expression,
    allowRowSources: !context.expression,
    allowSchemas: !context.expression,
    allowDatabases: !context.expression,
    allowProcedures: !context.expression,
    allowProjectionAliases: context.allowProjectionAliases,
  };
}

const depths = (tokens: readonly SqlToken[]): readonly number[] => {
  let depth = 0;
  return tokens.map((token) => {
    const current = depth;
    if (token.text === "(") depth++;
    else if (token.text === ")") depth--;
    return current;
  });
};

const functionOpen = (
  tokens: readonly SqlToken[],
  start: number,
  end: number,
): number => {
  const stack: number[] = [];
  for (let i = start; i < end; i++) {
    if (tokens[i]?.text === "(") stack.push(i);
    else if (tokens[i]?.text === ")") stack.pop();
  }
  const open = stack.at(-1) ?? -1;
  if (open < 0) return -1;
  const previous = tokens[open - 1];
  return previous?.kind === "identifier" && previous.normalized !== "exists"
    ? open
    : -1;
};

export function classifyCompletionContext(
  sql: string,
  cursor: number,
  semantics: DocumentSemanticModel,
): ClauseCompletionContext {
  const scope = semantics.activeQueryScope;
  if (!scope)
    return {
      clause: "unknown",
      expression: false,
      allowProjectionAliases: false,
      finalSetOrderBy: false,
    };
  const tokens = tokenizeSql(sql);
  const tokenDepth = depths(tokens);
  const start = tokens.findIndex((token) => token.start >= scope.range.start);
  let end = tokens.findIndex((token) => token.start >= cursor);
  if (end < 0) end = tokens.length;
  const select = tokens.findIndex(
    (token, index) =>
      index >= start && index < end && token.normalized === "select",
  );
  if (select < 0)
    return {
      clause: "unknown",
      expression: false,
      allowProjectionAliases: false,
      finalSetOrderBy: false,
    };
  const functionToken = functionOpen(tokens, select + 1, end);
  const depth = tokenDepth[select] ?? 0;
  let clause: CompletionClause = "select";
  let onToken = -1;
  for (let i = select + 1; i < end; i++) {
    if ((tokenDepth[i] ?? 0) !== depth) continue;
    const word = tokens[i]?.normalized;
    if (word === "where") clause = "where";
    else if (word === "on") {
      clause = "joinOn";
      onToken = i;
    } else if (word === "having") clause = "having";
    else if (word === "group" && tokens[i + 1]?.normalized === "by")
      clause = "groupBy";
    else if (word === "order" && tokens[i + 1]?.normalized === "by") {
      clause = "orderBy";
    }
  }
  if (functionToken >= 0) {
    clause = "functionArgument";
    if (tokens[functionToken - 1]?.normalized === "over") {
      clause = "window";
      const windowDepth = (tokenDepth[functionToken] ?? 0) + 1;
      for (let index = functionToken + 1; index < end; index++) {
        if ((tokenDepth[index] ?? 0) !== windowDepth) continue;
        const word = tokens[index]?.normalized;
        if (word === "partition" && tokens[index + 1]?.normalized === "by")
          clause = "windowPartitionBy";
        else if (word === "order" && tokens[index + 1]?.normalized === "by")
          clause = "windowOrderBy";
      }
    }
  }
  const finalSetOrderBy =
    clause === "orderBy" && semantics.setQueryExpressions.length > 0;
  let join: JoinConditionContext | undefined;
  if (clause === "joinOn") {
    const onOffset = tokens[onToken]?.start ?? cursor;
    const local = semantics.visibleRowSources.filter(
      (binding) =>
        binding.scopeDistance === 0 && binding.source.origin.start < onOffset,
    );
    const currentRightRowSource = [...local]
      .filter((binding) => binding.source.origin.start < onOffset)
      .at(-1);
    join = {
      ...(currentRightRowSource ? { currentRightRowSource } : {}),
      leftVisibleRowSources: currentRightRowSource
        ? local.filter((binding) => binding !== currentRightRowSource)
        : local,
      outerRowSources: semantics.visibleRowSources.filter(
        (binding) => binding.scopeDistance > 0,
      ),
      visibleAtCursor: [
        ...local,
        ...semantics.visibleRowSources.filter(
          (binding) => binding.scopeDistance > 0,
        ),
      ],
      joinRange: {
        start: currentRightRowSource?.source.origin.start ?? onOffset,
        end: cursor,
      },
      conditionRange: {
        start: tokens[onToken]?.end ?? onOffset,
        end: cursor,
      },
    };
  }
  return {
    clause,
    expression: [
      "select",
      "where",
      "joinOn",
      "groupBy",
      "having",
      "orderBy",
      "functionArgument",
      "window",
      "windowPartitionBy",
      "windowOrderBy",
    ].includes(clause),
    allowProjectionAliases: clause === "orderBy",
    finalSetOrderBy,
    ...(join ? { join } : {}),
  };
}

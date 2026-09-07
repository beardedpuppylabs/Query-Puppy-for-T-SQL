import { normalizeName } from "../metadata/MetadataModels.js";
import { documentBatchTokenRanges } from "./BatchBoundary.js";
import {
  analyzeStatementQueryScopes,
  documentTokenDepths,
} from "./DocumentSemanticAnalyzer.js";
import { resolveLocalVariablesInBatch } from "./LocalVariableSymbols.js";
import {
  queryScopeAtOffset,
  resolveUniqueInvisibleExplicitAlias,
} from "./QueryScopeResolver.js";
import { tokenizeSql, type SqlToken } from "./SqlTokenizer.js";
import {
  documentStatementTokenRanges,
  type StatementTokenRange,
} from "./StatementBoundary.js";

export interface DocumentSemanticIssue {
  readonly code: "QP1001" | "QP1002";
  readonly severity: "error";
  readonly message: string;
  readonly range: { readonly start: number; readonly end: number };
}

const variableReferenceStatementKinds = new Set([
  "select",
  "with",
  "insert",
  "update",
  "delete",
  "merge",
  "set",
  "declare",
]);

const isModuleDefinitionBatch = (
  tokens: readonly SqlToken[],
  start: number,
  end: number,
): boolean => {
  const first = tokens[start]?.normalized;
  if (first !== "create" && first !== "alter") return false;
  for (let index = start + 1; index < end; index++) {
    const token = tokens[index];
    if (token?.text === ";" || token?.normalized === "as") return false;
    if (
      ["proc", "procedure", "function", "trigger"].includes(
        token?.normalized ?? "",
      )
    )
      return true;
  }
  return false;
};

const rangeContains = (
  outer: { readonly start: number; readonly end: number },
  inner: { readonly start: number; readonly end: number },
): boolean => outer.start <= inner.start && outer.end >= inner.end;

const isNonAliasQualifiedPath = (
  tokens: readonly SqlToken[],
  index: number,
): boolean =>
  tokens[index - 1]?.text === "." ||
  tokens[index + 3]?.text === "." ||
  tokens[index + 3]?.text === "(";

const collectInvisibleAliasIssues = (
  tokens: readonly SqlToken[],
  statement: StatementTokenRange,
  depths: readonly number[],
): readonly DocumentSemanticIssue[] => {
  const cursor = tokens[statement.end - 1]?.end;
  if (cursor === undefined) return [];
  const model = analyzeStatementQueryScopes(tokens, statement, cursor, depths);
  const sourcePaths = model.scopes.flatMap((scope) =>
    scope.localRowSources.flatMap((binding) =>
      binding.sourcePath ? [binding.sourcePath] : [],
    ),
  );
  const issues: DocumentSemanticIssue[] = [];

  for (let index = statement.start; index < statement.end - 1; index++) {
    const qualifier = tokens[index];
    if (
      qualifier?.kind !== "identifier" ||
      tokens[index + 1]?.text !== "." ||
      isNonAliasQualifiedPath(tokens, index)
    )
      continue;
    const range = { start: qualifier.start, end: qualifier.end };
    if (sourcePaths.some((sourcePath) => rangeContains(sourcePath, range)))
      continue;
    const declaration = resolveUniqueInvisibleExplicitAlias(
      model.scopes,
      queryScopeAtOffset(model.scopes, qualifier.start),
      qualifier.text,
    );
    if (!declaration) continue;
    issues.push({
      code: "QP1002",
      severity: "error",
      message: `Row-source alias '${qualifier.text}' is not visible in this query scope.`,
      range,
    });
  }
  return issues;
};

/** @internal Exposes the conservative QP1002 hot-path gate for regression tests. */
export const statementMayHaveInvisibleAliasIssue = (
  tokens: readonly SqlToken[],
  statement: StatementTokenRange,
): boolean => {
  let selectCount = 0;
  let hasQualifiedIdentifier = false;
  for (let index = statement.start; index < statement.end - 1; index++) {
    if (tokens[index]?.normalized === "select") selectCount++;
    if (tokens[index]?.kind === "identifier" && tokens[index + 1]?.text === ".")
      hasQualifiedIdentifier = true;
  }
  return selectCount > 1 && hasQualifiedIdentifier;
};

/** Finds only document-local semantic errors proven without catalog access. */
export function collectHighConfidenceDocumentIssues(
  sql: string,
): readonly DocumentSemanticIssue[] {
  const tokens = tokenizeSql(sql);
  const statements = documentStatementTokenRanges(tokens);
  const depths = documentTokenDepths(tokens);
  const declarationsFromEarlierBatches = new Set<string>();
  const issues: DocumentSemanticIssue[] = [];
  let statementIndex = 0;

  for (const batch of documentBatchTokenRanges(tokens)) {
    const batchStatements = [];
    while (
      statementIndex < statements.length &&
      (statements[statementIndex]?.start ?? tokens.length) < batch.end
    ) {
      const statement = statements[statementIndex++];
      if (
        statement &&
        statement.start >= batch.start &&
        statement.end <= batch.end
      )
        batchStatements.push(statement);
    }
    if (isModuleDefinitionBatch(tokens, batch.start, batch.end)) continue;
    const batchEnd = tokens[batch.end - 1]?.end;
    if (batchEnd === undefined) continue;
    const declarations = resolveLocalVariablesInBatch(
      tokens,
      batchEnd,
      batch,
      batchStatements,
    );
    const declarationStartByName = new Map(
      declarations.map((declaration) => [
        declaration.normalizedName,
        declaration.declaration.start,
      ]),
    );
    const declarationRanges = new Set(
      declarations.map(
        (declaration) =>
          `${String(declaration.declaration.start)}:${String(declaration.declaration.end)}`,
      ),
    );

    for (const statement of batchStatements) {
      if (
        !variableReferenceStatementKinds.has(
          tokens[statement.start]?.normalized ?? "",
        )
      )
        continue;
      for (let index = statement.start; index < statement.end; index++) {
        const token = tokens[index];
        if (
          token?.kind !== "variable" ||
          token.text.startsWith("@@") ||
          declarationRanges.has(`${String(token.start)}:${String(token.end)}`)
        )
          continue;
        const name = normalizeName(token.text);
        const declarationStart = declarationStartByName.get(name);
        if (
          (declarationStart !== undefined && declarationStart <= token.start) ||
          !declarationsFromEarlierBatches.has(name)
        )
          continue;
        issues.push({
          code: "QP1001",
          severity: "error",
          message: `Local variable '${token.text}' is not available in this GO batch.`,
          range: { start: token.start, end: token.end },
        });
      }
      if (statementMayHaveInvisibleAliasIssue(tokens, statement))
        issues.push(...collectInvisibleAliasIssues(tokens, statement, depths));
    }

    for (const declaration of declarations)
      declarationsFromEarlierBatches.add(declaration.normalizedName);
  }

  return issues.sort(
    (left, right) =>
      left.range.start - right.range.start ||
      left.range.end - right.range.end ||
      left.code.localeCompare(right.code),
  );
}

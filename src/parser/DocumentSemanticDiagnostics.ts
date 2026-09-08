import { normalizeName } from "../metadata/MetadataModels.js";
import { documentBatchTokenRanges } from "./BatchBoundary.js";
import {
  analyzeStatementQueryScopes,
  documentTokenDepths,
  type StatementQueryScopeModel,
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
  readonly code: "QP1001" | "QP1002" | "QP1003";
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
  model: StatementQueryScopeModel,
): readonly DocumentSemanticIssue[] => {
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

const collectDuplicateExplicitAliasIssues = (
  model: StatementQueryScopeModel,
): readonly DocumentSemanticIssue[] => {
  const issues: DocumentSemanticIssue[] = [];
  for (const scope of model.scopes) {
    const firstDeclarationByName = new Map<string, number>();
    for (const binding of scope.localRowSources) {
      if (!binding.explicitAlias || !binding.aliasDeclaration) continue;
      const normalizedName = normalizeName(binding.qualifier);
      if (!firstDeclarationByName.has(normalizedName)) {
        firstDeclarationByName.set(
          normalizedName,
          binding.aliasDeclaration.start,
        );
        continue;
      }
      issues.push({
        code: "QP1003",
        severity: "error",
        message: `Row-source alias '${binding.qualifier}' is declared more than once in this query scope.`,
        range: binding.aliasDeclaration,
      });
    }
  }
  return issues;
};

interface StatementAliasIssueCandidates {
  readonly invisibleAlias: boolean;
  readonly duplicateExplicitAlias: boolean;
}

const statementAliasIssueCandidates = (
  tokens: readonly SqlToken[],
  statement: StatementTokenRange,
): StatementAliasIssueCandidates => {
  let selectCount = 0;
  let hasQualifiedIdentifier = false;
  let sourceIntroducerCount = 0;
  let parenthesisDepth = 0;
  let duplicateSourceSyntaxValid = true;
  for (let index = statement.start; index < statement.end; index++) {
    const token = tokens[index];
    if (token?.normalized === "select") selectCount++;
    if (token?.kind === "identifier" && tokens[index + 1]?.text === ".")
      hasQualifiedIdentifier = true;
    if (token?.text === "(") parenthesisDepth++;
    else if (token?.text === ")") {
      if (parenthesisDepth === 0) duplicateSourceSyntaxValid = false;
      else parenthesisDepth--;
    }
    if (!["from", "join", "apply"].includes(token?.normalized ?? "")) continue;
    const source = tokens[index + 1];
    if (source?.text !== "(") {
      if (!source?.kind.match(/identifier|temp|variable/u)) {
        duplicateSourceSyntaxValid = false;
        continue;
      }
      let sourcePart = index + 1;
      while (tokens[sourcePart + 1]?.text === ".") {
        const nextPart = tokens[sourcePart + 2];
        if (
          !nextPart?.kind.match(/identifier|temp|variable/u) ||
          (nextPart.normalized === "as" && !nextPart.delimited)
        ) {
          duplicateSourceSyntaxValid = false;
          break;
        }
        sourcePart += 2;
      }
    }
    sourceIntroducerCount++;
  }
  return {
    invisibleAlias: selectCount > 1 && hasQualifiedIdentifier,
    duplicateExplicitAlias:
      duplicateSourceSyntaxValid &&
      parenthesisDepth === 0 &&
      sourceIntroducerCount > 1,
  };
};

/** @internal Exposes the conservative QP1002 hot-path gate for regression tests. */
export const statementMayHaveInvisibleAliasIssue = (
  tokens: readonly SqlToken[],
  statement: StatementTokenRange,
): boolean => statementAliasIssueCandidates(tokens, statement).invisibleAlias;

/** @internal Exposes the conservative QP1003 hot-path gate for regression tests. */
export const statementMayHaveDuplicateExplicitAliasIssue = (
  tokens: readonly SqlToken[],
  statement: StatementTokenRange,
): boolean =>
  statementAliasIssueCandidates(tokens, statement).duplicateExplicitAlias;

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
      const candidates = statementAliasIssueCandidates(tokens, statement);
      const mayHaveInvisibleAliasIssue = candidates.invisibleAlias;
      const mayHaveDuplicateAliasIssue = candidates.duplicateExplicitAlias;
      if (mayHaveInvisibleAliasIssue || mayHaveDuplicateAliasIssue) {
        const cursor = tokens[statement.end - 1]?.end;
        if (cursor === undefined) continue;
        const model = analyzeStatementQueryScopes(
          tokens,
          statement,
          cursor,
          depths,
        );
        if (mayHaveInvisibleAliasIssue)
          issues.push(...collectInvisibleAliasIssues(tokens, statement, model));
        if (mayHaveDuplicateAliasIssue)
          issues.push(...collectDuplicateExplicitAliasIssues(model));
      }
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

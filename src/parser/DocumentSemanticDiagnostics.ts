import { normalizeName } from "../metadata/MetadataModels.js";
import { documentBatchTokenRanges } from "./BatchBoundary.js";
import { resolveBatchLocalVariables } from "./LocalVariableSymbols.js";
import { tokenizeSql, type SqlToken } from "./SqlTokenizer.js";
import { documentStatementTokenRanges } from "./StatementBoundary.js";

export interface DocumentSemanticIssue {
  readonly code: "QP1001";
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

/** Finds only document-local semantic errors proven without catalog access. */
export function collectHighConfidenceDocumentIssues(
  sql: string,
): readonly DocumentSemanticIssue[] {
  const tokens = tokenizeSql(sql);
  const statements = documentStatementTokenRanges(tokens);
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
    const declarations = resolveBatchLocalVariables(tokens, batchEnd);
    const currentNames = new Set(
      declarations.map((declaration) => declaration.normalizedName),
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
        if (currentNames.has(name) || !declarationsFromEarlierBatches.has(name))
          continue;
        issues.push({
          code: "QP1001",
          severity: "error",
          message: `Local variable '${token.text}' is not available in this GO batch.`,
          range: { start: token.start, end: token.end },
        });
      }
    }

    for (const declaration of declarations)
      declarationsFromEarlierBatches.add(declaration.normalizedName);
  }

  return issues;
}

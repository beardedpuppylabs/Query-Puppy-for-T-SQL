import { tokenizeSql } from "./SqlTokenizer.js";
import {
  resolveDocumentSymbols,
  type DocumentSymbols,
  type SourceReference,
} from "./DocumentSymbols.js";

export type SqlContextKind = "rowSource" | "execute" | "expression" | "member";
export interface SqlCompletionContext {
  readonly kind: SqlContextKind;
  readonly search: string;
  readonly replacementStart: number;
  readonly qualifier?: string;
  readonly aliasSource?: SourceReference;
  readonly symbols: DocumentSymbols;
}

export function resolveSqlContext(
  sql: string,
  cursor = sql.length,
): SqlCompletionContext {
  const prefix = sql.slice(0, cursor);
  const tokens = tokenizeSql(prefix);
  const symbols = resolveDocumentSymbols(tokenizeSql(sql));
  const last = tokens.at(-1);
  const previous = tokens.at(-2);
  const beforeDot = tokens.at(-3);
  let search = "";
  let replacementStart = cursor;
  if (
    last &&
    (last.kind === "identifier" ||
      last.kind === "variable" ||
      last.kind === "temp") &&
    last.end === cursor
  ) {
    search = last.text;
    replacementStart = last.start;
  }
  const dot = search ? previous?.text === "." : last?.text === ".";
  const qualifierToken = search ? beforeDot : previous;
  if (
    dot &&
    qualifierToken &&
    (qualifierToken.kind === "identifier" ||
      qualifierToken.kind === "variable" ||
      qualifierToken.kind === "temp")
  ) {
    const qualifier = qualifierToken.text;
    const aliasSource = symbols.aliases.get(qualifier.toLowerCase());
    return {
      kind: "member",
      search,
      replacementStart,
      qualifier,
      ...(aliasSource ? { aliasSource } : {}),
      symbols,
    };
  }
  const significant = tokens.slice(0, search ? -1 : undefined).at(-1);
  const recentKeywords = tokens.slice(-8).map((token) => token.normalized);
  const execute =
    significant?.normalized === "exec" ||
    significant?.normalized === "execute" ||
    recentKeywords.at(-1) === "exec";
  if (execute) return { kind: "execute", search, replacementStart, symbols };
  const rowSource =
    ["from", "join", "apply"].includes(significant?.normalized ?? "") ||
    recentKeywords.some(
      (word, index) =>
        ["from", "join", "apply"].includes(word) &&
        !recentKeywords
          .slice(index + 1)
          .some((next) => ["where", "on", "select"].includes(next)),
    );
  return {
    kind: rowSource ? "rowSource" : "expression",
    search,
    replacementStart,
    symbols,
  };
}

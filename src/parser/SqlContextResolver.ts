import {
  resolveDocumentSymbols,
  type DocumentSymbols,
  type SourceReference,
} from "./DocumentSymbols.js";
import { tokenizeSql, type SqlToken } from "./SqlTokenizer.js";

export type SqlContextKind =
  | "rowSource"
  | "execute"
  | "expression"
  | "member"
  | "qualified"
  | "schema"
  | "unsupported";
export interface IdentifierQualifier {
  readonly parts: readonly string[];
  readonly database?: string;
  readonly schema?: string;
  readonly doubleDot: boolean;
  readonly unsupported: boolean;
}
export interface SqlCompletionContext {
  readonly kind: SqlContextKind;
  readonly baseKind: "rowSource" | "execute" | "expression";
  readonly search: string;
  readonly replacementStart: number;
  readonly qualifier?: IdentifierQualifier;
  readonly aliasSource?: SourceReference;
  readonly symbols: DocumentSymbols;
}

const isReferenceToken = (token: SqlToken | undefined): boolean =>
  token?.kind === "identifier" ||
  token?.kind === "variable" ||
  token?.kind === "temp" ||
  token?.text === ".";

export function resolveSqlContext(
  sql: string,
  cursor = sql.length,
): SqlCompletionContext {
  const prefix = sql.slice(0, cursor);
  const tokens = tokenizeSql(prefix);
  const symbols = resolveDocumentSymbols(tokenizeSql(sql));
  const last = tokens.at(-1);
  const hasSearch = Boolean(
    last &&
    (last.kind === "identifier" ||
      last.kind === "variable" ||
      last.kind === "temp") &&
    last.end === cursor,
  );
  const search = hasSearch && last ? last.text : "";
  const replacementStart = hasSearch && last ? last.start : cursor;

  let tailStart = tokens.length;
  while (tailStart > 0 && isReferenceToken(tokens[tailStart - 1])) {
    const previous = tokens[tailStart - 1];
    const current = tokens[tailStart];
    if (current && current.text !== "." && previous?.text !== ".") break;
    tailStart--;
  }
  const tail = tokens.slice(tailStart);
  const parts = referenceParts(tail);
  const baseKind = resolveBaseKind(tokens.slice(0, tailStart));
  if (parts.length > 1) {
    const unsupported = parts.length > 3;
    const doubleDot = parts.length === 3 && parts[1] === "";
    const qualifier: IdentifierQualifier = {
      parts,
      ...(parts.length === 3 ? { database: parts[0] } : {}),
      ...(parts.length === 3 ? { schema: doubleDot ? "dbo" : parts[1] } : {}),
      doubleDot,
      unsupported,
    };
    if (unsupported)
      return {
        kind: "unsupported",
        baseKind,
        search,
        replacementStart,
        qualifier,
        symbols,
      };
    if (parts.length === 2) {
      const aliasSource = symbols.aliases.get((parts[0] ?? "").toLowerCase());
      if (aliasSource)
        return {
          kind: "member",
          baseKind,
          search,
          replacementStart,
          qualifier,
          aliasSource,
          symbols,
        };
    }
    return {
      kind: "qualified",
      baseKind,
      search,
      replacementStart,
      qualifier,
      symbols,
    };
  }
  return { kind: baseKind, baseKind, search, replacementStart, symbols };
}

function referenceParts(tokens: readonly SqlToken[]): string[] {
  if (tokens.length === 0) return [];
  const parts: string[] = [];
  let current = "";
  for (const token of tokens) {
    if (token.text === ".") {
      parts.push(current);
      current = "";
    } else current = token.text;
  }
  parts.push(current);
  return parts;
}

function resolveBaseKind(
  tokens: readonly SqlToken[],
): "rowSource" | "execute" | "expression" {
  const significant = tokens.at(-1);
  const recent = tokens.slice(-10).map((token) => token.normalized);
  if (
    significant?.normalized === "exec" ||
    significant?.normalized === "execute"
  )
    return "execute";
  const rowSource =
    ["from", "join", "apply"].includes(significant?.normalized ?? "") ||
    recent.some(
      (word, index) =>
        ["from", "join", "apply"].includes(word) &&
        !recent
          .slice(index + 1)
          .some((next) => ["where", "on", "select"].includes(next)),
    );
  return rowSource ? "rowSource" : "expression";
}

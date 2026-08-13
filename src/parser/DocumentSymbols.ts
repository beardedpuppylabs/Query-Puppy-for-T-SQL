import type { ColumnMetadata } from "../metadata/MetadataModels.js";
import { normalizeName } from "../metadata/MetadataModels.js";
import type { SqlToken } from "./SqlTokenizer.js";

export interface SourceReference {
  readonly database?: string;
  readonly schema?: string;
  readonly name: string;
  readonly alias: string;
  readonly unsupported?: boolean;
}
export interface LocalSymbol {
  readonly name: string;
  readonly kind: "cte" | "variable" | "tableVariable" | "tempTable";
  readonly columns: readonly ColumnMetadata[];
}
export interface DocumentSymbols {
  readonly aliases: ReadonlyMap<string, SourceReference>;
  readonly locals: readonly LocalSymbol[];
}

const isIdentifier = (token: SqlToken | undefined): token is SqlToken =>
  token?.kind === "identifier" ||
  token?.kind === "temp" ||
  token?.kind === "variable";
export function resolveDocumentSymbols(
  tokens: readonly SqlToken[],
  cursor = Number.POSITIVE_INFINITY,
): DocumentSymbols {
  const aliases = new Map<string, SourceReference>();
  const locals: LocalSymbol[] = [];
  const localNames = new Set<string>();
  const addLocal = (symbol: LocalSymbol): void => {
    const key = normalizeName(symbol.name);
    if (!localNames.has(key)) {
      localNames.add(key);
      locals.push(symbol);
    }
  };
  let cursorDepth = 0;
  for (const token of tokens) {
    if (token.start >= cursor) break;
    if (token.text === "(") cursorDepth++;
    if (token.text === ")") cursorDepth--;
  }
  let depth = 0;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;
    if (token.text === "(") depth++;
    if (token.text === ")") depth--;
    if (token.normalized === "with" || (token.text === "," && i > 0)) {
      const name = tokens[i + 1];
      const as = tokens[i + 2];
      if (
        isIdentifier(name) &&
        as?.normalized === "as" &&
        tokens[i + 3]?.text === "("
      )
        addLocal({ name: name.text, kind: "cte", columns: [] });
    }
    if (token.normalized === "declare" && tokens[i + 1]?.kind === "variable") {
      const variable = tokens[i + 1];
      if (!variable) continue;
      const table = tokens[i + 2];
      addLocal({
        name: variable.text,
        kind: table?.normalized === "table" ? "tableVariable" : "variable",
        columns: [],
      });
    }
    if (
      (token.normalized === "create" || token.normalized === "into") &&
      tokens[i + 1]?.normalized === "table"
    ) {
      const temp = tokens[i + 2];
      if (temp?.kind === "temp")
        addLocal({ name: temp.text, kind: "tempTable", columns: [] });
    } else if (token.normalized === "into" && tokens[i + 1]?.kind === "temp")
      addLocal({
        name: tokens[i + 1]?.text ?? "",
        kind: "tempTable",
        columns: [],
      });
    if (
      token.normalized !== "from" &&
      token.normalized !== "join" &&
      token.normalized !== "apply" &&
      token.text !== ","
    )
      continue;
    if (depth > cursorDepth) continue;
    let cursor = i + 1;
    const first = tokens[cursor];
    if (!isIdentifier(first)) continue;
    const parts = [first.text];
    while (tokens[cursor + 1]?.text === "." && parts.length < 4) {
      cursor++;
      const part = tokens[cursor + 1];
      if (isIdentifier(part)) {
        parts.push(part.text);
        cursor++;
      } else parts.push("");
    }
    const unsupported = parts.length > 3;
    const database = parts.length === 3 ? parts[0] : undefined;
    const schema =
      parts.length === 2
        ? parts[0]
        : parts.length === 3
          ? parts[1] || "dbo"
          : undefined;
    const name = parts.at(-1) ?? first.text;
    if (tokens[cursor + 1]?.text === "(") {
      let depth = 0;
      do {
        cursor++;
        const current = tokens[cursor];
        if (current?.text === "(") depth++;
        if (current?.text === ")") depth--;
      } while (cursor < tokens.length && depth > 0);
    }
    if (tokens[cursor + 1]?.normalized === "as") cursor++;
    const aliasToken = tokens[cursor + 1];
    if (
      isIdentifier(aliasToken) &&
      ![
        "where",
        "join",
        "on",
        "group",
        "order",
        "cross",
        "outer",
        "left",
        "right",
        "inner",
        "full",
      ].includes(aliasToken.normalized)
    ) {
      aliases.set(aliasToken.normalized, {
        ...(database ? { database } : {}),
        ...(schema ? { schema } : {}),
        name,
        alias: aliasToken.text,
        ...(unsupported ? { unsupported: true } : {}),
      });
    }
  }
  return { aliases, locals };
}

import { normalizeName, type SqlType } from "../metadata/MetadataModels.js";
import { batchTokenRangeAtCursor } from "./BatchBoundary.js";
import type { SqlToken } from "./SqlTokenizer.js";
import { statementTokenRangeAtCursor } from "./StatementBoundary.js";

export interface LocalVariableSymbol {
  readonly name: string;
  readonly normalizedName: string;
  readonly kind: "scalar" | "table";
  readonly type?: SqlType;
  readonly declaration: { readonly start: number; readonly end: number };
}

const matching = (tokens: readonly SqlToken[], open: number): number => {
  let depth = 0;
  for (let index = open; index < tokens.length; index++) {
    if (tokens[index]?.text === "(") depth++;
    if (tokens[index]?.text === ")" && --depth === 0) return index;
  }
  return tokens.length - 1;
};

const scalarType = (
  tokens: readonly SqlToken[],
  typeIndex: number,
): SqlType | undefined => {
  const name = tokens[typeIndex];
  if (name?.kind !== "identifier") return undefined;
  let type: SqlType = { name: name.text };
  if (tokens[typeIndex + 1]?.text !== "(") return type;
  const close = matching(tokens, typeIndex + 1);
  const arguments_ = tokens.slice(typeIndex + 2, close);
  if (arguments_[0]?.normalized === "max") return { ...type, maxLength: -1 };
  const values = arguments_
    .filter((token) => token.kind === "number")
    .map((token) => Number(token.text));
  if (
    ["decimal", "numeric"].includes(name.normalized) &&
    values[0] !== undefined &&
    values[1] !== undefined
  )
    type = { ...type, precision: values[0], scale: values[1] };
  else if (
    ["datetime2", "datetimeoffset", "time"].includes(name.normalized) &&
    values[0] !== undefined
  )
    type = { ...type, scale: values[0] };
  else if (values[0] !== undefined)
    type = {
      ...type,
      maxLength: ["nchar", "nvarchar"].includes(name.normalized)
        ? values[0] * 2
        : values[0],
    };
  return type;
};

/** Returns local variables declared before the cursor in the current client batch. */
export function resolveBatchLocalVariables(
  tokens: readonly SqlToken[],
  cursor: number,
): readonly LocalVariableSymbol[] {
  const batch = batchTokenRangeAtCursor(tokens, cursor);
  const variables = new Map<string, LocalVariableSymbol>();
  for (let index = batch.start; index < batch.end; index++) {
    const declare = tokens[index];
    if (
      declare?.kind !== "identifier" ||
      declare.delimited ||
      declare.normalized !== "declare" ||
      declare.start >= cursor
    )
      continue;
    const statement = statementTokenRangeAtCursor(tokens, declare.end);
    let depth = 0;
    let expectingVariable = true;
    for (
      let part = index + 1;
      part < statement.end && (tokens[part]?.start ?? cursor) < cursor;
      part++
    ) {
      const token = tokens[part];
      if (!token) continue;
      if (token.text === "(") depth++;
      else if (token.text === ")") depth--;
      if (depth === 0 && token.text === ",") {
        expectingVariable = true;
        continue;
      }
      if (!expectingVariable || token.kind !== "variable") continue;
      const table = tokens[part + 1]?.normalized === "table";
      const type = table ? undefined : scalarType(tokens, part + 1);
      const symbol: LocalVariableSymbol = {
        name: token.text,
        normalizedName: normalizeName(token.text),
        kind: table ? "table" : "scalar",
        ...(type ? { type } : {}),
        declaration: { start: token.start, end: token.end },
      };
      if (!variables.has(symbol.normalizedName))
        variables.set(symbol.normalizedName, symbol);
      expectingVariable = false;
    }
  }
  return [...variables.values()];
}

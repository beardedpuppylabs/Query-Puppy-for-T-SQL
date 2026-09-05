import { normalizeName, type SqlType } from "../metadata/MetadataModels.js";
import { batchTokenRangeAtCursor } from "./BatchBoundary.js";
import type { SqlToken } from "./SqlTokenizer.js";
import { statementTokenRangeAtCursor } from "./StatementBoundary.js";

export interface LocalVariableSymbol {
  readonly name: string;
  readonly normalizedName: string;
  readonly kind: "scalar" | "table";
  readonly type?: SqlType;
  readonly initializer?: { readonly start: number; readonly end: number };
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

interface ScalarTypeDeclaration {
  readonly type: SqlType;
  readonly end: number;
}

const scalarType = (
  tokens: readonly SqlToken[],
  typeIndex: number,
): ScalarTypeDeclaration | undefined => {
  const name = tokens[typeIndex];
  if (name?.kind !== "identifier") return undefined;
  let type: SqlType = { name: name.text };
  if (tokens[typeIndex + 1]?.text !== "(") return { type, end: typeIndex + 1 };
  const close = matching(tokens, typeIndex + 1);
  const arguments_ = tokens.slice(typeIndex + 2, close);
  if (arguments_[0]?.normalized === "max")
    return { type: { ...type, maxLength: -1 }, end: close + 1 };
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
  return { type, end: close + 1 };
};

const declaratorEnd = (
  tokens: readonly SqlToken[],
  start: number,
  statementEnd: number,
): number => {
  let depth = 0;
  for (let index = start; index < statementEnd; index++) {
    const token = tokens[index];
    if (token?.text === "(") depth++;
    else if (token?.text === ")") depth = Math.max(0, depth - 1);
    else if (token?.text === "," && depth === 0) return index;
  }
  return statementEnd;
};

const isCompleteSingleLineString = (token: SqlToken | undefined): boolean =>
  token?.kind === "string" &&
  token.text.endsWith("'") &&
  !token.text.includes("\n") &&
  !token.text.includes("\r");

const isNumericLiteral = (token: SqlToken | undefined): boolean => {
  if (token?.kind !== "number") return false;
  const parts = token.text.split(".");
  const containsOnlyDigits = (value: string): boolean => {
    for (const character of value)
      if (character < "0" || character > "9") return false;
    return true;
  };
  return (
    parts.length <= 2 &&
    (parts[0]?.length ?? 0) > 0 &&
    parts.every(
      (part, index) =>
        (index > 0 && part.length === 0) || containsOnlyDigits(part),
    )
  );
};

const scalarInitializer = (
  tokens: readonly SqlToken[],
  typeEnd: number,
  end: number,
): { readonly start: number; readonly end: number } | undefined => {
  if (tokens[typeEnd]?.text !== "=") return undefined;
  const initializer = tokens.slice(typeEnd + 1, end);
  const first = initializer[0];
  const second = initializer[1];
  if (
    initializer.length === 1 &&
    (isNumericLiteral(first) ||
      isCompleteSingleLineString(first) ||
      (first?.kind === "identifier" &&
        !first.delimited &&
        first.normalized === "null"))
  )
    return first ? { start: first.start, end: first.end } : undefined;
  if (
    initializer.length === 2 &&
    first?.kind === "identifier" &&
    !first.delimited &&
    first.normalized === "n" &&
    isCompleteSingleLineString(second) &&
    first.end === second?.start
  )
    return { start: first.start, end: second.end };
  if (
    initializer.length === 2 &&
    first?.kind === "symbol" &&
    (first.text === "+" || first.text === "-") &&
    isNumericLiteral(second) &&
    first.end === second?.start
  )
    return { start: first.start, end: second.end };
  return undefined;
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
      const typeDeclaration = table ? undefined : scalarType(tokens, part + 1);
      const initializer = typeDeclaration
        ? scalarInitializer(
            tokens,
            typeDeclaration.end,
            declaratorEnd(tokens, part + 1, statement.end),
          )
        : undefined;
      const symbol: LocalVariableSymbol = {
        name: token.text,
        normalizedName: normalizeName(token.text),
        kind: table ? "table" : "scalar",
        ...(typeDeclaration ? { type: typeDeclaration.type } : {}),
        ...(initializer ? { initializer } : {}),
        declaration: { start: token.start, end: token.end },
      };
      if (!variables.has(symbol.normalizedName))
        variables.set(symbol.normalizedName, symbol);
      expectingVariable = false;
    }
  }
  return [...variables.values()];
}

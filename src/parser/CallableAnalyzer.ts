import type { DatabaseObject, SqlType } from "../metadata/MetadataModels.js";
import { formatSqlType } from "../metadata/SqlTypeFormatter.js";
import {
  resolveCatalogObject,
  type CatalogScope,
} from "./CatalogObjectResolver.js";
import { tokenizeSql, type SqlToken } from "./SqlTokenizer.js";
import {
  findBuiltinFunction,
  type BuiltinReturnRule,
  type BuiltinOverClause,
  type BuiltinParameterSemantic,
} from "./BuiltinFunctionCatalog.js";
import type { SqlTypeFamily } from "../metadata/SqlTypeDescriptor.js";

export interface CallArgumentRange {
  readonly start: number;
  readonly end: number;
}

export interface ParsedCallSite {
  readonly nameParts: readonly string[];
  readonly nameStart: number;
  readonly openParenthesis: number;
  readonly arguments: readonly CallArgumentRange[];
  readonly activeArgument: number;
  readonly cursor: number;
  readonly complete: boolean;
  readonly database?: string;
  readonly schema?: string;
  readonly name: string;
}

export interface CallableSignature {
  readonly name: string;
  readonly schema?: string;
  readonly database?: string;
  readonly kind:
    "scalar" | "aggregate" | "window" | "expression" | "tableValued";
  readonly parameters: readonly CallableParameter[];
  readonly returnType?: SqlType;
  readonly returnRule?: BuiltinReturnRule;
  readonly over?: BuiltinOverClause;
  readonly documentation?: string;
  readonly minimumServerMajor?: number;
  readonly catalogObject?: DatabaseObject;
}

export interface CallableParameter {
  readonly name: string;
  readonly ordinal: number;
  readonly output: boolean;
  readonly optional?: boolean;
  readonly variadic?: boolean;
  readonly type?: SqlType;
  readonly families?: readonly SqlTypeFamily[];
  readonly semantic?: BuiltinParameterSemantic;
  readonly sameTypeAs?: number;
}

export function callableParameterLabel(parameter: CallableParameter): string {
  const expectation = parameter.type
    ? formatSqlType(parameter.type)
    : (parameter.semantic ?? parameter.families?.join(" | ") ?? "expression");
  return `${parameter.name}${parameter.variadic ? "..." : ""} ${expectation}${parameter.optional ? " [optional]" : ""}${parameter.output ? " OUTPUT" : ""}`;
}

export interface CallableResolution {
  readonly callSite: ParsedCallSite;
  readonly signature: CallableSignature;
  readonly activeParameter: number;
}

export function callableSignatureLabel(signature: CallableSignature): string {
  const parameters = signature.parameters
    .map((parameter) => callableParameterLabel(parameter))
    .join(", ");
  const returns =
    signature.kind === "tableValued"
      ? " → table"
      : signature.returnType
        ? ` → ${formatSqlType(signature.returnType)}`
        : "";
  const over = signature.over
    ? signature.over.required
      ? " OVER (ORDER BY ...)"
      : " [OVER (...)]"
    : "";
  return `${signature.schema ? `${signature.schema}.` : ""}${signature.name}(${parameters})${over}${returns}`;
}

const identifierPartsBefore = (
  tokens: readonly SqlToken[],
  open: number,
): readonly string[] => {
  let start = open - 1;
  if (tokens[start]?.kind !== "identifier") return [];
  while (
    start >= 2 &&
    tokens[start - 1]?.text === "." &&
    tokens[start - 2]?.kind === "identifier"
  )
    start -= 2;
  return tokens
    .slice(start, open)
    .filter((token) => token.kind === "identifier")
    .map((token) => token.text);
};

const identifierStartBefore = (
  tokens: readonly SqlToken[],
  open: number,
): number => {
  let start = open - 1;
  if (tokens[start]?.kind !== "identifier") return open;
  while (
    start >= 2 &&
    tokens[start - 1]?.text === "." &&
    tokens[start - 2]?.kind === "identifier"
  )
    start -= 2;
  return tokens[start]?.start ?? open;
};

const callSiteFromOpen = (
  tokens: readonly SqlToken[],
  open: number,
  cursor: number,
  complete: boolean,
): ParsedCallSite | undefined => {
  const nameParts = identifierPartsBefore(tokens, open);
  const name = nameParts.at(-1);
  if (!name || nameParts.length > 3) return undefined;
  const schema =
    nameParts.length >= 2 ? nameParts[nameParts.length - 2] : undefined;
  const argumentEnd = complete ? (tokens.at(-1)?.start ?? cursor) : cursor;
  const arguments_: CallArgumentRange[] = [];
  let argumentStart = tokens[open]?.end ?? cursor;
  let depth = 0;
  for (let index = open + 1; index < tokens.length; index++) {
    const token = tokens[index];
    if (!token) continue;
    if (token.text === "(") depth++;
    else if (token.text === ")") {
      if (depth === 0) break;
      depth--;
    } else if (token.text === "," && depth === 0) {
      arguments_.push({ start: argumentStart, end: token.start });
      argumentStart = token.end;
    }
  }
  arguments_.push({ start: argumentStart, end: argumentEnd });
  return {
    nameParts,
    nameStart: identifierStartBefore(tokens, open),
    openParenthesis: tokens[open]?.start ?? cursor,
    arguments: arguments_,
    activeArgument: Math.max(0, arguments_.length - 1),
    cursor,
    complete,
    ...(nameParts.length === 3 ? { database: nameParts[0] } : {}),
    ...(schema ? { schema } : {}),
    name,
  };
};

export function parseCallSite(
  sql: string,
  cursor: number,
): ParsedCallSite | undefined {
  const tokens = tokenizeSql(sql.slice(0, cursor));
  let depth = 0;
  for (let open = tokens.length - 1; open >= 0; open--) {
    if (tokens[open]?.text === ")") depth++;
    else if (tokens[open]?.text === "(") {
      if (depth === 0) return callSiteFromOpen(tokens, open, cursor, false);
      depth--;
    }
  }
  return undefined;
}

export function parseCompletedCallSite(
  sql: string,
  start: number,
  end: number,
): ParsedCallSite | undefined {
  const text = sql.slice(start, end);
  const tokens = tokenizeSql(text);
  if (tokens.at(-1)?.text !== ")") return undefined;
  let depth = 0;
  for (let open = tokens.length - 1; open >= 0; open--) {
    if (tokens[open]?.text === ")") depth++;
    else if (tokens[open]?.text === "(" && --depth === 0) {
      const site = callSiteFromOpen(tokens, open, text.length, true);
      if (!site) return undefined;
      const nameStart = tokens.findIndex(
        (token) => token.kind === "identifier",
      );
      if (nameStart !== 0) return undefined;
      return {
        ...site,
        nameStart: site.nameStart + start,
        openParenthesis: site.openParenthesis + start,
        arguments: site.arguments.map((range) => ({
          start: range.start + start,
          end: range.end + start,
        })),
        cursor: end,
      };
    }
  }
  return undefined;
}

export const callableDatabase = (
  callSite: ParsedCallSite | undefined,
): string | undefined => callSite?.database;

const catalogSignature = (
  object: DatabaseObject,
  database?: string,
): CallableSignature => ({
  name: object.name,
  schema: object.schema,
  ...(database ? { database } : {}),
  kind: object.kind === "tableValuedFunction" ? "tableValued" : "scalar",
  parameters: object.parameters,
  ...(object.returnType ? { returnType: object.returnType } : {}),
  catalogObject: object,
});

const builtinSignature = (name: string): CallableSignature | undefined => {
  const builtin = findBuiltinFunction(name);
  return builtin
    ? {
        name: builtin.name,
        kind: builtin.kind,
        parameters: builtin.parameters.map((parameter) => ({
          ...parameter,
          output: false,
        })),
        returnRule: builtin.returnRule,
        ...(builtin.returnRule.kind === "fixed"
          ? { returnType: builtin.returnRule.type }
          : {}),
        ...(builtin.over ? { over: builtin.over } : {}),
        documentation: builtin.description,
        minimumServerMajor: builtin.minimumServerMajor,
      }
    : undefined;
};

export function resolveBuiltinCallable(
  callSite: ParsedCallSite,
): CallableResolution | undefined {
  const signature =
    callSite.nameParts.length === 1
      ? builtinSignature(callSite.name)
      : undefined;
  return signature
    ? {
        callSite,
        signature,
        activeParameter: Math.min(
          callSite.activeArgument,
          Math.max(0, signature.parameters.length - 1),
        ),
      }
    : undefined;
}

export function resolveCallable(
  callSite: ParsedCallSite,
  catalog: CatalogScope,
): CallableResolution | undefined {
  const builtin = resolveBuiltinCallable(callSite);
  if (builtin) return builtin;
  const object = resolveCatalogObject(callSite.nameParts, catalog, [
    "scalarFunction",
    "tableValuedFunction",
  ]);
  if (!object) return undefined;
  const signature = catalogSignature(
    object,
    callSite.database ?? catalog.activeDatabase,
  );
  return {
    callSite,
    signature,
    activeParameter: Math.min(
      callSite.activeArgument,
      Math.max(0, signature.parameters.length - 1),
    ),
  };
}

export function resolveCallableAtCursor(
  sql: string,
  cursor: number,
  catalog: CatalogScope,
): CallableResolution | undefined {
  const callSite = parseCallSite(sql, cursor);
  return callSite ? resolveCallable(callSite, catalog) : undefined;
}

export function resolveCompletedScalarCallable(
  sql: string,
  start: number,
  end: number,
  catalog: CatalogScope,
): CallableResolution | undefined {
  const callSite = parseCompletedCallSite(sql, start, end);
  if (!callSite) return undefined;
  const resolution = resolveCallable(callSite, catalog);
  return resolution?.signature.kind !== "tableValued" ? resolution : undefined;
}

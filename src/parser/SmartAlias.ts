import { normalizeName } from "../metadata/MetadataModels.js";
import type {
  DocumentSemanticModel,
  SemanticCatalog,
} from "./DocumentSemanticAnalyzer.js";
import { tokenizeSql, type SqlToken } from "./SqlTokenizer.js";
import { resolveDocumentSymbols } from "./DocumentSymbols.js";

const identifier = (token: SqlToken | undefined): token is SqlToken =>
  token?.kind === "identifier" ||
  token?.kind === "temp" ||
  token?.kind === "variable";
export function aliasFromObjectName(name: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  return (
    words.length > 1
      ? words.map((word) => word[0]).join("")
      : (words[0]?.[0] ?? "t")
  ).toLocaleLowerCase("en-US");
}

export interface SmartAliasContext {
  readonly objectName: string;
  readonly sourceName: string;
  readonly alias: string;
  readonly explicitAs: boolean;
}

export function isPotentialSmartAliasTrigger(
  sql: string,
  cursor: number,
): boolean {
  if (!/\s/.test(sql[cursor - 1] ?? "")) return false;
  const tokens = tokenizeSql(sql.slice(0, cursor));
  return Boolean(resolveAliasTarget(sql, cursor, tokens));
}

interface AliasTarget {
  readonly parts: readonly string[];
  readonly explicitAs: boolean;
}

function resolveAliasTarget(
  sql: string,
  cursor: number,
  tokens: readonly SqlToken[],
): AliasTarget | undefined {
  let keyword = -1;
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (tokens[i]?.text === ";" || tokens[i]?.normalized === "go") break;
    if (["from", "join", "apply"].includes(tokens[i]?.normalized ?? "")) {
      keyword = i;
      break;
    }
  }
  if (keyword < 0) return undefined;
  let p = keyword + 1;
  if (tokens[p]?.text === "(" || !identifier(tokens[p])) return undefined;
  const parts = [tokens[p]?.text ?? ""];
  while (tokens[p + 1]?.text === "." && identifier(tokens[p + 2])) {
    parts.push(tokens[p + 2]?.text ?? "");
    p += 2;
  }
  if (tokens[p + 1]?.text === "(") {
    let depth = 0;
    do {
      p++;
      if (tokens[p]?.text === "(") depth++;
      if (tokens[p]?.text === ")") depth--;
    } while (p < tokens.length && depth > 0);
  }
  const trailing = tokens.slice(p + 1);
  const explicitAs = trailing.length === 1 && trailing[0]?.normalized === "as";
  if (trailing.length > (explicitAs ? 1 : 0)) return undefined;
  const boundary = explicitAs ? trailing[0]?.end : tokens[p]?.end;
  if (
    boundary === undefined ||
    boundary >= cursor ||
    !/^\s+$/.test(sql.slice(boundary, cursor))
  )
    return undefined;
  return { parts, explicitAs };
}

export function resolveSmartAliasContext(
  sql: string,
  cursor: number,
  semantics: DocumentSemanticModel,
  catalog?: SemanticCatalog,
): SmartAliasContext | undefined {
  if (cursor <= 0) return undefined;
  const tokens = tokenizeSql(sql.slice(0, cursor));
  const target = resolveAliasTarget(sql, cursor, tokens);
  if (!target) return undefined;
  const { parts, explicitAs } = target;
  const objectName = parts.at(-1) ?? "";
  const known = semantics.aliases.get(normalizeName(objectName));
  const database = parts.length === 3 ? parts[0] : catalog?.activeDatabase;
  const schema = parts.length >= 2 ? parts.at(-2) : undefined;
  const object =
    database && schema
      ? catalog?.indexes
          .get(normalizeName(database))
          ?.findObject(schema, objectName)
      : undefined;
  if (
    (!known || known.columns.length === 0) &&
    (!object || object.columns.length === 0)
  )
    return undefined;
  const used = new Set(
    semantics.visibleRowSources
      .filter((binding) => binding.source.origin.start < cursor)
      .map((binding) => normalizeName(binding.qualifier)),
  );
  let statementStart = 0;
  for (let i = 0; i < tokens.length; i++)
    if (tokens[i]?.text === ";" || tokens[i]?.normalized === "go")
      statementStart = i + 1;
  for (const alias of resolveDocumentSymbols(
    tokens.slice(statementStart),
    cursor,
  ).aliases.keys())
    used.add(alias);
  const base = aliasFromObjectName(objectName);
  let alias = base;
  for (let suffix = 2; used.has(normalizeName(alias)); suffix++)
    alias = `${base}${String(suffix)}`;
  const sourceSchema = object?.schema ?? known?.schema ?? schema;
  const sourceName = sourceSchema
    ? `${sourceSchema}.${objectName}`
    : objectName;
  return { objectName, sourceName, alias, explicitAs };
}

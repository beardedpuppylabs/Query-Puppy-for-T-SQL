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
const terminators = new Set([
  "where",
  "join",
  "on",
  "group",
  "order",
  "having",
  "cross",
  "outer",
  "left",
  "right",
  "inner",
  "full",
  "union",
  "from",
  "apply",
]);

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
  readonly alias: string;
  readonly leadingSpace: boolean;
}

export function isPotentialSmartAliasTrigger(
  sql: string,
  cursor: number,
): boolean {
  if (!/\s/.test(sql[cursor - 1] ?? "")) return false;
  const tokens = tokenizeSql(sql.slice(0, cursor));
  let keyword = -1;
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (tokens[i]?.text === ";" || tokens[i]?.normalized === "go") break;
    if (["from", "join", "apply"].includes(tokens[i]?.normalized ?? "")) {
      keyword = i;
      break;
    }
  }
  if (keyword < 0 || !identifier(tokens[keyword + 1])) return false;
  return !tokens
    .slice(keyword + 1)
    .some((token) => terminators.has(token.normalized));
}

export function resolveSmartAliasContext(
  sql: string,
  cursor: number,
  semantics: DocumentSemanticModel,
  catalog?: SemanticCatalog,
): SmartAliasContext | undefined {
  if (cursor <= 0) return undefined;
  const leadingSpace = !/\s/.test(sql[cursor - 1] ?? "");
  const tokens = tokenizeSql(sql.slice(0, cursor));
  let keyword = -1;
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i];
    if (token?.text === ";" || token?.normalized === "go") break;
    if (["from", "join", "apply"].includes(token?.normalized ?? "")) {
      keyword = i;
      break;
    }
  }
  if (keyword < 0) return undefined;
  let p = keyword + 1;
  if (tokens[p]?.text === "(") return undefined;
  if (!identifier(tokens[p])) return undefined;
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
  if (trailing.length || terminators.has(tokens[p]?.normalized ?? ""))
    return undefined;
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
  return { objectName, alias, leadingSpace };
}

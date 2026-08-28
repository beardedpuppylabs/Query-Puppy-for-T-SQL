import { normalizeName } from "../metadata/MetadataModels.js";
import type {
  DocumentSemanticModel,
  SemanticCatalog,
} from "./DocumentSemanticAnalyzer.js";
import { tokenizeSql } from "./SqlTokenizer.js";
import { resolveDocumentSymbols } from "./DocumentSymbols.js";
import { resolveRowSourceCompletionPhase } from "./RowSourceCompletionPhase.js";
import { statementTokenRangeAtCursor } from "./StatementBoundary.js";

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
  return Boolean(resolveAliasTarget(sql, cursor));
}

interface AliasTarget {
  readonly parts: readonly string[];
  readonly explicitAs: boolean;
}

function resolveAliasTarget(
  sql: string,
  cursor: number,
): AliasTarget | undefined {
  const phase = resolveRowSourceCompletionPhase(sql, cursor);
  if (!phase || !["completedObject", "explicitAs"].includes(phase.kind))
    return undefined;
  return { parts: phase.parts, explicitAs: phase.kind === "explicitAs" };
}

export function resolveSmartAliasContext(
  sql: string,
  cursor: number,
  semantics: DocumentSemanticModel,
  catalog?: SemanticCatalog,
): SmartAliasContext | undefined {
  if (cursor <= 0) return undefined;
  const tokens = tokenizeSql(sql.slice(0, cursor));
  const target = resolveAliasTarget(sql, cursor);
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
  const statementStart = statementTokenRangeAtCursor(tokens, cursor).start;
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

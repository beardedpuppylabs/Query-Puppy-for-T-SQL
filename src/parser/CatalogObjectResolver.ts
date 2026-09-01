import type { DatabaseIndex } from "../metadata/DatabaseIndex.js";
import {
  normalizeName,
  type DatabaseObject,
} from "../metadata/MetadataModels.js";

export interface CatalogScope {
  readonly activeDatabase: string;
  readonly indexes: ReadonlyMap<string, DatabaseIndex>;
}

export const ROW_SOURCE_OBJECT_KINDS: readonly DatabaseObject["kind"][] = [
  "table",
  "view",
  "tableValuedFunction",
  "synonym",
];

export function resolveCatalogObject(
  parts: readonly string[],
  catalog: CatalogScope,
  kinds?: readonly DatabaseObject["kind"][],
): DatabaseObject | undefined {
  const database =
    parts.length === 3
      ? (parts[0] ?? catalog.activeDatabase)
      : catalog.activeDatabase;
  const schema = parts.length >= 2 ? parts.at(-2) : undefined;
  const name = parts.at(-1) ?? "";
  const index = catalog.indexes.get(normalizeName(database));
  if (!index) return undefined;
  if (schema) {
    const object = index.findObject(schema, name);
    return object && (!kinds || kinds.includes(object.kind))
      ? object
      : undefined;
  }
  return index.findUniqueObject(name, kinds);
}

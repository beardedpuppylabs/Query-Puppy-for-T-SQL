import type { DatabaseIndex } from "../metadata/DatabaseIndex.js";
import {
  normalizeName,
  type DatabaseObject,
} from "../metadata/MetadataModels.js";

export interface CatalogScope {
  readonly activeDatabase: string;
  readonly indexes: ReadonlyMap<string, DatabaseIndex>;
}

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
  const objects = schema
    ? ([index.findObject(schema, name)].filter(Boolean) as DatabaseObject[])
    : index.objects.filter(
        (object) => normalizeName(object.name) === normalizeName(name),
      );
  const filtered = kinds
    ? objects.filter((object) => kinds.includes(object.kind))
    : objects;
  return filtered.length === 1 ? filtered[0] : undefined;
}

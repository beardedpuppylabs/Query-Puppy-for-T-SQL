import type { DatabaseObject } from "../metadata/MetadataModels.js";
import type { DatabaseIndex } from "../metadata/DatabaseIndex.js";
import type { SourceReference } from "./DocumentSymbols.js";
import { ROW_SOURCE_OBJECT_KINDS } from "./CatalogObjectResolver.js";

export function resolveAliasSource(
  source: SourceReference,
  index: DatabaseIndex,
): DatabaseObject | undefined {
  if (source.schema) return index.findObject(source.schema, source.name);
  return index.findUniqueObject(source.name, ROW_SOURCE_OBJECT_KINDS);
}

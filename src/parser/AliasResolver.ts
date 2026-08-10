import type { DatabaseObject } from "../metadata/MetadataModels.js";
import type { DatabaseIndex } from "../metadata/DatabaseIndex.js";
import type { SourceReference } from "./DocumentSymbols.js";

export function resolveAliasSource(
  source: SourceReference,
  index: DatabaseIndex,
): DatabaseObject | undefined {
  if (source.schema) return index.findObject(source.schema, source.name);
  const matches = index.objects.filter(
    (object) => object.name.toLowerCase() === source.name.toLowerCase(),
  );
  return matches.length === 1 ? matches[0] : undefined;
}

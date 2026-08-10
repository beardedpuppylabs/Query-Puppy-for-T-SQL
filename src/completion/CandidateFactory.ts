import type { DatabaseIndex } from "../metadata/DatabaseIndex.js";
import {
  normalizeName,
  type DatabaseObject,
} from "../metadata/MetadataModels.js";
import { resolveAliasSource } from "../parser/AliasResolver.js";
import type { SqlCompletionContext } from "../parser/SqlContextResolver.js";
import { containsMatch } from "./ContainsMatcher.js";
import type { CompletionCandidate } from "./CompletionCandidate.js";
import { sortCandidates, TYPE_ORDER } from "./CompletionSorter.js";

const objectCandidate = (object: DatabaseObject): CompletionCandidate => ({
  name: object.name,
  normalizedName: object.normalizedName,
  kind: object.kind,
  schema: object.schema,
  parameters: object.parameters,
  ...(object.returnType ? { returnType: object.returnType } : {}),
  sourceObject: object,
  ...(object.baseObjectName ? { baseObjectName: object.baseObjectName } : {}),
});
const columnCandidates = (object: DatabaseObject): CompletionCandidate[] =>
  object.columns.map((column) => ({
    name: column.name,
    normalizedName: column.normalizedName,
    kind: "column",
    schema: object.schema,
    sqlType: column.type,
    nullable: column.nullable,
    sourceObject: object,
    column,
  }));

export function createCandidates(
  context: SqlCompletionContext,
  index?: DatabaseIndex,
): CompletionCandidate[] {
  let candidates: CompletionCandidate[] = [];
  if (context.kind === "member") {
    if (context.aliasSource && index) {
      const object = resolveAliasSource(context.aliasSource, index);
      if (object) candidates = columnCandidates(object);
    } else if (context.qualifier && index?.hasSchema(context.qualifier))
      candidates = index.objects
        .filter(
          (object) =>
            object.schema.toLowerCase() === context.qualifier?.toLowerCase(),
        )
        .map(objectCandidate);
  } else {
    const allowed = new Set(TYPE_ORDER[context.kind]);
    if (index) {
      if (context.kind === "expression") {
        for (const source of context.symbols.aliases.values()) {
          const object = resolveAliasSource(source, index);
          if (object) candidates.push(...columnCandidates(object));
        }
      }
      candidates.push(
        ...index.objects
          .filter((object) => allowed.has(object.kind))
          .map(objectCandidate),
      );
    }
    candidates.push(
      ...context.symbols.locals
        .filter((local) => allowed.has(local.kind))
        .map((local) => ({
          name: local.name,
          normalizedName: normalizeName(local.name),
          kind: local.kind,
        })),
    );
    if (context.kind === "expression")
      candidates.push(
        ...["NULL", "CASE", "CAST", "CONVERT"].map((name) => ({
          name,
          normalizedName: normalizeName(name),
          kind: "keyword" as const,
        })),
      );
  }
  return sortCandidates(
    candidates.filter((candidate) =>
      containsMatch(candidate.name, context.search),
    ),
    context.search,
    context.kind,
  );
}

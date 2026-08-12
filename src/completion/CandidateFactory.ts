import { DatabaseIndex } from "../metadata/DatabaseIndex.js";
import {
  normalizeName,
  type DatabaseObject,
} from "../metadata/MetadataModels.js";
import { resolveAliasSource } from "../parser/AliasResolver.js";
import { quoteIdentifier } from "../metadata/SqlTypeFormatter.js";
import type { SqlCompletionContext } from "../parser/SqlContextResolver.js";
import { containsMatch } from "./ContainsMatcher.js";
import type { CompletionCandidate } from "./CompletionCandidate.js";
import { sortCandidates, TYPE_ORDER } from "./CompletionSorter.js";

export interface CompletionScope {
  readonly activeDatabase: string;
  readonly indexes: ReadonlyMap<string, DatabaseIndex>;
  readonly databaseNames?: readonly string[];
}
const normalizedDatabase = (database: string): string =>
  database.toLocaleLowerCase("en-US");
const objectCandidate = (
  object: DatabaseObject,
  database: string,
): CompletionCandidate => ({
  name: object.name,
  normalizedName: object.normalizedName,
  kind: object.kind,
  database,
  schema: object.schema,
  parameters: object.parameters,
  ...(object.returnType ? { returnType: object.returnType } : {}),
  sourceObject: object,
  ...(object.baseObjectName ? { baseObjectName: object.baseObjectName } : {}),
});
const columnCandidates = (
  object: DatabaseObject,
  database: string,
): CompletionCandidate[] =>
  object.columns.map((column) => ({
    name: column.name,
    normalizedName: column.normalizedName,
    kind: "column",
    database,
    schema: object.schema,
    sqlType: column.type,
    nullable: column.nullable,
    sourceObject: object,
    column,
  }));

const schemaCandidate = (
  schema: string,
  database: string,
): CompletionCandidate => ({
  name: schema,
  normalizedName: normalizeName(schema),
  kind: "schema",
  database,
  insertText: `${quoteIdentifier(schema)}.`,
  triggerSuggest: true,
  priority: 0,
});

export function createCandidates(
  context: SqlCompletionContext,
  scopeOrIndex?: CompletionScope | DatabaseIndex,
): CompletionCandidate[] {
  const scope = toScope(scopeOrIndex);
  const activeIndex = scope?.indexes.get(
    normalizedDatabase(scope.activeDatabase),
  );
  let candidates: CompletionCandidate[] = [];
  let sortKind = context.kind;
  if (context.kind === "unsupported") return [];
  if (context.kind === "member") {
    const source = context.aliasSource;
    if (source && !source.unsupported && scope) {
      const database = source.database ?? scope.activeDatabase;
      const index = scope.indexes.get(normalizedDatabase(database));
      if (index) {
        const object = resolveAliasSource(source, index);
        if (object)
          candidates = columnCandidates(object, index.metadata.database);
      }
    }
  } else if (context.kind === "qualified") {
    const parts = context.qualifier?.parts ?? [];
    if (parts.length === 2 && scope) {
      const qualifier = parts[0] ?? "";
      if (activeIndex?.hasSchema(qualifier)) {
        candidates = objectsInSchema(activeIndex, qualifier);
        sortKind = context.baseKind;
      } else {
        const databaseIndex = scope.indexes.get(normalizedDatabase(qualifier));
        if (databaseIndex) {
          candidates = databaseIndex.metadata.schemas.map((schema) =>
            schemaCandidate(schema, databaseIndex.metadata.database),
          );
          if (context.search)
            candidates.push(
              ...objectsAcrossSchemas(databaseIndex).map((candidate) => ({
                ...candidate,
                priority: 1,
              })),
            );
          sortKind = context.search ? context.baseKind : "schema";
        }
      }
    } else if (parts.length === 3 && scope) {
      const database = parts[0] ?? "";
      const schema = parts[1] || "dbo";
      const databaseIndex = scope.indexes.get(normalizedDatabase(database));
      if (databaseIndex) candidates = objectsInSchema(databaseIndex, schema);
      sortKind = context.baseKind;
    }
  } else {
    const allowed = new Set(TYPE_ORDER[context.kind]);
    if (activeIndex) {
      if (context.kind === "expression" && scope) {
        for (const source of context.symbols.aliases.values()) {
          if (source.unsupported) continue;
          const database = source.database ?? scope.activeDatabase;
          const index = scope.indexes.get(normalizedDatabase(database));
          if (!index) continue;
          const object = resolveAliasSource(source, index);
          if (object)
            candidates.push(
              ...columnCandidates(object, index.metadata.database),
            );
        }
      }
      if (context.kind === "rowSource")
        candidates.push(
          ...activeIndex.metadata.schemas.map((schema) =>
            schemaCandidate(schema, activeIndex.metadata.database),
          ),
        );
      candidates.push(
        ...activeIndex.objects
          .filter((object) => allowed.has(object.kind))
          .map((object) => ({
            ...objectCandidate(object, activeIndex.metadata.database),
            ...(context.kind === "rowSource" ? { priority: 1 } : {}),
          })),
      );
    }
    candidates.push(
      ...context.symbols.locals
        .filter((local) => allowed.has(local.kind))
        .map((local) => ({
          name: local.name,
          normalizedName: normalizeName(local.name),
          kind: local.kind,
          ...(context.kind === "rowSource" ? { priority: 1 } : {}),
        })),
    );
    if (context.kind === "rowSource" && scope?.databaseNames)
      candidates.push(
        ...scope.databaseNames.map((database) => ({
          name: database,
          normalizedName: normalizeName(database),
          kind: "database" as const,
          database,
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
      containsMatch(candidate.normalizedName, context.search),
    ),
    context.search,
    sortKind,
  );
}

function objectsAcrossSchemas(index: DatabaseIndex): CompletionCandidate[] {
  const allowed = new Set(TYPE_ORDER.rowSource);
  return index.objects
    .filter((object) => allowed.has(object.kind))
    .map((object) => ({
      ...objectCandidate(object, index.metadata.database),
      name: `${object.schema}.${object.name}`,
      normalizedName: object.normalizedName,
      insertText: `${quoteIdentifier(object.schema)}.${quoteIdentifier(object.name)}`,
    }));
}

function objectsInSchema(
  index: DatabaseIndex,
  schema: string,
): CompletionCandidate[] {
  const allowed = new Set(TYPE_ORDER.rowSource);
  return index.objects
    .filter(
      (object) =>
        object.schema.toLowerCase() === schema.toLowerCase() &&
        allowed.has(object.kind),
    )
    .map((object) => objectCandidate(object, index.metadata.database));
}

function toScope(
  scopeOrIndex?: CompletionScope | DatabaseIndex,
): CompletionScope | undefined {
  if (!scopeOrIndex) return undefined;
  if (scopeOrIndex instanceof DatabaseIndex) {
    const database = scopeOrIndex.metadata.database;
    return {
      activeDatabase: database,
      indexes: new Map([[normalizedDatabase(database), scopeOrIndex]]),
    };
  }
  return scopeOrIndex;
}

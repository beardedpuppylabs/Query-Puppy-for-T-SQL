import { DatabaseIndex } from "../metadata/DatabaseIndex.js";
import {
  normalizeName,
  type DatabaseObject,
  type ForeignKeyMetadata,
} from "../metadata/MetadataModels.js";
import { quoteIdentifier } from "../metadata/SqlTypeFormatter.js";
import type { SqlCompletionContext } from "../parser/SqlContextResolver.js";
import {
  analyzeDocumentSemantics,
  resolveVisibleRowSource,
  type DocumentSemanticModel,
  type RowSource,
  type ScopedRowSource,
} from "../parser/DocumentSemanticAnalyzer.js";
import { tokenizeSql } from "../parser/SqlTokenizer.js";
import { containsMatch } from "./ContainsMatcher.js";
import type { CompletionCandidate } from "./CompletionCandidate.js";
import { sortCandidates, TYPE_ORDER } from "./CompletionSorter.js";
import { analyzeDmlCompletion } from "../parser/DmlCallAnalyzer.js";
import {
  classifyCompletionContext,
  completionDomainPolicy,
} from "../parser/CompletionContextClassifier.js";

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
  semanticModel?: DocumentSemanticModel,
): CompletionCandidate[] {
  const scope = toScope(scopeOrIndex);
  const activeIndex = scope?.indexes.get(
    normalizedDatabase(scope.activeDatabase),
  );
  const semantics =
    semanticModel ??
    analyzeDocumentSemantics(context.sql, context.cursor, scope);
  const clauseContext = classifyCompletionContext(
    context.sql,
    context.cursor,
    semantics,
  );
  const policy = completionDomainPolicy(clauseContext);
  if (scope) {
    const dml = analyzeDmlCompletion(
      context.sql,
      context.cursor,
      scope,
      semantics.aliases,
    );
    if (dml?.kind === "none") return [];
    if (dml?.kind === "columns" || dml?.kind === "pseudo") {
      const columns = dml.kind === "pseudo" ? dml.source.columns : dml.columns;
      return sortCandidates(
        columns
          .filter((column) =>
            containsMatch(column.normalizedName, context.search),
          )
          .map((column) => ({
            name: column.name,
            normalizedName: column.normalizedName,
            kind: "column" as const,
            sqlType: column.type,
            nullable: column.nullable,
            column,
          })),
        context.search,
        "member",
      );
    }
    if (dml?.kind === "parameters")
      return dml.parameters
        .filter((parameter) =>
          containsMatch(normalizeName(parameter.name), context.search),
        )
        .map((parameter) => ({
          name: parameter.name,
          normalizedName: normalizeName(parameter.name),
          kind: "procedureParameter" as const,
          sqlType: parameter.type,
          nullable: false,
          parameterOutput: parameter.output,
        }));
  }
  let candidates: CompletionCandidate[] = [];
  let sortKind = context.kind;
  if (context.kind === "unsupported") return [];
  if (context.kind === "member") {
    if (clauseContext.finalSetOrderBy) return [];
    const alias = context.qualifier?.parts[0] ?? "";
    const binding = clauseContext.join
      ? clauseContext.join.visibleAtCursor.find(
          (item) => normalizeName(item.qualifier) === normalizeName(alias),
        )
      : resolveVisibleRowSource(semantics, alias);
    if (binding) candidates = scopedColumnCandidates(binding.source, scope);
  } else if (context.kind === "qualified") {
    const parts = context.qualifier?.parts ?? [];
    if (parts.length === 2 && clauseContext.finalSetOrderBy) return [];
    const binding = clauseContext.join
      ? clauseContext.join.visibleAtCursor.find(
          (item) =>
            normalizeName(item.qualifier) === normalizeName(parts[0] ?? ""),
        )
      : resolveVisibleRowSource(semantics, parts[0] ?? "");
    if (parts.length === 2 && binding) {
      candidates = scopedColumnCandidates(binding.source, scope);
      sortKind = "member";
    } else if (parts.length === 2 && scope) {
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
            ...(context.kind === "expression" ? { priority: 100 } : {}),
          })),
      );
    }
    candidates.push(
      ...semantics.rowSources
        .filter(
          (local) =>
            allowed.has(local.sourceKind) &&
            !["derivedTable", "values"].includes(local.sourceKind),
        )
        .map((local) => ({
          name: local.name,
          normalizedName: normalizeName(local.name),
          kind: local.sourceKind,
          ...(context.kind === "rowSource" ? { priority: 1 } : {}),
        })),
    );
    if (context.kind === "expression") {
      const fallbackVisible = semantics.activeQueryScope
        ? semantics.visibleRowSources
        : [...context.symbols.aliases.keys()].flatMap((qualifier) => {
            const source = semantics.aliases.get(qualifier);
            return source
              ? [{ source, qualifier, scopeDistance: 0, outer: false }]
              : [];
          });
      const visible = clauseContext.join
        ? [
            ...clauseContext.join.leftVisibleRowSources,
            ...(clauseContext.join.currentRightRowSource
              ? [clauseContext.join.currentRightRowSource]
              : []),
            ...clauseContext.join.outerRowSources,
          ]
        : fallbackVisible;
      for (const binding of clauseContext.finalSetOrderBy ? [] : visible)
        candidates.push(
          ...scopedColumnCandidates(binding.source, scope).map((candidate) => ({
            ...candidate,
            sourceQualifier: binding.qualifier,
            outerScope: binding.outer,
            priority: clauseContext.allowProjectionAliases
              ? binding.scopeDistance + 2
              : binding.scopeDistance,
          })),
        );
      if (policy.allowProjectionAliases)
        candidates.push(
          ...semantics.orderByColumns.map((column) => ({
            name: column.name,
            normalizedName: column.normalizedName,
            kind: "column" as const,
            sqlType: column.type,
            nullable: column.nullable,
            column,
            priority: 0,
          })),
        );
      if (policy.allowRowSourceAliases)
        candidates.push(
          ...visible.map((binding) => ({
            name: binding.qualifier,
            normalizedName: normalizeName(binding.qualifier),
            kind: "rowSourceAlias" as const,
            sourceQualifier: binding.qualifier,
            outerScope: binding.outer,
            priority: binding.scopeDistance + 50,
          })),
        );
    }
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
          priority: 100,
        })),
      );
  }
  if (clauseContext.join && scope)
    candidates.push(
      ...joinPredicateCandidates(
        clauseContext.join.currentRightRowSource,
        clauseContext.join.leftVisibleRowSources,
        scope,
      ),
    );
  if (
    context.baseKind === "rowSource" &&
    scope &&
    isJoinSourcePosition(context.sql, context.cursor)
  )
    candidates = rankRelatedRowSources(
      candidates,
      semantics.visibleRowSources.filter(
        (binding) =>
          binding.scopeDistance === 0 &&
          binding.source.origin.start < context.replacementStart,
      ),
      scope,
    );
  const aliasable = new Set([
    "table",
    "view",
    "tableValuedFunction",
    "synonym",
    "cte",
    "tempTable",
    "tableVariable",
  ]);
  if (context.baseKind === "rowSource")
    candidates = candidates.map((candidate) =>
      aliasable.has(candidate.kind) && !candidate.triggerSuggest
        ? { ...candidate, triggerAliasSuggest: true }
        : candidate,
    );
  const unique = new Map<string, CompletionCandidate>();
  for (const candidate of candidates)
    unique.set(
      `${candidate.kind}:${candidate.database ?? ""}:${candidate.schema ?? ""}:${candidate.normalizedName}:${candidate.sourceQualifier ?? ""}`,
      candidate,
    );
  return sortCandidates(
    [...unique.values()].filter((candidate) =>
      containsMatch(
        candidate.searchText ?? candidate.normalizedName,
        context.search,
      ),
    ),
    context.search,
    sortKind,
  );
}

function physicalBinding(
  binding: ScopedRowSource,
  scope: CompletionScope,
):
  | { readonly object: DatabaseObject; readonly index: DatabaseIndex }
  | undefined {
  const database = binding.source.database ?? scope.activeDatabase;
  const index = scope.indexes.get(normalizedDatabase(database));
  const object =
    binding.source.sourceObject ??
    (binding.source.schema
      ? index?.findObject(binding.source.schema, binding.source.name)
      : undefined);
  return index && object?.kind === "table" ? { object, index } : undefined;
}

function renderJoinPredicate(
  foreignKey: ForeignKeyMetadata,
  right: ScopedRowSource,
  left: ScopedRowSource,
  rightObject: DatabaseObject,
): string {
  const rightIsParent = rightObject.id === foreignKey.parentObjectId;
  return foreignKey.columns
    .map((mapping) => {
      const rightColumn = rightIsParent
        ? mapping.parentColumnName
        : mapping.referencedColumnName;
      const leftColumn = rightIsParent
        ? mapping.referencedColumnName
        : mapping.parentColumnName;
      return `${quoteIdentifier(right.qualifier)}.${quoteIdentifier(rightColumn)} = ${quoteIdentifier(left.qualifier)}.${quoteIdentifier(leftColumn)}`;
    })
    .join(" AND ");
}

function joinPredicateCandidates(
  right: ScopedRowSource | undefined,
  leftSources: readonly ScopedRowSource[],
  scope: CompletionScope,
): CompletionCandidate[] {
  if (!right) return [];
  const resolvedRight = physicalBinding(right, scope);
  if (!resolvedRight) return [];
  const rightDatabase = normalizeName(
    right.source.database ?? scope.activeDatabase,
  );
  return leftSources.flatMap((left) => {
    if (
      normalizeName(left.source.database ?? scope.activeDatabase) !==
      rightDatabase
    )
      return [];
    const resolvedLeft = physicalBinding(left, scope);
    if (!resolvedLeft || resolvedLeft.index !== resolvedRight.index) return [];
    return resolvedRight.index
      .relationshipsBetween(resolvedRight.object, resolvedLeft.object)
      .filter((foreignKey) => !foreignKey.disabled)
      .map((foreignKey) => {
        const predicate = renderJoinPredicate(
          foreignKey,
          right,
          left,
          resolvedRight.object,
        );
        return {
          name: predicate,
          normalizedName: normalizeName(predicate),
          searchText: normalizeName(
            `${predicate} ${foreignKey.name} ${foreignKey.columns.flatMap((mapping) => [mapping.parentColumnName, mapping.referencedColumnName]).join(" ")}`,
          ),
          kind: "joinPredicate" as const,
          database: foreignKey.database,
          insertText: predicate,
          foreignKey,
          priority: -100,
        };
      });
  });
}

function isJoinSourcePosition(sql: string, cursor: number): boolean {
  const tokens = tokenizeSql(sql).filter((token) => token.start < cursor);
  for (let index = tokens.length - 1; index >= 0; index--) {
    const word = tokens[index]?.normalized;
    if (word === "join") return true;
    if (
      ["from", "on", "where", "group", "having", "order"].includes(word ?? "")
    )
      return false;
  }
  return false;
}

function rankRelatedRowSources(
  candidates: readonly CompletionCandidate[],
  leftSources: readonly ScopedRowSource[],
  scope: CompletionScope,
): CompletionCandidate[] {
  const left = leftSources.flatMap((binding) => {
    const resolved = physicalBinding(binding, scope);
    return resolved ? [{ binding, ...resolved }] : [];
  });
  return candidates.map((candidate) => {
    const object = candidate.sourceObject;
    if (!object || object.kind !== "table" || object.id === undefined)
      return candidate;
    const database = normalizeName(candidate.database ?? scope.activeDatabase);
    const index = scope.indexes.get(database);
    if (!index) return candidate;
    const relationships = left.flatMap((source) =>
      source.index === index
        ? index
            .relationshipsBetween(source.object, object)
            .filter((foreignKey) => !foreignKey.disabled)
        : [],
    );
    return relationships.length
      ? {
          ...candidate,
          priority: -10,
          relatedRelationshipCount: relationships.length,
        }
      : candidate;
  });
}

function localColumnCandidates(
  source: RowSource,
  index?: DatabaseIndex,
): CompletionCandidate[] {
  return source.columns.map((column) => ({
    name: column.name,
    normalizedName: column.normalizedName,
    kind: "column",
    sqlType: column.type,
    nullable: column.nullable,
    column,
    ...(source.database ? { database: source.database } : {}),
    ...(source.schema ? { schema: source.schema } : {}),
    ...(source.sourceObject ? { sourceObject: source.sourceObject } : {}),
    ...relationshipProperties(index, source.sourceObject, column.name),
  }));
}

function scopedColumnCandidates(
  source: RowSource,
  scope?: CompletionScope,
): CompletionCandidate[] {
  const database = source.database ?? scope?.activeDatabase ?? "";
  const index = scope?.indexes.get(normalizedDatabase(database));
  if (source.columns.length || !scope)
    return localColumnCandidates(source, index);
  const object =
    source.sourceObject ??
    (source.schema ? index?.findObject(source.schema, source.name) : undefined);
  if (!object) return [];
  return object.columns.map((column) => ({
    name: column.name,
    normalizedName: column.normalizedName,
    kind: "column",
    database: index?.metadata.database ?? database,
    schema: object.schema,
    sqlType: column.type,
    nullable: column.nullable,
    sourceObject: object,
    column,
    ...relationshipProperties(index, object, column.name),
  }));
}

function relationshipProperties(
  index: DatabaseIndex | undefined,
  object: DatabaseObject | undefined,
  columnName: string,
): Pick<CompletionCandidate, "keyRoles" | "keys" | "foreignKeys"> {
  if (!index || !object || object.kind !== "table") return {};
  const keys = index.keysForColumn(object, columnName);
  const foreignKeys = index.foreignKeysForColumn(object, columnName);
  const outgoingForeignKeys = index.outgoingForeignKeysForColumn(
    object,
    columnName,
  );
  const roles: ("PK" | "UQ" | "FK")[] = [];
  if (keys.some((key) => key.kind === "primaryKey")) roles.push("PK");
  if (keys.some((key) => key.kind !== "primaryKey")) roles.push("UQ");
  if (outgoingForeignKeys.length) roles.push("FK");
  return {
    ...(roles.length ? { keyRoles: roles } : {}),
    ...(keys.length ? { keys } : {}),
    ...(foreignKeys.length ? { foreignKeys } : {}),
  };
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

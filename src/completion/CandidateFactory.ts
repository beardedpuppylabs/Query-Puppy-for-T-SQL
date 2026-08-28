import { DatabaseIndex } from "../metadata/DatabaseIndex.js";
import {
  normalizeName,
  type DatabaseObject,
} from "../metadata/MetadataModels.js";
import {
  isDeclaredForeignKeyRelationship,
  isEnabledDeclaredForeignKeyRelationship,
  type Relationship,
} from "../relationships/RelationshipModels.js";
import { quoteIdentifier } from "../metadata/SqlTypeFormatter.js";
import type {
  SqlCompletionContext,
  SqlContextKind,
} from "../parser/SqlContextResolver.js";
import {
  analyzeDocumentSemantics,
  resolveVisibleRowSource,
  type DocumentSemanticModel,
  type RowSource,
  type ScopedRowSource,
} from "../parser/DocumentSemanticAnalyzer.js";
import { tokenizeSql } from "../parser/SqlTokenizer.js";
import { statementTokenRangeAtCursor } from "../parser/StatementBoundary.js";
import { resolveDocumentSymbols } from "../parser/DocumentSymbols.js";
import { containsMatch } from "./ContainsMatcher.js";
import type { CompletionCandidate } from "./CompletionCandidate.js";
import { sortCandidates, TYPE_ORDER } from "./CompletionSorter.js";
import { analyzeDmlCompletion } from "../parser/DmlCallAnalyzer.js";
import {
  classifyCompletionContext,
  completionDomainPolicy,
} from "../parser/CompletionContextClassifier.js";
import {
  inferExpectedTypeAtCursor,
  type ExpectedTypeContext,
} from "../parser/SqlTypeInference.js";
import {
  compareSqlTypes,
  describeSqlType,
} from "../metadata/SqlTypeDescriptor.js";
import {
  BUILTIN_FUNCTIONS,
  DATEPART_VALUES,
} from "../parser/BuiltinFunctionCatalog.js";
import { resolveCallableAtCursor } from "../parser/CallableAnalyzer.js";

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
  const callable = scope
    ? resolveCallableAtCursor(context.sql, context.cursor, scope)
    : undefined;
  const expected = scope
    ? inferExpectedTypeAtCursor(
        context.sql,
        context.cursor,
        scope,
        semantics,
        callable ?? false,
      )
    : undefined;
  if (context.rowSourcePhase) {
    if (
      context.rowSourcePhase.joinAllowsOn &&
      context.rowSourcePhase.kind !== "explicitAs"
    )
      return [
        {
          name: "ON",
          normalizedName: "on",
          kind: "keyword",
          insertText: "ON ",
          documentation: "T-SQL JOIN condition",
        },
      ];
    return [];
  }
  if (scope) {
    const dml = analyzeDmlCompletion(
      context.sql,
      context.cursor,
      scope,
      semantics.aliases,
    );
    if (dml?.kind === "none") return [];
    if (dml?.kind === "columns" || dml?.kind === "pseudo") {
      const dmlCandidates = scopedColumnCandidates(dml.source, scope).filter(
        (column) => containsMatch(column.normalizedName, context.search),
      );
      return sortCandidates(
        applyTypeCompatibility(dmlCandidates, expected?.expectedType),
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
    if (context.kind === "expression" && clauseContext.clause === "window") {
      const candidates = ["ORDER BY", "PARTITION BY"]
        .map((name) => ({
          name,
          normalizedName: normalizeName(name),
          kind: "keyword" as const,
          insertText: `${name} `,
          documentation: "T-SQL window clause",
        }))
        .filter((candidate) =>
          containsMatch(candidate.normalizedName, context.search),
        );
      return sortCandidates(candidates, context.search, "expression");
    }
    const parameter = callable?.signature.parameters[callable.activeParameter];
    if (context.kind === "expression" && parameter?.semantic === "datepart") {
      const candidates = DATEPART_VALUES.map((value) => ({
        name: value.name,
        normalizedName: normalizeName(value.name),
        kind: "keyword" as const,
        searchText: normalizeName([value.name, ...value.aliases].join(" ")),
        documentation: `T-SQL datepart (${value.aliases.join(", ")})`,
      })).filter((candidate) =>
        containsMatch(candidate.searchText, context.search),
      );
      return sortCandidates(candidates, context.search, "expression");
    }
  }
  let candidates: CompletionCandidate[] = [];
  let memberSource: RowSource | undefined;
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
    if (binding) {
      memberSource = rebindIdentityLessSource(
        binding.source,
        alias,
        context.sql,
        context.cursor,
        scope,
      );
      candidates = scopedColumnCandidates(memberSource, scope);
    }
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
      memberSource = rebindIdentityLessSource(
        binding.source,
        parts[0] ?? "",
        context.sql,
        context.cursor,
        scope,
      );
      candidates = scopedColumnCandidates(memberSource, scope);
      sortKind = "member";
    } else if (parts.length === 2 && scope) {
      const qualifier = parts[0] ?? "";
      if (activeIndex?.hasSchema(qualifier)) {
        candidates = objectsInSchema(activeIndex, qualifier, context.baseKind);
        sortKind = context.baseKind;
      } else {
        const databaseIndex = scope.indexes.get(normalizedDatabase(qualifier));
        if (databaseIndex) {
          candidates = databaseIndex.metadata.schemas.map((schema) =>
            schemaCandidate(schema, databaseIndex.metadata.database),
          );
          if (context.search)
            candidates.push(
              ...objectsAcrossSchemas(databaseIndex, context.baseKind).map(
                (candidate) => ({
                  ...candidate,
                  priority: 1,
                }),
              ),
            );
          sortKind = context.search ? context.baseKind : "schema";
        }
      }
    } else if (parts.length === 3 && scope) {
      const database = parts[0] ?? "";
      const schema = parts[1] || "dbo";
      const databaseIndex = scope.indexes.get(normalizedDatabase(database));
      if (databaseIndex)
        candidates = objectsInSchema(databaseIndex, schema, context.baseKind);
      sortKind = context.baseKind;
    }
  } else {
    const allowed = new Set(TYPE_ORDER[context.kind]);
    if (activeIndex) {
      if (context.kind === "rowSource" || context.kind === "dmlTarget")
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
            ...(context.kind === "rowSource" || context.kind === "dmlTarget"
              ? { priority: 1 }
              : {}),
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
          ...(context.kind === "rowSource" || context.kind === "dmlTarget"
            ? { priority: 1 }
            : {}),
        })),
    );
    if (context.kind === "expression") {
      const fallbackVisible = semantics.activeQueryScope
        ? semantics.visibleRowSources
        : [...context.symbols.aliases.keys()].flatMap((qualifier) => {
            const source = semantics.aliases.get(qualifier);
            return source
              ? [
                  {
                    source: rebindIdentityLessSource(
                      source,
                      qualifier,
                      context.sql,
                      context.cursor,
                      scope,
                    ),
                    qualifier,
                    explicitAlias: true,
                    scopeDistance: 0,
                    outer: false,
                  },
                ]
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
            ...(binding.explicitAlias
              ? {
                  insertText: `${quoteIdentifier(binding.qualifier)}.${quoteIdentifier(candidate.name)}`,
                }
              : {}),
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
    if (
      (context.kind === "rowSource" || context.kind === "dmlTarget") &&
      scope?.databaseNames
    )
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
        ...BUILTIN_FUNCTIONS.map((builtin) => ({
          name: builtin.name,
          normalizedName: builtin.normalizedName,
          kind: "builtinFunction" as const,
          parameters: builtin.parameters.map((parameter) => ({
            ...parameter,
            output: false,
          })),
          returnRule: builtin.returnRule,
          documentation: builtin.description,
          ...(builtin.returnRule.kind === "fixed"
            ? { returnType: builtin.returnRule.type }
            : {}),
          priority: 100,
        })),
        ...["NULL", "CASE", "CAST", "CONVERT"].map((name) => ({
          name,
          normalizedName: normalizeName(name),
          kind: "keyword" as const,
          priority: 100,
        })),
      );
  }
  if (
    clauseContext.join &&
    scope &&
    !hasExplicitJoinComparison(context.sql, context.cursor)
  )
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
  const filtered = [...unique.values()].filter((candidate) =>
    containsMatch(
      candidate.searchText ?? candidate.normalizedName,
      context.search,
    ),
  );
  return sortCandidates(
    applyTypeCompatibility(
      rankComparisonRelationshipCandidates(
        filtered,
        expected,
        memberSource,
        scope,
      ),
      expected?.expectedType,
    ),
    context.search,
    sortKind,
  );
}

function physicalSource(
  source: RowSource,
  scope: CompletionScope,
):
  | { readonly object: DatabaseObject; readonly index: DatabaseIndex }
  | undefined {
  const database = source.database ?? scope.activeDatabase;
  const index = scope.indexes.get(normalizedDatabase(database));
  const object =
    source.sourceObject ??
    (source.schema ? index?.findObject(source.schema, source.name) : undefined);
  return index && object?.kind === "table" ? { object, index } : undefined;
}

function rankComparisonRelationshipCandidates(
  candidates: readonly CompletionCandidate[],
  expected: ExpectedTypeContext | undefined,
  memberSource: RowSource | undefined,
  scope: CompletionScope | undefined,
): CompletionCandidate[] {
  if (
    !scope ||
    !memberSource ||
    expected?.source !== "comparisonOperand" ||
    !expected.comparisonColumn
  )
    return [...candidates];
  const comparison = physicalSource(expected.comparisonColumn.source, scope);
  const member = physicalSource(memberSource, scope);
  if (!comparison || !member || comparison.index !== member.index)
    return [...candidates];
  const relatedColumns = new Set<string>();
  for (const relationship of comparison.index
    .relationshipsBetween(comparison.object, member.object)
    .filter(isEnabledDeclaredForeignKeyRelationship)) {
    for (const mapping of relationship.mappings) {
      if (
        comparison.object.id === relationship.source.objectId &&
        member.object.id === relationship.target.objectId &&
        normalizeName(mapping.sourceColumnName) ===
          expected.comparisonColumn.column.normalizedName
      )
        relatedColumns.add(normalizeName(mapping.targetColumnName));
      if (
        comparison.object.id === relationship.target.objectId &&
        member.object.id === relationship.source.objectId &&
        normalizeName(mapping.targetColumnName) ===
          expected.comparisonColumn.column.normalizedName
      )
        relatedColumns.add(normalizeName(mapping.sourceColumnName));
    }
  }
  if (!relatedColumns.size) return [...candidates];
  return candidates.map((candidate) =>
    relatedColumns.has(candidate.normalizedName)
      ? { ...candidate, priority: (candidate.priority ?? 0) - 1 }
      : candidate,
  );
}

function hasExplicitJoinComparison(sql: string, cursor: number): boolean {
  const tokens = tokenizeSql(sql).filter((token) => token.start < cursor);
  let on = -1;
  for (let index = tokens.length - 1; index >= 0; index--)
    if (tokens[index]?.normalized === "on") {
      on = index;
      break;
    }
  return (
    on >= 0 &&
    tokens
      .slice(on + 1)
      .some((token) => ["=", "<", ">", "!"].includes(token.text))
  );
}

function applyTypeCompatibility(
  candidates: readonly CompletionCandidate[],
  expected?: ReturnType<typeof describeSqlType>,
): CompletionCandidate[] {
  if (!expected || expected.kind === "unknown") return [...candidates];
  return candidates.map((candidate) => {
    const actual = candidate.sqlType ?? candidate.returnType;
    return {
      ...candidate,
      expectedType: expected,
      typeCompatibility: actual
        ? compareSqlTypes(expected, describeSqlType(actual))
        : "unknown",
    };
  });
}

function rebindIdentityLessSource(
  source: RowSource,
  alias: string,
  sql: string,
  cursor: number,
  scope?: CompletionScope,
): RowSource {
  if (!scope || source.sourceObject || source.schema || source.database)
    return source;
  const tokens = tokenizeSql(sql);
  const statement = statementTokenRangeAtCursor(tokens, cursor);
  const reference = resolveDocumentSymbols(
    tokens.slice(statement.start, statement.end),
    Number.POSITIVE_INFINITY,
  ).aliases.get(normalizeName(alias));
  if (!reference) return source;
  const database = reference.database ?? scope.activeDatabase;
  const index = scope.indexes.get(normalizedDatabase(database));
  const object = reference.schema
    ? index?.findObject(reference.schema, reference.name)
    : index?.objects.find(
        (candidate) =>
          candidate.normalizedName === normalizeName(reference.name),
      );
  if (!object) return source;
  return {
    ...source,
    name: object.name,
    database,
    schema: object.schema,
    sourceObject: object,
    columns: object.columns,
  };
}

function physicalBinding(
  binding: ScopedRowSource,
  scope: CompletionScope,
):
  | { readonly object: DatabaseObject; readonly index: DatabaseIndex }
  | undefined {
  return physicalSource(binding.source, scope);
}

function renderJoinPredicate(
  relationship: Relationship,
  right: ScopedRowSource,
  left: ScopedRowSource,
  rightObject: DatabaseObject,
): string {
  const rightIsSource = rightObject.id === relationship.source.objectId;
  return relationship.mappings
    .map((mapping) => {
      const rightColumn = rightIsSource
        ? mapping.sourceColumnName
        : mapping.targetColumnName;
      const leftColumn = rightIsSource
        ? mapping.targetColumnName
        : mapping.sourceColumnName;
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
      .filter(isEnabledDeclaredForeignKeyRelationship)
      .map((relationship) => {
        const predicate = renderJoinPredicate(
          relationship,
          right,
          left,
          resolvedRight.object,
        );
        return {
          name: predicate,
          normalizedName: normalizeName(predicate),
          searchText: normalizeName(
            `${predicate} ${relationship.declaredForeignKey.constraintName} ${relationship.mappings.flatMap((mapping) => [mapping.sourceColumnName, mapping.targetColumnName]).join(" ")}`,
          ),
          kind: "joinPredicate" as const,
          database: relationship.source.database,
          insertText: predicate,
          relationship,
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
            .filter(isEnabledDeclaredForeignKeyRelationship)
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
  physicalObject?: DatabaseObject,
): CompletionCandidate[] {
  const object = physicalObject ?? source.sourceObject;
  return source.columns.map((column) => ({
    name: column.name,
    normalizedName: column.normalizedName,
    kind: "column",
    sqlType: column.type,
    nullable: column.nullable,
    column,
    ...(object?.kind === "table" ? { physicalColumn: true } : {}),
    ...(source.database ? { database: source.database } : {}),
    ...(source.schema ? { schema: source.schema } : {}),
    ...(object ? { sourceObject: object } : {}),
    ...relationshipProperties(index, object, column.name),
  }));
}

function scopedColumnCandidates(
  source: RowSource,
  scope?: CompletionScope,
): CompletionCandidate[] {
  const database = source.database ?? scope?.activeDatabase ?? "";
  const index = scope?.indexes.get(normalizedDatabase(database));
  const indexedObject = source.schema
    ? index?.findObject(source.schema, source.name)
    : undefined;
  const physicalObject = indexedObject ?? source.sourceObject;
  if (source.columns.length || !scope)
    return localColumnCandidates(source, index, physicalObject);
  const object = physicalObject;
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
    ...(object.kind === "table" ? { physicalColumn: true } : {}),
    ...relationshipProperties(index, object, column.name),
  }));
}

function relationshipProperties(
  index: DatabaseIndex | undefined,
  object: DatabaseObject | undefined,
  columnName: string,
): Pick<CompletionCandidate, "keyRoles" | "keys" | "relationships"> {
  if (!index || !object || object.kind !== "table") return {};
  const keys = index.keysForColumn(object, columnName);
  const relationships = index
    .relationshipsForColumn(object, columnName)
    .filter(isDeclaredForeignKeyRelationship);
  const outgoingRelationships = index
    .outgoingRelationshipsForColumn(object, columnName)
    .filter(isDeclaredForeignKeyRelationship);
  const roles: ("PK" | "UQ" | "FK")[] = [];
  if (keys.some((key) => key.kind === "primaryKey")) roles.push("PK");
  if (keys.some((key) => key.kind !== "primaryKey")) roles.push("UQ");
  if (outgoingRelationships.length) roles.push("FK");
  return {
    ...(roles.length ? { keyRoles: roles } : {}),
    ...(keys.length ? { keys } : {}),
    ...(relationships.length ? { relationships } : {}),
  };
}

function objectsAcrossSchemas(
  index: DatabaseIndex,
  context: SqlContextKind,
): CompletionCandidate[] {
  const allowed = new Set(TYPE_ORDER[context]);
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
  context: SqlContextKind,
): CompletionCandidate[] {
  const allowed = new Set(TYPE_ORDER[context]);
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

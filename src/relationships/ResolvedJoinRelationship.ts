import type {
  ColumnMetadata,
  DatabaseObject,
  KeyMetadata,
} from "../metadata/MetadataModels.js";
import { normalizeName } from "../metadata/MetadataModels.js";
import {
  compareSqlTypes,
  describeSqlType,
} from "../metadata/SqlTypeDescriptor.js";
import type {
  DocumentSemanticModel,
  SemanticCatalog,
  ScopedRowSource,
} from "../parser/DocumentSemanticAnalyzer.js";
import { analyzeDocumentSemantics } from "../parser/DocumentSemanticAnalyzer.js";
import { tokenizeSql, type SqlToken } from "../parser/SqlTokenizer.js";
import {
  RelationshipConfidence,
  RelationshipProvenance,
  relationshipSemanticIdentity,
  type UserConfirmedRelationship,
} from "./RelationshipModels.js";
import type { ProjectRelationshipDefinition } from "./ProjectRelationshipConfig.js";

export interface ResolvedJoinEndpoint {
  readonly bindingId: string;
  readonly qualifier: string;
  readonly database: string;
  readonly schema: string;
  readonly object: DatabaseObject;
}

export interface ResolvedJoinColumnMapping {
  readonly endpointAColumn: ColumnMetadata;
  readonly endpointBColumn: ColumnMetadata;
}

export interface DirectedResolvedJoinRelationship {
  readonly source: ResolvedJoinEndpoint;
  readonly target: ResolvedJoinEndpoint;
  readonly mappings: readonly {
    readonly sourceColumn: ColumnMetadata;
    readonly targetColumn: ColumnMetadata;
  }[];
}

export type ResolvedJoinDirection = "aToB" | "bToA" | "ambiguous";

/** Semantic interpretation of one concrete equality-only JOIN predicate. */
export interface ResolvedJoinRelationshipCandidate {
  readonly endpointA: ResolvedJoinEndpoint;
  readonly endpointB: ResolvedJoinEndpoint;
  readonly mappings: readonly ResolvedJoinColumnMapping[];
  readonly direction: ResolvedJoinDirection;
  readonly range: { readonly start: number; readonly end: number };
  readonly predicateRange: { readonly start: number; readonly end: number };
}

interface JoinSlice {
  readonly onIndex: number;
  readonly endIndex: number;
  readonly right: ScopedRowSource;
  readonly visible: readonly ScopedRowSource[];
  readonly range: { readonly start: number; readonly end: number };
}

interface ResolvedTerm {
  readonly leftBinding: ScopedRowSource;
  readonly leftColumn: ColumnMetadata;
  readonly rightBinding: ScopedRowSource;
  readonly rightColumn: ColumnMetadata;
}

const boundaryWords = new Set([
  "join",
  "inner",
  "left",
  "right",
  "full",
  "cross",
  "outer",
  "where",
  "group",
  "having",
  "order",
  "union",
  "intersect",
  "except",
  "option",
  "for",
]);

export function resolveJoinRelationshipCandidate(
  sql: string,
  selection: { readonly start: number; readonly end: number },
  scope: SemanticCatalog,
  semantics: DocumentSemanticModel = analyzeDocumentSemantics(
    sql,
    selection.start,
    scope,
  ),
): ResolvedJoinRelationshipCandidate | undefined {
  const queryScope = semantics.activeQueryScope;
  if (!queryScope) return undefined;
  const tokens = tokenizeSql(sql);
  const depths = tokenDepths(tokens);
  const selectIndex = tokens.findIndex(
    (token) =>
      token.normalized === "select" && token.start === queryScope.range.start,
  );
  if (selectIndex < 0) return undefined;
  const queryDepth = depths[selectIndex] ?? 0;
  const slices = joinSlices(
    tokens,
    depths,
    queryDepth,
    queryScope.range,
    queryScope.localRowSources,
    semantics.visibleRowSources.filter((binding) => binding.outer),
  ).filter((slice) => overlaps(selection, slice.range));
  if (slices.length !== 1) return undefined;
  const slice = slices[0];
  if (!slice) return undefined;
  const predicateTokens = tokens.slice(slice.onIndex + 1, slice.endIndex);
  if (
    !predicateTokens.length ||
    predicateTokens.some(
      (_, index) =>
        (depths[slice.onIndex + 1 + index] ?? queryDepth) !== queryDepth,
    )
  )
    return undefined;
  const terms = parseEqualityTerms(predicateTokens, slice.visible);
  if (!terms?.length) return undefined;
  const bindings = uniqueBindings(
    terms.flatMap((term) => [term.leftBinding, term.rightBinding]),
  );
  if (bindings.length !== 2) return undefined;
  if (!bindings.some((binding) => sameBinding(binding, slice.right)))
    return undefined;
  const other = bindings.find((binding) => !sameBinding(binding, slice.right));
  if (!other || !slice.visible.some((binding) => sameBinding(binding, other)))
    return undefined;
  const ordered = [...bindings].sort(compareBindings);
  const endpointABinding = ordered[0];
  const endpointBBinding = ordered[1];
  if (!endpointABinding || !endpointBBinding) return undefined;
  const endpointA = physicalEndpoint(endpointABinding);
  const endpointB = physicalEndpoint(endpointBBinding);
  if (!endpointA || !endpointB) return undefined;
  if (normalizeName(endpointA.database) !== normalizeName(endpointB.database))
    return undefined;
  const mappings: ResolvedJoinColumnMapping[] = [];
  const usedA = new Set<string>();
  const usedB = new Set<string>();
  for (const term of terms) {
    const leftIsA = sameBinding(term.leftBinding, endpointABinding);
    const mapping = leftIsA
      ? {
          endpointAColumn: term.leftColumn,
          endpointBColumn: term.rightColumn,
        }
      : {
          endpointAColumn: term.rightColumn,
          endpointBColumn: term.leftColumn,
        };
    if (
      usedA.has(mapping.endpointAColumn.normalizedName) ||
      usedB.has(mapping.endpointBColumn.normalizedName) ||
      compareSqlTypes(
        describeSqlType(mapping.endpointAColumn.type),
        describeSqlType(mapping.endpointBColumn.type),
      ) === "incompatible"
    )
      return undefined;
    usedA.add(mapping.endpointAColumn.normalizedName);
    usedB.add(mapping.endpointBColumn.normalizedName);
    mappings.push(mapping);
  }
  mappings.sort(
    (left, right) =>
      left.endpointAColumn.ordinal - right.endpointAColumn.ordinal ||
      left.endpointBColumn.ordinal - right.endpointBColumn.ordinal ||
      left.endpointAColumn.name.localeCompare(right.endpointAColumn.name) ||
      left.endpointBColumn.name.localeCompare(right.endpointBColumn.name),
  );
  if (
    endpointA.object.id === endpointB.object.id &&
    mappings.every(
      (mapping) =>
        mapping.endpointAColumn.normalizedName ===
        mapping.endpointBColumn.normalizedName,
    )
  )
    return undefined;
  return {
    endpointA,
    endpointB,
    mappings,
    direction: resolveDirection(endpointA, endpointB, mappings, scope),
    range: slice.range,
    predicateRange: {
      start: tokens[slice.onIndex]?.end ?? slice.range.start,
      end: slice.range.end,
    },
  };
}

/** Resolves every conservative physical JOIN occurrence in a complete SQL document. */
export function resolveJoinRelationshipCandidates(
  sql: string,
  scope: SemanticCatalog,
): ResolvedJoinRelationshipCandidate[] {
  const candidates = new Map<string, ResolvedJoinRelationshipCandidate>();
  for (const token of tokenizeSql(sql)) {
    if (token.normalized !== "on") continue;
    const semantics = analyzeDocumentSemantics(sql, token.start, scope);
    const candidate = resolveJoinRelationshipCandidate(
      sql,
      { start: token.start, end: token.start },
      scope,
      semantics,
    );
    if (!candidate) continue;
    candidates.set(
      `${String(candidate.range.start)}:${String(candidate.range.end)}`,
      candidate,
    );
  }
  return [...candidates.values()].sort(
    (left, right) =>
      left.range.start - right.range.start || left.range.end - right.range.end,
  );
}

export function directResolvedJoinRelationship(
  candidate: ResolvedJoinRelationshipCandidate,
  direction: Exclude<ResolvedJoinDirection, "ambiguous">,
): DirectedResolvedJoinRelationship {
  const source =
    direction === "aToB" ? candidate.endpointA : candidate.endpointB;
  const target =
    direction === "aToB" ? candidate.endpointB : candidate.endpointA;
  const mappings = candidate.mappings
    .map((mapping) => ({
      sourceColumn:
        direction === "aToB"
          ? mapping.endpointAColumn
          : mapping.endpointBColumn,
      targetColumn:
        direction === "aToB"
          ? mapping.endpointBColumn
          : mapping.endpointAColumn,
    }))
    .sort(
      (left, right) =>
        left.sourceColumn.ordinal - right.sourceColumn.ordinal ||
        left.targetColumn.ordinal - right.targetColumn.ordinal ||
        left.sourceColumn.name.localeCompare(right.sourceColumn.name) ||
        left.targetColumn.name.localeCompare(right.targetColumn.name),
    );
  return { source, target, mappings };
}

export function userConfirmedDefinition(
  candidate: ResolvedJoinRelationshipCandidate,
  direction: Exclude<ResolvedJoinDirection, "ambiguous">,
): ProjectRelationshipDefinition {
  const directed = directResolvedJoinRelationship(candidate, direction);
  return {
    provenance: RelationshipProvenance.UserConfirmed,
    source: persistedEndpoint(directed.source),
    target: persistedEndpoint(directed.target),
    mappings: directed.mappings.map((mapping) => ({
      source: mapping.sourceColumn.name,
      target: mapping.targetColumn.name,
    })),
  };
}

export function resolvedJoinRelationshipIdentity(
  candidate: ResolvedJoinRelationshipCandidate,
): string {
  return relationshipSemanticIdentity(candidateRelationship(candidate));
}

function candidateRelationship(
  candidate: ResolvedJoinRelationshipCandidate,
): UserConfirmedRelationship {
  return {
    provenance: RelationshipProvenance.UserConfirmed,
    confidence: RelationshipConfidence.Confirmed,
    source: relationshipEndpoint(candidate.endpointA),
    target: relationshipEndpoint(candidate.endpointB),
    mappings: candidate.mappings.map((mapping, index) => ({
      sourceColumnName: mapping.endpointAColumn.name,
      targetColumnName: mapping.endpointBColumn.name,
      sourceColumnId: mapping.endpointAColumn.ordinal,
      targetColumnId: mapping.endpointBColumn.ordinal,
      ordinal: index + 1,
    })),
  };
}

function joinSlices(
  tokens: readonly SqlToken[],
  depths: readonly number[],
  queryDepth: number,
  queryRange: { readonly start: number; readonly end: number },
  local: readonly ScopedRowSource[],
  outer: readonly ScopedRowSource[],
): JoinSlice[] {
  const slices: JoinSlice[] = [];
  for (let onIndex = 0; onIndex < tokens.length; onIndex++) {
    const on = tokens[onIndex];
    if (
      !on ||
      on.normalized !== "on" ||
      on.start < queryRange.start ||
      on.start >= queryRange.end ||
      (depths[onIndex] ?? 0) !== queryDepth
    )
      continue;
    const before = local
      .filter((binding) => binding.source.origin.start < on.start)
      .sort(compareBindings);
    const right = before.at(-1);
    if (!right) continue;
    const joinIndex = joinKeywordIndex(
      tokens,
      depths,
      queryDepth,
      onIndex,
      right.source.origin.start,
    );
    if (joinIndex < 0 || tokens[joinIndex - 1]?.normalized === "cross")
      continue;
    let endIndex = tokens.findIndex(
      (token, index) =>
        index > onIndex &&
        (depths[index] ?? 0) === queryDepth &&
        (token.text === ";" || boundaryWords.has(token.normalized)),
    );
    if (endIndex < 0 || (tokens[endIndex]?.start ?? Infinity) > queryRange.end)
      endIndex = tokens.findIndex((token) => token.start >= queryRange.end);
    if (endIndex < 0) endIndex = tokens.length;
    const end = tokens[endIndex]?.start ?? queryRange.end;
    slices.push({
      onIndex,
      endIndex,
      right,
      visible: [...before, ...outer],
      range: {
        start: tokens[joinIndex]?.start ?? right.source.origin.start,
        end,
      },
    });
  }
  return slices;
}

function parseEqualityTerms(
  tokens: readonly SqlToken[],
  visible: readonly ScopedRowSource[],
): ResolvedTerm[] | undefined {
  const terms: ResolvedTerm[] = [];
  let index = 0;
  while (index < tokens.length) {
    const left = columnReference(tokens, index, visible);
    if (!left || tokens[left.next]?.text !== "=") return undefined;
    const right = columnReference(tokens, left.next + 1, visible);
    if (!right) return undefined;
    terms.push({
      leftBinding: left.binding,
      leftColumn: left.column,
      rightBinding: right.binding,
      rightColumn: right.column,
    });
    index = right.next;
    if (index === tokens.length) break;
    if (tokens[index]?.normalized !== "and") return undefined;
    index++;
  }
  return terms;
}

function columnReference(
  tokens: readonly SqlToken[],
  index: number,
  visible: readonly ScopedRowSource[],
):
  | {
      readonly binding: ScopedRowSource;
      readonly column: ColumnMetadata;
      readonly next: number;
    }
  | undefined {
  const qualifier = tokens[index];
  const column = tokens[index + 2];
  if (
    qualifier?.kind !== "identifier" ||
    tokens[index + 1]?.text !== "." ||
    column?.kind !== "identifier"
  )
    return undefined;
  const matches = visible.filter(
    (binding) =>
      normalizeName(binding.qualifier) === normalizeName(qualifier.text),
  );
  if (matches.length !== 1) return undefined;
  const binding = matches[0];
  if (!binding) return undefined;
  const resolved = binding.source.columns.find(
    (candidate) => candidate.normalizedName === column.normalized,
  );
  return resolved ? { binding, column: resolved, next: index + 3 } : undefined;
}

function physicalEndpoint(
  binding: ScopedRowSource | undefined,
): ResolvedJoinEndpoint | undefined {
  const source = binding?.source;
  if (
    !binding ||
    !source?.database ||
    !source.schema ||
    source.sourceObject?.kind !== "table" ||
    source.sourceObject.id === undefined
  )
    return undefined;
  return {
    bindingId: source.sourceId,
    qualifier: binding.qualifier,
    database: source.database,
    schema: source.schema,
    object: source.sourceObject,
  };
}

function resolveDirection(
  endpointA: ResolvedJoinEndpoint,
  endpointB: ResolvedJoinEndpoint,
  mappings: readonly ResolvedJoinColumnMapping[],
  scope: SemanticCatalog,
): ResolvedJoinDirection {
  const index = scope.indexes.get(normalizeName(endpointA.database));
  if (!index) return "ambiguous";
  const aUnique = coversUnfilteredKey(
    index.keysForObject(endpointA.object),
    mappings.map((mapping) => mapping.endpointAColumn.normalizedName),
  );
  const bUnique = coversUnfilteredKey(
    index.keysForObject(endpointB.object),
    mappings.map((mapping) => mapping.endpointBColumn.normalizedName),
  );
  if (aUnique === bUnique) return "ambiguous";
  return aUnique ? "bToA" : "aToB";
}

const coversUnfilteredKey = (
  keys: readonly KeyMetadata[],
  columns: readonly string[],
): boolean => {
  const mapped = new Set(columns);
  return keys.some(
    (key) =>
      !key.filtered &&
      key.columns.length === mapped.size &&
      key.columns.every((column) =>
        mapped.has(normalizeName(column.columnName)),
      ),
  );
};

const persistedEndpoint = (endpoint: ResolvedJoinEndpoint) => ({
  database: endpoint.database,
  schema: endpoint.schema,
  object: endpoint.object.name,
});
const relationshipEndpoint = (endpoint: ResolvedJoinEndpoint) => ({
  database: endpoint.database,
  schema: endpoint.schema,
  objectName: endpoint.object.name,
  ...(endpoint.object.id === undefined ? {} : { objectId: endpoint.object.id }),
});
const uniqueBindings = (
  bindings: readonly ScopedRowSource[],
): ScopedRowSource[] => [
  ...new Map(
    bindings.map((binding) => [binding.source.sourceId, binding]),
  ).values(),
];
const sameBinding = (left: ScopedRowSource, right: ScopedRowSource): boolean =>
  left.source.sourceId === right.source.sourceId;
const compareBindings = (
  left: ScopedRowSource,
  right: ScopedRowSource,
): number =>
  left.source.origin.start - right.source.origin.start ||
  normalizeName(left.qualifier).localeCompare(normalizeName(right.qualifier));
const overlaps = (
  left: { readonly start: number; readonly end: number },
  right: { readonly start: number; readonly end: number },
): boolean =>
  left.start === left.end
    ? left.start >= right.start && left.start < right.end
    : left.start < right.end && left.end > right.start;
const tokenDepths = (tokens: readonly SqlToken[]): number[] => {
  let depth = 0;
  return tokens.map((token) => {
    const current = depth;
    if (token.text === "(") depth++;
    else if (token.text === ")") depth--;
    return current;
  });
};
const joinKeywordIndex = (
  tokens: readonly SqlToken[],
  depths: readonly number[],
  queryDepth: number,
  onIndex: number,
  objectStart: number,
): number => {
  for (let index = onIndex - 1; index >= 0; index--)
    if (
      (depths[index] ?? 0) === queryDepth &&
      tokens[index]?.normalized === "join" &&
      (tokens[index]?.start ?? Infinity) <= objectStart
    )
      return index;
  return -1;
};

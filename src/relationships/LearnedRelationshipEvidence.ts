import { normalizeName } from "../metadata/MetadataModels.js";
import {
  directResolvedJoinRelationship,
  type ResolvedJoinRelationshipCandidate,
} from "./ResolvedJoinRelationship.js";
import {
  relationshipMappingIdentity,
  relationshipSemanticIdentity,
  RelationshipProvenance,
  type Relationship,
} from "./RelationshipModels.js";

export const LEARNED_RELATIONSHIP_EVIDENCE_FORMAT_VERSION = 1;
export const MAX_LEARNED_RELATIONSHIP_EVIDENCE = 4096;

export interface LearnedRelationshipEvidenceEndpoint {
  readonly database: string;
  readonly schema: string;
  readonly object: string;
}

export interface LearnedRelationshipEvidenceMapping {
  readonly source: string;
  readonly target: string;
}

export interface LearnedRelationshipEvidenceDefinition {
  readonly source: LearnedRelationshipEvidenceEndpoint;
  readonly target: LearnedRelationshipEvidenceEndpoint;
  readonly mappings: readonly LearnedRelationshipEvidenceMapping[];
}

export interface LearnedRelationshipEvidenceRecord extends LearnedRelationshipEvidenceDefinition {
  readonly observationCount: number;
}

export interface LearnedRelationshipEvidenceDocument {
  readonly version: typeof LEARNED_RELATIONSHIP_EVIDENCE_FORMAT_VERSION;
  readonly evidence: readonly LearnedRelationshipEvidenceRecord[];
}

export interface LearnedRelationshipEvidenceObservation {
  readonly evidence: LearnedRelationshipEvidenceDefinition;
  readonly count: number;
}

export interface LearnedRelationshipEvidenceMutation {
  readonly observations: readonly LearnedRelationshipEvidenceObservation[];
  readonly removals: ReadonlySet<string>;
}

export type ParsedLearnedRelationshipEvidence =
  | {
      readonly kind: "valid";
      readonly document: LearnedRelationshipEvidenceDocument;
    }
  | { readonly kind: "invalid"; readonly message: string };

/** Converts a resolved JOIN only when passive direction is deterministic. */
export function learnedEvidenceFromResolvedJoin(
  candidate: ResolvedJoinRelationshipCandidate,
): LearnedRelationshipEvidenceDefinition | undefined {
  if (candidate.direction === "ambiguous") return undefined;
  const directed = directResolvedJoinRelationship(
    candidate,
    candidate.direction,
  );
  return {
    source: endpoint(directed.source),
    target: endpoint(directed.target),
    mappings: directed.mappings.map((mapping) => ({
      source: mapping.sourceColumn.name,
      target: mapping.targetColumn.name,
    })),
  };
}

export function learnedEvidenceIdentity(
  evidence: LearnedRelationshipEvidenceDefinition,
): string {
  return relationshipMappingIdentity(
    {
      database: evidence.source.database,
      schema: evidence.source.schema,
      objectName: evidence.source.object,
    },
    {
      database: evidence.target.database,
      schema: evidence.target.schema,
      objectName: evidence.target.object,
    },
    evidence.mappings.map((mapping) => ({
      sourceColumnName: mapping.source,
      targetColumnName: mapping.target,
    })),
  );
}

/** Identities already represented by production relationship truth. */
export function knownRelationshipEvidenceIdentities(
  relationships: readonly Relationship[],
): ReadonlySet<string> {
  return new Set(
    relationships
      .filter(
        (relationship) =>
          relationship.provenance ===
            RelationshipProvenance.DeclaredForeignKey ||
          relationship.provenance === RelationshipProvenance.ProjectDefined ||
          relationship.provenance === RelationshipProvenance.UserConfirmed,
      )
      .map(relationshipSemanticIdentity),
  );
}

/**
 * Tracks document-save occurrence counts in memory. An unchanged occurrence can
 * contribute only once until it is removed in one save cycle and later re-added.
 */
export class LearnedRelationshipObservationTracker {
  private readonly documents = new Map<string, ReadonlyMap<string, number>>();

  observe(
    documentKey: string,
    occurrences: readonly LearnedRelationshipEvidenceDefinition[],
    knownRelationshipIdentities: ReadonlySet<string>,
  ): LearnedRelationshipEvidenceMutation {
    const current = occurrenceCounts(occurrences);
    const previous = this.documents.get(documentKey) ?? new Map();
    const observations: LearnedRelationshipEvidenceObservation[] = [];
    const removals = new Set<string>();
    for (const [identity, occurrence] of current) {
      if (knownRelationshipIdentities.has(identity)) {
        removals.add(identity);
        continue;
      }
      const count = occurrence.count - (previous.get(identity) ?? 0);
      if (count > 0)
        observations.push({ evidence: occurrence.evidence, count });
    }
    this.documents.set(
      documentKey,
      new Map(
        [...current]
          .filter(([identity]) => !knownRelationshipIdentities.has(identity))
          .map(([identity, value]) => [identity, value.count]),
      ),
    );
    return {
      observations: observations.sort((left, right) =>
        learnedEvidenceIdentity(left.evidence).localeCompare(
          learnedEvidenceIdentity(right.evidence),
        ),
      ),
      removals,
    };
  }

  close(documentKey: string): void {
    this.documents.delete(documentKey);
  }

  clear(): void {
    this.documents.clear();
  }
}

export function applyLearnedEvidenceMutation(
  existing: readonly LearnedRelationshipEvidenceRecord[],
  mutation: LearnedRelationshipEvidenceMutation,
  limit = MAX_LEARNED_RELATIONSHIP_EVIDENCE,
): LearnedRelationshipEvidenceRecord[] {
  const records = new Map(
    existing.map((record) => [learnedEvidenceIdentity(record), record]),
  );
  for (const identity of mutation.removals) records.delete(identity);
  for (const observation of mutation.observations) {
    if (!Number.isSafeInteger(observation.count) || observation.count <= 0)
      continue;
    const identity = learnedEvidenceIdentity(observation.evidence);
    if (mutation.removals.has(identity)) continue;
    const previous = records.get(identity)?.observationCount ?? 0;
    records.set(identity, {
      ...observation.evidence,
      observationCount: Math.min(
        Number.MAX_SAFE_INTEGER,
        previous + observation.count,
      ),
    });
  }
  const strongest = [...records.values()]
    .sort(
      (left, right) =>
        right.observationCount - left.observationCount ||
        learnedEvidenceIdentity(left).localeCompare(
          learnedEvidenceIdentity(right),
        ),
    )
    .slice(0, Math.max(0, limit));
  return strongest.sort((left, right) =>
    learnedEvidenceIdentity(left).localeCompare(learnedEvidenceIdentity(right)),
  );
}

export function parseLearnedRelationshipEvidence(
  text: string,
): ParsedLearnedRelationshipEvidence {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return {
      kind: "invalid",
      message: `Invalid JSON: ${errorMessage(error)}.`,
    };
  }
  if (!record(value) || unknownFields(value, ["version", "evidence"]).length)
    return {
      kind: "invalid",
      message: "Invalid learned-evidence document shape.",
    };
  if (value["version"] !== LEARNED_RELATIONSHIP_EVIDENCE_FORMAT_VERSION)
    return {
      kind: "invalid",
      message: `Unsupported learned-evidence format version ${String(value["version"])}.`,
    };
  if (!Array.isArray(value["evidence"]))
    return { kind: "invalid", message: "`evidence` must be an array." };
  const records: LearnedRelationshipEvidenceRecord[] = [];
  for (const [index, candidate] of value["evidence"].entries()) {
    const parsed = parseRecord(candidate);
    if (!parsed)
      return {
        kind: "invalid",
        message: `Invalid learned-evidence record at index ${String(index)}.`,
      };
    records.push(parsed);
  }
  return {
    kind: "valid",
    document: {
      version: LEARNED_RELATIONSHIP_EVIDENCE_FORMAT_VERSION,
      evidence: applyLearnedEvidenceMutation(records, {
        observations: [],
        removals: new Set(),
      }),
    },
  };
}

export function serializeLearnedRelationshipEvidence(
  evidence: readonly LearnedRelationshipEvidenceRecord[],
): string {
  const document: LearnedRelationshipEvidenceDocument = {
    version: LEARNED_RELATIONSHIP_EVIDENCE_FORMAT_VERSION,
    evidence: applyLearnedEvidenceMutation(evidence, {
      observations: [],
      removals: new Set(),
    }),
  };
  return `${JSON.stringify(document, undefined, 2)}\n`;
}

const endpoint = (value: {
  readonly database: string;
  readonly schema: string;
  readonly object: { readonly name: string };
}): LearnedRelationshipEvidenceEndpoint => ({
  database: value.database,
  schema: value.schema,
  object: value.object.name,
});

const occurrenceCounts = (
  occurrences: readonly LearnedRelationshipEvidenceDefinition[],
): Map<
  string,
  { readonly evidence: LearnedRelationshipEvidenceDefinition; count: number }
> => {
  const result = new Map<
    string,
    { readonly evidence: LearnedRelationshipEvidenceDefinition; count: number }
  >();
  for (const evidence of occurrences) {
    const identity = learnedEvidenceIdentity(evidence);
    const existing = result.get(identity);
    if (existing) existing.count++;
    else result.set(identity, { evidence, count: 1 });
  }
  return result;
};

const parseRecord = (
  value: unknown,
): LearnedRelationshipEvidenceRecord | undefined => {
  if (
    !record(value) ||
    unknownFields(value, ["source", "target", "mappings", "observationCount"])
      .length ||
    !Number.isSafeInteger(value["observationCount"]) ||
    Number(value["observationCount"]) <= 0 ||
    !Array.isArray(value["mappings"]) ||
    !value["mappings"].length
  )
    return undefined;
  const source = parseEndpoint(value["source"]);
  const target = parseEndpoint(value["target"]);
  if (
    !source ||
    !target ||
    normalizeName(source.database) !== normalizeName(target.database)
  )
    return undefined;
  const mappings: LearnedRelationshipEvidenceMapping[] = [];
  const sourceColumns = new Set<string>();
  const targetColumns = new Set<string>();
  for (const candidate of value["mappings"]) {
    if (
      !record(candidate) ||
      unknownFields(candidate, ["source", "target"]).length ||
      !name(candidate["source"]) ||
      !name(candidate["target"])
    )
      return undefined;
    const sourceColumn = candidate["source"];
    const targetColumn = candidate["target"];
    if (
      sourceColumns.has(normalizeName(sourceColumn)) ||
      targetColumns.has(normalizeName(targetColumn))
    )
      return undefined;
    sourceColumns.add(normalizeName(sourceColumn));
    targetColumns.add(normalizeName(targetColumn));
    mappings.push({ source: sourceColumn, target: targetColumn });
  }
  if (
    normalizeEndpoint(source) === normalizeEndpoint(target) &&
    mappings.every(
      (mapping) =>
        normalizeName(mapping.source) === normalizeName(mapping.target),
    )
  )
    return undefined;
  return {
    source,
    target,
    mappings,
    observationCount: Number(value["observationCount"]),
  };
};

const parseEndpoint = (
  value: unknown,
): LearnedRelationshipEvidenceEndpoint | undefined => {
  if (
    !record(value) ||
    unknownFields(value, ["database", "schema", "object"]).length ||
    !name(value["database"]) ||
    !name(value["schema"]) ||
    !name(value["object"])
  )
    return undefined;
  return {
    database: value["database"],
    schema: value["schema"],
    object: value["object"],
  };
};

const normalizeEndpoint = (
  value: LearnedRelationshipEvidenceEndpoint,
): string =>
  [value.database, value.schema, value.object].map(normalizeName).join(".");

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const name = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;
const unknownFields = (
  value: Record<string, unknown>,
  allowed: readonly string[],
): string[] => Object.keys(value).filter((field) => !allowed.includes(field));
const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

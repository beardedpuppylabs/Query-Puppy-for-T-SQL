import { createHash } from "node:crypto";
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

export const LEARNED_RELATIONSHIP_EVIDENCE_FORMAT_VERSION = 2;
export const MAX_LEARNED_RELATIONSHIP_EVIDENCE = 4096;
export const MAX_LEARNED_RELATIONSHIP_SEEN_OCCURRENCES = 16384;

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
  readonly seenOccurrences: readonly LearnedRelationshipSeenOccurrence[];
}

export interface LearnedRelationshipSeenOccurrence {
  /** SHA-256 of the workspace-relative document identity. */
  readonly document: string;
  /** SHA-256 of the canonical relationship identity. */
  readonly relationship: string;
  /** Zero-based source-order ordinal among this relationship in the document. */
  readonly ordinal: number;
  /** Stable insertion order used only for deterministic bounded eviction. */
  readonly order: number;
}

export interface LearnedRelationshipOccurrenceObservation {
  readonly evidence: LearnedRelationshipEvidenceDefinition;
  readonly relationshipIdentity: string;
  readonly ordinal: number;
}

export interface LearnedRelationshipEvidenceSave {
  readonly document: string;
  readonly occurrences: readonly LearnedRelationshipOccurrenceObservation[];
  readonly removals: ReadonlySet<string>;
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
      readonly upgradedFromVersion1: boolean;
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

export function learnedEvidenceHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Hashes a normalized workspace-relative identity; no source path is persisted. */
export function learnedDocumentIdentity(
  workspaceRelativeDocumentIdentity: string,
): string {
  return learnedEvidenceHash(
    workspaceRelativeDocumentIdentity.replaceAll("\\", "/"),
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

/** Creates one complete saved-document occurrence snapshot in source order. */
export function createLearnedRelationshipEvidenceSave(
  document: string,
  evidence: readonly LearnedRelationshipEvidenceDefinition[],
  knownRelationshipIdentities: ReadonlySet<string>,
): LearnedRelationshipEvidenceSave {
  const ordinals = new Map<string, number>();
  const occurrences: LearnedRelationshipOccurrenceObservation[] = [];
  const removals = new Set<string>();
  for (const item of evidence) {
    const identity = learnedEvidenceIdentity(item);
    if (knownRelationshipIdentities.has(identity)) {
      removals.add(identity);
      continue;
    }
    const ordinal = ordinals.get(identity) ?? 0;
    ordinals.set(identity, ordinal + 1);
    occurrences.push({
      evidence: item,
      relationshipIdentity: identity,
      ordinal,
    });
  }
  return { document, occurrences, removals };
}

/** Applies one saved-document snapshot atomically to evidence and occurrence state. */
export function applyLearnedRelationshipEvidenceSave(
  existing: LearnedRelationshipEvidenceDocument,
  save: LearnedRelationshipEvidenceSave,
  evidenceLimit = MAX_LEARNED_RELATIONSHIP_EVIDENCE,
  occurrenceLimit = MAX_LEARNED_RELATIONSHIP_SEEN_OCCURRENCES,
): LearnedRelationshipEvidenceDocument {
  const previousOccurrences = new Map(
    existing.seenOccurrences.map((occurrence) => [
      seenOccurrenceIdentity(occurrence),
      occurrence,
    ]),
  );
  const nextOccurrences = new Map(previousOccurrences);
  for (const [identity, occurrence] of nextOccurrences)
    if (occurrence.document === save.document) nextOccurrences.delete(identity);
  const removedRelationshipHashes = new Set(
    [...save.removals].map(learnedEvidenceHash),
  );
  for (const [identity, occurrence] of nextOccurrences)
    if (removedRelationshipHashes.has(occurrence.relationship))
      nextOccurrences.delete(identity);

  let nextOrder = existing.seenOccurrences.reduce(
    (maximum, occurrence) => Math.max(maximum, occurrence.order),
    0,
  );
  const observations: LearnedRelationshipEvidenceObservation[] = [];
  for (const occurrence of save.occurrences) {
    const relationship = learnedEvidenceHash(occurrence.relationshipIdentity);
    const identity = seenOccurrenceIdentity({
      document: save.document,
      relationship,
      ordinal: occurrence.ordinal,
    });
    const previous = previousOccurrences.get(identity);
    if (!previous) {
      nextOrder++;
      observations.push({ evidence: occurrence.evidence, count: 1 });
    }
    const seen: LearnedRelationshipSeenOccurrence = {
      document: save.document,
      relationship,
      ordinal: occurrence.ordinal,
      order: previous?.order ?? nextOrder,
    };
    nextOccurrences.set(identity, seen);
  }
  return {
    version: LEARNED_RELATIONSHIP_EVIDENCE_FORMAT_VERSION,
    evidence: applyLearnedEvidenceMutation(
      existing.evidence,
      { observations, removals: save.removals },
      evidenceLimit,
    ),
    seenOccurrences: boundSeenOccurrences(
      [...nextOccurrences.values()],
      occurrenceLimit,
    ),
  };
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
  if (!record(value))
    return {
      kind: "invalid",
      message: "Invalid learned-evidence document shape.",
    };
  const version = value["version"];
  if (version !== 1 && version !== LEARNED_RELATIONSHIP_EVIDENCE_FORMAT_VERSION)
    return {
      kind: "invalid",
      message: `Unsupported learned-evidence format version ${String(version)}.`,
    };
  const allowedFields =
    version === 1
      ? ["version", "evidence"]
      : ["version", "evidence", "seenOccurrences"];
  if (unknownFields(value, allowedFields).length)
    return {
      kind: "invalid",
      message: "Invalid learned-evidence document shape.",
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
  const seenOccurrences: LearnedRelationshipSeenOccurrence[] = [];
  if (version === LEARNED_RELATIONSHIP_EVIDENCE_FORMAT_VERSION) {
    if (!Array.isArray(value["seenOccurrences"]))
      return {
        kind: "invalid",
        message: "`seenOccurrences` must be an array.",
      };
    const identities = new Set<string>();
    for (const [index, candidate] of value["seenOccurrences"].entries()) {
      const parsed = parseSeenOccurrence(candidate);
      if (!parsed)
        return {
          kind: "invalid",
          message: `Invalid seen occurrence at index ${String(index)}.`,
        };
      const identity = seenOccurrenceIdentity(parsed);
      if (identities.has(identity))
        return {
          kind: "invalid",
          message: `Duplicate seen occurrence at index ${String(index)}.`,
        };
      identities.add(identity);
      seenOccurrences.push(parsed);
    }
  }
  return {
    kind: "valid",
    upgradedFromVersion1: version === 1,
    document: {
      version: LEARNED_RELATIONSHIP_EVIDENCE_FORMAT_VERSION,
      evidence: applyLearnedEvidenceMutation(records, {
        observations: [],
        removals: new Set(),
      }),
      seenOccurrences: boundSeenOccurrences(seenOccurrences),
    },
  };
}

export function serializeLearnedRelationshipEvidence(
  evidence: readonly LearnedRelationshipEvidenceRecord[],
  seenOccurrences: readonly LearnedRelationshipSeenOccurrence[] = [],
): string {
  const document: LearnedRelationshipEvidenceDocument = {
    version: LEARNED_RELATIONSHIP_EVIDENCE_FORMAT_VERSION,
    evidence: applyLearnedEvidenceMutation(evidence, {
      observations: [],
      removals: new Set(),
    }),
    seenOccurrences: boundSeenOccurrences(seenOccurrences),
  };
  return `${JSON.stringify(document, undefined, 2)}\n`;
}

export function boundSeenOccurrences(
  occurrences: readonly LearnedRelationshipSeenOccurrence[],
  limit = MAX_LEARNED_RELATIONSHIP_SEEN_OCCURRENCES,
): LearnedRelationshipSeenOccurrence[] {
  const newest = [...occurrences]
    .sort(
      (left, right) =>
        right.order - left.order ||
        seenOccurrenceIdentity(left).localeCompare(
          seenOccurrenceIdentity(right),
        ),
    )
    .slice(0, Math.max(0, limit));
  return newest.sort((left, right) =>
    seenOccurrenceIdentity(left).localeCompare(seenOccurrenceIdentity(right)),
  );
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

const parseSeenOccurrence = (
  value: unknown,
): LearnedRelationshipSeenOccurrence | undefined => {
  if (
    !record(value) ||
    unknownFields(value, ["document", "relationship", "ordinal", "order"])
      .length ||
    !sha256(value["document"]) ||
    !sha256(value["relationship"]) ||
    !Number.isSafeInteger(value["ordinal"]) ||
    Number(value["ordinal"]) < 0 ||
    !Number.isSafeInteger(value["order"]) ||
    Number(value["order"]) <= 0
  )
    return undefined;
  return {
    document: value["document"],
    relationship: value["relationship"],
    ordinal: Number(value["ordinal"]),
    order: Number(value["order"]),
  };
};

const seenOccurrenceIdentity = (
  occurrence: Pick<
    LearnedRelationshipSeenOccurrence,
    "document" | "relationship" | "ordinal"
  >,
): string =>
  `${occurrence.document}\u0000${occurrence.relationship}\u0000${String(occurrence.ordinal).padStart(10, "0")}`;

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
const sha256 = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f\d]{64}$/u.test(value);
const unknownFields = (
  value: Record<string, unknown>,
  allowed: readonly string[],
): string[] => Object.keys(value).filter((field) => !allowed.includes(field));
const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

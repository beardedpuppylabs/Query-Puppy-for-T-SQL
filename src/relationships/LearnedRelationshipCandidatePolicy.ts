import type { DatabaseIndex } from "../metadata/DatabaseIndex.js";
import {
  resolveProjectRelationships,
  type ProjectRelationshipDefinition,
} from "./ProjectRelationshipConfig.js";
import type { LearnedRelationshipEvidenceRecord } from "./LearnedRelationshipEvidence.js";
import {
  compareRelationships,
  relationshipSemanticIdentity,
  RelationshipConfidence,
  RelationshipProvenance,
  type LearnedFromQueryRelationship,
} from "./RelationshipModels.js";

/** Product-owned evidence threshold; intentionally not user configurable. */
export const LEARNED_RELATIONSHIP_CANDIDATE_THRESHOLD = 3;

/**
 * Resolves qualifying local evidence against the current canonical catalog.
 * Invalid, stale, cross-database, and exactly superseded evidence fails closed.
 */
export function resolveLearnedRelationshipCandidates(
  evidence: readonly LearnedRelationshipEvidenceRecord[],
  index: DatabaseIndex,
): readonly LearnedFromQueryRelationship[] {
  const strongerIdentities = new Set(
    index.relationships
      .filter(
        (relationship) =>
          relationship.provenance ===
            RelationshipProvenance.DeclaredForeignKey ||
          relationship.provenance === RelationshipProvenance.UserConfirmed ||
          relationship.provenance === RelationshipProvenance.ProjectDefined,
      )
      .map(relationshipSemanticIdentity),
  );
  const candidates = new Map<string, LearnedFromQueryRelationship>();

  for (const record of evidence) {
    if (
      !Number.isSafeInteger(record.observationCount) ||
      record.observationCount < LEARNED_RELATIONSHIP_CANDIDATE_THRESHOLD
    )
      continue;
    const definition: ProjectRelationshipDefinition = {
      source: record.source,
      target: record.target,
      mappings: record.mappings,
    };
    const resolved = resolveProjectRelationships([definition], index)
      .relationships[0];
    if (!resolved) continue;
    const identity = relationshipSemanticIdentity(resolved);
    if (strongerIdentities.has(identity)) continue;
    const existing = candidates.get(identity);
    if (existing && existing.observationCount >= record.observationCount)
      continue;
    candidates.set(identity, {
      provenance: RelationshipProvenance.LearnedFromQuery,
      confidence: RelationshipConfidence.StrongEvidence,
      source: resolved.source,
      target: resolved.target,
      mappings: resolved.mappings,
      observationCount: record.observationCount,
    });
  }

  return [...candidates.values()].sort(compareRelationships);
}

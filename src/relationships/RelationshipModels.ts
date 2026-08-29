import type { ForeignKeyMetadata } from "../metadata/MetadataModels.js";

export const RelationshipProvenance = {
  DeclaredForeignKey: "declaredForeignKey",
  ProjectDefined: "projectDefined",
  UserConfirmed: "userConfirmed",
  LearnedFromQuery: "learnedFromQuery",
  HeuristicCandidate: "heuristicCandidate",
} as const;

export const RelationshipConfidence = {
  Authoritative: "authoritative",
  Confirmed: "confirmed",
  StrongEvidence: "strongEvidence",
  Candidate: "candidate",
} as const;

export interface RelationshipObjectReference {
  readonly database: string;
  readonly schema: string;
  readonly objectName: string;
  /** Catalog object identity when the source has been resolved in a DatabaseIndex. */
  readonly objectId?: number;
}

export interface RelationshipColumnMapping {
  readonly sourceColumnName: string;
  readonly targetColumnName: string;
  readonly ordinal: number;
  readonly sourceColumnId?: number;
  readonly targetColumnId?: number;
}

export interface DeclaredForeignKeyDetails {
  readonly constraintId: number;
  readonly constraintName: string;
  readonly deleteAction: string;
  readonly updateAction: string;
  readonly disabled: boolean;
  readonly notTrusted: boolean;
}

interface RelationshipCore {
  /** Logical source/dependent endpoint; the parent endpoint for a declared FK. */
  readonly source: RelationshipObjectReference;
  /** Logical target/principal endpoint; the referenced endpoint for a declared FK. */
  readonly target: RelationshipObjectReference;
  readonly mappings: readonly RelationshipColumnMapping[];
}

export interface DeclaredForeignKeyRelationship extends RelationshipCore {
  readonly provenance: typeof RelationshipProvenance.DeclaredForeignKey;
  readonly confidence: typeof RelationshipConfidence.Authoritative;
  readonly declaredForeignKey: DeclaredForeignKeyDetails;
}

export interface ProjectDefinedRelationship extends RelationshipCore {
  readonly provenance: typeof RelationshipProvenance.ProjectDefined;
  readonly confidence: typeof RelationshipConfidence.Confirmed;
  readonly declaredForeignKey?: never;
}

export interface UserConfirmedRelationship extends RelationshipCore {
  readonly provenance: typeof RelationshipProvenance.UserConfirmed;
  readonly confidence: typeof RelationshipConfidence.Confirmed;
  readonly declaredForeignKey?: never;
}

export interface LearnedFromQueryRelationship extends RelationshipCore {
  readonly provenance: typeof RelationshipProvenance.LearnedFromQuery;
  readonly confidence: typeof RelationshipConfidence.StrongEvidence;
  readonly declaredForeignKey?: never;
}

export interface HeuristicCandidateRelationship extends RelationshipCore {
  readonly provenance: typeof RelationshipProvenance.HeuristicCandidate;
  readonly confidence: typeof RelationshipConfidence.Candidate;
  readonly declaredForeignKey?: never;
}

export type Relationship =
  | DeclaredForeignKeyRelationship
  | ProjectDefinedRelationship
  | UserConfirmedRelationship
  | LearnedFromQueryRelationship
  | HeuristicCandidateRelationship;

export function relationshipFromForeignKey(
  foreignKey: ForeignKeyMetadata,
): DeclaredForeignKeyRelationship {
  return {
    provenance: RelationshipProvenance.DeclaredForeignKey,
    confidence: RelationshipConfidence.Authoritative,
    source: {
      database: foreignKey.database,
      schema: foreignKey.parentSchema,
      objectName: foreignKey.parentObjectName,
      objectId: foreignKey.parentObjectId,
    },
    target: {
      database: foreignKey.database,
      schema: foreignKey.referencedSchema,
      objectName: foreignKey.referencedObjectName,
      objectId: foreignKey.referencedObjectId,
    },
    mappings: [...foreignKey.columns]
      .sort(
        (left, right) =>
          left.ordinal - right.ordinal ||
          left.parentColumnName.localeCompare(right.parentColumnName) ||
          left.referencedColumnName.localeCompare(right.referencedColumnName),
      )
      .map((column) => ({
        sourceColumnId: column.parentColumnId,
        sourceColumnName: column.parentColumnName,
        targetColumnId: column.referencedColumnId,
        targetColumnName: column.referencedColumnName,
        ordinal: column.ordinal,
      })),
    declaredForeignKey: {
      constraintId: foreignKey.id,
      constraintName: foreignKey.name,
      deleteAction: foreignKey.deleteAction,
      updateAction: foreignKey.updateAction,
      disabled: foreignKey.disabled,
      notTrusted: foreignKey.notTrusted,
    },
  };
}

export function isDeclaredForeignKeyRelationship(
  relationship: Relationship,
): relationship is DeclaredForeignKeyRelationship {
  return relationship.provenance === RelationshipProvenance.DeclaredForeignKey;
}

export function isEnabledDeclaredForeignKeyRelationship(
  relationship: Relationship,
): relationship is DeclaredForeignKeyRelationship {
  return (
    isDeclaredForeignKeyRelationship(relationship) &&
    !relationship.declaredForeignKey.disabled
  );
}

export type ProductionRelationship =
  | DeclaredForeignKeyRelationship
  | UserConfirmedRelationship
  | ProjectDefinedRelationship;

/**
 * Returns the explicit trust tier used by production relationship consumers.
 * Future provenances remain excluded until their own production workflow exists.
 */
export function productionRelationshipRank(
  relationship: Relationship,
): number | undefined {
  if (isEnabledDeclaredForeignKeyRelationship(relationship)) return 0;
  if (relationship.provenance === RelationshipProvenance.UserConfirmed)
    return 1;
  if (relationship.provenance === RelationshipProvenance.ProjectDefined)
    return 2;
  return undefined;
}

export function isProductionRelationship(
  relationship: Relationship,
): relationship is ProductionRelationship {
  return productionRelationshipRank(relationship) !== undefined;
}

/** Semantic identity ignores traversal direction and mapping display order. */
export function relationshipSemanticIdentity(
  relationship: Relationship,
): string {
  return relationshipMappingIdentity(
    relationship.source,
    relationship.target,
    relationship.mappings,
  );
}

/** Direction-independent identity shared by relationship truth and local evidence. */
export function relationshipMappingIdentity(
  sourceReference: RelationshipObjectReference,
  targetReference: RelationshipObjectReference,
  mappings: readonly Pick<
    RelationshipColumnMapping,
    "sourceColumnName" | "targetColumnName"
  >[],
): string {
  const source = objectIdentity(sourceReference);
  const target = objectIdentity(targetReference);
  const forwardMappings = mappings
    .map(
      (mapping) =>
        `${normalize(mapping.sourceColumnName)}>${normalize(mapping.targetColumnName)}`,
    )
    .sort()
    .join("|");
  const reverseMappings = mappings
    .map(
      (mapping) =>
        `${normalize(mapping.targetColumnName)}>${normalize(mapping.sourceColumnName)}`,
    )
    .sort()
    .join("|");
  const forward = `${source}>${target}\u0000${forwardMappings}`;
  const reverse = `${target}>${source}\u0000${reverseMappings}`;
  return forward.localeCompare(reverse) <= 0 ? forward : reverse;
}

/**
 * Removes logical duplicates while retaining distinct physical constraints.
 * An authoritative declared FK always wins over an equivalent logical edge.
 */
export function deduplicateRelationships(
  relationships: readonly Relationship[],
): Relationship[] {
  const result: Relationship[] = [];
  const logicalByIdentity = new Map<string, number>();
  for (const relationship of relationships) {
    const identity = relationshipSemanticIdentity(relationship);
    const existingIndex = logicalByIdentity.get(identity);
    if (existingIndex === undefined) {
      logicalByIdentity.set(identity, result.length);
      result.push(relationship);
      continue;
    }
    const existing = result[existingIndex];
    if (!existing) continue;
    if (
      isDeclaredForeignKeyRelationship(existing) &&
      isDeclaredForeignKeyRelationship(relationship)
    ) {
      result.push(relationship);
      continue;
    }
    if (isDeclaredForeignKeyRelationship(existing)) continue;
    if (isDeclaredForeignKeyRelationship(relationship)) {
      result[existingIndex] = relationship;
      continue;
    }
    const existingRank = productionRelationshipRank(existing);
    const replacementRank = productionRelationshipRank(relationship);
    if (
      replacementRank !== undefined &&
      (existingRank === undefined || replacementRank < existingRank)
    )
      result[existingIndex] = relationship;
  }
  return result.sort(compareRelationships);
}

export function compareRelationships(
  left: Relationship,
  right: Relationship,
): number {
  const trust =
    relationshipTrustSortRank(left) - relationshipTrustSortRank(right);
  return (
    trust || relationshipSortKey(left).localeCompare(relationshipSortKey(right))
  );
}

const relationshipTrustSortRank = (relationship: Relationship): number => {
  if (isDeclaredForeignKeyRelationship(relationship)) return 0;
  if (relationship.provenance === RelationshipProvenance.UserConfirmed)
    return 1;
  if (relationship.provenance === RelationshipProvenance.ProjectDefined)
    return 2;
  if (relationship.confidence === RelationshipConfidence.StrongEvidence)
    return 3;
  return 4;
};

const normalize = (value: string): string => value.toLocaleLowerCase("en-US");
const objectIdentity = (reference: RelationshipObjectReference): string =>
  [reference.database, reference.schema, reference.objectName]
    .map(normalize)
    .join(".");

function relationshipSortKey(relationship: Relationship): string {
  const declaredIdentity = isDeclaredForeignKeyRelationship(relationship)
    ? `${String(relationship.declaredForeignKey.constraintId)}:${relationship.declaredForeignKey.constraintName}`
    : "";
  const mappings = relationship.mappings
    .map(
      (mapping) =>
        `${String(mapping.ordinal)}:${mapping.sourceColumnName}:${mapping.targetColumnName}`,
    )
    .join("|");
  return [
    relationship.source.database,
    relationship.source.schema,
    relationship.source.objectName,
    relationship.target.database,
    relationship.target.schema,
    relationship.target.objectName,
    relationship.provenance,
    declaredIdentity,
    mappings,
  ]
    .join("\u0000")
    .toLocaleLowerCase("en-US");
}

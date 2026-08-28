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
  /** Dependent/parent endpoint for a declared SQL Server foreign key. */
  readonly source: RelationshipObjectReference;
  /** Principal/referenced endpoint for a declared SQL Server foreign key. */
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

export function compareRelationships(
  left: Relationship,
  right: Relationship,
): number {
  return relationshipSortKey(left).localeCompare(relationshipSortKey(right));
}

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

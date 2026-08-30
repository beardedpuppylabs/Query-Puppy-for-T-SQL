import type { DatabaseIndex } from "../metadata/DatabaseIndex.js";
import {
  normalizeName,
  type ColumnMetadata,
  type DatabaseObject,
  type KeyMetadata,
} from "../metadata/MetadataModels.js";
import {
  compareSqlTypes,
  describeSqlType,
  type TypeCompatibility,
} from "../metadata/SqlTypeDescriptor.js";
import {
  RelationshipConfidence,
  RelationshipProvenance,
  type HeuristicCandidateRelationship,
  type HeuristicRelationshipEvidence,
} from "./RelationshipModels.js";

type KnownCompatibility = Exclude<
  TypeCompatibility,
  "unknown" | "incompatible"
>;

interface ProposedMapping {
  readonly source: ColumnMetadata;
  readonly target: ColumnMetadata;
  readonly compatibility: KnownCompatibility;
  readonly targetNameForm?: string;
}

interface ProposedRelationship {
  readonly source: DatabaseObject;
  readonly target: DatabaseObject;
  readonly key: KeyMetadata;
  readonly mappings: readonly ProposedMapping[];
}

const strongerProvenances: ReadonlySet<string> = new Set([
  RelationshipProvenance.DeclaredForeignKey,
  RelationshipProvenance.UserConfirmed,
  RelationshipProvenance.ProjectDefined,
  RelationshipProvenance.LearnedFromQuery,
]);

/**
 * Evaluates one already-selected physical table pair. The policy deliberately
 * returns at most one transient canonical relationship and never scans the catalog.
 */
export function resolveHeuristicRelationshipCandidate(
  index: DatabaseIndex,
  left: DatabaseObject,
  right: DatabaseObject,
): HeuristicCandidateRelationship | undefined {
  if (
    left.kind !== "table" ||
    right.kind !== "table" ||
    left.id === undefined ||
    right.id === undefined ||
    left.id === right.id
  )
    return undefined;
  if (
    index
      .relationshipsBetween(left, right)
      .some((relationship) => strongerProvenances.has(relationship.provenance))
  )
    return undefined;

  const proposals = [
    ...proposalsForDirection(index, left, right),
    ...proposalsForDirection(index, right, left),
  ];
  const [proposal] = proposals;
  if (!proposal || proposals.length !== 1) return undefined;
  return materialize(proposal, index.metadata.database);
}

function proposalsForDirection(
  index: DatabaseIndex,
  source: DatabaseObject,
  target: DatabaseObject,
): ProposedRelationship[] {
  const keys = index.keysForObject(target).filter((key) => !key.filtered);
  return keys.flatMap((key) => {
    const mappings = mappingsForCompleteKey(source, target, key);
    return mappings ? [{ source, target, key, mappings }] : [];
  });
}

function mappingsForCompleteKey(
  source: DatabaseObject,
  target: DatabaseObject,
  key: KeyMetadata,
): readonly ProposedMapping[] | undefined {
  if (!key.columns.length) return undefined;
  const targetNameForms = relationshipTargetNameForms(target.name);
  const mappings: ProposedMapping[] = [];
  const usedSourceColumns = new Set<string>();
  let targetAwareCount = 0;

  for (const keyColumn of [...key.columns].sort(
    (left, right) => left.ordinal - right.ordinal,
  )) {
    const targetColumn = target.columns.find(
      (column) => column.normalizedName === normalizeName(keyColumn.columnName),
    );
    if (!targetColumn) return undefined;
    const compatibleAssignments: ProposedMapping[] = source.columns.flatMap(
      (sourceColumn): ProposedMapping[] => {
        const compatibility = knownCompatibility(sourceColumn, targetColumn);
        if (!compatibility) return [];
        const targetNameForm = targetNameForms.find(
          (form) =>
            sourceColumn.normalizedName ===
            `${form}${targetColumn.normalizedName}`,
        );
        if (targetNameForm)
          return [
            {
              source: sourceColumn,
              target: targetColumn,
              compatibility,
              targetNameForm,
            },
          ];
        if (sourceColumn.normalizedName === targetColumn.normalizedName)
          return [
            { source: sourceColumn, target: targetColumn, compatibility },
          ];
        return [];
      },
    );
    const targetAwareAssignments = compatibleAssignments.filter(
      (assignment) => assignment.targetNameForm !== undefined,
    );
    const assignments = targetAwareAssignments.length
      ? targetAwareAssignments
      : compatibleAssignments;
    const [assignment] = assignments;
    if (!assignment || assignments.length !== 1) return undefined;
    if (usedSourceColumns.has(assignment.source.normalizedName))
      return undefined;
    usedSourceColumns.add(assignment.source.normalizedName);
    if (assignment.targetNameForm) targetAwareCount += 1;
    mappings.push(assignment);
  }

  return targetAwareCount > 0 ? mappings : undefined;
}

function knownCompatibility(
  source: ColumnMetadata,
  target: ColumnMetadata,
): KnownCompatibility | undefined {
  const sourceType = describeSqlType(source.type);
  const targetType = describeSqlType(target.type);
  if (sourceType.kind !== "known" || targetType.kind !== "known")
    return undefined;
  const compatibility = compareSqlTypes(targetType, sourceType);
  return compatibility === "unknown" || compatibility === "incompatible"
    ? undefined
    : compatibility;
}

/** Exact object name plus a deliberately small trailing-s variant. */
export function relationshipTargetNameForms(
  objectName: string,
): readonly string[] {
  const exact = normalizeName(objectName);
  const forms = [exact];
  if (
    exact.length > 2 &&
    exact.endsWith("s") &&
    !exact.endsWith("ss") &&
    !exact.endsWith("ies") &&
    !exact.endsWith("ses")
  )
    forms.push(exact.slice(0, -1));
  return forms;
}

function materialize(
  proposal: ProposedRelationship,
  database: string,
): HeuristicCandidateRelationship {
  const mappings = proposal.mappings.map((mapping, index) => ({
    sourceColumnName: mapping.source.name,
    targetColumnName: mapping.target.name,
    sourceColumnId: mapping.source.ordinal,
    targetColumnId: mapping.target.ordinal,
    ordinal: index + 1,
  }));
  const targetAwareEvidence = proposal.mappings.flatMap((mapping) =>
    mapping.targetNameForm
      ? [
          {
            kind: "targetAwareColumnName" as const,
            sourceColumnName: mapping.source.name,
            targetColumnName: mapping.target.name,
            targetObjectName: proposal.target.name,
            targetNameForm: mapping.targetNameForm,
          },
        ]
      : [],
  );
  const contextMappings = proposal.mappings
    .filter((mapping) => !mapping.targetNameForm)
    .map((mapping) => ({
      sourceColumnName: mapping.source.name,
      targetColumnName: mapping.target.name,
    }));
  const evidence: HeuristicRelationshipEvidence[] = [
    {
      kind: "completeTargetKey",
      keyKind: proposal.key.kind,
      keyName: proposal.key.name,
    },
    {
      kind: "compatibleTypes",
      mappings: proposal.mappings.map((mapping) => ({
        sourceColumnName: mapping.source.name,
        targetColumnName: mapping.target.name,
        compatibility: mapping.compatibility,
      })),
    },
    ...targetAwareEvidence,
    ...(proposal.mappings.length > 1 && contextMappings.length
      ? [
          {
            kind: "compositeContextMatch" as const,
            mappings: contextMappings,
          },
        ]
      : []),
  ];
  return {
    provenance: RelationshipProvenance.HeuristicCandidate,
    confidence: RelationshipConfidence.Candidate,
    source: {
      database,
      schema: proposal.source.schema,
      objectName: proposal.source.name,
      ...(proposal.source.id === undefined
        ? {}
        : { objectId: proposal.source.id }),
    },
    target: {
      database,
      schema: proposal.target.schema,
      objectName: proposal.target.name,
      ...(proposal.target.id === undefined
        ? {}
        : { objectId: proposal.target.id }),
    },
    mappings,
    evidence,
  };
}

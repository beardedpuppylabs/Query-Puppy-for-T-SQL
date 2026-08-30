import { friendlyKind } from "../metadata/MetadataModels.js";
import { formatSqlType } from "../metadata/SqlTypeFormatter.js";
import type { CompletionCandidate } from "./CompletionCandidate.js";
import { callableParameterLabel } from "../parser/CallableAnalyzer.js";
import {
  isDeclaredForeignKeyRelationship,
  RelationshipProvenance,
} from "../relationships/RelationshipModels.js";

export interface PresentationModel {
  readonly detail: string;
  readonly description?: string;
}

/** Maximum visible identifier slot in the native suggestion widget. */
export const MAX_VISIBLE_COLUMN_NAME = 32;
export const PHYSICAL_COLUMN_ROLE_WIDTH = 8;
export const PHYSICAL_COLUMN_TYPE_WIDTH = 20;

export function visibleCandidateName(candidate: CompletionCandidate): string {
  if (
    candidate.kind !== "column" ||
    candidate.name.length <= MAX_VISIBLE_COLUMN_NAME
  )
    return candidate.name;
  return `${candidate.name.slice(0, MAX_VISIBLE_COLUMN_NAME - 1)}…`;
}

const fixedSlot = (value: string, width: number): string => {
  const visible =
    value.length <= width ? value : `${value.slice(0, width - 1)}…`;
  return visible.padEnd(width, " ");
};

export const formatColumnRoles = (
  roles: CompletionCandidate["keyRoles"],
): string =>
  ["PK", "UQ", "FK"]
    .filter((role) => roles?.includes(role as "PK" | "UQ" | "FK"))
    .join("·");

export function physicalColumnDisplayRow(
  candidate: CompletionCandidate,
): string | undefined {
  if (
    candidate.kind !== "column" ||
    !candidate.physicalColumn ||
    !candidate.sqlType
  )
    return undefined;
  const name = fixedSlot(candidate.name, MAX_VISIBLE_COLUMN_NAME);
  const roles = fixedSlot(
    formatColumnRoles(candidate.keyRoles),
    PHYSICAL_COLUMN_ROLE_WIDTH,
  );
  const type = fixedSlot(
    formatSqlType(candidate.sqlType),
    PHYSICAL_COLUMN_TYPE_WIDTH,
  );
  return `${name}  ${roles}  ${type}  ${candidate.nullable ? "NULL" : "NOT NULL"}`;
}

export function presentationModel(
  candidate: CompletionCandidate,
  mixed: boolean,
): PresentationModel {
  const params = (candidate.parameters ?? [])
    .map((parameter) => callableParameterLabel(parameter))
    .join(", ");
  let detail = "";
  if (
    (candidate.kind === "column" || candidate.kind === "procedureParameter") &&
    candidate.sqlType
  )
    detail = ` ${formatColumnRoles(candidate.keyRoles) ? `${formatColumnRoles(candidate.keyRoles)} ` : ""}${formatSqlType(candidate.sqlType)} ${candidate.nullable ? "NULL" : "NOT NULL"}`;
  if (candidate.kind === "procedureParameter" && candidate.sqlType)
    detail = ` ${formatSqlType(candidate.sqlType)}${candidate.parameterOutput ? " OUTPUT" : ""}`;
  else if (
    candidate.kind === "scalarFunction" ||
    candidate.kind === "builtinFunction"
  )
    detail = `(${params})${candidate.returnType ? ` → ${formatSqlType(candidate.returnType)}` : ""}`;
  else if (candidate.kind === "tableValuedFunction")
    detail = `(${params}) → table`;
  else if (candidate.kind === "procedure")
    detail = `(${params})${candidate.sourceObject?.columns.length ? ` → ${String(candidate.sourceObject.columns.length)} columns` : ""}`;
  else if (candidate.kind === "joinPredicate")
    detail = candidate.relationship
      ? isDeclaredForeignKeyRelationship(candidate.relationship)
        ? " FK JOIN"
        : candidate.relationship.provenance ===
            RelationshipProvenance.UserConfirmed
          ? " User-confirmed relationship JOIN"
          : candidate.relationship.provenance ===
              RelationshipProvenance.ProjectDefined
            ? " Project relationship JOIN"
            : candidate.relationship.provenance ===
                RelationshipProvenance.LearnedFromQuery
              ? " Learned relationship JOIN"
              : " Heuristic relationship JOIN"
      : " JOIN";
  else if (candidate.relatedRelationshipCount) {
    const declared = candidate.relationships?.filter(
      isDeclaredForeignKeyRelationship,
    ).length;
    const project = candidate.relationships?.filter(
      (relationship) =>
        relationship.provenance === RelationshipProvenance.ProjectDefined,
    ).length;
    const confirmed = candidate.relationships?.filter(
      (relationship) =>
        relationship.provenance === RelationshipProvenance.UserConfirmed,
    ).length;
    const learned = candidate.relationships?.filter(
      (relationship) =>
        relationship.provenance === RelationshipProvenance.LearnedFromQuery,
    ).length;
    const parts = [
      declared
        ? `${String(declared)} FK${declared === 1 ? "" : "s"}`
        : undefined,
      confirmed
        ? `${String(confirmed)} user-confirmed relationship${confirmed === 1 ? "" : "s"}`
        : undefined,
      project
        ? `${String(project)} project relationship${project === 1 ? "" : "s"}`
        : undefined,
      learned
        ? `${String(learned)} learned relationship${learned === 1 ? "" : "s"}`
        : undefined,
    ].filter((part): part is string => part !== undefined);
    detail = ` related via ${parts.join(" + ")}`;
  }
  return {
    detail,
    ...(candidate.sourceQualifier
      ? {
          description: `${candidate.sourceQualifier}${candidate.outerScope ? " (outer)" : ""}`,
        }
      : mixed
        ? { description: friendlyKind(candidate.kind) }
        : {}),
  };
}

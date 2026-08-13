import { friendlyKind } from "../metadata/MetadataModels.js";
import { formatSqlType } from "../metadata/SqlTypeFormatter.js";
import type { CompletionCandidate } from "./CompletionCandidate.js";

export interface PresentationModel {
  readonly detail: string;
  readonly description?: string;
}
export function presentationModel(
  candidate: CompletionCandidate,
  mixed: boolean,
): PresentationModel {
  const params = (candidate.parameters ?? [])
    .map(
      (parameter) =>
        `${parameter.name} ${formatSqlType(parameter.type)}${parameter.output ? " OUTPUT" : ""}`,
    )
    .join(", ");
  let detail = "";
  if (
    (candidate.kind === "column" || candidate.kind === "procedureParameter") &&
    candidate.sqlType
  )
    detail = ` ${formatSqlType(candidate.sqlType)} ${candidate.nullable ? "NULL" : "NOT NULL"}`;
  if (candidate.kind === "procedureParameter" && candidate.sqlType)
    detail = ` ${formatSqlType(candidate.sqlType)}${candidate.parameterOutput ? " OUTPUT" : ""}`;
  else if (candidate.kind === "scalarFunction")
    detail = `(${params})${candidate.returnType ? ` → ${formatSqlType(candidate.returnType)}` : ""}`;
  else if (candidate.kind === "tableValuedFunction")
    detail = `(${params}) → table`;
  else if (candidate.kind === "procedure")
    detail = `(${params})${candidate.sourceObject?.columns.length ? ` → ${String(candidate.sourceObject.columns.length)} columns` : ""}`;
  return {
    detail,
    ...(mixed ? { description: friendlyKind(candidate.kind) } : {}),
  };
}

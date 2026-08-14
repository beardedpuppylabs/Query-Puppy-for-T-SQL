import { friendlyKind } from "../metadata/MetadataModels.js";
import { formatSqlType } from "../metadata/SqlTypeFormatter.js";
import type { CompletionCandidate } from "./CompletionCandidate.js";

export interface PresentationModel {
  readonly detail: string;
  readonly description?: string;
}
export interface ColumnPresentationLayout {
  readonly nameWidth: number;
  readonly typeWidth: number;
}

const NAME_WIDTH_CAP = 32;
const TYPE_WIDTH_CAP = 24;
const boundedWidth = (values: readonly string[], cap: number): number =>
  Math.min(cap, Math.max(...values.map((value) => value.length)));

export function columnPresentationLayout(
  candidates: readonly CompletionCandidate[],
): ColumnPresentationLayout | undefined {
  const physical = candidates.filter(
    (candidate) =>
      candidate.kind === "column" &&
      candidate.sourceObject?.kind === "table" &&
      candidate.sqlType,
  );
  if (physical.length < 2) return undefined;
  return {
    nameWidth: boundedWidth(
      physical.map((candidate) => candidate.name),
      NAME_WIDTH_CAP,
    ),
    typeWidth: boundedWidth(
      physical.flatMap((candidate) =>
        candidate.sqlType ? [formatSqlType(candidate.sqlType)] : [],
      ),
      TYPE_WIDTH_CAP,
    ),
  };
}

const paddingAfter = (value: string, width: number): string =>
  " ".repeat(Math.max(2, width - Math.min(value.length, width) + 2));

export function presentationModel(
  candidate: CompletionCandidate,
  mixed: boolean,
  columnLayout?: ColumnPresentationLayout,
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
    if (candidate.kind === "column" && columnLayout) {
      const type = formatSqlType(candidate.sqlType);
      const nullability = candidate.nullable ? "NULL" : "NOT NULL";
      detail =
        `${paddingAfter(candidate.name, columnLayout.nameWidth)}${type}${paddingAfter(type, columnLayout.typeWidth)}${nullability.padEnd(10)}${candidate.keyRoles?.join(" · ") ?? ""}`.trimEnd();
    } else
      detail = ` ${formatSqlType(candidate.sqlType)} ${candidate.nullable ? "NULL" : "NOT NULL"}${candidate.keyRoles?.length ? ` · ${candidate.keyRoles.join(" · ")}` : ""}`;
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
    ...(candidate.sourceQualifier
      ? {
          description: `${candidate.sourceQualifier}${candidate.outerScope ? " (outer)" : ""}`,
        }
      : mixed
        ? { description: friendlyKind(candidate.kind) }
        : {}),
  };
}

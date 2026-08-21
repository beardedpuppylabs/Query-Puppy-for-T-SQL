import type { CompletionCandidate } from "./CompletionCandidate.js";
import { formatSqlTypeDescriptorForDisplay } from "../metadata/SqlTypeFormatter.js";

export type TypeDisplayGroup = "match" | "compatible" | "other";

export const typeDisplayGroup = (
  candidate: CompletionCandidate,
): TypeDisplayGroup | undefined => {
  if (!candidate.expectedType) return undefined;
  if (
    candidate.typeCompatibility === "exact" ||
    candidate.typeCompatibility === "sameBaseType"
  )
    return "match";
  if (candidate.typeCompatibility === "compatibleFamily") return "compatible";
  return "other";
};

const expectedTypeLabel = (candidate: CompletionCandidate): string => {
  const expected = candidate.expectedType;
  if (!expected) return "type";
  if (expected.kind === "family") return expected.sqlName;
  return formatSqlTypeDescriptorForDisplay(expected);
};

const compatibleFamilyLabel = (candidate: CompletionCandidate): string => {
  const expected = candidate.expectedType;
  if (expected?.kind === "family") return expected.sqlName;
  const family = expected?.family;
  if (["integer", "decimal", "floatingPoint"].includes(family ?? ""))
    return "numeric";
  if (["string", "unicodeString"].includes(family ?? "")) return "string";
  if (["dateTime", "time"].includes(family ?? "")) return "date/time";
  return family ?? "type";
};

export const typeDisplayGroupLabel = (
  group: TypeDisplayGroup,
  candidate: CompletionCandidate,
): string => {
  if (group === "match") return `Type match · ${expectedTypeLabel(candidate)}`;
  if (group === "compatible")
    return `Compatible ${compatibleFamilyLabel(candidate)}`;
  return "Other visible columns";
};

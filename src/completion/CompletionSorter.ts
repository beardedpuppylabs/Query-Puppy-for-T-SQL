import type { SqlContextKind } from "../parser/SqlContextResolver.js";
import type { SqlObjectKind } from "../metadata/MetadataModels.js";
import type { CompletionCandidate } from "./CompletionCandidate.js";

const compatibilityGroup = (candidate: CompletionCandidate): number => {
  if (!candidate.expectedType) return 0;
  if (
    candidate.typeCompatibility === "exact" ||
    candidate.typeCompatibility === "sameBaseType"
  )
    return 0;
  if (candidate.typeCompatibility === "compatibleFamily") return 1;
  return 2;
};

export const TYPE_ORDER: Readonly<
  Record<SqlContextKind, readonly SqlObjectKind[]>
> = {
  rowSource: [
    "schema",
    "database",
    "cte",
    "tempTable",
    "tableVariable",
    "derivedTable",
    "values",
    "inserted",
    "deleted",
    "table",
    "view",
    "tableValuedFunction",
    "synonym",
  ],
  execute: ["procedureParameter", "procedure", "variable"],
  expression: [
    "joinPredicate",
    "column",
    "rowSourceAlias",
    "procedureParameter",
    "variable",
    "scalarFunction",
    "builtinFunction",
    "sequence",
    "keyword",
  ],
  member: ["column"],
  qualified: ["table", "view", "tableValuedFunction", "synonym"],
  schema: ["schema"],
  unsupported: [],
};

export function sortCandidates(
  candidates: readonly CompletionCandidate[],
  search: string,
  context: SqlContextKind,
): CompletionCandidate[] {
  const order = TYPE_ORDER[context];
  const normalized = search.toLowerCase();
  return [...candidates].sort((left, right) => {
    const exact =
      Number(right.normalizedName === normalized) -
      Number(left.normalizedName === normalized);
    if (exact) return exact;
    const joinPriority =
      left.kind === "joinPredicate" || right.kind === "joinPredicate"
        ? (left.priority ?? 0) - (right.priority ?? 0)
        : 0;
    if (joinPriority) return joinPriority;
    // The absence of expectedType is an explicit, complete bypass. In particular,
    // candidates must never be grouped by their own SQL datatypes.
    const compatibility = compatibilityGroup(left) - compatibilityGroup(right);
    if (compatibility) return compatibility;
    const priority = (left.priority ?? 0) - (right.priority ?? 0);
    if (priority) return priority;
    const type = order.indexOf(left.kind) - order.indexOf(right.kind);
    if (type) return type;
    const name = left.name.localeCompare(right.name, undefined, {
      sensitivity: "base",
    });
    return (
      name ||
      (left.schema ?? "").localeCompare(right.schema ?? "", undefined, {
        sensitivity: "base",
      })
    );
  });
}

/** Encodes an already-computed semantic rank for the VS Code suggestion API. */
export const completionSortText = (rank: number): string =>
  rank.toString().padStart(8, "0");

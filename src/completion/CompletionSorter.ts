import type { SqlContextKind } from "../parser/SqlContextResolver.js";
import type { SqlObjectKind } from "../metadata/MetadataModels.js";
import type { CompletionCandidate } from "./CompletionCandidate.js";

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
    "column",
    "rowSourceAlias",
    "procedureParameter",
    "variable",
    "scalarFunction",
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
    const priority = (left.priority ?? 0) - (right.priority ?? 0);
    if (priority) return priority;
    const exact =
      Number(right.normalizedName === normalized) -
      Number(left.normalizedName === normalized);
    if (exact) return exact;
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

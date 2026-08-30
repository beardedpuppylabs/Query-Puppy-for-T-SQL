import { normalizeName } from "../metadata/MetadataModels.js";
import type {
  QueryScope,
  ScopedRowSource,
} from "./DocumentSemanticAnalyzer.js";

export interface ResolvedQueryScopeRowSource {
  readonly scope: QueryScope;
  readonly binding: ScopedRowSource;
  readonly scopeDistance: number;
}

const containsOffset = (
  range: { readonly start: number; readonly end: number },
  offset: number,
): boolean => range.start <= offset && offset < range.end;

export function queryScopeAtOffset(
  scopes: readonly QueryScope[],
  offset: number,
): QueryScope | undefined {
  let closest: QueryScope | undefined;
  for (const scope of scopes) {
    if (!containsOffset(scope.range, offset)) continue;
    if (
      !closest ||
      scope.range.end - scope.range.start <
        closest.range.end - closest.range.start
    )
      closest = scope;
  }
  return closest;
}

/** Resolves one qualifier through the canonical QueryScope visibility chain. */
export function resolveQueryScopeRowSource(
  scopes: readonly QueryScope[],
  activeScope: QueryScope | undefined,
  qualifier: string,
): ResolvedQueryScopeRowSource | undefined {
  const normalizedName = normalizeName(qualifier);
  const byId = new Map(scopes.map((scope) => [scope.id, scope]));
  let current = activeScope;
  let distance = 0;
  let upperBound: number | undefined;
  while (current) {
    const matches = current.localRowSources.filter(
      (binding) =>
        normalizeName(binding.qualifier) === normalizedName &&
        (upperBound === undefined ||
          (binding.sourceExpression?.end ?? binding.source.origin.end) <=
            upperBound),
    );
    if (matches.length !== 0)
      return matches.length === 1 && matches[0]
        ? { scope: current, binding: matches[0], scopeDistance: distance }
        : undefined;
    if (!current.allowsOuterReferences || !current.parentId) return undefined;
    upperBound = current.outerReferenceUpperBound;
    current = byId.get(current.parentId);
    distance++;
  }
  return undefined;
}

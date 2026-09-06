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

export interface InvisibleExplicitAlias {
  readonly scope: QueryScope;
  readonly binding: ScopedRowSource;
}

interface QueryScopeVisibilityStep {
  readonly scope: QueryScope;
  readonly scopeDistance: number;
  readonly upperBound?: number;
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

const queryScopeVisibilityChain = (
  scopes: readonly QueryScope[],
  activeScope: QueryScope | undefined,
): readonly QueryScopeVisibilityStep[] => {
  const byId = new Map(scopes.map((scope) => [scope.id, scope]));
  const chain: QueryScopeVisibilityStep[] = [];
  let current = activeScope;
  let scopeDistance = 0;
  let upperBound: number | undefined;
  while (current) {
    chain.push({
      scope: current,
      scopeDistance,
      ...(upperBound === undefined ? {} : { upperBound }),
    });
    if (!current.allowsOuterReferences || !current.parentId) break;
    upperBound = current.outerReferenceUpperBound;
    current = byId.get(current.parentId);
    scopeDistance++;
  }
  return chain;
};

const matchingBindings = (
  scope: QueryScope,
  normalizedName: string,
): readonly ScopedRowSource[] =>
  scope.localRowSources.filter(
    (binding) => normalizeName(binding.qualifier) === normalizedName,
  );

const isWithinUpperBound = (
  binding: ScopedRowSource,
  upperBound: number | undefined,
): boolean =>
  upperBound === undefined ||
  (binding.sourceExpression?.end ?? binding.source.origin.end) <= upperBound;

/** Resolves one qualifier through the canonical QueryScope visibility chain. */
export function resolveQueryScopeRowSource(
  scopes: readonly QueryScope[],
  activeScope: QueryScope | undefined,
  qualifier: string,
): ResolvedQueryScopeRowSource | undefined {
  const normalizedName = normalizeName(qualifier);
  for (const step of queryScopeVisibilityChain(scopes, activeScope)) {
    const matches = matchingBindings(step.scope, normalizedName).filter(
      (binding) => isWithinUpperBound(binding, step.upperBound),
    );
    if (matches.length !== 0)
      return matches.length === 1 && matches[0]
        ? {
            scope: step.scope,
            binding: matches[0],
            scopeDistance: step.scopeDistance,
          }
        : undefined;
  }
  return undefined;
}

/** Finds one explicit alias declaration that exists in this statement but is not visible here. */
export function resolveUniqueInvisibleExplicitAlias(
  scopes: readonly QueryScope[],
  activeScope: QueryScope | undefined,
  qualifier: string,
): InvisibleExplicitAlias | undefined {
  if (!activeScope) return undefined;
  const normalizedName = normalizeName(qualifier);
  for (const step of queryScopeVisibilityChain(scopes, activeScope)) {
    const matches = matchingBindings(step.scope, normalizedName);
    if (matches.some((binding) => isWithinUpperBound(binding, step.upperBound)))
      return undefined;
    // Positional APPLY visibility is not an alias-scope diagnostic.
    if (matches.length !== 0) return undefined;
  }

  const candidates: InvisibleExplicitAlias[] = [];
  for (const scope of scopes) {
    for (const binding of matchingBindings(scope, normalizedName)) {
      candidates.push({ scope, binding });
    }
  }
  const candidate = candidates.length === 1 ? candidates[0] : undefined;
  return candidate?.binding.explicitAlias && candidate.binding.aliasDeclaration
    ? candidate
    : undefined;
}

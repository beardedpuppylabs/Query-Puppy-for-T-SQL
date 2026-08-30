import { normalizeName } from "../metadata/MetadataModels.js";
import type { QueryScope, RowSource } from "./DocumentSemanticAnalyzer.js";
import type { LocalVariableSymbol } from "./LocalVariableSymbols.js";
import {
  queryScopeAtOffset,
  resolveQueryScopeRowSource,
} from "./QueryScopeResolver.js";
import type { SqlToken } from "./SqlTokenizer.js";

export interface DocumentOffsetRange {
  readonly start: number;
  readonly end: number;
}

export type DocumentSemanticSymbolKind =
  | "cte"
  | "rowSourceAlias"
  | "localVariable"
  | "tableVariable"
  | "temporaryTable";

export interface DocumentSemanticScope {
  readonly id: string;
  readonly kind: "query" | "batch" | "document";
  readonly range: DocumentOffsetRange;
}

export interface DocumentSemanticSymbol {
  readonly id: string;
  readonly name: string;
  readonly normalizedName: string;
  readonly kind: DocumentSemanticSymbolKind;
  readonly declaration: DocumentOffsetRange;
  readonly scope: DocumentSemanticScope;
}

export interface DocumentSemanticReference {
  readonly symbolId: string;
  readonly range: DocumentOffsetRange;
}

export interface DocumentSemanticSymbolIndex {
  readonly symbols: readonly DocumentSemanticSymbol[];
  readonly references: readonly DocumentSemanticReference[];
}

export interface DocumentSemanticOccurrence {
  readonly symbol: DocumentSemanticSymbol;
  readonly range: DocumentOffsetRange;
  readonly role: "declaration" | "reference";
}

interface BuildInput {
  readonly tokens: readonly SqlToken[];
  readonly documentRange: DocumentOffsetRange;
  readonly batchRange: DocumentOffsetRange;
  readonly statementRange: DocumentOffsetRange;
  readonly rowSources: readonly RowSource[];
  readonly queryScopes: readonly QueryScope[];
  readonly localVariables: readonly LocalVariableSymbol[];
}

const symbolId = (
  kind: DocumentSemanticSymbolKind,
  declaration: DocumentOffsetRange,
): string => `${kind}:${String(declaration.start)}:${String(declaration.end)}`;

const containsOffset = (range: DocumentOffsetRange, offset: number): boolean =>
  range.start <= offset && offset < range.end;

const sameRange = (
  left: DocumentOffsetRange,
  right: DocumentOffsetRange,
): boolean => left.start === right.start && left.end === right.end;

const rowSourceKind = (
  source: RowSource,
): DocumentSemanticSymbolKind | undefined => {
  switch (source.sourceKind) {
    case "cte":
      return "cte";
    case "tableVariable":
      return "tableVariable";
    case "tempTable":
      return "temporaryTable";
    default:
      return undefined;
  }
};

const rangeContainsRange = (
  outer: DocumentOffsetRange,
  inner: DocumentOffsetRange,
): boolean => outer.start <= inner.start && inner.end <= outer.end;

/** Builds declaration/reference bindings from the canonical parser semantic output. */
export function buildDocumentSemanticSymbolIndex(
  input: BuildInput,
): DocumentSemanticSymbolIndex {
  const symbols: DocumentSemanticSymbol[] = [];
  const references: DocumentSemanticReference[] = [];
  const symbolsById = new Map<string, DocumentSemanticSymbol>();
  const sourceSymbols = new Map<string, DocumentSemanticSymbol>();
  const aliasSymbols = new Map<string, DocumentSemanticSymbol>();

  const addSymbol = (
    kind: DocumentSemanticSymbolKind,
    name: string,
    declaration: DocumentOffsetRange,
    scope: DocumentSemanticScope,
  ): DocumentSemanticSymbol => {
    const id = symbolId(kind, declaration);
    const existing = symbolsById.get(id);
    if (existing) return existing;
    const symbol: DocumentSemanticSymbol = {
      id,
      name,
      normalizedName: normalizeName(name),
      kind,
      declaration,
      scope,
    };
    symbols.push(symbol);
    symbolsById.set(id, symbol);
    return symbol;
  };

  for (const variable of input.localVariables) {
    const kind = variable.kind === "table" ? "tableVariable" : "localVariable";
    addSymbol(kind, variable.name, variable.declaration, {
      id: `batch:${String(input.batchRange.start)}:${String(input.batchRange.end)}`,
      kind: "batch",
      range: input.batchRange,
    });
  }

  for (const source of input.rowSources) {
    const kind = rowSourceKind(source);
    if (!kind || !source.declaration) continue;
    const scope: DocumentSemanticScope =
      kind === "cte"
        ? {
            id: `statement:${String(input.statementRange.start)}:${String(input.statementRange.end)}`,
            kind: "query",
            range: input.statementRange,
          }
        : kind === "tableVariable"
          ? {
              id: `batch:${String(input.batchRange.start)}:${String(input.batchRange.end)}`,
              kind: "batch",
              range: input.batchRange,
            }
          : {
              id: "document",
              kind: "document",
              range: input.documentRange,
            };
    const symbol = addSymbol(kind, source.name, source.declaration, scope);
    sourceSymbols.set(source.sourceId, symbol);
  }

  for (const scope of input.queryScopes) {
    for (const binding of scope.localRowSources) {
      if (!binding.explicitAlias || !binding.aliasDeclaration) continue;
      const symbol = addSymbol(
        "rowSourceAlias",
        binding.qualifier,
        binding.aliasDeclaration,
        { id: scope.id, kind: "query", range: scope.range },
      );
      aliasSymbols.set(`${scope.id}:${symbol.normalizedName}`, symbol);
    }
  }

  const addReference = (
    symbol: DocumentSemanticSymbol | undefined,
    range: DocumentOffsetRange | undefined,
  ): void => {
    if (!symbol || !range || sameRange(symbol.declaration, range)) return;
    if (
      !references.some(
        (reference) =>
          reference.symbolId === symbol.id && sameRange(reference.range, range),
      )
    )
      references.push({ symbolId: symbol.id, range });
  };

  for (const scope of input.queryScopes)
    for (const binding of scope.localRowSources)
      addReference(
        sourceSymbols.get(binding.source.sourceId),
        binding.sourceName,
      );

  const sourcePaths = input.queryScopes.flatMap((scope) =>
    scope.localRowSources.flatMap((binding) =>
      binding.sourcePath ? [binding.sourcePath] : [],
    ),
  );
  for (let index = 0; index < input.tokens.length - 1; index++) {
    const token = input.tokens[index];
    if (!token || input.tokens[index + 1]?.text !== ".") continue;
    const tokenRange = { start: token.start, end: token.end };
    if (
      sourcePaths.some((sourceRange) =>
        rangeContainsRange(sourceRange, tokenRange),
      )
    )
      continue;
    const resolved = resolveQueryScopeRowSource(
      input.queryScopes,
      queryScopeAtOffset(input.queryScopes, token.start),
      token.text,
    );
    if (!resolved) continue;
    const resolvedSymbol = resolved.binding.explicitAlias
      ? aliasSymbols.get(
          `${resolved.scope.id}:${normalizeName(resolved.binding.qualifier)}`,
        )
      : sourceSymbols.get(resolved.binding.source.sourceId);
    addReference(resolvedSymbol, tokenRange);
  }

  for (const token of input.tokens) {
    if (token.kind !== "variable") continue;
    const range = { start: token.start, end: token.end };
    const matches = symbols.filter(
      (symbol) =>
        (symbol.kind === "localVariable" || symbol.kind === "tableVariable") &&
        symbol.normalizedName === normalizeName(token.text) &&
        rangeContainsRange(symbol.scope.range, range) &&
        symbol.declaration.start <= token.start,
    );
    if (matches.length === 1) addReference(matches[0], range);
  }

  symbols.sort(
    (left, right) => left.declaration.start - right.declaration.start,
  );
  references.sort((left, right) => left.range.start - right.range.start);
  return { symbols, references };
}

/** Resolves either a declaration or a bound reference at an exact document offset. */
export function semanticSymbolAtOffset(
  index: DocumentSemanticSymbolIndex,
  offset: number,
): DocumentSemanticOccurrence | undefined {
  const declaration = index.symbols.find((symbol) =>
    containsOffset(symbol.declaration, offset),
  );
  if (declaration)
    return {
      symbol: declaration,
      range: declaration.declaration,
      role: "declaration",
    };
  const reference = index.references.find((candidate) =>
    containsOffset(candidate.range, offset),
  );
  const symbol = reference
    ? index.symbols.find((candidate) => candidate.id === reference.symbolId)
    : undefined;
  return reference && symbol
    ? { symbol, range: reference.range, role: "reference" }
    : undefined;
}

export function semanticReferencesForSymbol(
  index: DocumentSemanticSymbolIndex,
  symbolId: string,
): readonly DocumentSemanticReference[] {
  return index.references.filter(
    (reference) => reference.symbolId === symbolId,
  );
}

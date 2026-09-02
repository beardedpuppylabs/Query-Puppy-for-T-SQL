import { DocumentSemanticCache } from "../parser/DocumentSemanticCache.js";
import {
  semanticSymbolAtOffset,
  type DocumentSemanticOccurrence,
  type DocumentSemanticSymbolIndex,
  type DocumentSemanticSymbolKind,
} from "../parser/DocumentSemanticSymbols.js";

const supportedKinds = new Set<DocumentSemanticSymbolKind>([
  "cte",
  "rowSourceAlias",
  "localVariable",
  "tableVariable",
  "temporaryTable",
]);

export const supportsDocumentSemanticNavigation = (
  kind: DocumentSemanticSymbolKind,
): boolean => supportedKinds.has(kind);

export interface DocumentSemanticNavigationTarget {
  readonly index: DocumentSemanticSymbolIndex;
  readonly occurrence: DocumentSemanticOccurrence;
}

/** Resolves a supported target through the canonical cached semantic model. */
export function resolveDocumentSemanticNavigationTarget(
  cache: DocumentSemanticCache,
  uri: string,
  version: number,
  sql: string,
  offset: number,
): DocumentSemanticNavigationTarget | undefined {
  let model = cache.get(uri, version, sql, offset);
  let occurrence = semanticSymbolAtOffset(model.documentLocalSymbols, offset);
  if (!occurrence && offset < sql.length) {
    const completed = cache.getCompletedStatement(uri, version, sql, offset);
    if (completed) {
      model = completed;
      occurrence = semanticSymbolAtOffset(model.documentLocalSymbols, offset);
    }
  }
  return occurrence &&
    supportsDocumentSemanticNavigation(occurrence.symbol.kind)
    ? { index: model.documentLocalSymbols, occurrence }
    : undefined;
}

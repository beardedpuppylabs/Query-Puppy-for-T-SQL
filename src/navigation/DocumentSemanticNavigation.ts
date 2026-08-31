import type { DocumentSemanticSymbolKind } from "../parser/DocumentSemanticSymbols.js";

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

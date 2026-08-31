import * as vscode from "vscode";
import { DocumentSemanticCache } from "../parser/DocumentSemanticCache.js";
import {
  semanticReferencesForSymbol,
  semanticSymbolAtOffset,
  type DocumentOffsetRange,
} from "../parser/DocumentSemanticSymbols.js";
import { supportsDocumentSemanticNavigation } from "./DocumentSemanticNavigation.js";

export class SqlReferenceProvider implements vscode.ReferenceProvider {
  private readonly documentSemantics = new DocumentSemanticCache();

  provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.ReferenceContext,
  ): vscode.ProviderResult<vscode.Location[]> {
    const offset = document.offsetAt(position);
    const sql = document.getText();
    let model = this.documentSemantics.get(
      document.uri.toString(),
      document.version,
      sql,
      offset,
    );
    let occurrence = semanticSymbolAtOffset(model.documentLocalSymbols, offset);
    if (!occurrence && offset < sql.length) {
      model = this.documentSemantics.get(
        document.uri.toString(),
        document.version,
        sql,
        sql.length,
      );
      occurrence = semanticSymbolAtOffset(model.documentLocalSymbols, offset);
    }
    if (
      !occurrence ||
      !supportsDocumentSemanticNavigation(occurrence.symbol.kind)
    )
      return;

    const ranges: DocumentOffsetRange[] = semanticReferencesForSymbol(
      model.documentLocalSymbols,
      occurrence.symbol.id,
    ).map((reference) => reference.range);
    if (context.includeDeclaration) ranges.push(occurrence.symbol.declaration);
    ranges.sort((left, right) => left.start - right.start);

    return ranges.map(
      (range) =>
        new vscode.Location(
          document.uri,
          new vscode.Range(
            document.positionAt(range.start),
            document.positionAt(range.end),
          ),
        ),
    );
  }

  closeDocument(uri: vscode.Uri): void {
    this.documentSemantics.delete(uri.toString());
  }
}

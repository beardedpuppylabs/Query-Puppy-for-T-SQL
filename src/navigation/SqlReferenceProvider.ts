import * as vscode from "vscode";
import { DocumentSemanticCache } from "../parser/DocumentSemanticCache.js";
import { semanticOccurrencesForSymbol } from "../parser/DocumentSemanticSymbols.js";
import { resolveDocumentSemanticNavigationTarget } from "./DocumentSemanticNavigation.js";

export class SqlReferenceProvider implements vscode.ReferenceProvider {
  constructor(
    private readonly documentSemantics = new DocumentSemanticCache(),
  ) {}

  provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.ReferenceContext,
  ): vscode.ProviderResult<vscode.Location[]> {
    const offset = document.offsetAt(position);
    const sql = document.getText();
    const target = resolveDocumentSemanticNavigationTarget(
      this.documentSemantics,
      document.uri.toString(),
      document.version,
      sql,
      offset,
    );
    if (!target) return;

    return semanticOccurrencesForSymbol(
      target.index,
      target.occurrence.symbol.id,
      context.includeDeclaration,
    ).map(
      (occurrence) =>
        new vscode.Location(
          document.uri,
          new vscode.Range(
            document.positionAt(occurrence.range.start),
            document.positionAt(occurrence.range.end),
          ),
        ),
    );
  }

  closeDocument(uri: vscode.Uri): void {
    this.documentSemantics.delete(uri.toString());
  }
}

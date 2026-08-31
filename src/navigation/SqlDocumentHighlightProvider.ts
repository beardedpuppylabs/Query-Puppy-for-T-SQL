import * as vscode from "vscode";
import { DocumentSemanticCache } from "../parser/DocumentSemanticCache.js";
import { semanticOccurrencesForSymbol } from "../parser/DocumentSemanticSymbols.js";
import { resolveDocumentSemanticNavigationTarget } from "./DocumentSemanticNavigation.js";

export class SqlDocumentHighlightProvider
  implements vscode.DocumentHighlightProvider
{
  private readonly documentSemantics = new DocumentSemanticCache();

  provideDocumentHighlights(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.ProviderResult<vscode.DocumentHighlight[]> {
    const offset = document.offsetAt(position);
    const target = resolveDocumentSemanticNavigationTarget(
      this.documentSemantics,
      document.uri.toString(),
      document.version,
      document.getText(),
      offset,
    );
    if (!target) return;

    return semanticOccurrencesForSymbol(
      target.index,
      target.occurrence.symbol.id,
    ).map(
      (occurrence) =>
        new vscode.DocumentHighlight(
          new vscode.Range(
            document.positionAt(occurrence.range.start),
            document.positionAt(occurrence.range.end),
          ),
          vscode.DocumentHighlightKind.Text,
        ),
    );
  }

  closeDocument(uri: vscode.Uri): void {
    this.documentSemantics.delete(uri.toString());
  }
}

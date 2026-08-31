import * as vscode from "vscode";
import { DocumentSemanticCache } from "../parser/DocumentSemanticCache.js";
import { semanticDefinitionAtOffset } from "../parser/DocumentSemanticSymbols.js";
import { supportsDocumentSemanticNavigation } from "./DocumentSemanticNavigation.js";

export class SqlDefinitionProvider implements vscode.DefinitionProvider {
  private readonly documentSemantics = new DocumentSemanticCache();

  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.ProviderResult<vscode.Definition> {
    const offset = document.offsetAt(position);
    const model = this.documentSemantics.get(
      document.uri.toString(),
      document.version,
      document.getText(),
      offset,
    );
    const definition = semanticDefinitionAtOffset(
      model.documentLocalSymbols,
      offset,
    );
    if (
      !definition ||
      !supportsDocumentSemanticNavigation(definition.symbol.kind)
    )
      return;
    return new vscode.Location(
      document.uri,
      new vscode.Range(
        document.positionAt(definition.declaration.start),
        document.positionAt(definition.declaration.end),
      ),
    );
  }

  closeDocument(uri: vscode.Uri): void {
    this.documentSemantics.delete(uri.toString());
  }
}

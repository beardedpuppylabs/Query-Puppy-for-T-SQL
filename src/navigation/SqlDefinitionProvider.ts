import * as vscode from "vscode";
import { DocumentSemanticCache } from "../parser/DocumentSemanticCache.js";
import { resolveDocumentSemanticNavigationTarget } from "./DocumentSemanticNavigation.js";

export class SqlDefinitionProvider implements vscode.DefinitionProvider {
  constructor(
    private readonly documentSemantics = new DocumentSemanticCache(),
  ) {}

  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.ProviderResult<vscode.Definition> {
    const offset = document.offsetAt(position);
    const target = resolveDocumentSemanticNavigationTarget(
      this.documentSemantics,
      document.uri.toString(),
      document.version,
      document.getText(),
      offset,
    );
    if (!target) return;
    const declaration = target.occurrence.symbol.declaration;
    return new vscode.Location(
      document.uri,
      new vscode.Range(
        document.positionAt(declaration.start),
        document.positionAt(declaration.end),
      ),
    );
  }

  closeDocument(uri: vscode.Uri): void {
    this.documentSemantics.delete(uri.toString());
  }
}

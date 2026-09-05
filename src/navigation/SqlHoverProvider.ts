import * as vscode from "vscode";
import { DocumentSemanticCache } from "../parser/DocumentSemanticCache.js";
import { resolveDocumentSemanticNavigationTarget } from "./DocumentSemanticNavigation.js";
import { localVariableInitializerPreview } from "./DocumentSymbolPresentation.js";

export class SqlHoverProvider implements vscode.HoverProvider {
  constructor(
    private readonly documentSemantics = new DocumentSemanticCache(),
  ) {}

  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.ProviderResult<vscode.Hover> {
    const sql = document.getText();
    const target = resolveDocumentSemanticNavigationTarget(
      this.documentSemantics,
      document.uri.toString(),
      document.version,
      sql,
      document.offsetAt(position),
    );
    if (target?.occurrence.symbol.kind !== "localVariable") return;

    const initializer = localVariableInitializerPreview(
      target.occurrence.symbol,
      sql,
    );
    if (!initializer) return;

    const contents = new vscode.MarkdownString();
    contents.appendText(`Initializer: ${initializer}`);
    const occurrence = target.occurrence.range;
    return new vscode.Hover(
      contents,
      new vscode.Range(
        document.positionAt(occurrence.start),
        document.positionAt(occurrence.end),
      ),
    );
  }
}

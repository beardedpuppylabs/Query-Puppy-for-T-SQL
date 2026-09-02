import * as vscode from "vscode";
import { collectDocumentSemanticDeclarations } from "../parser/DocumentSemanticAnalyzer.js";
import type { DocumentSemanticSymbol } from "../parser/DocumentSemanticSymbols.js";

interface CacheEntry {
  readonly version: number;
  readonly declarations: readonly DocumentSemanticSymbol[];
}

const presentation: Readonly<
  Record<
    DocumentSemanticSymbol["kind"],
    { readonly detail: string; readonly kind: vscode.SymbolKind }
  >
> = {
  cte: { detail: "CTE", kind: vscode.SymbolKind.Struct },
  rowSourceAlias: {
    detail: "Row source alias",
    kind: vscode.SymbolKind.Variable,
  },
  localVariable: {
    detail: "Local variable",
    kind: vscode.SymbolKind.Variable,
  },
  tableVariable: {
    detail: "Table variable",
    kind: vscode.SymbolKind.Variable,
  },
  temporaryTable: {
    detail: "Temporary table",
    kind: vscode.SymbolKind.Object,
  },
};

export class SqlDocumentSymbolProvider
  implements vscode.DocumentSymbolProvider
{
  private readonly entries = new Map<string, CacheEntry>();

  constructor(
    private readonly collectDeclarations = collectDocumentSemanticDeclarations,
  ) {}

  provideDocumentSymbols(
    document: vscode.TextDocument,
  ): vscode.ProviderResult<vscode.DocumentSymbol[]> {
    const uri = document.uri.toString();
    const existing = this.entries.get(uri);
    const declarations =
      existing?.version === document.version
        ? existing.declarations
        : this.collectDeclarations(document.getText());
    if (existing?.version !== document.version)
      this.entries.set(uri, { version: document.version, declarations });

    return declarations.map((declaration) => {
      const display = presentation[declaration.kind];
      const range = new vscode.Range(
        document.positionAt(declaration.declaration.start),
        document.positionAt(declaration.declaration.end),
      );
      return new vscode.DocumentSymbol(
        declaration.name,
        display.detail,
        display.kind,
        range,
        range,
      );
    });
  }

  closeDocument(uri: vscode.Uri): void {
    this.entries.delete(uri.toString());
  }
}

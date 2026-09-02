import * as vscode from "vscode";
import { collectHighConfidenceDocumentIssues } from "../parser/DocumentSemanticDiagnostics.js";

const DIAGNOSTIC_SOURCE = "Query Puppy";

export class SqlDocumentDiagnostics implements vscode.Disposable {
  private readonly collection =
    vscode.languages.createDiagnosticCollection("query-puppy");

  update(document: vscode.TextDocument): void {
    if (document.languageId !== "sql") {
      this.collection.delete(document.uri);
      return;
    }
    this.collection.set(
      document.uri,
      collectHighConfidenceDocumentIssues(document.getText()).map((issue) => {
        const diagnostic = new vscode.Diagnostic(
          new vscode.Range(
            document.positionAt(issue.range.start),
            document.positionAt(issue.range.end),
          ),
          issue.message,
          vscode.DiagnosticSeverity.Error,
        );
        diagnostic.source = DIAGNOSTIC_SOURCE;
        diagnostic.code = issue.code;
        return diagnostic;
      }),
    );
  }

  closeDocument(uri: vscode.Uri): void {
    this.collection.delete(uri);
  }

  dispose(): void {
    this.collection.dispose();
  }
}

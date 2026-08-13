import * as vscode from "vscode";
import type { MetadataCache } from "../metadata/MetadataCache.js";
import type { ConnectionService } from "../mssql/ConnectionService.js";
import {
  resolveSelectWildcard,
  wildcardColumnExpressions,
  type SemanticCatalog,
} from "../parser/DocumentSemanticAnalyzer.js";

export const CAN_EXPAND_SELECT_STAR =
  "improvedSqlIntellisense.canExpandSelectStar";

export class SelectStarExpansionController implements vscode.Disposable {
  private expansion: ReturnType<typeof resolveSelectWildcard>;
  private generation = 0;
  private readonly subscriptions: vscode.Disposable[];

  constructor(
    private readonly connections: ConnectionService,
    private readonly cache: MetadataCache,
  ) {
    const update = (): void => void this.update();
    this.subscriptions = [
      vscode.window.onDidChangeActiveTextEditor(update),
      vscode.window.onDidChangeTextEditorSelection(update),
      vscode.workspace.onDidChangeTextDocument(update),
      vscode.commands.registerCommand(
        "improvedSqlIntellisense.expandSelectStar",
        () => this.expand(),
      ),
    ];
    update();
  }

  dispose(): void {
    for (const subscription of this.subscriptions) subscription.dispose();
  }

  private async update(): Promise<void> {
    const generation = ++this.generation;
    this.expansion = undefined;
    await vscode.commands.executeCommand(
      "setContext",
      CAN_EXPAND_SELECT_STAR,
      false,
    );
    const editor = vscode.window.activeTextEditor;
    if (
      !editor ||
      editor.document.languageId !== "sql" ||
      !editor.selection.isEmpty
    )
      return;
    const catalog = await this.cachedCatalog();
    if (generation !== this.generation) return;
    const cursor = editor.document.offsetAt(editor.selection.active);
    this.expansion = resolveSelectWildcard(
      editor.document.getText(),
      cursor,
      catalog,
    );
    await vscode.commands.executeCommand(
      "setContext",
      CAN_EXPAND_SELECT_STAR,
      Boolean(this.expansion),
    );
  }

  private async expand(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || !this.expansion) return;
    const expansion = this.expansion;
    const start = editor.document.positionAt(expansion.start);
    const line = editor.document.lineAt(start.line).text;
    const indent = " ".repeat(start.character);
    const expressions = wildcardColumnExpressions(expansion);
    const continuation = line.slice(0, start.character).trim().length
      ? " ".repeat(start.character)
      : indent;
    const replacement = expressions.join(`,\n${continuation}`);
    await editor.edit((edit) =>
      edit.replace(
        new vscode.Range(start, editor.document.positionAt(expansion.end)),
        replacement,
      ),
    );
  }

  private async cachedCatalog(): Promise<SemanticCatalog | undefined> {
    const active = await this.connections.active();
    if (!active) return undefined;
    const indexes = new Map<
      string,
      NonNullable<ReturnType<MetadataCache["get"]>>
    >();
    for (const snapshot of this.cache.snapshots(active.connectionId)) {
      const index = this.cache.get(active.connectionId, snapshot.database);
      if (index)
        indexes.set(snapshot.database.toLocaleLowerCase("en-US"), index);
    }
    return { activeDatabase: active.database, indexes };
  }
}

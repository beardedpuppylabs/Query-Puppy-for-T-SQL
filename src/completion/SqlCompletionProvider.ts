import * as vscode from "vscode";
import type { ConnectionService } from "../mssql/ConnectionService.js";
import type { MetadataLoader } from "../mssql/MetadataLoader.js";
import { MetadataCache } from "../metadata/MetadataCache.js";
import { resolveSqlContext } from "../parser/SqlContextResolver.js";
import { createCandidates } from "./CandidateFactory.js";
import { presentCandidate } from "./CompletionPresenter.js";

export class SqlCompletionProvider implements vscode.CompletionItemProvider {
  constructor(
    private readonly connections: ConnectionService,
    private readonly loader: MetadataLoader,
    private readonly cache: MetadataCache,
    private readonly output: vscode.OutputChannel,
  ) {}
  async provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
  ): Promise<vscode.CompletionList> {
    if (!(
      vscode.workspace
        .getConfiguration("improvedSqlIntellisense")
        .get<boolean>("enabled") ?? true
    ))
      return new vscode.CompletionList([], true);
    const offset = document.offsetAt(position);
    const context = resolveSqlContext(document.getText(), offset);
    let index;
    try {
      const active = await this.connections.active();
      if (active && !token.isCancellationRequested) {
        const key = MetadataCache.key(active.connectionId, active.database);
        index = this.cache.peek(key);
        if (!index)
          index = await this.cache.load(key, () => this.loader.load(active));
      }
    } catch (error) {
      this.output.appendLine(
        `Metadata unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (token.isCancellationRequested)
      return new vscode.CompletionList([], true);
    const candidates = createCandidates(context, index);
    const types = new Set(candidates.map((candidate) => candidate.kind));
    const start = document.positionAt(context.replacementStart);
    const range = new vscode.Range(start, position);
    return new vscode.CompletionList(
      candidates.map((candidate, rank) =>
        presentCandidate(
          candidate,
          range,
          context.search,
          types.size > 1,
          rank,
        ),
      ),
      true,
    );
  }
}

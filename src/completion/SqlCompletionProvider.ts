import * as vscode from "vscode";
import type { ConnectionService } from "../mssql/ConnectionService.js";
import type { MetadataLoader } from "../mssql/MetadataLoader.js";
import { MetadataCache } from "../metadata/MetadataCache.js";
import { resolveSqlContext } from "../parser/SqlContextResolver.js";
import { createCandidates, type CompletionScope } from "./CandidateFactory.js";
import { CompletionScopeResolver } from "./CompletionScopeResolver.js";
import { presentCandidate } from "./CompletionPresenter.js";

export class SqlCompletionProvider implements vscode.CompletionItemProvider {
  private readonly loggedFailures = new Set<string>();
  private readonly scopes: CompletionScopeResolver;

  constructor(
    private readonly connections: ConnectionService,
    private readonly loader: MetadataLoader,
    private readonly cache: MetadataCache,
    private readonly output: vscode.OutputChannel,
  ) {
    this.scopes = new CompletionScopeResolver(
      connections,
      loader,
      cache,
      (key, error) => this.logFailureOnce(key, error),
    );
  }
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
    if (context.kind === "unsupported") {
      this.debug("Ignoring unsupported four-part identifier completion.");
      return new vscode.CompletionList([], false);
    }
    let scope: CompletionScope | undefined;
    try {
      const active = await this.connections.active();
      if (active && !token.isCancellationRequested)
        scope = await this.scopes.resolve(active, context);
    } catch (error) {
      this.logFailureOnce("completion", error);
    }
    if (token.isCancellationRequested)
      return new vscode.CompletionList([], true);
    const candidates = createCandidates(context, scope);
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

  private logFailureOnce(key: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    const identity = `${key}:${message}`;
    if (this.loggedFailures.has(identity)) return;
    this.loggedFailures.add(identity);
    this.output.appendLine(`Metadata unavailable: ${message}`);
  }
  private debug(message: string): void {
    if (
      vscode.workspace
        .getConfiguration("improvedSqlIntellisense")
        .get<boolean>("debugLogging") ??
      false
    )
      this.output.appendLine(message);
  }
}

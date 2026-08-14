import * as vscode from "vscode";
import type { ConnectionService } from "../mssql/ConnectionService.js";
import type { MetadataLoader } from "../mssql/MetadataLoader.js";
import { MetadataCache } from "../metadata/MetadataCache.js";
import { resolveSqlContext } from "../parser/SqlContextResolver.js";
import { createCandidates, type CompletionScope } from "./CandidateFactory.js";
import { CompletionScopeResolver } from "./CompletionScopeResolver.js";
import { presentCandidate } from "./CompletionPresenter.js";
import { columnPresentationLayout } from "./PresentationModel.js";
import { DocumentSemanticCache } from "../parser/DocumentSemanticCache.js";
import { resolveSmartAliasContext } from "../parser/SmartAlias.js";
import { resolveVisibleRowSource } from "../parser/DocumentSemanticAnalyzer.js";
import {
  classifyCompletionContext,
  completionDomainPolicy,
} from "../parser/CompletionContextClassifier.js";

export class SqlCompletionProvider implements vscode.CompletionItemProvider {
  private readonly loggedFailures = new Set<string>();
  private readonly scopes: CompletionScopeResolver;
  private readonly documentSemantics = new DocumentSemanticCache();
  private readonly loggedEmptyProjections = new Set<string>();
  private testScope?: CompletionScope;

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
  setTestScope(scope: CompletionScope): void {
    this.testScope = scope;
  }
  async diagnoseQueryScope(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<string> {
    const context = resolveSqlContext(
      document.getText(),
      document.offsetAt(position),
    );
    let scope = this.testScope;
    if (!scope) {
      const active = await this.connections.active();
      if (active) scope = await this.scopes.resolve(active, context);
    }
    const semantics = this.documentSemantics.get(
      document.uri.toString(),
      document.version,
      context.sql,
      context.cursor,
      scope,
    );
    const qualifier = context.qualifier?.parts[0];
    const binding = qualifier
      ? resolveVisibleRowSource(semantics, qualifier)
      : undefined;
    const candidates = createCandidates(context, scope, semantics);
    const clause = classifyCompletionContext(
      context.sql,
      context.cursor,
      semantics,
    );
    const policy = completionDomainPolicy(clause);
    const local = semantics.visibleRowSources.filter(
      (source) => source.scopeDistance === 0,
    );
    const parents = semantics.visibleRowSources.filter(
      (source) => source.scopeDistance > 0,
    );
    const identity = binding
      ? `${binding.source.database ? `${binding.source.database}.` : ""}${binding.source.schema ? `${binding.source.schema}.` : ""}${binding.source.name}`
      : "unresolved";
    return [
      `Scope kind: ${semantics.activeQueryScope?.kind ?? "none"}`,
      `Clause context: ${clause.clause}`,
      `Expression domain: ${clause.expression ? "yes" : "no"}`,
      `Projection aliases: ${policy.allowProjectionAliases ? "allowed" : "hidden"}`,
      `JOIN left sources: ${clause.join?.leftVisibleRowSources.map((source) => source.qualifier).join(", ") || "none"}`,
      `JOIN current right source: ${clause.join?.currentRightRowSource?.qualifier ?? "none"}`,
      `Local RowSources: ${local.map((source) => `${source.qualifier} -> ${source.source.name}`).join(", ") || "none"}`,
      `Correlation allowed: ${semantics.activeQueryScope?.allowsOuterReferences ? "yes" : "no"}`,
      `Eligible parents: ${parents.map((source) => `${source.qualifier} (distance ${String(source.scopeDistance)}) -> ${source.source.name}`).join(", ") || "none"}`,
      `Explicit qualifier: ${qualifier ?? "none"}`,
      `Resolved RowSource: ${identity}`,
      `Resolved columns: ${String(binding?.source.columns.length ?? 0)}`,
      `Semantic candidates: ${String(candidates.length)}`,
    ].join("\n");
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
    let scope: CompletionScope | undefined = this.testScope;
    try {
      const active = scope ? undefined : await this.connections.active();
      if (!scope && active && !token.isCancellationRequested)
        scope = await this.scopes.resolve(active, context);
    } catch (error) {
      this.logFailureOnce("completion", error);
    }
    if (token.isCancellationRequested)
      return new vscode.CompletionList([], true);
    const semantics = this.documentSemantics.get(
      document.uri.toString(),
      document.version,
      context.sql,
      context.cursor,
      scope,
    );
    if (semantics.activeQueryScope)
      this.debug(
        `Query scope at cursor: ${semantics.activeQueryScope.kind}; visible aliases: ${
          semantics.visibleRowSources
            .map(
              (binding) =>
                `${binding.qualifier}${binding.outer ? " (outer)" : ""} -> ${binding.source.database ? `${binding.source.database}.` : ""}${binding.source.schema ? `${binding.source.schema}.` : ""}${binding.source.name}`,
            )
            .join(", ") || "none"
        }; outer correlation: ${semantics.activeQueryScope.allowsOuterReferences ? "enabled" : "disabled"}.`,
      );
    const requestedAlias = context.qualifier?.parts[0];
    if (requestedAlias) {
      const binding = resolveVisibleRowSource(semantics, requestedAlias);
      this.debug(
        `Scoped alias lookup: requested=${requestedAlias}; local=${binding?.scopeDistance === 0 ? "yes" : "no"}; parent=${binding?.outer ? `yes (distance ${String(binding.scopeDistance)})` : "no"}; match=${binding ? `${binding.source.database ? `${binding.source.database}.` : ""}${binding.source.schema ? `${binding.source.schema}.` : ""}${binding.source.name}` : "none"}.`,
      );
    }
    if (
      vscode.workspace
        .getConfiguration("improvedSqlIntellisense.smartAliases", document.uri)
        .get<boolean>("enabled") ??
      true
    ) {
      const alias = resolveSmartAliasContext(
        context.sql,
        context.cursor,
        semantics,
        scope,
      );
      if (alias) {
        const item = new vscode.CompletionItem(
          `AS ${alias.alias}`,
          vscode.CompletionItemKind.Snippet,
        );
        (item as vscode.CompletionItem & { data?: unknown }).data = {
          provider: "improved-sql-intellisense",
          semanticKind: "rowSourceAlias",
        };
        item.detail = `alias for ${alias.objectName}`;
        item.insertText = new vscode.SnippetString(
          `${alias.leadingSpace ? " " : ""}AS \${1:${alias.alias}}`,
        );
        item.range = new vscode.Range(position, position);
        item.sortText = "00000000";
        item.filterText = `AS ${alias.alias}`;
        return new vscode.CompletionList([item], false);
      }
    }
    const memberAlias = context.qualifier?.parts[0];
    const memberSource = memberAlias
      ? semantics.aliases.get(memberAlias.toLocaleLowerCase("en-US"))
      : undefined;
    if (
      (context.kind === "member" || context.kind === "qualified") &&
      memberSource &&
      memberSource.columns.length === 0
    ) {
      const identity = `${document.uri.toString()}:${String(document.version)}:${memberSource.sourceId}`;
      if (!this.loggedEmptyProjections.has(identity)) {
        this.loggedEmptyProjections.add(identity);
        this.debug(
          `Resolved alias \`${memberAlias ?? memberSource.name}\` to ${memberSource.sourceKind} \`${memberSource.name}\`, but the projection contains 0 columns.`,
        );
      }
    }
    const candidates = createCandidates(context, scope, semantics);
    const types = new Set(candidates.map((candidate) => candidate.kind));
    const start = document.positionAt(context.replacementStart);
    const range = new vscode.Range(start, position);
    const columnLayout = columnPresentationLayout(candidates);
    return new vscode.CompletionList(
      candidates.map((candidate, rank) =>
        presentCandidate(
          candidate,
          range,
          context.search,
          types.size > 1,
          rank,
          columnLayout,
        ),
      ),
      true,
    );
  }

  closeDocument(uri: vscode.Uri): void {
    this.documentSemantics.delete(uri.toString());
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

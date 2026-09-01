import * as vscode from "vscode";
import type {
  ConnectionContextResolver,
  MetadataBackend,
} from "../backend/MetadataBackend.js";
import type { MetadataLoader } from "../metadata/MetadataLoader.js";
import { MetadataCache } from "../metadata/MetadataCache.js";
import { resolveSqlContext } from "../parser/SqlContextResolver.js";
import { createCandidates, type CompletionScope } from "./CandidateFactory.js";
import { CompletionScopeResolver } from "./CompletionScopeResolver.js";
import { presentCandidate } from "./CompletionPresenter.js";
import {
  typeDisplayGroup,
  typeDisplayGroupLabel,
  type TypeDisplayGroup,
} from "./TypeCompatibilityGrouping.js";
import { completionSortText } from "./CompletionSorter.js";
import { DocumentSemanticCache } from "../parser/DocumentSemanticCache.js";
import { resolveSmartAliasContext } from "../parser/SmartAlias.js";
import { resolveVisibleRowSource } from "../parser/DocumentSemanticAnalyzer.js";
import {
  classifyCompletionContext,
  completionDomainPolicy,
} from "../parser/CompletionContextClassifier.js";
import type { WorkspaceProjectRelationships } from "../relationships/WorkspaceProjectRelationships.js";
import type { WorkspaceLearnedRelationshipEvidence } from "../relationships/WorkspaceLearnedRelationshipEvidence.js";
import { ROW_SOURCE_OBJECT_KINDS } from "../parser/CatalogObjectResolver.js";
import { normalizeName } from "../metadata/MetadataModels.js";

export class SqlCompletionProvider implements vscode.CompletionItemProvider {
  private readonly loggedFailures = new Set<string>();
  private readonly scopes: CompletionScopeResolver;
  private readonly documentSemantics = new DocumentSemanticCache();
  private readonly loggedEmptyProjections = new Set<string>();
  private readonly reportedAmbiguities = new Map<string, string>();
  private readonly testAmbiguityNotifications: string[] = [];
  private automaticCompletionExpectation:
    | {
        readonly kind: string;
        readonly uri: string;
        readonly documentVersion: number;
        readonly offset: number;
      }
    | undefined;
  private readonly automaticCompletionInvocations: AutomaticCompletionInvocation[] =
    [];
  private testScope?: CompletionScope;

  constructor(
    private readonly connectionContext: ConnectionContextResolver,
    metadataBackend: MetadataBackend,
    private readonly loader: MetadataLoader,
    private readonly cache: MetadataCache,
    private readonly output: vscode.OutputChannel,
    private readonly observeAutomaticCompletions = false,
    private readonly projectRelationships?: WorkspaceProjectRelationships,
    private readonly learnedRelationshipEvidence?: WorkspaceLearnedRelationshipEvidence,
  ) {
    this.scopes = new CompletionScopeResolver(
      metadataBackend,
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
      const active = await this.connectionContext.active();
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
    this.reportAmbiguousAlias(document, context, scope, semantics);
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
    completionContext?: vscode.CompletionContext,
  ): Promise<vscode.CompletionList> {
    const completion = await this.createCompletionItems(
      document,
      position,
      token,
    );
    this.observeAutomaticCompletion(
      document,
      position,
      completion,
      completionContext,
    );
    return completion;
  }

  private async createCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
  ): Promise<vscode.CompletionList> {
    if (!(
      vscode.workspace
        .getConfiguration("queryPuppyForTSql")
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
      const active = scope ? undefined : await this.connectionContext.active();
      if (!scope && active && !token.isCancellationRequested)
        scope = await this.scopes.resolve(active, context);
      if (scope && !this.testScope && this.projectRelationships)
        scope = await this.projectRelationships.apply(document, scope);
      if (scope && !this.testScope && this.learnedRelationshipEvidence)
        scope = await this.learnedRelationshipEvidence.applyCandidates(
          document,
          scope,
        );
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
        .getConfiguration("queryPuppyForTSql.smartAliases", document.uri)
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
        const text = alias.explicitAs ? alias.alias : `AS ${alias.alias}`;
        const item = new vscode.CompletionItem(
          {
            label: text,
            description: `alias for ${alias.objectName}`,
          },
          vscode.CompletionItemKind.Variable,
        );
        (item as vscode.CompletionItem & { data?: unknown }).data = {
          provider: "query-puppy-for-t-sql",
          semanticKind: "rowSourceAlias",
        };
        item.detail = `alias for ${alias.sourceName}`;
        item.insertText = text;
        item.range = new vscode.Range(position, position);
        item.sortText = "00000000";
        item.filterText = text;
        const continuation = createCandidates(context, scope, semantics)
          .filter(
            (candidate) =>
              candidate.kind === "keyword" && candidate.name === "ON",
          )
          .map((candidate, rank) =>
            presentCandidate(
              candidate,
              new vscode.Range(position, position),
              "",
              false,
              rank + 1,
            ),
          );
        return new vscode.CompletionList([item, ...continuation], false);
      }
    }
    const candidates = createCandidates(context, scope, semantics);
    this.reportAmbiguousAlias(document, context, scope, semantics);
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
    const types = new Set(candidates.map((candidate) => candidate.kind));
    const start = document.positionAt(context.replacementStart);
    const range = new vscode.Range(start, position);
    const materialize = (
      candidate: (typeof candidates)[number],
      rank: number,
    ) =>
      presentCandidate(
        candidate,
        candidate.replacementStart === undefined
          ? range
          : new vscode.Range(
              document.positionAt(candidate.replacementStart),
              position,
            ),
        context.search,
        types.size > 1,
        rank,
        candidate.kind === "joinPredicate" &&
          candidate.replacementStart === context.replacementStart &&
          context.search.length === 0 &&
          context.replacementStart > 0 &&
          !/\s/.test(context.sql[context.replacementStart - 1] ?? "")
          ? context.sql[context.replacementStart - 1]
          : undefined,
      );
    const visibleGroups = new Set(
      candidates.flatMap((candidate) => {
        const group = typeDisplayGroup(candidate);
        return group ? [group] : [];
      }),
    );
    if (visibleGroups.size <= 1)
      return new vscode.CompletionList(candidates.map(materialize), true);
    const items: vscode.CompletionItem[] = [];
    const added = new Set<TypeDisplayGroup>();
    let sortRank = 0;
    for (const candidate of candidates) {
      const group = typeDisplayGroup(candidate);
      if (group && !added.has(group)) {
        added.add(group);
        const header = new vscode.CompletionItem(
          `──────── ${typeDisplayGroupLabel(group, candidate)} ────────`,
          vscode.CompletionItemKind.Text,
        );
        (header as vscode.CompletionItem & { data?: unknown }).data = {
          provider: "query-puppy-for-t-sql",
          decorative: "typeGroupHeader",
        };
        header.filterText = context.search || candidate.name;
        header.preselect = false;
        header.insertText = "";
        header.range = new vscode.Range(position, position);
        header.sortText = completionSortText(sortRank++);
        items.push(header);
      }
      const item = materialize(candidate, sortRank++);
      if (items.length === 1) item.preselect = true;
      items.push(item);
    }
    return new vscode.CompletionList(items, true);
  }

  closeDocument(uri: vscode.Uri): void {
    this.documentSemantics.delete(uri.toString());
    this.reportedAmbiguities.delete(uri.toString());
  }

  takeTestAmbiguityNotifications(): readonly string[] {
    return this.testAmbiguityNotifications.splice(0);
  }

  expectAutomaticCompletionInvocation(
    kind: string,
    uri: vscode.Uri,
    documentVersion: number,
    offset: number,
  ): void {
    if (!this.observeAutomaticCompletions) return;
    this.automaticCompletionExpectation = {
      kind,
      uri: uri.toString(),
      documentVersion,
      offset,
    };
  }

  clearAutomaticCompletionExpectation(): void {
    this.automaticCompletionExpectation = undefined;
  }

  takeAutomaticCompletionInvocations(): readonly AutomaticCompletionInvocation[] {
    const invocations = this.automaticCompletionInvocations.splice(0);
    return invocations;
  }

  private observeAutomaticCompletion(
    document: vscode.TextDocument,
    position: vscode.Position,
    completion: vscode.CompletionList,
    context: vscode.CompletionContext | undefined,
  ): void {
    if (!this.observeAutomaticCompletions) return;
    const expected = this.automaticCompletionExpectation;
    if (
      !expected ||
      !context ||
      expected.uri !== document.uri.toString() ||
      expected.documentVersion !== document.version ||
      expected.offset !== document.offsetAt(position)
    )
      return;
    this.automaticCompletionExpectation = undefined;
    this.automaticCompletionInvocations.push({
      kind: expected.kind,
      documentVersion: document.version,
      offset: expected.offset,
      items: completion.items.flatMap((item) => {
        const data = (
          item as vscode.CompletionItem & {
            readonly data?: {
              readonly provider?: string;
              readonly semanticKind?: string;
              readonly decorative?: string;
            };
          }
        ).data;
        if (
          data?.provider !== "query-puppy-for-t-sql" ||
          data.decorative ||
          !data.semanticKind
        )
          return [];
        return [
          {
            name:
              data.semanticKind === "column" &&
              typeof item.filterText === "string"
                ? item.filterText
                : typeof item.label === "string"
                  ? item.label
                  : item.label.label,
            semanticKind: data.semanticKind,
          },
        ];
      }),
    });
  }

  private logFailureOnce(key: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    const identity = `${key}:${message}`;
    if (this.loggedFailures.has(identity)) return;
    this.loggedFailures.add(identity);
    this.output.appendLine(`Metadata unavailable: ${message}`);
  }
  private reportAmbiguousAlias(
    document: vscode.TextDocument,
    context: ReturnType<typeof resolveSqlContext>,
    scope: CompletionScope | undefined,
    semantics: ReturnType<DocumentSemanticCache["get"]>,
  ): void {
    const qualifier = context.qualifier?.parts[0] ?? "";
    const binding = qualifier
      ? resolveVisibleRowSource(semantics, qualifier)
      : undefined;
    const reference = context.aliasSource;
    const source = binding?.source;
    if (
      !scope ||
      (reference?.schema ?? source?.schema) ||
      (!reference && (!source?.database || source.sourceObject))
    )
      return;
    const name = reference?.name ?? source?.name ?? "";
    const alias = reference?.alias ?? qualifier;
    const database =
      reference?.database ?? source?.database ?? scope.activeDatabase;
    const index = scope.indexes.get(normalizeName(database));
    const matches =
      index?.findObjectsByName(name, ROW_SOURCE_OBJECT_KINDS) ?? [];
    if (matches.length <= 1) return;
    const identity = `${String(document.version)}:${normalizeName(alias)}:${normalizeName(name)}:${matches
      .map((object) => normalizeName(object.schema))
      .sort()
      .join(",")}`;
    const uri = document.uri.toString();
    if (this.reportedAmbiguities.get(uri) === identity) return;
    this.reportedAmbiguities.set(uri, identity);
    const message = `Query Puppy: "${name}" is ambiguous across schemas. Qualify it with a schema to enable semantic suggestions.`;
    if (this.observeAutomaticCompletions)
      this.testAmbiguityNotifications.push(message);
    vscode.window.setStatusBarMessage(message, 7000);
  }
  private debug(message: string): void {
    if (
      vscode.workspace
        .getConfiguration("queryPuppyForTSql")
        .get<boolean>("debugLogging") ??
      false
    )
      this.output.appendLine(message);
  }
}

export interface AutomaticCompletionInvocation {
  readonly kind: string;
  readonly documentVersion: number;
  readonly offset: number;
  readonly items: readonly {
    readonly name: string;
    readonly semanticKind: string;
  }[];
}

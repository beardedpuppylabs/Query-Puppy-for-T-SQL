import * as vscode from "vscode";
import type {
  ConnectionContextResolver,
  MetadataBackend,
} from "../backend/MetadataBackend.js";
import type { CompletionScope } from "../completion/CandidateFactory.js";
import { CompletionScopeResolver } from "../completion/CompletionScopeResolver.js";
import { MetadataCache } from "../metadata/MetadataCache.js";
import type { MetadataLoader } from "../metadata/MetadataLoader.js";
import { DocumentSemanticCache } from "../parser/DocumentSemanticCache.js";
import { resolveSqlContext } from "../parser/SqlContextResolver.js";
import {
  resolveJoinRelationshipCandidate,
  resolvedJoinRelationshipIdentity,
  userConfirmedDefinition,
  type ResolvedJoinDirection,
  type ResolvedJoinRelationshipCandidate,
} from "./ResolvedJoinRelationship.js";
import { relationshipSemanticIdentity } from "./RelationshipModels.js";
import type { WorkspaceProjectRelationships } from "./WorkspaceProjectRelationships.js";

export const SAVE_JOIN_RELATIONSHIP_COMMAND =
  "queryPuppyForTSql.saveJoinRelationship";
export const SAVE_JOIN_RELATIONSHIP_TITLE =
  "Save JOIN as Query Puppy relationship";

interface SaveJoinRequest {
  readonly uri: string;
  readonly version: number;
  readonly start: number;
  readonly end: number;
}

/** Native editor adapter around the reusable resolved-JOIN semantic model. */
export class SqlRelationshipCodeActionProvider
  implements vscode.CodeActionProvider, vscode.Disposable
{
  private readonly scopes: CompletionScopeResolver;
  private readonly documentSemantics = new DocumentSemanticCache();
  private testScope: CompletionScope | undefined;

  constructor(
    private readonly connectionContext: ConnectionContextResolver,
    metadataBackend: MetadataBackend,
    loader: MetadataLoader,
    cache: MetadataCache,
    private readonly projectRelationships: WorkspaceProjectRelationships,
    private readonly output: vscode.OutputChannel,
  ) {
    this.scopes = new CompletionScopeResolver(
      metadataBackend,
      loader,
      cache,
      (key, error) => this.reportFailure(key, error),
    );
  }

  setTestScope(scope: CompletionScope | undefined): void {
    this.testScope = scope;
  }

  async provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    _context: vscode.CodeActionContext,
    token: vscode.CancellationToken,
  ): Promise<vscode.CodeAction[]> {
    if (
      document.languageId !== "sql" ||
      !vscode.workspace.getWorkspaceFolder(document.uri) ||
      !(
        vscode.workspace
          .getConfiguration("queryPuppyForTSql", document.uri)
          .get<boolean>("enabled") ?? true
      )
    )
      return [];
    try {
      const resolved = await this.resolve(document, range, token);
      if (!resolved || this.duplicate(resolved.candidate, resolved.scope))
        return [];
      const action = new vscode.CodeAction(
        SAVE_JOIN_RELATIONSHIP_TITLE,
        vscode.CodeActionKind.RefactorRewrite,
      );
      action.isPreferred = true;
      action.command = {
        command: SAVE_JOIN_RELATIONSHIP_COMMAND,
        title: SAVE_JOIN_RELATIONSHIP_TITLE,
        arguments: [
          {
            uri: document.uri.toString(),
            version: document.version,
            start: document.offsetAt(range.start),
            end: document.offsetAt(range.end),
          } satisfies SaveJoinRequest,
        ],
      };
      return [action];
    } catch (error) {
      this.reportFailure("code-action", error);
      return [];
    }
  }

  async save(value: unknown): Promise<void> {
    try {
      if (!saveJoinRequest(value)) return;
      const request = value;
      const uri = vscode.Uri.parse(request.uri);
      const document =
        vscode.workspace.textDocuments.find(
          (candidate) => candidate.uri.toString() === request.uri,
        ) ?? (await vscode.workspace.openTextDocument(uri));
      if (document.version !== request.version) {
        void vscode.window.showWarningMessage(
          "The JOIN changed before it could be saved. Run the Code Action again.",
        );
        return;
      }
      const range = new vscode.Range(
        document.positionAt(request.start),
        document.positionAt(request.end),
      );
      const cancellation = new vscode.CancellationTokenSource();
      let resolved:
        | {
            readonly candidate: ResolvedJoinRelationshipCandidate;
            readonly scope: CompletionScope;
          }
        | undefined;
      try {
        resolved = await this.resolve(document, range, cancellation.token);
      } finally {
        cancellation.dispose();
      }
      if (!resolved) {
        void vscode.window.showWarningMessage(
          "This JOIN is no longer a safely resolved equality relationship.",
        );
        return;
      }
      if (this.duplicate(resolved.candidate, resolved.scope)) {
        void vscode.window.showInformationMessage(
          "This relationship is already represented in the project or database metadata.",
        );
        return;
      }
      const direction = await this.direction(resolved.candidate);
      if (!direction) return;
      const result = await this.projectRelationships.save(
        document,
        userConfirmedDefinition(resolved.candidate, direction),
      );
      if (result.kind === "saved") {
        void vscode.window.showInformationMessage(
          "Saved the user-confirmed relationship to .query-puppy/relationships.json.",
        );
        return;
      }
      if (result.kind === "duplicate") {
        void vscode.window.showInformationMessage(
          "This relationship is already saved in .query-puppy/relationships.json.",
        );
        return;
      }
      if (result.kind === "noWorkspace") {
        void vscode.window.showWarningMessage(
          "Save the SQL document inside a workspace folder before saving a relationship.",
        );
        return;
      }
      void vscode.window.showWarningMessage(
        `The relationship file is invalid and was not changed: ${result.issues.map((issue) => issue.message).join(" ")}`,
      );
    } catch (error) {
      this.reportFailure("save-relationship", error);
      void vscode.window.showErrorMessage(
        `Could not save the Query Puppy relationship: ${errorMessage(error)}`,
      );
    }
  }

  closeDocument(uri: vscode.Uri): void {
    this.documentSemantics.delete(uri.toString());
  }

  dispose(): void {
    // The provider owns only in-memory semantic caches.
  }

  private async resolve(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    token: vscode.CancellationToken,
  ): Promise<
    | {
        readonly candidate: ResolvedJoinRelationshipCandidate;
        readonly scope: CompletionScope;
      }
    | undefined
  > {
    const start = document.offsetAt(range.start);
    const end = document.offsetAt(range.end);
    const sql = document.getText();
    const context = resolveSqlContext(sql, start);
    let scope = this.testScope;
    if (!scope) {
      const active = await this.connectionContext.active();
      if (!active || token.isCancellationRequested) return undefined;
      scope = await this.scopes.resolve(active, context);
    }
    if (token.isCancellationRequested) return undefined;
    scope = await this.projectRelationships.apply(document, scope);
    const semantics = this.documentSemantics.get(
      document.uri.toString(),
      document.version,
      sql,
      start,
      scope,
    );
    const candidate = resolveJoinRelationshipCandidate(
      sql,
      { start, end },
      scope,
      semantics,
    );
    return candidate ? { candidate, scope } : undefined;
  }

  private duplicate(
    candidate: ResolvedJoinRelationshipCandidate,
    scope: CompletionScope,
  ): boolean {
    const index = scope.indexes.get(
      candidate.endpointA.database.toLocaleLowerCase("en-US"),
    );
    const identity = resolvedJoinRelationshipIdentity(candidate);
    return Boolean(
      index?.relationships.some(
        (relationship) =>
          relationshipSemanticIdentity(relationship) === identity,
      ),
    );
  }

  private async direction(
    candidate: ResolvedJoinRelationshipCandidate,
  ): Promise<Exclude<ResolvedJoinDirection, "ambiguous"> | undefined> {
    if (candidate.direction !== "ambiguous") return candidate.direction;
    const choices = (["aToB", "bToA"] as const).map((direction) => {
      const source =
        direction === "aToB" ? candidate.endpointA : candidate.endpointB;
      const target =
        direction === "aToB" ? candidate.endpointB : candidate.endpointA;
      const mappings = candidate.mappings
        .map((mapping) =>
          direction === "aToB"
            ? `${mapping.endpointAColumn.name} → ${mapping.endpointBColumn.name}`
            : `${mapping.endpointBColumn.name} → ${mapping.endpointAColumn.name}`,
        )
        .join(", ");
      return {
        label: `${qualified(source)} → ${qualified(target)}`,
        description: `${source.qualifier} → ${target.qualifier}`,
        detail: mappings,
        direction,
      };
    });
    return (
      await vscode.window.showQuickPick(choices, {
        title: "Choose Query Puppy relationship direction",
        placeHolder: "Source/dependent table → target/principal table",
        matchOnDescription: true,
        matchOnDetail: true,
      })
    )?.direction;
  }

  private reportFailure(key: string, error: unknown): void {
    this.output.appendLine(
      `[user-confirmed-relationship] ${key}: ${errorMessage(error)}`,
    );
  }
}

const qualified = (
  endpoint: ResolvedJoinRelationshipCandidate["endpointA"],
): string => `${endpoint.database}.${endpoint.schema}.${endpoint.object.name}`;

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const saveJoinRequest = (value: unknown): value is SaveJoinRequest =>
  typeof value === "object" &&
  value !== null &&
  "uri" in value &&
  typeof value.uri === "string" &&
  "version" in value &&
  typeof value.version === "number" &&
  "start" in value &&
  typeof value.start === "number" &&
  "end" in value &&
  typeof value.end === "number";

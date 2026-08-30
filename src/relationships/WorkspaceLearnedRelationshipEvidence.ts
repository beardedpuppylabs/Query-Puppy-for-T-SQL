import * as vscode from "vscode";
import { posix } from "node:path";
import type { ConnectionContextResolver } from "../backend/MetadataBackend.js";
import type { MetadataCache } from "../metadata/MetadataCache.js";
import { DatabaseIndex } from "../metadata/DatabaseIndex.js";
import { normalizeName } from "../metadata/MetadataModels.js";
import type { SemanticCatalog } from "../parser/DocumentSemanticAnalyzer.js";
import {
  createLearnedRelationshipEvidenceSave,
  learnedDocumentIdentity,
  learnedEvidenceFromResolvedJoin,
  knownRelationshipEvidenceIdentities,
  type LearnedRelationshipEvidenceRecord,
} from "./LearnedRelationshipEvidence.js";
import type {
  FileLearnedRelationshipEvidenceStore,
  LearnedRelationshipEvidenceStoreResult,
} from "./LearnedRelationshipEvidenceStore.js";
import { resolveJoinRelationshipCandidates } from "./ResolvedJoinRelationship.js";
import type { WorkspaceProjectRelationships } from "./WorkspaceProjectRelationships.js";
import { resolveLearnedRelationshipCandidates } from "./LearnedRelationshipCandidatePolicy.js";
import { isDeclaredForeignKeyRelationship } from "./RelationshipModels.js";

export const CLEAR_LEARNED_RELATIONSHIP_EVIDENCE_COMMAND =
  "queryPuppyForTSql.clearLearnedRelationshipEvidence";

export type LearnedRelationshipObservationResult =
  | { readonly kind: "observed"; readonly count: number }
  | { readonly kind: "unchanged"; readonly count: number }
  | { readonly kind: "skipped"; readonly reason: string }
  | { readonly kind: "invalid"; readonly message: string };

/** Save-driven VS Code adapter around editor-neutral JOIN evidence components. */
export class WorkspaceLearnedRelationshipEvidence implements vscode.Disposable {
  private readonly subscriptions: vscode.Disposable[] = [];
  private readonly reportedFailures = new Set<string>();
  private readonly candidateOverlays = new Map<
    string,
    WeakMap<
      DatabaseIndex,
      {
        readonly evidence: readonly LearnedRelationshipEvidenceRecord[];
        readonly index: DatabaseIndex;
      }
    >
  >();
  private testScope: SemanticCatalog | undefined;

  constructor(
    private readonly store: FileLearnedRelationshipEvidenceStore | undefined,
    private readonly connectionContext: ConnectionContextResolver,
    private readonly cache: MetadataCache,
    private readonly projectRelationships: WorkspaceProjectRelationships,
    private readonly output: vscode.OutputChannel,
  ) {
    this.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument((document) => {
        void this.observeSavedDocument(document).catch((error: unknown) =>
          this.report("save", error),
        );
      }),
      vscode.workspace.onDidChangeWorkspaceFolders((event) => {
        for (const folder of event.removed)
          this.candidateOverlays.delete(folder.uri.toString());
      }),
    );
  }

  setTestScope(scope: SemanticCatalog | undefined): void {
    this.testScope = scope;
  }

  async observeSavedDocument(
    document: vscode.TextDocument,
  ): Promise<LearnedRelationshipObservationResult> {
    if (!this.store)
      return { kind: "skipped", reason: "workspace storage unavailable" };
    if (document.languageId !== "sql")
      return { kind: "skipped", reason: "not a SQL document" };
    const folder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!folder) return { kind: "skipped", reason: "no owning workspace" };
    if (!this.enabled(document.uri))
      return { kind: "skipped", reason: "relationship learning disabled" };
    if (
      !this.testScope &&
      vscode.window.activeTextEditor?.document.uri.toString() !==
        document.uri.toString()
    )
      return {
        kind: "skipped",
        reason: "document is not the active SQL editor",
      };
    let scope = this.testScope;
    if (!scope) {
      const active = await this.connectionContext.active();
      if (!active)
        return { kind: "skipped", reason: "no active SQL connection" };
      const index = this.cache.get(active.connectionIdentity, active.database);
      if (!index)
        return { kind: "skipped", reason: "metadata is not already loaded" };
      scope = {
        activeDatabase: active.database,
        indexes: new Map([[normalizeName(active.database), index]]),
      };
    }
    scope = await this.projectRelationships.apply(document, scope);
    const occurrences = resolveJoinRelationshipCandidates(
      document.getText(),
      scope,
    )
      .map(learnedEvidenceFromResolvedJoin)
      .filter((evidence) => evidence !== undefined);
    const known = knownRelationshipEvidenceIdentities(
      [...scope.indexes.values()].flatMap((index) => index.relationships),
    );
    const save = createLearnedRelationshipEvidenceSave(
      learnedDocumentIdentity(
        posix.relative(folder.uri.path, document.uri.path),
      ),
      occurrences,
      known,
    );
    const update = await this.store.update(folder.uri.toString(), save);
    if (update.kind === "invalid") return update;
    return {
      kind: update.kind === "written" ? "observed" : "unchanged",
      count: update.count,
    };
  }

  async evidenceForDocument(
    document: vscode.TextDocument,
  ): Promise<readonly LearnedRelationshipEvidenceRecord[]> {
    const folder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!this.store || !folder) return [];
    const result = await this.store.read(folder.uri.toString());
    return result.kind === "valid" ? result.evidence : [];
  }

  /** Applies qualifying learned candidates without re-reading cached evidence per keystroke. */
  async applyCandidates<T extends SemanticCatalog>(
    document: vscode.TextDocument,
    scope: T,
  ): Promise<T> {
    const folder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!this.store || !folder) return scope;
    const state = await this.store.read(folder.uri.toString());
    if (state.kind !== "valid") return scope;
    let workspaceCache = this.candidateOverlays.get(folder.uri.toString());
    if (!workspaceCache) {
      workspaceCache = new WeakMap();
      this.candidateOverlays.set(folder.uri.toString(), workspaceCache);
    }
    const indexes = new Map<string, DatabaseIndex>();
    for (const [database, base] of scope.indexes) {
      const cached = workspaceCache.get(base);
      if (cached?.evidence === state.evidence) {
        indexes.set(database, cached.index);
        continue;
      }
      const candidates = resolveLearnedRelationshipCandidates(
        state.evidence,
        base,
      );
      const index = candidates.length
        ? new DatabaseIndex(base.metadata, [
            ...base.relationships.filter(
              (relationship) => !isDeclaredForeignKeyRelationship(relationship),
            ),
            ...candidates,
          ])
        : base;
      workspaceCache.set(base, { evidence: state.evidence, index });
      indexes.set(database, index);
    }
    return { ...scope, indexes };
  }

  async stateForDocument(
    document: vscode.TextDocument,
  ): Promise<LearnedRelationshipEvidenceStoreResult | undefined> {
    const folder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!this.store || !folder) return undefined;
    return this.store.read(folder.uri.toString());
  }

  async clearForDocument(document: vscode.TextDocument): Promise<void> {
    const folder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (this.store && folder) await this.store.clear(folder.uri.toString());
  }

  async clearForActiveWorkspace(): Promise<void> {
    const folder = activeWorkspaceFolder();
    if (!this.store || !folder) {
      await vscode.window.showInformationMessage(
        "Open a SQL file inside a workspace before clearing learned relationship evidence.",
      );
      return;
    }
    const confirmation = await vscode.window.showWarningMessage(
      `Clear local learned relationship evidence for ${folder.name}? Project-defined and user-confirmed relationships are not affected.`,
      { modal: true },
      "Clear",
    );
    if (confirmation !== "Clear") return;
    await this.store.clear(folder.uri.toString());
    await vscode.window.showInformationMessage(
      `Cleared local learned relationship evidence for ${folder.name}.`,
    );
  }

  dispose(): void {
    for (const subscription of this.subscriptions) subscription.dispose();
    this.subscriptions.length = 0;
    this.candidateOverlays.clear();
  }

  private enabled(uri: vscode.Uri): boolean {
    const root = vscode.workspace.getConfiguration("queryPuppyForTSql", uri);
    const learning = vscode.workspace.getConfiguration(
      "queryPuppyForTSql.relationshipLearning",
      uri,
    );
    return (
      (root.get<boolean>("enabled") ?? true) &&
      (learning.get<boolean>("enabled") ?? true)
    );
  }

  private report(key: string, error: unknown): void {
    const message = `${key}: ${errorMessage(error)}`;
    if (this.reportedFailures.has(message)) return;
    this.reportedFailures.add(message);
    this.output.appendLine(`[learned-relationship-evidence] ${message}`);
  }
}

const activeWorkspaceFolder = (): vscode.WorkspaceFolder | undefined => {
  const active = vscode.window.activeTextEditor;
  if (active) {
    const owning = vscode.workspace.getWorkspaceFolder(active.document.uri);
    if (owning) return owning;
  }
  const folders = vscode.workspace.workspaceFolders ?? [];
  return folders.length === 1 ? folders[0] : undefined;
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

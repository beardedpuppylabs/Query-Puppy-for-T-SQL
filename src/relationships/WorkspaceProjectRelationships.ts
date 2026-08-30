import * as vscode from "vscode";
import { DatabaseIndex } from "../metadata/DatabaseIndex.js";
import type { SemanticCatalog } from "../parser/DocumentSemanticAnalyzer.js";
import {
  appendProjectRelationshipDefinition,
  PROJECT_RELATIONSHIP_FILE,
  ProjectRelationshipConfigurationCache,
  resolveProjectRelationships,
  type ProjectRelationshipDefinition,
  type ProjectRelationshipIssue,
} from "./ProjectRelationshipConfig.js";

export type SaveProjectRelationshipResult =
  | { readonly kind: "saved"; readonly uri: vscode.Uri }
  | { readonly kind: "duplicate" }
  | { readonly kind: "noWorkspace" }
  | {
      readonly kind: "invalid";
      readonly issues: readonly ProjectRelationshipIssue[];
    };

interface WorkspaceState {
  readonly folder: vscode.WorkspaceFolder;
  readonly overlays: WeakMap<DatabaseIndex, DatabaseIndex>;
  readonly reportedSemanticIssues: Set<string>;
  readonly watcher: vscode.FileSystemWatcher;
}

/** Workspace-file adapter; parsing and semantic validation remain editor-neutral. */
export class WorkspaceProjectRelationships implements vscode.Disposable {
  private readonly states = new Map<string, WorkspaceState>();
  private readonly configuration: ProjectRelationshipConfigurationCache;
  private readonly subscriptions: vscode.Disposable[] = [];

  constructor(private readonly output: vscode.OutputChannel) {
    this.configuration = new ProjectRelationshipConfigurationCache(
      (projectKey) => this.read(projectKey),
      (projectKey, message) => this.report(projectKey, message),
    );
    for (const folder of vscode.workspace.workspaceFolders ?? [])
      this.addFolder(folder);
    this.subscriptions.push(
      vscode.workspace.onDidChangeWorkspaceFolders((event) => {
        for (const folder of event.removed) this.removeFolder(folder);
        for (const folder of event.added) this.addFolder(folder);
      }),
    );
  }

  async apply<T extends SemanticCatalog>(
    document: vscode.TextDocument,
    scope: T,
  ): Promise<T> {
    const folder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!folder) return scope;
    const state = this.states.get(folder.uri.toString());
    if (!state) return scope;
    const configuration = await this.configuration.load(folder.uri.toString());
    if (!configuration.definitions.length) return scope;
    let changed = false;
    const indexes = new Map<string, DatabaseIndex>();
    for (const [database, base] of scope.indexes) {
      let overlay = state.overlays.get(base);
      if (!overlay) {
        const resolved = resolveProjectRelationships(
          configuration.definitions,
          base,
        );
        for (const issue of resolved.issues) {
          if (state.reportedSemanticIssues.has(issue.message)) continue;
          state.reportedSemanticIssues.add(issue.message);
          this.report(folder.uri.toString(), issue.message);
        }
        overlay = resolved.relationships.length
          ? new DatabaseIndex(base.metadata, resolved.relationships)
          : base;
        state.overlays.set(base, overlay);
      }
      indexes.set(database, overlay);
      changed ||= overlay !== base;
    }
    return changed ? { ...scope, indexes } : scope;
  }

  async openForActiveWorkspace(): Promise<void> {
    const folder = activeWorkspaceFolder();
    if (!folder) {
      await vscode.window.showInformationMessage(
        "Open a workspace folder, or activate a file inside one, before opening project relationships.",
      );
      return;
    }
    const uri = vscode.Uri.joinPath(folder.uri, PROJECT_RELATIONSHIP_FILE);
    try {
      await vscode.workspace.fs.stat(uri);
    } catch (error) {
      if (!isMissing(error)) throw error;
      await vscode.workspace.fs.createDirectory(
        vscode.Uri.joinPath(folder.uri, ".query-puppy"),
      );
      await vscode.workspace.fs.writeFile(
        uri,
        new TextEncoder().encode(
          `${JSON.stringify({ version: 1, relationships: [] }, undefined, 2)}\n`,
        ),
      );
    }
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document);
  }

  async save(
    document: vscode.TextDocument,
    definition: ProjectRelationshipDefinition,
  ): Promise<SaveProjectRelationshipResult> {
    const folder = vscode.workspace.getWorkspaceFolder(document.uri);
    if (!folder) return { kind: "noWorkspace" };
    const projectKey = folder.uri.toString();
    if (!this.states.has(projectKey)) this.addFolder(folder);
    const existing = await this.read(projectKey);
    const update = appendProjectRelationshipDefinition(existing, definition);
    if (update.kind !== "written") return update;
    const directory = vscode.Uri.joinPath(folder.uri, ".query-puppy");
    const uri = vscode.Uri.joinPath(folder.uri, PROJECT_RELATIONSHIP_FILE);
    await vscode.workspace.fs.createDirectory(directory);
    await vscode.workspace.fs.writeFile(
      uri,
      new TextEncoder().encode(update.text),
    );
    this.invalidate(projectKey);
    return { kind: "saved", uri };
  }

  dispose(): void {
    for (const state of this.states.values()) state.watcher.dispose();
    this.states.clear();
    this.configuration.clear();
    for (const subscription of this.subscriptions) subscription.dispose();
  }

  private addFolder(folder: vscode.WorkspaceFolder): void {
    const key = folder.uri.toString();
    if (this.states.has(key)) return;
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(folder, PROJECT_RELATIONSHIP_FILE),
    );
    const invalidate = (): void => this.invalidate(key);
    watcher.onDidCreate(invalidate);
    watcher.onDidChange(invalidate);
    watcher.onDidDelete(invalidate);
    this.states.set(key, {
      folder,
      overlays: new WeakMap(),
      reportedSemanticIssues: new Set(),
      watcher,
    });
  }

  private removeFolder(folder: vscode.WorkspaceFolder): void {
    const key = folder.uri.toString();
    this.states.get(key)?.watcher.dispose();
    this.states.delete(key);
    this.configuration.invalidate(key);
  }

  private invalidate(projectKey: string): void {
    const state = this.states.get(projectKey);
    if (!state) return;
    this.configuration.invalidate(projectKey);
    this.states.set(projectKey, {
      ...state,
      overlays: new WeakMap(),
      reportedSemanticIssues: new Set(),
    });
    this.output.appendLine(
      `[project-relationships] ${PROJECT_RELATIONSHIP_FILE} changed; relationships will be revalidated on the next completion.`,
    );
  }

  private async read(projectKey: string): Promise<string | undefined> {
    const state = this.states.get(projectKey);
    if (!state) return undefined;
    const uri = vscode.Uri.joinPath(
      state.folder.uri,
      PROJECT_RELATIONSHIP_FILE,
    );
    try {
      return new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
    } catch (error) {
      if (isMissing(error)) return undefined;
      throw error;
    }
  }

  private report(projectKey: string, message: string): void {
    const folder = this.states.get(projectKey)?.folder.name ?? projectKey;
    this.output.appendLine(`[project-relationships] ${folder}: ${message}`);
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

const isMissing = (error: unknown): boolean =>
  error instanceof vscode.FileSystemError && error.code === "FileNotFound";

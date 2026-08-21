import * as vscode from "vscode";
import type { MetadataLifecycleEvent } from "./MetadataCache.js";

export class MetadataLifecycleStatus implements vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    10,
  );
  private readonly active = new Map<
    string,
    { readonly database: string; readonly state: "loading" | "refreshing" }
  >();

  constructor(private readonly output: vscode.OutputChannel) {
    this.item.name = "Query Puppy Schema Metadata";
    this.item.command = "queryPuppyForTSql.showStatus";
  }

  handle(event: MetadataLifecycleEvent): void {
    const key = `${event.connectionId}\u0000${event.database.toLocaleLowerCase("en-US")}`;
    if (event.kind === "coldLoadStarted")
      this.active.set(key, { database: event.database, state: "loading" });
    if (event.kind === "refreshStarted")
      this.active.set(key, { database: event.database, state: "refreshing" });
    if (
      [
        "coldLoadCompleted",
        "coldLoadFailed",
        "refreshCompleted",
        "refreshFailed",
      ].includes(event.kind)
    )
      this.active.delete(key);
    this.updateStatus();
    this.output.appendLine(`[metadata-cache] ${eventMessage(event)}`);
  }

  dispose(): void {
    this.item.dispose();
  }

  private updateStatus(): void {
    const operations = [...this.active.values()];
    if (operations.length === 0) {
      this.item.hide();
      return;
    }
    const loading = operations.some(
      (operation) => operation.state === "loading",
    );
    const database = operations[0]?.database ?? "database";
    this.item.text = loading
      ? `$(database) Query Puppy: Loading schema metadata: ${database}…`
      : `$(sync~spin) Query Puppy: Refreshing schema metadata: ${database}…`;
    this.item.tooltip =
      operations.length === 1
        ? this.item.text.replace(/^\$\([^)]*\)\s*/, "")
        : `Query Puppy: ${String(operations.length)} schema metadata operations running`;
    this.item.show();
  }
}

function eventMessage(event: MetadataLifecycleEvent): string {
  const duration =
    event.durationMs === undefined ? "" : ` in ${String(event.durationMs)} ms`;
  const counts =
    event.objectCount === undefined
      ? ""
      : ` (${String(event.objectCount)} objects${event.columnCount === undefined ? "" : `, ${String(event.columnCount)} columns`})`;
  const reason = event.reason ? ` [${event.reason}]` : "";
  switch (event.kind) {
    case "persistentCacheHit":
      return `Persistent cache loaded for ${event.database}${duration}${counts}.`;
    case "persistentCacheMiss":
      return `Persistent cache miss for ${event.database}${duration}.`;
    case "persistentCacheFailed":
      return `Persistent cache read failed for ${event.database}${duration}: ${event.error ?? "unknown error"}.`;
    case "coldLoadStarted":
      return `Cold metadata load started for ${event.database}.`;
    case "coldLoadCompleted":
      return `Cold metadata load completed for ${event.database}${duration}${counts}.`;
    case "coldLoadFailed":
      return `Cold metadata load failed for ${event.database}${duration}: ${event.error ?? "unknown error"}.`;
    case "refreshStarted":
      return `Background metadata refresh started for ${event.database}${reason}.`;
    case "refreshCompleted":
      return `Background metadata refresh completed for ${event.database}${reason}${duration}${counts}.`;
    case "refreshFailed":
      return `Background metadata refresh failed for ${event.database}${reason}${duration}; retaining stale snapshot: ${event.error ?? "unknown error"}.`;
    case "snapshotPersisted":
      return `Persistent snapshot written for ${event.database}${duration}${counts}.`;
    case "snapshotPersistFailed":
      return `Persistent snapshot write failed for ${event.database}${duration}: ${event.error ?? "unknown error"}.`;
    case "cacheCleared":
      return `Memory and persistent schema cache cleared for ${event.database}.`;
  }
}

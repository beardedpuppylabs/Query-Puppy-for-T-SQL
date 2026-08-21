import * as vscode from "vscode";
import type { ConnectionService } from "../mssql/ConnectionService.js";
import type { MetadataLoader } from "../mssql/MetadataLoader.js";
import { MetadataCache } from "../metadata/MetadataCache.js";

export async function refreshMetadata(
  connections: ConnectionService,
  loader: MetadataLoader,
  cache: MetadataCache,
): Promise<void> {
  try {
    const active = await connections.active();
    if (!active) {
      await vscode.window.showInformationMessage(
        "No active mssql editor connection.",
      );
      return;
    }
    const index = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Refreshing schema metadata for ${active.database}`,
      },
      () =>
        cache.refresh(active.connectionId, active.database, () =>
          loader.load(active),
        ),
    );
    await vscode.window.showInformationMessage(
      `Loaded ${String(index.count)} objects from ${active.database}.`,
    );
  } catch (error) {
    await vscode.window.showErrorMessage(
      `Could not refresh SQL metadata: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function clearMetadataCache(
  connections: ConnectionService,
  cache: MetadataCache,
): Promise<void> {
  try {
    const active = await connections.active();
    if (!active) {
      await vscode.window.showInformationMessage(
        "No active mssql editor connection.",
      );
      return;
    }
    const confirmation = await vscode.window.showWarningMessage(
      `Clear Query Puppy schema metadata for ${active.database}? The next schema-backed completion will perform a cold load.`,
      { modal: true },
      "Clear Cache",
    );
    if (confirmation !== "Clear Cache") return;
    await cache.clearDatabase(active.connectionId, active.database);
    await vscode.window.showInformationMessage(
      `Cleared Query Puppy schema metadata for ${active.database}.`,
    );
  } catch (error) {
    await vscode.window.showErrorMessage(
      `Could not clear SQL metadata cache: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

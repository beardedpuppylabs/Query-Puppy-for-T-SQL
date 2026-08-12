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
    cache.invalidate(active.connectionId, active.database);
    const index = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Loading SQL metadata for ${active.database}`,
      },
      () =>
        cache.ensureLoaded(active.connectionId, active.database, () =>
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

import * as vscode from "vscode";
import type { ConnectionContextResolver } from "../backend/MetadataBackend.js";
import { MetadataCache } from "../metadata/MetadataCache.js";
import type { MetadataLoader } from "../metadata/MetadataLoader.js";

export async function refreshMetadata(
  connections: ConnectionContextResolver,
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
        cache.refresh(active.connectionIdentity, active.database, () =>
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
  connections: ConnectionContextResolver,
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
    await cache.clearDatabase(active.connectionIdentity, active.database);
    await vscode.window.showInformationMessage(
      `Cleared Query Puppy schema metadata for ${active.database}.`,
    );
  } catch (error) {
    await vscode.window.showErrorMessage(
      `Could not clear SQL metadata cache: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

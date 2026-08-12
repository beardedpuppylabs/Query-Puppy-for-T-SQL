import * as vscode from "vscode";
import { SqlCompletionProvider } from "./completion/SqlCompletionProvider.js";
import { refreshMetadata } from "./commands/RefreshMetadataCommand.js";
import { MetadataCache } from "./metadata/MetadataCache.js";
import { ConnectionService } from "./mssql/ConnectionService.js";
import { getMssqlApi } from "./mssql/MssqlApi.js";
import { MetadataLoader } from "./mssql/MetadataLoader.js";

const EXTENSION_ID = "error404.improved-sql-intellisense";

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("Improved SQL IntelliSense");
  const cache = new MetadataCache();
  const connections = new ConnectionService(EXTENSION_ID, getMssqlApi);
  const loader = new MetadataLoader(connections, (message) =>
    output.appendLine(`[metadata] ${message}`),
  );
  const provider = new SqlCompletionProvider(
    connections,
    loader,
    cache,
    output,
  );
  context.subscriptions.push(
    output,
    vscode.languages.registerCompletionItemProvider(
      { language: "sql" },
      provider,
      ".",
    ),
    vscode.commands.registerCommand(
      "improvedSqlIntellisense.refreshMetadata",
      () => refreshMetadata(connections, loader, cache),
    ),
    vscode.commands.registerCommand(
      "improvedSqlIntellisense.showStatus",
      async () => {
        try {
          const installed = await connections.available();
          const active = await connections.active();
          if (!installed) {
            await vscode.window.showInformationMessage(
              "Improved SQL IntelliSense — mssql API unavailable; disconnected; metadata not loaded.",
            );
            return;
          }
          if (!active) {
            await vscode.window.showInformationMessage(
              "Improved SQL IntelliSense — mssql API available; disconnected; metadata not loaded.",
            );
            return;
          }
          const cached = cache.snapshots(active.connectionId);
          const summary =
            cached.length === 0
              ? "none"
              : cached
                  .map(
                    (entry) =>
                      `${entry.database}: ${entry.state}${entry.objectCount === undefined ? "" : ` (${String(entry.objectCount)} objects)`}${entry.error ? ` — ${entry.error}` : ""}`,
                  )
                  .join("; ");
          await vscode.window.showInformationMessage(
            `Improved SQL IntelliSense — mssql API available; connected; active database: ${active.database}; cached databases: ${summary}.`,
          );
        } catch (error) {
          await vscode.window.showInformationMessage(
            `Improved SQL IntelliSense status unavailable: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
    ),
    vscode.commands.registerCommand(
      "improvedSqlIntellisense.disableMicrosoftSuggestions",
      async () => {
        await vscode.workspace
          .getConfiguration("mssql.intelliSense")
          .update(
            "enableSuggestions",
            false,
            vscode.ConfigurationTarget.Global,
          );
        await vscode.window.showInformationMessage(
          "Microsoft SQL suggestions disabled globally. Quick Info and error checking remain enabled.",
        );
      },
    ),
  );
  warnAboutMicrosoftSuggestions(context).catch((error: unknown) =>
    output.appendLine(
      `Suggestion setting check failed: ${error instanceof Error ? error.message : String(error)}`,
    ),
  );
}

async function warnAboutMicrosoftSuggestions(
  context: vscode.ExtensionContext,
): Promise<void> {
  const noticeKey = "mssqlSuggestionsNoticeShown";
  if (context.globalState.get<boolean>(noticeKey)) return;
  if (!(
    vscode.workspace
      .getConfiguration("mssql.intelliSense")
      .get<boolean>("enableSuggestions") ?? true
  ))
    return;
  const disable = "Disable globally";
  const notNow = "Not now";
  const choice = await vscode.window.showInformationMessage(
    "Improved SQL IntelliSense replaces Microsoft mssql SQL suggestions. Disable Microsoft's suggestions globally to avoid duplicate completion results? Quick Info and Error Checking remain available.",
    disable,
    notNow,
  );
  await context.globalState.update(noticeKey, true);
  if (choice === disable)
    await vscode.commands.executeCommand(
      "improvedSqlIntellisense.disableMicrosoftSuggestions",
    );
}

export function deactivate(): void {}

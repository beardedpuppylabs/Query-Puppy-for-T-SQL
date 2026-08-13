import * as vscode from "vscode";
import { SqlCompletionProvider } from "./completion/SqlCompletionProvider.js";
import { refreshMetadata } from "./commands/RefreshMetadataCommand.js";
import { MetadataCache } from "./metadata/MetadataCache.js";
import { ConnectionService } from "./mssql/ConnectionService.js";
import { getMssqlApi } from "./mssql/MssqlApi.js";
import { MetadataLoader } from "./mssql/MetadataLoader.js";
import {
  microsoftSuggestionStatusLines,
  resolveMicrosoftSuggestionState,
  type MicrosoftSuggestionInspection,
  type SuggestionConfigurationScope,
} from "./config/MicrosoftSuggestions.js";

const EXTENSION_ID = "Bismarck.improved-sql-intellisense";
let suggestionNoticePending = false;

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
    vscode.workspace.onDidCloseTextDocument((document) =>
      provider.closeDocument(document.uri),
    ),
    vscode.commands.registerCommand(
      "improvedSqlIntellisense.refreshMetadata",
      () => refreshMetadata(connections, loader, cache),
    ),
    vscode.commands.registerCommand(
      "improvedSqlIntellisense.showStatus",
      async () => {
        try {
          const suggestionStatus = microsoftSuggestionStatusLines(
            inspectMicrosoftSuggestions(),
          ).join("\n");
          const installed = await connections.available();
          const active = await connections.active();
          if (!installed) {
            await vscode.window.showInformationMessage(
              `Improved SQL IntelliSense — mssql API unavailable; disconnected; metadata not loaded.\n${suggestionStatus}`,
            );
            return;
          }
          if (!active) {
            await vscode.window.showInformationMessage(
              `Improved SQL IntelliSense — mssql API available; disconnected; metadata not loaded.\n${suggestionStatus}`,
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
            `Improved SQL IntelliSense — mssql API available; connected; active database: ${active.database}; cached databases: ${summary}.\n${suggestionStatus}`,
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
      () => disableMicrosoftSuggestions(),
    ),
  );
  const checkFirstRun = (): void => {
    warnAboutMicrosoftSuggestions(context).catch((error: unknown) =>
      output.appendLine(
        `Suggestion setting check failed: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  };
  checkFirstRun();
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(checkFirstRun),
    vscode.workspace.onDidOpenTextDocument(checkFirstRun),
  );

  let lastDuplicateState: boolean | undefined;
  const reportDuplicateProviders = (): void => {
    const enabled = inspectMicrosoftSuggestions().effectiveValue;
    if (enabled && lastDuplicateState !== true)
      output.appendLine(
        "Microsoft mssql suggestions are enabled; completion results may contain duplicates.",
      );
    lastDuplicateState = enabled;
  };
  reportDuplicateProviders();
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("mssql.intelliSense.enableSuggestions"))
        reportDuplicateProviders();
    }),
  );
}

function inspectMicrosoftSuggestions(): MicrosoftSuggestionInspection {
  const resource = vscode.window.activeTextEditor?.document.uri;
  const configuration = vscode.workspace.getConfiguration(
    "mssql.intelliSense",
    resource,
  );
  const inspection = configuration.inspect<boolean>("enableSuggestions");
  return {
    effectiveValue: configuration.get<boolean>("enableSuggestions") ?? true,
    globalValue: inspection?.globalValue,
    workspaceValue: inspection?.workspaceValue,
    workspaceFolderValue: inspection?.workspaceFolderValue,
  };
}

async function updateMicrosoftSuggestions(
  scope: SuggestionConfigurationScope,
): Promise<void> {
  const target = {
    global: vscode.ConfigurationTarget.Global,
    workspace: vscode.ConfigurationTarget.Workspace,
    workspaceFolder: vscode.ConfigurationTarget.WorkspaceFolder,
  }[scope];
  await vscode.workspace
    .getConfiguration(
      "mssql.intelliSense",
      vscode.window.activeTextEditor?.document.uri,
    )
    .update("enableSuggestions", false, target);
}

async function disableMicrosoftSuggestions(): Promise<void> {
  const inspection = inspectMicrosoftSuggestions();
  const state = resolveMicrosoftSuggestionState(inspection);
  if (!state.enabled) {
    await vscode.window.showInformationMessage(
      "Microsoft SQL suggestions are already disabled.",
    );
    return;
  }

  if (state.enablingScope === "workspaceFolder") {
    const action = "Disable for this workspace folder";
    const globalContext =
      inspection.globalValue === false
        ? "Microsoft SQL suggestions are disabled globally, but this workspace folder explicitly enables them."
        : "This workspace folder explicitly enables Microsoft SQL suggestions.";
    const choice = await vscode.window.showInformationMessage(
      globalContext,
      action,
    );
    if (choice === action) await updateMicrosoftSuggestions("workspaceFolder");
    return;
  }
  if (state.enablingScope === "workspace") {
    const action = "Disable for this workspace";
    const globalContext =
      inspection.globalValue === false
        ? "Microsoft SQL suggestions are disabled globally, but this workspace explicitly enables them."
        : "This workspace explicitly enables Microsoft SQL suggestions.";
    const choice = await vscode.window.showInformationMessage(
      globalContext,
      action,
    );
    if (choice === action) await updateMicrosoftSuggestions("workspace");
    return;
  }

  await updateMicrosoftSuggestions("global");
  await vscode.window.showInformationMessage(
    "Microsoft SQL suggestions disabled globally. Quick Info and error checking remain enabled.",
  );
}

async function warnAboutMicrosoftSuggestions(
  context: vscode.ExtensionContext,
): Promise<void> {
  const noticeKey = "mssqlSuggestionsNoticeShown";
  if (context.globalState.get<boolean>(noticeKey) || suggestionNoticePending)
    return;
  if (vscode.window.activeTextEditor?.document.languageId !== "sql") return;
  if (!vscode.extensions.getExtension("ms-mssql.mssql")) return;
  if (!inspectMicrosoftSuggestions().effectiveValue) return;
  const disable = "Disable globally";
  const notNow = "Not now";
  suggestionNoticePending = true;
  try {
    const choice = await vscode.window.showInformationMessage(
      "Improved SQL IntelliSense replaces Microsoft mssql suggestions. Disable Microsoft's suggestions to avoid duplicate and conflicting completion results?",
      disable,
      notNow,
    );
    await context.globalState.update(noticeKey, true);
    if (choice === disable) {
      await updateMicrosoftSuggestions("global");
      if (inspectMicrosoftSuggestions().effectiveValue)
        await vscode.window.showWarningMessage(
          "Microsoft SQL suggestions remain enabled by a workspace override. Run “Improved SQL IntelliSense: Disable Microsoft SQL Suggestions” to resolve it.",
        );
    }
  } finally {
    suggestionNoticePending = false;
  }
}

export function deactivate(): void {}

import * as vscode from "vscode";
import { SqlCompletionProvider } from "./completion/SqlCompletionProvider.js";
import { refreshMetadata } from "./commands/RefreshMetadataCommand.js";
import { MetadataCache } from "./metadata/MetadataCache.js";
import { ConnectionService } from "./mssql/ConnectionService.js";
import { getMssqlApi } from "./mssql/MssqlApi.js";
import { MetadataLoader } from "./mssql/MetadataLoader.js";
import { SqlSignatureHelpProvider } from "./completion/SqlSignatureHelpProvider.js";
import { tokenizeSql } from "./parser/SqlTokenizer.js";
import {
  SIGNATURE_HELP_METADATA,
  SQL_DOCUMENT_SELECTOR,
} from "./completion/ProviderRegistration.js";
import { PendingSignatureTriggerState } from "./completion/AutomaticSignatureHelp.js";
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
  const signatureProvider = new SqlSignatureHelpProvider(
    connections,
    loader,
    cache,
    output,
  );
  const automaticSignatureHelp = new PendingSignatureTriggerState();
  let automaticFallbackTimer: ReturnType<typeof setTimeout> | undefined;
  let fallbackInvoked = false;
  let fallbackSuppressed = false;
  const clearAutomaticTrigger = (): void => {
    automaticSignatureHelp.clear();
    if (automaticFallbackTimer) clearTimeout(automaticFallbackTimer);
    automaticFallbackTimer = undefined;
  };
  const fulfillAutomaticTrigger = async (
    generation?: number,
  ): Promise<void> => {
    const pending = automaticSignatureHelp.current();
    const editor = vscode.window.activeTextEditor;
    if (!pending || !editor) return;
    const position = editor.selection.active;
    const taken = automaticSignatureHelp.takeIfCurrent(
      editor.document.uri.toString(),
      editor.document.version,
      editor.document.offsetAt(position),
      generation,
    );
    if (!taken) return;
    if (automaticFallbackTimer) clearTimeout(automaticFallbackTimer);
    automaticFallbackTimer = undefined;
    if (signatureProvider.succeeded(editor.document, position)) {
      fallbackSuppressed = true;
      return;
    }
    const hints =
      vscode.workspace
        .getConfiguration("editor", editor.document.uri)
        .get<boolean>("parameterHints.enabled") ?? true;
    if (
      !hints ||
      !(await signatureProvider.canResolveCached(editor.document, position))
    )
      return;
    const active = vscode.window.activeTextEditor;
    if (
      active !== editor ||
      active.document.version !== taken.documentVersion ||
      active.document.offsetAt(active.selection.active) !== taken.expectedOffset
    )
      return;
    fallbackInvoked = true;
    await vscode.commands.executeCommand("editor.action.triggerParameterHints");
  };
  context.subscriptions.push(
    output,
    vscode.languages.registerCompletionItemProvider(
      SQL_DOCUMENT_SELECTOR,
      provider,
      ".",
    ),
    vscode.languages.registerSignatureHelpProvider(
      SQL_DOCUMENT_SELECTOR,
      signatureProvider,
      SIGNATURE_HELP_METADATA,
    ),
    vscode.workspace.onDidCloseTextDocument((document) => {
      provider.closeDocument(document.uri);
      if (automaticSignatureHelp.current()?.uri === document.uri.toString())
        clearAutomaticTrigger();
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      clearAutomaticTrigger();
      const editor = vscode.window.activeTextEditor;
      if (
        !editor ||
        editor.document !== event.document ||
        editor.document.languageId !== "sql" ||
        event.contentChanges.length !== 1
      )
        return;
      const change = event.contentChanges[0];
      if (!change) return;
      const pending = automaticSignatureHelp.replace(
        event.document.uri.toString(),
        event.document.version,
        change,
      );
      if (!pending) return;
      if (
        !functionCallAtCursor(
          editor.document.getText(),
          pending.expectedOffset,
          pending.triggerCharacter,
        )
      ) {
        clearAutomaticTrigger();
        return;
      }
      automaticFallbackTimer = setTimeout(
        () => void fulfillAutomaticTrigger(pending.generation),
        75,
      );
    }),
    vscode.window.onDidChangeTextEditorSelection(() => {
      void fulfillAutomaticTrigger();
    }),
    vscode.window.onDidChangeActiveTextEditor(() => clearAutomaticTrigger()),
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
          const parameterHintStatus = parameterHintStatusLine(
            vscode.window.activeTextEditor?.document,
          );
          const installed = await connections.available();
          const active = await connections.active();
          if (!installed) {
            await vscode.window.showInformationMessage(
              `Improved SQL IntelliSense — mssql API unavailable; disconnected; metadata not loaded.\n${suggestionStatus}\n${parameterHintStatus}`,
            );
            return;
          }
          if (!active) {
            await vscode.window.showInformationMessage(
              `Improved SQL IntelliSense — mssql API available; disconnected; metadata not loaded.\n${suggestionStatus}\n${parameterHintStatus}`,
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
            `Improved SQL IntelliSense — mssql API available; connected; active database: ${active.database}; cached databases: ${summary}.\n${suggestionStatus}\n${parameterHintStatus}`,
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
    vscode.commands.registerCommand(
      "improvedSqlIntellisense.diagnoseSignatureHelp",
      async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== "sql") {
          await vscode.window.showInformationMessage(
            "Open a SQL editor and place the cursor inside a function call.",
          );
          return;
        }
        const report = await signatureProvider.diagnose(
          editor.document,
          editor.selection.active,
        );
        const pending = automaticSignatureHelp.current();
        output.appendLine(
          `Signature Help diagnosis:\n${report}\n\nautomatic trigger:\n  pending: ${pending ? "yes" : "no"}\n  trigger character: ${pending?.triggerCharacter ?? "none"}\n  expected cursor: ${pending ? String(pending.expectedOffset) : "none"}\n  actual cursor: ${String(editor.document.offsetAt(editor.selection.active))}\n  fallback invoked: ${fallbackInvoked ? "yes" : "no"}\n  fallback suppressed because native succeeded: ${fallbackSuppressed ? "yes" : "no"}`,
        );
        output.show(true);
        await vscode.window.showInformationMessage(
          "Signature Help diagnosis was written to the Improved SQL IntelliSense output channel.",
        );
      },
    ),
  );
  if (context.extensionMode === vscode.ExtensionMode.Test)
    context.subscriptions.push(
      vscode.commands.registerCommand(
        "improvedSqlIntellisense.test.setSignatureScope",
        (scope: import("./completion/CandidateFactory.js").CompletionScope) =>
          signatureProvider.setTestScope(scope),
      ),
      vscode.commands.registerCommand(
        "improvedSqlIntellisense.test.takeSignatureInvocations",
        () => signatureProvider.takeTestInvocations(),
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

function functionCallAtCursor(
  sql: string,
  cursor: number,
  character: string,
): boolean {
  const prefix = sql.slice(0, cursor);
  if (character === "(")
    return /(?:^|[^A-Za-z0-9_])(?:\[[^\]]+\]|[A-Za-z_][A-Za-z0-9_@$#]*)(?:\.(?:\[[^\]]+\]|[A-Za-z_][A-Za-z0-9_@$#]*)){1,2}\($/.test(
      prefix,
    );
  if (character !== ",") return false;
  const tokens = tokenizeSql(prefix);
  let depth = 0;
  for (let i = tokens.length - 2; i >= 0; i--) {
    if (tokens[i]?.text === ")") depth++;
    if (tokens[i]?.text !== "(") continue;
    if (depth > 0) {
      depth--;
      continue;
    }
    return (
      tokens[i - 1]?.kind === "identifier" &&
      tokens[i - 2]?.text === "." &&
      tokens[i - 3]?.kind === "identifier"
    );
  }
  return false;
}

function parameterHintStatusLine(document?: vscode.TextDocument): string {
  const configuration = vscode.workspace.getConfiguration(
    "editor",
    document?.uri,
  );
  if (configuration.get<boolean>("parameterHints.enabled") ?? true)
    return "Parameter hints: enabled.";
  const inspected = configuration.inspect<boolean>("parameterHints.enabled");
  const scopes = [
    [
      "Workspace-folder SQL-language override",
      inspected?.workspaceFolderLanguageValue,
    ],
    ["Workspace SQL-language override", inspected?.workspaceLanguageValue],
    ["Global SQL-language override", inspected?.globalLanguageValue],
    ["Workspace-folder override", inspected?.workspaceFolderValue],
    ["Workspace override", inspected?.workspaceValue],
    ["Global override", inspected?.globalValue],
  ] as const;
  const source = scopes.find(([, value]) => value === false)?.[0];
  return `Parameter hints: DISABLED${source ? ` — ${source}: false.` : " by editor configuration."}`;
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

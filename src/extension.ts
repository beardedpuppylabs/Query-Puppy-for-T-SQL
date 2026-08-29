import * as vscode from "vscode";
import { SqlCompletionProvider } from "./completion/SqlCompletionProvider.js";
import {
  clearMetadataCache,
  refreshMetadata,
} from "./commands/RefreshMetadataCommand.js";
import { MetadataCache } from "./metadata/MetadataCache.js";
import { MetadataLifecycleStatus } from "./metadata/MetadataLifecycleStatus.js";
import { FileMetadataSnapshotStore } from "./metadata/PersistentMetadataStore.js";
import { MetadataLoader } from "./metadata/MetadataLoader.js";
import { MssqlConnectionSharingAdapter } from "./mssql/ConnectionSharingAdapter.js";
import { SqlSignatureHelpProvider } from "./completion/SqlSignatureHelpProvider.js";
import {
  parseCallSite,
  resolveBuiltinCallable,
} from "./parser/CallableAnalyzer.js";
import {
  COMPLETION_TRIGGER_CHARACTERS,
  SIGNATURE_HELP_METADATA,
  SQL_DOCUMENT_SELECTOR,
} from "./completion/ProviderRegistration.js";
import { PendingSignatureTriggerState } from "./completion/AutomaticSignatureHelp.js";
import { SelectStarExpansionController } from "./commands/ExpandSelectStarCommand.js";
import {
  PendingCompletionTriggerState,
  type AutomaticCompletionTriggerKind,
} from "./parser/AutomaticCompletionTrigger.js";
import {
  microsoftSuggestionStatusLines,
  resolveMicrosoftSuggestionState,
  type MicrosoftSuggestionInspection,
  type SuggestionConfigurationScope,
} from "./config/MicrosoftSuggestions.js";
import { WorkspaceProjectRelationships } from "./relationships/WorkspaceProjectRelationships.js";
import {
  SAVE_JOIN_RELATIONSHIP_COMMAND,
  SqlRelationshipCodeActionProvider,
} from "./relationships/SqlRelationshipCodeActionProvider.js";

const EXTENSION_ID = "BeardedPuppyLabs.query-puppy-for-t-sql";
let suggestionNoticePending = false;

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel("Query Puppy for T-SQL");
  const metadataStatus = new MetadataLifecycleStatus(output);
  const persistentStore = new FileMetadataSnapshotStore(
    context.globalStorageUri.fsPath,
    (message) => output.appendLine(`[metadata-cache] ${message}`),
  );
  const cache = new MetadataCache({
    store: persistentStore,
    onEvent: (event) => metadataStatus.handle(event),
  });
  const mssqlBackend = new MssqlConnectionSharingAdapter(EXTENSION_ID);
  const loader = new MetadataLoader(mssqlBackend, (message) =>
    output.appendLine(`[metadata] ${message}`),
  );
  const projectRelationships = new WorkspaceProjectRelationships(output);
  const relationshipCodeActions = new SqlRelationshipCodeActionProvider(
    mssqlBackend,
    mssqlBackend,
    loader,
    cache,
    projectRelationships,
    output,
  );
  const provider = new SqlCompletionProvider(
    mssqlBackend,
    mssqlBackend,
    loader,
    cache,
    output,
    context.extensionMode === vscode.ExtensionMode.Test,
    projectRelationships,
  );
  const signatureProvider = new SqlSignatureHelpProvider(
    mssqlBackend,
    loader,
    cache,
    output,
  );
  const automaticSignatureHelp = new PendingSignatureTriggerState();
  let automaticFallbackTimer: ReturnType<typeof setTimeout> | undefined;
  const automaticCompletion = new PendingCompletionTriggerState();
  let automaticSuggestRunning = false;
  let automaticAliasSuggestInvocations = 0;
  let automaticSemanticSuggestInvocations = 0;
  let fallbackInvoked = false;
  let fallbackSuppressed = false;
  const clearAutomaticTrigger = (): void => {
    automaticSignatureHelp.clear();
    if (automaticFallbackTimer) clearTimeout(automaticFallbackTimer);
    automaticFallbackTimer = undefined;
  };
  const clearAutomaticSuggestTrigger = (): void => {
    automaticCompletion.clear();
    provider.clearAutomaticCompletionExpectation();
  };
  const fulfillAutomaticSuggestTrigger = async (
    generation?: number,
  ): Promise<void> => {
    if (automaticSuggestRunning) return;
    const pending = automaticCompletion.current();
    const editor = vscode.window.activeTextEditor;
    if (!pending || !editor) return;
    const position = editor.selection.active;
    const taken = automaticCompletion.takeIfCurrent(
      editor.document.uri.toString(),
      editor.document.version,
      editor.document.offsetAt(position),
      generation,
    );
    if (!taken) return;
    automaticSuggestRunning = true;
    const cancellation = new vscode.CancellationTokenSource();
    try {
      const completion = await provider.provideCompletionItems(
        editor.document,
        position,
        cancellation.token,
      );
      const hasSemanticCandidate = completion.items.some((item) => {
        const data = (
          item as vscode.CompletionItem & {
            readonly data?: {
              readonly provider?: string;
              readonly semanticKind?: string;
              readonly decorative?: string;
            };
          }
        ).data;
        if (
          data?.provider !== "query-puppy-for-t-sql" ||
          data.decorative ||
          !data.semanticKind
        )
          return false;
        return automaticCandidateMatches(taken.kind, data.semanticKind);
      });
      const active = vscode.window.activeTextEditor;
      if (
        active !== editor ||
        active.document.version !== taken.documentVersion ||
        active.document.offsetAt(active.selection.active) !==
          taken.expectedOffset
      )
        return;
      if (hasSemanticCandidate) {
        await vscode.commands.executeCommand("hideSuggestWidget");
        const current = vscode.window.activeTextEditor;
        if (
          current !== editor ||
          current.document.version !== taken.documentVersion ||
          current.document.offsetAt(current.selection.active) !==
            taken.expectedOffset
        )
          return;
        provider.expectAutomaticCompletionInvocation(
          taken.kind,
          current.document.uri,
          taken.documentVersion,
          taken.expectedOffset,
        );
        if (taken.kind === "smartAlias") automaticAliasSuggestInvocations++;
        else automaticSemanticSuggestInvocations++;
        await vscode.commands.executeCommand("editor.action.triggerSuggest");
      }
    } finally {
      cancellation.dispose();
      automaticSuggestRunning = false;
    }
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
  const starExpansion = new SelectStarExpansionController(mssqlBackend, cache);
  context.subscriptions.push(
    output,
    metadataStatus,
    projectRelationships,
    relationshipCodeActions,
    starExpansion,
    vscode.languages.registerCompletionItemProvider(
      SQL_DOCUMENT_SELECTOR,
      provider,
      ...COMPLETION_TRIGGER_CHARACTERS,
    ),
    vscode.languages.registerSignatureHelpProvider(
      SQL_DOCUMENT_SELECTOR,
      signatureProvider,
      SIGNATURE_HELP_METADATA,
    ),
    vscode.languages.registerCodeActionsProvider(
      SQL_DOCUMENT_SELECTOR,
      relationshipCodeActions,
      {
        providedCodeActionKinds: [vscode.CodeActionKind.RefactorRewrite],
      },
    ),
    vscode.workspace.onDidCloseTextDocument((document) => {
      provider.closeDocument(document.uri);
      relationshipCodeActions.closeDocument(document.uri);
      if (automaticSignatureHelp.current()?.uri === document.uri.toString())
        clearAutomaticTrigger();
      if (automaticCompletion.current()?.uri === document.uri.toString())
        clearAutomaticSuggestTrigger();
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      clearAutomaticTrigger();
      clearAutomaticSuggestTrigger();
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
      const pendingSuggest = automaticCompletion.replace(
        event.document.uri.toString(),
        event.document.version,
        event.document.getText(),
        change,
        vscode.workspace
          .getConfiguration(
            "queryPuppyForTSql.smartAliases",
            event.document.uri,
          )
          .get<boolean>("enabled") ?? true,
      );
      if (pendingSuggest)
        queueMicrotask(
          () => void fulfillAutomaticSuggestTrigger(pendingSuggest.generation),
        );
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
      const pending = automaticCompletion.current();
      const active = vscode.window.activeTextEditor;
      if (
        pending &&
        active?.document.uri.toString() === pending.uri &&
        active.document.version === pending.documentVersion &&
        active.document.offsetAt(active.selection.active) ===
          pending.expectedOffset
      )
        void fulfillAutomaticSuggestTrigger(pending.generation);
      else if (pending) clearAutomaticSuggestTrigger();
      void fulfillAutomaticTrigger();
    }),
    vscode.window.onDidChangeActiveTextEditor(() => {
      clearAutomaticSuggestTrigger();
      clearAutomaticTrigger();
    }),
    vscode.commands.registerCommand(
      "queryPuppyForTSql.triggerAliasSuggest",
      () => vscode.commands.executeCommand("editor.action.triggerSuggest"),
    ),
    vscode.commands.registerCommand("queryPuppyForTSql.refreshMetadata", () =>
      refreshMetadata(mssqlBackend, loader, cache),
    ),
    vscode.commands.registerCommand(
      "queryPuppyForTSql.clearMetadataCache",
      () => clearMetadataCache(mssqlBackend, cache),
    ),
    vscode.commands.registerCommand(
      "queryPuppyForTSql.openProjectRelationships",
      () => projectRelationships.openForActiveWorkspace(),
    ),
    vscode.commands.registerCommand(
      SAVE_JOIN_RELATIONSHIP_COMMAND,
      (request: unknown) => relationshipCodeActions.save(request),
    ),
    vscode.commands.registerCommand(
      "queryPuppyForTSql.showStatus",
      async () => {
        try {
          const suggestionStatus = microsoftSuggestionStatusLines(
            inspectMicrosoftSuggestions(),
          ).join("\n");
          const parameterHintStatus = parameterHintStatusLine(
            vscode.window.activeTextEditor?.document,
          );
          const installed = await mssqlBackend.available();
          const active = await mssqlBackend.active();
          if (!installed) {
            await vscode.window.showInformationMessage(
              `Query Puppy for T-SQL — mssql API unavailable; disconnected; metadata not loaded.\n${suggestionStatus}\n${parameterHintStatus}`,
            );
            return;
          }
          if (!active) {
            await vscode.window.showInformationMessage(
              `Query Puppy for T-SQL — mssql API available; disconnected; metadata not loaded.\n${suggestionStatus}\n${parameterHintStatus}`,
            );
            return;
          }
          const cached = cache.snapshots(active.connectionIdentity);
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
            `Query Puppy for T-SQL — mssql API available; connected; active database: ${active.database}; cached databases: ${summary}.\n${suggestionStatus}\n${parameterHintStatus}`,
          );
        } catch (error) {
          await vscode.window.showInformationMessage(
            `Query Puppy for T-SQL status unavailable: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
    ),
    vscode.commands.registerCommand(
      "queryPuppyForTSql.disableMicrosoftSuggestions",
      () => disableMicrosoftSuggestions(),
    ),
    vscode.commands.registerCommand(
      "queryPuppyForTSql.diagnoseSignatureHelp",
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
          "Signature Help diagnosis was written to the Query Puppy for T-SQL output channel.",
        );
      },
    ),
    vscode.commands.registerCommand(
      "queryPuppyForTSql.diagnoseQueryScope",
      async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== "sql") {
          await vscode.window.showInformationMessage(
            "Open a SQL editor and place the cursor at a completion position.",
          );
          return;
        }
        try {
          const report = await provider.diagnoseQueryScope(
            editor.document,
            editor.selection.active,
          );
          output.appendLine(`Query Scope diagnosis:\n${report}`);
          output.show(true);
          await vscode.window.showInformationMessage(
            "Query Scope diagnosis was written to the Query Puppy for T-SQL output channel.",
          );
        } catch (error) {
          output.appendLine(
            `Query Scope diagnosis failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
    ),
  );
  if (context.extensionMode === vscode.ExtensionMode.Test)
    context.subscriptions.push(
      vscode.commands.registerCommand(
        "queryPuppyForTSql.test.setCompletionScope",
        (scope: import("./completion/CandidateFactory.js").CompletionScope) => {
          provider.setTestScope(scope);
          starExpansion.setTestCatalog(scope);
          relationshipCodeActions.setTestScope(scope);
        },
      ),
      vscode.commands.registerCommand(
        "queryPuppyForTSql.test.applyProjectRelationships",
        (
          document: vscode.TextDocument,
          scope: import("./completion/CandidateFactory.js").CompletionScope,
        ) => projectRelationships.apply(document, scope),
      ),
      vscode.commands.registerCommand(
        "queryPuppyForTSql.test.provideCompletions",
        async (document: vscode.TextDocument, position: vscode.Position) => {
          const cancellation = new vscode.CancellationTokenSource();
          try {
            return await provider.provideCompletionItems(
              document,
              position,
              cancellation.token,
            );
          } finally {
            cancellation.dispose();
          }
        },
      ),
      vscode.commands.registerCommand(
        "queryPuppyForTSql.test.provideRelationshipCodeActions",
        async (document: vscode.TextDocument, range: vscode.Range) => {
          const cancellation = new vscode.CancellationTokenSource();
          try {
            return await relationshipCodeActions.provideCodeActions(
              document,
              range,
              {
                diagnostics: [],
                only: undefined,
                triggerKind: vscode.CodeActionTriggerKind.Invoke,
              },
              cancellation.token,
            );
          } finally {
            cancellation.dispose();
          }
        },
      ),
      vscode.commands.registerCommand(
        "queryPuppyForTSql.test.diagnoseQueryScope",
        (document: vscode.TextDocument, position: vscode.Position) =>
          provider.diagnoseQueryScope(document, position),
      ),
      vscode.commands.registerCommand(
        "queryPuppyForTSql.test.setSignatureScope",
        (scope: import("./completion/CandidateFactory.js").CompletionScope) =>
          signatureProvider.setTestScope(scope),
      ),
      vscode.commands.registerCommand(
        "queryPuppyForTSql.test.takeSignatureInvocations",
        () => signatureProvider.takeTestInvocations(),
      ),
      vscode.commands.registerCommand(
        "queryPuppyForTSql.test.takeAutomaticAliasSuggestInvocations",
        () => {
          const count = automaticAliasSuggestInvocations;
          automaticAliasSuggestInvocations = 0;
          return count;
        },
      ),
      vscode.commands.registerCommand(
        "queryPuppyForTSql.test.takeAutomaticSemanticSuggestInvocations",
        () => {
          const count = automaticSemanticSuggestInvocations;
          automaticSemanticSuggestInvocations = 0;
          return count;
        },
      ),
      vscode.commands.registerCommand(
        "queryPuppyForTSql.test.takeAutomaticCompletionInvocations",
        () => provider.takeAutomaticCompletionInvocations(),
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

function automaticCandidateMatches(
  trigger: AutomaticCompletionTriggerKind,
  semanticKind: string,
): boolean {
  if (trigger === "smartAlias") return semanticKind === "rowSourceAlias";
  if (trigger === "joinContinuation") return semanticKind === "keyword";
  return true;
}

function functionCallAtCursor(
  sql: string,
  cursor: number,
  character: string,
): boolean {
  if (character !== "(" && character !== ",") return false;
  const callSite = parseCallSite(sql, cursor);
  return Boolean(
    callSite &&
    (callSite.nameParts.length >= 2 || resolveBuiltinCallable(callSite)),
  );
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
      "Query Puppy for T-SQL replaces Microsoft mssql suggestions. Disable Microsoft's suggestions to avoid duplicate and conflicting completion results?",
      disable,
      notNow,
    );
    await context.globalState.update(noticeKey, true);
    if (choice === disable) {
      await updateMicrosoftSuggestions("global");
      if (inspectMicrosoftSuggestions().effectiveValue)
        await vscode.window.showWarningMessage(
          "Microsoft SQL suggestions remain enabled by a workspace override. Run “Query Puppy for T-SQL: Disable Microsoft SQL Suggestions” to resolve it.",
        );
    }
  } finally {
    suggestionNoticePending = false;
  }
}

export function deactivate(): void {}

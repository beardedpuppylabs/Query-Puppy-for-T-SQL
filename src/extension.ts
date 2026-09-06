import * as vscode from "vscode";
import { join } from "node:path";
import { SqlCompletionProvider } from "./completion/SqlCompletionProvider.js";
import { CompletionScopeResolver } from "./completion/CompletionScopeResolver.js";
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
import {
  PendingSignatureTriggerState,
  type PendingSignatureTrigger,
} from "./completion/AutomaticSignatureHelp.js";
import { SelectStarExpansionController } from "./commands/ExpandSelectStarCommand.js";
import {
  PendingCompletionTriggerState,
  type AutomaticCompletionTriggerKind,
} from "./parser/AutomaticCompletionTrigger.js";
import {
  disableMicrosoftQuickInfoAtEffectiveScope,
  microsoftQuickInfoStatusLines,
  microsoftSuggestionStatusLines,
  resolveMicrosoftQuickInfoState,
  resolveMicrosoftSuggestionState,
  type MicrosoftSuggestionInspection,
  type QuickInfoConfigurationScope,
  type SuggestionConfigurationScope,
} from "./config/MicrosoftSuggestions.js";
import { WorkspaceProjectRelationships } from "./relationships/WorkspaceProjectRelationships.js";
import {
  SAVE_JOIN_RELATIONSHIP_COMMAND,
  SqlRelationshipCodeActionProvider,
} from "./relationships/SqlRelationshipCodeActionProvider.js";
import { FileLearnedRelationshipEvidenceStore } from "./relationships/LearnedRelationshipEvidenceStore.js";
import { parseProcedureCallSite } from "./parser/DmlCallAnalyzer.js";
import {
  CLEAR_LEARNED_RELATIONSHIP_EVIDENCE_COMMAND,
  WorkspaceLearnedRelationshipEvidence,
} from "./relationships/WorkspaceLearnedRelationshipEvidence.js";
import { resolveSqlContext } from "./parser/SqlContextResolver.js";
import { DocumentSemanticCache } from "./parser/DocumentSemanticCache.js";
import { SqlDefinitionProvider } from "./navigation/SqlDefinitionProvider.js";
import { SqlDocumentHighlightProvider } from "./navigation/SqlDocumentHighlightProvider.js";
import { SqlDocumentDiagnostics } from "./navigation/SqlDocumentDiagnostics.js";
import { SqlDocumentSymbolProvider } from "./navigation/SqlDocumentSymbolProvider.js";
import { SqlHoverProvider } from "./navigation/SqlHoverProvider.js";
import { SqlReferenceProvider } from "./navigation/SqlReferenceProvider.js";

const EXTENSION_ID = "BeardedPuppyLabs.query-puppy-for-t-sql";
const MICROSOFT_QUICK_INFO_NOTICE_KEY = "mssqlQuickInfoNoticeShown";
let suggestionNoticePending = false;
let quickInfoNoticePending = false;
let quickInfoNoticePromptCount = 0;

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
  const learnedEvidenceStore = context.storageUri
    ? new FileLearnedRelationshipEvidenceStore(
        join(context.storageUri.fsPath, "learned-relationship-evidence"),
        (message) =>
          output.appendLine(`[learned-relationship-evidence] ${message}`),
      )
    : undefined;
  const learnedRelationshipEvidence = new WorkspaceLearnedRelationshipEvidence(
    learnedEvidenceStore,
    mssqlBackend,
    cache,
    projectRelationships,
    output,
  );
  const relationshipScopes = new CompletionScopeResolver(
    mssqlBackend,
    loader,
    cache,
    (key, error) =>
      output.appendLine(
        `[user-confirmed-relationship] ${key}: ${error instanceof Error ? error.message : String(error)}`,
      ),
  );
  const relationshipCodeActions = new SqlRelationshipCodeActionProvider(
    mssqlBackend,
    {
      resolve: (active, sql, cursor) =>
        relationshipScopes.resolve(active, resolveSqlContext(sql, cursor)),
    },
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
    learnedRelationshipEvidence,
  );
  const signatureProvider = new SqlSignatureHelpProvider(
    mssqlBackend,
    loader,
    cache,
    output,
  );
  const navigationDocumentSemantics = new DocumentSemanticCache();
  const definitionProvider = new SqlDefinitionProvider(
    navigationDocumentSemantics,
  );
  const documentHighlightProvider = new SqlDocumentHighlightProvider(
    navigationDocumentSemantics,
  );
  const documentDiagnostics = new SqlDocumentDiagnostics();
  const documentSymbolProvider = new SqlDocumentSymbolProvider();
  const hoverProvider = new SqlHoverProvider(navigationDocumentSemantics);
  const referenceProvider = new SqlReferenceProvider(
    navigationDocumentSemantics,
  );
  const automaticSignatureHelp = new PendingSignatureTriggerState();
  let automaticFallbackTimer: ReturnType<typeof setTimeout> | undefined;
  const automaticCompletion = new PendingCompletionTriggerState();
  let automaticSuggestTimer: ReturnType<typeof setTimeout> | undefined;
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
    if (automaticSuggestTimer) clearTimeout(automaticSuggestTimer);
    automaticSuggestTimer = undefined;
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
    if (automaticSuggestTimer) clearTimeout(automaticSuggestTimer);
    automaticSuggestTimer = undefined;
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
    learnedRelationshipEvidence,
    relationshipCodeActions,
    starExpansion,
    documentDiagnostics,
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
    vscode.languages.registerDefinitionProvider(
      SQL_DOCUMENT_SELECTOR,
      definitionProvider,
    ),
    vscode.languages.registerReferenceProvider(
      SQL_DOCUMENT_SELECTOR,
      referenceProvider,
    ),
    vscode.languages.registerDocumentHighlightProvider(
      SQL_DOCUMENT_SELECTOR,
      documentHighlightProvider,
    ),
    vscode.languages.registerDocumentSymbolProvider(
      SQL_DOCUMENT_SELECTOR,
      documentSymbolProvider,
    ),
    vscode.languages.registerHoverProvider(
      SQL_DOCUMENT_SELECTOR,
      hoverProvider,
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
      definitionProvider.closeDocument(document.uri);
      documentDiagnostics.closeDocument(document.uri);
      documentHighlightProvider.closeDocument(document.uri);
      documentSymbolProvider.closeDocument(document.uri);
      referenceProvider.closeDocument(document.uri);
      relationshipCodeActions.closeDocument(document.uri);
      if (automaticSignatureHelp.current()?.uri === document.uri.toString())
        clearAutomaticTrigger();
      if (automaticCompletion.current()?.uri === document.uri.toString())
        clearAutomaticSuggestTrigger();
    }),
    vscode.workspace.onDidOpenTextDocument((document) =>
      documentDiagnostics.update(document),
    ),
    vscode.workspace.onDidChangeTextDocument((event) => {
      documentDiagnostics.update(event.document);
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
        automaticSuggestTimer = setTimeout(
          () => void fulfillAutomaticSuggestTrigger(pendingSuggest.generation),
          0,
        );
      const pending = automaticSignatureHelp.replace(
        event.document.uri.toString(),
        event.document.version,
        change,
      );
      if (!pending) return;
      if (
        !signatureCallAtCursor(
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
      CLEAR_LEARNED_RELATIONSHIP_EVIDENCE_COMMAND,
      () => learnedRelationshipEvidence.clearForActiveWorkspace(),
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
          const quickInfoStatus = microsoftQuickInfoStatusLines(
            inspectMicrosoftQuickInfo(),
          ).join("\n");
          const parameterHintStatus = parameterHintStatusLine(
            vscode.window.activeTextEditor?.document,
          );
          const installed = await mssqlBackend.available();
          const active = await mssqlBackend.active();
          if (!installed) {
            await vscode.window.showInformationMessage(
              `Query Puppy for T-SQL — mssql API unavailable; disconnected; metadata not loaded.\n${suggestionStatus}\n${quickInfoStatus}\n${parameterHintStatus}`,
            );
            return;
          }
          if (!active) {
            await vscode.window.showInformationMessage(
              `Query Puppy for T-SQL — mssql API available; disconnected; metadata not loaded.\n${suggestionStatus}\n${quickInfoStatus}\n${parameterHintStatus}`,
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
            `Query Puppy for T-SQL — mssql API available; connected; active database: ${active.database}; cached databases: ${summary}.\n${suggestionStatus}\n${quickInfoStatus}\n${parameterHintStatus}`,
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
      "queryPuppyForTSql.disableMicrosoftQuickInfo",
      () => disableMicrosoftQuickInfo(),
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
  for (const document of vscode.workspace.textDocuments)
    documentDiagnostics.update(document);
  if (context.extensionMode === vscode.ExtensionMode.Test)
    context.subscriptions.push(
      vscode.commands.registerCommand(
        "queryPuppyForTSql.test.setCompletionScope",
        (scope: import("./completion/CandidateFactory.js").CompletionScope) => {
          provider.setTestScope(scope);
          starExpansion.setTestCatalog(scope);
          relationshipCodeActions.setTestScope(scope);
          learnedRelationshipEvidence.setTestScope(scope);
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
        "queryPuppyForTSql.test.applyLearnedRelationshipCandidates",
        (
          document: vscode.TextDocument,
          scope: import("./completion/CandidateFactory.js").CompletionScope,
        ) => learnedRelationshipEvidence.applyCandidates(document, scope),
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
        "queryPuppyForTSql.test.observeLearnedRelationshipEvidence",
        (document: vscode.TextDocument) =>
          learnedRelationshipEvidence.observeSavedDocument(document),
      ),
      vscode.commands.registerCommand(
        "queryPuppyForTSql.test.learnedRelationshipEvidence",
        (document: vscode.TextDocument) =>
          learnedRelationshipEvidence.evidenceForDocument(document),
      ),
      vscode.commands.registerCommand(
        "queryPuppyForTSql.test.learnedRelationshipEvidenceState",
        (document: vscode.TextDocument) =>
          learnedRelationshipEvidence.stateForDocument(document),
      ),
      vscode.commands.registerCommand(
        "queryPuppyForTSql.test.clearLearnedRelationshipEvidence",
        (document: vscode.TextDocument) =>
          learnedRelationshipEvidence.clearForDocument(document),
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
      vscode.commands.registerCommand(
        "queryPuppyForTSql.test.takeAmbiguityNotifications",
        () => provider.takeTestAmbiguityNotifications(),
      ),
      vscode.commands.registerCommand(
        "queryPuppyForTSql.test.microsoftQuickInfoNoticeState",
        () => ({
          shown:
            context.globalState.get<boolean>(MICROSOFT_QUICK_INFO_NOTICE_KEY) ??
            false,
          promptCount: quickInfoNoticePromptCount,
        }),
      ),
      vscode.commands.registerCommand(
        "queryPuppyForTSql.test.warnAboutMicrosoftQuickInfo",
        () => warnAboutMicrosoftQuickInfo(context),
      ),
      vscode.commands.registerCommand(
        "queryPuppyForTSql.test.disableMicrosoftQuickInfoAtEffectiveScope",
        () =>
          disableMicrosoftQuickInfoAtEffectiveScope(
            inspectMicrosoftQuickInfo(),
            updateMicrosoftQuickInfo,
          ),
      ),
    );
  let coexistenceNoticeCheckPending = false;
  const checkFirstRun = (): void => {
    if (coexistenceNoticeCheckPending) return;
    coexistenceNoticeCheckPending = true;
    void (async () => {
      try {
        await warnAboutMicrosoftSuggestions(context);
        await warnAboutMicrosoftQuickInfo(context);
      } catch (error) {
        output.appendLine(
          `Microsoft IntelliSense setting check failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        coexistenceNoticeCheckPending = false;
      }
    })();
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
  if (trigger === "joinOnContinuation") return semanticKind === "joinPredicate";
  return true;
}

function signatureCallAtCursor(
  sql: string,
  cursor: number,
  character: PendingSignatureTrigger["triggerCharacter"],
): boolean {
  const procedure = parseProcedureCallSite(sql, cursor);
  if (character === "procedureArgument")
    return Boolean(
      procedure &&
      cursor > procedure.nameEnd &&
      sql.slice(procedure.nameEnd, cursor).trim().length === 0,
    );
  const callSite = parseCallSite(sql, cursor);
  if (
    callSite &&
    (resolveBuiltinCallable(callSite) || callSite.nameParts.length)
  )
    return true;
  return character === "," && procedure?.lastArgumentSeparator === cursor - 1;
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

type MicrosoftIntelliSenseSetting = "enableSuggestions" | "enableQuickInfo";

function inspectMicrosoftIntelliSenseSetting(
  setting: MicrosoftIntelliSenseSetting,
): MicrosoftSuggestionInspection {
  const resource = vscode.window.activeTextEditor?.document.uri;
  const configuration = vscode.workspace.getConfiguration(
    "mssql.intelliSense",
    resource,
  );
  const inspection = configuration.inspect<boolean>(setting);
  return {
    effectiveValue: configuration.get<boolean>(setting) ?? true,
    globalValue: inspection?.globalValue,
    workspaceValue: inspection?.workspaceValue,
    workspaceFolderValue: inspection?.workspaceFolderValue,
  };
}

function inspectMicrosoftSuggestions(): MicrosoftSuggestionInspection {
  return inspectMicrosoftIntelliSenseSetting("enableSuggestions");
}

function inspectMicrosoftQuickInfo(): MicrosoftSuggestionInspection {
  return inspectMicrosoftIntelliSenseSetting("enableQuickInfo");
}

async function updateMicrosoftIntelliSenseSetting(
  setting: MicrosoftIntelliSenseSetting,
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
    .update(setting, false, target);
}

async function updateMicrosoftSuggestions(
  scope: SuggestionConfigurationScope,
): Promise<void> {
  await updateMicrosoftIntelliSenseSetting("enableSuggestions", scope);
}

async function updateMicrosoftQuickInfo(
  scope: QuickInfoConfigurationScope,
): Promise<void> {
  await updateMicrosoftIntelliSenseSetting("enableQuickInfo", scope);
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

async function disableMicrosoftQuickInfo(): Promise<void> {
  const inspection = inspectMicrosoftQuickInfo();
  const state = resolveMicrosoftQuickInfoState(inspection);
  if (!state.enabled) {
    await vscode.window.showInformationMessage(
      "Microsoft SQL Quick Info is already disabled.",
    );
    return;
  }

  if (state.enablingScope === "workspaceFolder") {
    const action = "Disable for this workspace folder";
    const globalContext =
      inspection.globalValue === false
        ? "Microsoft SQL Quick Info is disabled globally, but this workspace folder explicitly enables it."
        : "This workspace folder explicitly enables Microsoft SQL Quick Info.";
    const choice = await vscode.window.showInformationMessage(
      globalContext,
      action,
    );
    if (choice === action)
      await disableMicrosoftQuickInfoAtEffectiveScope(
        inspection,
        updateMicrosoftQuickInfo,
      );
    return;
  }
  if (state.enablingScope === "workspace") {
    const action = "Disable for this workspace";
    const globalContext =
      inspection.globalValue === false
        ? "Microsoft SQL Quick Info is disabled globally, but this workspace explicitly enables it."
        : "This workspace explicitly enables Microsoft SQL Quick Info.";
    const choice = await vscode.window.showInformationMessage(
      globalContext,
      action,
    );
    if (choice === action)
      await disableMicrosoftQuickInfoAtEffectiveScope(
        inspection,
        updateMicrosoftQuickInfo,
      );
    return;
  }

  await disableMicrosoftQuickInfoAtEffectiveScope(
    inspection,
    updateMicrosoftQuickInfo,
  );
  void vscode.window.showInformationMessage(
    "Microsoft SQL Quick Info disabled globally. Microsoft suggestions and error checking remain unchanged.",
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

async function warnAboutMicrosoftQuickInfo(
  context: vscode.ExtensionContext,
): Promise<void> {
  if (
    context.globalState.get<boolean>(MICROSOFT_QUICK_INFO_NOTICE_KEY) ||
    quickInfoNoticePending
  )
    return;
  if (vscode.window.activeTextEditor?.document.languageId !== "sql") return;
  if (!vscode.extensions.getExtension("ms-mssql.mssql")) return;
  if (!inspectMicrosoftQuickInfo().effectiveValue) return;
  const disable = "Disable globally";
  const notNow = "Not now";
  quickInfoNoticePending = true;
  quickInfoNoticePromptCount++;
  await context.globalState.update(MICROSOFT_QUICK_INFO_NOTICE_KEY, true);
  try {
    const choice = await vscode.window.showInformationMessage(
      "Query Puppy provides enhanced SQL Hover information. Disable Microsoft SQL Quick Info to avoid duplicate Hover descriptions?",
      disable,
      notNow,
    );
    if (choice === disable) {
      await updateMicrosoftQuickInfo("global");
      if (inspectMicrosoftQuickInfo().effectiveValue)
        await vscode.window.showWarningMessage(
          "Microsoft SQL Quick Info remains enabled by a workspace override. Run “Query Puppy for T-SQL: Disable Microsoft SQL Quick Info” to resolve it.",
        );
    }
  } finally {
    quickInfoNoticePending = false;
  }
}

export function deactivate(): void {}

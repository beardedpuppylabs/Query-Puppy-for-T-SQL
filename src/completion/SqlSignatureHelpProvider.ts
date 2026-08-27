import * as vscode from "vscode";
import type { ConnectionContextResolver } from "../backend/MetadataBackend.js";
import type { MetadataLoader } from "../metadata/MetadataLoader.js";
import { MetadataCache } from "../metadata/MetadataCache.js";
import { formatSqlType } from "../metadata/SqlTypeFormatter.js";
import { normalizeName } from "../metadata/MetadataModels.js";
import type { CompletionScope } from "./CandidateFactory.js";
import {
  callableDatabase,
  callableParameterLabel,
  callableSignatureLabel,
  parseCallSite,
  resolveCallable,
  resolveBuiltinCallable,
  resolveCallableAtCursor,
} from "../parser/CallableAnalyzer.js";

export class SqlSignatureHelpProvider implements vscode.SignatureHelpProvider {
  private testScope: CompletionScope | undefined;
  private readonly testInvocations: Array<{
    readonly triggerKind: vscode.SignatureHelpTriggerKind;
    readonly triggerCharacter?: string;
  }> = [];
  private lastSuccessfulSignatureHelp:
    | {
        readonly uri: string;
        readonly documentVersion: number;
        readonly offset: number;
        readonly signatureCount: number;
      }
    | undefined;
  private readonly loggedEnvironments = new Set<string>();
  private readonly diagnostics = new Map<string, string>();
  constructor(
    private readonly connections: ConnectionContextResolver,
    private readonly loader: MetadataLoader,
    private readonly cache: MetadataCache,
    private readonly output?: vscode.OutputChannel,
  ) {}
  setTestScope(scope: CompletionScope): void {
    this.testScope = scope;
  }
  takeTestInvocations(): readonly {
    readonly triggerKind: vscode.SignatureHelpTriggerKind;
    readonly triggerCharacter?: string;
  }[] {
    return this.testInvocations.splice(0);
  }
  async provideSignatureHelp(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.SignatureHelpContext,
  ): Promise<vscode.SignatureHelp | undefined> {
    const environmentKey = `${document.uri.scheme}:${document.languageId}`;
    if (!this.loggedEnvironments.has(environmentKey)) {
      this.loggedEnvironments.add(environmentKey);
      const hints =
        vscode.workspace
          .getConfiguration("editor", document.uri)
          .get<boolean>("parameterHints.enabled") ?? true;
      this.debug(
        `Signature Help environment: languageId=${document.languageId}; scheme=${document.uri.scheme}; parameterHints=${String(hints)}; selector=sql/${document.uri.scheme}; triggers=(,comma; selectorMatch=${document.languageId === "sql" ? "yes" : "no"}.`,
      );
    }
    if (this.testScope)
      this.testInvocations.push({
        triggerKind: context.triggerKind,
        ...(context.triggerCharacter
          ? { triggerCharacter: context.triggerCharacter }
          : {}),
      });
    const sql = document.getText();
    const cursor = document.offsetAt(position);
    const callSite = parseCallSite(sql, cursor);
    const builtin = callSite ? resolveBuiltinCallable(callSite) : undefined;
    let scope = this.testScope;
    if (!scope && !builtin) {
      const active = await this.connections.active();
      if (!active || token.isCancellationRequested) {
        this.diagnostics.set(
          document.uri.toString(),
          `provider result: returned no\nreason: ${active ? "request cancelled" : "no active SQL connection"}`,
        );
        return undefined;
      }
      const indexes = new Map();
      const activeIndex = await this.cache.ensureLoaded(
        active.connectionIdentity,
        active.database,
        () => this.loader.load(active),
      );
      indexes.set(normalizeName(active.database), activeIndex);
      const database = callableDatabase(callSite);
      if (
        database &&
        normalizeName(database) !== normalizeName(active.database)
      ) {
        const index = await this.cache.ensureLoaded(
          active.connectionIdentity,
          database,
          () => this.loader.load({ ...active, database }),
        );
        indexes.set(normalizeName(database), index);
      }
      scope = { activeDatabase: active.database, indexes };
    }
    const resolution =
      builtin ??
      (callSite && scope ? resolveCallable(callSite, scope) : undefined);
    if (!resolution) {
      this.diagnostics.set(
        document.uri.toString(),
        "parsed call: not resolved\nmetadata match: found no\nprovider result: returned no",
      );
      this.debug(
        `Signature Help invoked: language=${document.languageId}; triggerKind=${vscode.SignatureHelpTriggerKind[context.triggerKind]}; triggerCharacter=${context.triggerCharacter ?? "none"}; resolved=no.`,
      );
      return undefined;
    }
    const signatureModel = resolution.signature;
    const parameters = signatureModel.parameters.map(
      (parameter) =>
        new vscode.ParameterInformation(callableParameterLabel(parameter)),
    );
    const signature = new vscode.SignatureInformation(
      callableSignatureLabel(signatureModel),
    );
    signature.parameters = parameters;
    if (signatureModel.documentation)
      signature.documentation = signatureModel.documentation;
    const help = new vscode.SignatureHelp();
    help.signatures = [signature];
    help.activeSignature = 0;
    help.activeParameter = resolution.activeParameter;
    this.lastSuccessfulSignatureHelp = {
      uri: document.uri.toString(),
      documentVersion: document.version,
      offset: cursor,
      signatureCount: help.signatures.length,
    };
    this.diagnostics.set(
      document.uri.toString(),
      `parsed call:\n  database: ${signatureModel.database ?? scope?.activeDatabase ?? "language metadata"}\n  schema: ${signatureModel.schema ?? "none"}\n  object: ${signatureModel.name}\nmetadata match:\n  found: yes\n  kind: ${signatureModel.kind === "tableValued" ? "table-valued function" : signatureModel.kind === "aggregate" ? "aggregate function" : "scalar function"}\n  parameters: ${String(signatureModel.parameters.length)}\n  return: ${signatureModel.kind === "tableValued" ? "table" : signatureModel.returnType ? formatSqlType(signatureModel.returnType) : "dynamic"}\nprovider result:\n  returned: yes\n  signatures: 1\n  activeParameter: ${String(resolution.activeParameter)}`,
    );
    this.debug(
      `Signature Help invoked: language=${document.languageId}; triggerKind=${vscode.SignatureHelpTriggerKind[context.triggerKind]}; triggerCharacter=${context.triggerCharacter ?? "none"}; function=${signatureModel.schema ? `${signatureModel.schema}.` : ""}${signatureModel.name}; resolved=yes; activeParameter=${String(resolution.activeParameter)}.`,
    );
    return help;
  }
  succeeded(document: vscode.TextDocument, position: vscode.Position): boolean {
    const successful = this.lastSuccessfulSignatureHelp;
    return (
      successful?.uri === document.uri.toString() &&
      successful.documentVersion === document.version &&
      successful.offset === document.offsetAt(position) &&
      successful.signatureCount > 0
    );
  }
  async canResolveCached(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<boolean> {
    const sql = document.getText();
    const cursor = document.offsetAt(position);
    const parsed = parseCallSite(sql, cursor);
    if (parsed && resolveBuiltinCallable(parsed)) return true;
    if (this.testScope)
      return Boolean(resolveCallableAtCursor(sql, cursor, this.testScope));
    const active = await this.connections.active();
    if (!active) return false;
    const indexes = new Map();
    const activeIndex = this.cache.get(
      active.connectionIdentity,
      active.database,
    );
    if (!activeIndex) return false;
    indexes.set(normalizeName(active.database), activeIndex);
    const callSite = parseCallSite(sql, cursor);
    const database = callableDatabase(callSite);
    if (
      database &&
      normalizeName(database) !== normalizeName(active.database)
    ) {
      const index = this.cache.get(active.connectionIdentity, database);
      if (!index) return false;
      indexes.set(normalizeName(database), index);
    }
    return Boolean(
      callSite &&
      resolveCallable(callSite, {
        activeDatabase: active.database,
        indexes,
      }),
    );
  }
  async diagnose(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<string> {
    const cancellation = new vscode.CancellationTokenSource();
    try {
      await this.provideSignatureHelp(document, position, cancellation.token, {
        triggerKind: vscode.SignatureHelpTriggerKind.Invoke,
        isRetrigger: false,
        triggerCharacter: undefined,
        activeSignatureHelp: undefined,
      });
    } finally {
      cancellation.dispose();
    }
    const hints =
      vscode.workspace
        .getConfiguration("editor", document.uri)
        .get<boolean>("parameterHints.enabled") ?? true;
    return `languageId: ${document.languageId}\nscheme: ${document.uri.scheme}\nparameter hints: ${hints ? "enabled" : "DISABLED"}\n\n${this.diagnostics.get(document.uri.toString()) ?? "provider result: unavailable"}`;
  }

  private debug(message: string): void {
    if (
      this.output &&
      (vscode.workspace
        .getConfiguration("queryPuppyForTSql")
        .get<boolean>("debugLogging") ??
        false)
    )
      this.output.appendLine(message);
  }
}

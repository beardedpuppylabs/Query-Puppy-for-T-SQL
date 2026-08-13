import * as vscode from "vscode";
import type { ConnectionService } from "../mssql/ConnectionService.js";
import type { MetadataLoader } from "../mssql/MetadataLoader.js";
import { MetadataCache } from "../metadata/MetadataCache.js";
import { formatSqlType } from "../metadata/SqlTypeFormatter.js";
import { normalizeName } from "../metadata/MetadataModels.js";
import type { CompletionScope } from "./CandidateFactory.js";
import {
  functionInvocationDatabase,
  functionSignatureLabel,
  resolveFunctionSignature,
} from "../parser/DmlCallAnalyzer.js";

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
    private readonly connections: ConnectionService,
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
    let scope = this.testScope;
    if (!scope) {
      const active = await this.connections.active();
      if (!active || token.isCancellationRequested) {
        this.diagnostics.set(
          document.uri.toString(),
          `provider result: returned no\nreason: ${active ? "request cancelled" : "no active mssql connection"}`,
        );
        return undefined;
      }
      const indexes = new Map();
      const activeIndex = await this.cache.ensureLoaded(
        active.connectionId,
        active.database,
        () => this.loader.load(active),
      );
      indexes.set(normalizeName(active.database), activeIndex);
      const database = functionInvocationDatabase(sql, cursor);
      if (
        database &&
        normalizeName(database) !== normalizeName(active.database)
      ) {
        const index = await this.cache.ensureLoaded(
          active.connectionId,
          database,
          () => this.loader.load({ ...active, database }),
        );
        indexes.set(normalizeName(database), index);
      }
      scope = { activeDatabase: active.database, indexes };
    }
    const resolution = resolveFunctionSignature(sql, cursor, scope);
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
    const object = resolution.object;
    const parameters = object.parameters.map(
      (parameter) =>
        new vscode.ParameterInformation(
          `${parameter.name} ${formatSqlType(parameter.type)}${parameter.output ? " OUTPUT" : ""}`,
        ),
    );
    const signature = new vscode.SignatureInformation(
      functionSignatureLabel(object),
    );
    signature.parameters = parameters;
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
      `parsed call:\n  database: ${functionInvocationDatabase(sql, cursor) ?? scope.activeDatabase}\n  schema: ${object.schema}\n  object: ${object.name}\nmetadata match:\n  found: yes\n  kind: ${object.kind === "scalarFunction" ? "scalar function" : "table-valued function"}\n  parameters: ${String(object.parameters.length)}\n  return: ${object.kind === "tableValuedFunction" ? "table" : object.returnType ? formatSqlType(object.returnType) : "unknown"}\nprovider result:\n  returned: yes\n  signatures: 1\n  activeParameter: ${String(resolution.activeParameter)}`,
    );
    this.debug(
      `Signature Help invoked: language=${document.languageId}; triggerKind=${vscode.SignatureHelpTriggerKind[context.triggerKind]}; triggerCharacter=${context.triggerCharacter ?? "none"}; function=${object.schema}.${object.name}; resolved=yes; activeParameter=${String(resolution.activeParameter)}.`,
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
    if (this.testScope)
      return Boolean(resolveFunctionSignature(sql, cursor, this.testScope));
    const active = await this.connections.active();
    if (!active) return false;
    const indexes = new Map();
    const activeIndex = this.cache.get(active.connectionId, active.database);
    if (!activeIndex) return false;
    indexes.set(normalizeName(active.database), activeIndex);
    const database = functionInvocationDatabase(sql, cursor);
    if (
      database &&
      normalizeName(database) !== normalizeName(active.database)
    ) {
      const index = this.cache.get(active.connectionId, database);
      if (!index) return false;
      indexes.set(normalizeName(database), index);
    }
    return Boolean(
      resolveFunctionSignature(sql, cursor, {
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
        .getConfiguration("improvedSqlIntellisense")
        .get<boolean>("debugLogging") ??
        false)
    )
      this.output.appendLine(message);
  }
}

import * as vscode from "vscode";

export interface ConnectionSharingApi {
  getActiveEditorConnectionId(extensionId: string): Promise<string | undefined>;
  getActiveDatabase(extensionId: string): Promise<string | undefined>;
  getDatabaseForConnectionId(
    extensionId: string,
    connectionId: string,
  ): Promise<string | undefined>;
  connect(
    extensionId: string,
    connectionId: string,
    database?: string,
  ): Promise<string | undefined>;
  disconnect(connectionUri: string): void;
  isConnected(connectionUri: string): boolean;
  executeSimpleQuery(
    connectionUri: string,
    queryString: string,
  ): Promise<unknown>;
  listDatabases(connectionUri: string): Promise<string[]>;
}
export interface MssqlExtensionApi {
  readonly connectionSharing: ConnectionSharingApi;
}

let apiExtension: vscode.Extension<unknown> | undefined;
let apiPromise: Promise<MssqlExtensionApi | undefined> | undefined;

function isConnectionSharing(value: unknown): value is ConnectionSharingApi {
  if (typeof value !== "object" || value === null) return false;
  const api = value as Record<string, unknown>;
  return [
    "getActiveEditorConnectionId",
    "getActiveDatabase",
    "connect",
    "disconnect",
    "isConnected",
    "executeSimpleQuery",
    "listDatabases",
  ].every((name) => typeof api[name] === "function");
}

export async function getMssqlApi(): Promise<MssqlExtensionApi | undefined> {
  const extension = vscode.extensions.getExtension<unknown>("ms-mssql.mssql");
  if (!extension) {
    apiExtension = undefined;
    apiPromise = undefined;
    return undefined;
  }
  if (extension !== apiExtension) {
    apiExtension = extension;
    apiPromise = undefined;
  }
  if (apiPromise) return apiPromise;
  const pending = acquireApi(extension);
  apiPromise = pending;
  try {
    const api = await pending;
    if (!api && apiPromise === pending) apiPromise = undefined;
    return api;
  } catch (error) {
    if (apiPromise === pending) apiPromise = undefined;
    throw error;
  }
}

async function acquireApi(
  extension: vscode.Extension<unknown>,
): Promise<MssqlExtensionApi | undefined> {
  const exported: unknown = extension.isActive
    ? extension.exports
    : await extension.activate();
  if (typeof exported !== "object" || exported === null) return undefined;
  const sharing = (exported as Record<string, unknown>)["connectionSharing"];
  return isConnectionSharing(sharing)
    ? { connectionSharing: sharing }
    : undefined;
}

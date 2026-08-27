import type {
  ActiveConnectionContext,
  ConnectionContextResolver,
  MetadataBackend,
  MetadataQueryResult,
} from "../backend/MetadataBackend.js";
import type { ConnectionSharingApi, MssqlExtensionApi } from "./MssqlApi.js";
import { validateSimpleExecuteResult } from "./SimpleExecuteResult.js";

const acquireMssqlApi = async (): Promise<MssqlExtensionApi | undefined> =>
  (await import("./MssqlApi.js")).getMssqlApi();

export class MssqlConnectionSharingAdapter
  implements ConnectionContextResolver, MetadataBackend
{
  private sharingApi: ConnectionSharingApi | undefined;
  private sharingRequest: Promise<ConnectionSharingApi | undefined> | undefined;
  private activeRequest:
    Promise<ActiveConnectionContext | undefined> | undefined;

  constructor(
    private readonly extensionId: string,
    private readonly getApi: () => Promise<
      MssqlExtensionApi | undefined
    > = acquireMssqlApi,
  ) {}

  async active(): Promise<ActiveConnectionContext | undefined> {
    if (this.activeRequest) return this.activeRequest;
    const pending = this.resolveActive();
    this.activeRequest = pending;
    try {
      return await pending;
    } finally {
      if (this.activeRequest === pending) this.activeRequest = undefined;
    }
  }

  async executeMetadataQueries(
    connection: ActiveConnectionContext,
    sqlStatements: readonly string[],
  ): Promise<readonly MetadataQueryResult[]> {
    if (sqlStatements.length === 0) return [];
    const sharing = await this.sharing();
    if (!sharing)
      throw new Error("Microsoft mssql connection sharing is unavailable.");
    const uri = await sharing.connect(
      this.extensionId,
      connection.connectionIdentity,
      connection.database,
    );
    if (!uri) throw new Error("mssql did not provide a shared connection URI.");
    try {
      if (!sharing.isConnected(uri))
        throw new Error("The shared mssql connection is not connected.");
      const results: MetadataQueryResult[] = [];
      for (const sql of sqlStatements)
        results.push(
          validateSimpleExecuteResult(
            await sharing.executeSimpleQuery(uri, sql),
          ),
        );
      return results;
    } finally {
      sharing.disconnect(uri);
    }
  }

  async available(): Promise<boolean> {
    return (await this.sharing()) !== undefined;
  }

  async listDatabases(
    connection: ActiveConnectionContext,
  ): Promise<readonly string[]> {
    const sharing = await this.sharing();
    if (!sharing)
      throw new Error("Microsoft mssql connection sharing is unavailable.");
    const uri = await sharing.connect(
      this.extensionId,
      connection.connectionIdentity,
      connection.database,
    );
    if (!uri) throw new Error("mssql did not provide a shared connection URI.");
    try {
      if (!sharing.isConnected(uri))
        throw new Error("The shared mssql connection is not connected.");
      const databases = await sharing.listDatabases(uri);
      if (
        !Array.isArray(databases) ||
        databases.some((database) => typeof database !== "string")
      )
        throw new Error(
          "mssql listDatabases returned an unsupported result shape.",
        );
      return databases;
    } finally {
      sharing.disconnect(uri);
    }
  }

  private async resolveActive(): Promise<ActiveConnectionContext | undefined> {
    const sharing = await this.sharing();
    if (!sharing) return undefined;
    const connectionId = await sharing.getActiveEditorConnectionId(
      this.extensionId,
    );
    if (!connectionId) return undefined;
    const database =
      (await sharing.getActiveDatabase(this.extensionId)) ??
      (await sharing.getDatabaseForConnectionId(
        this.extensionId,
        connectionId,
      ));
    return database
      ? {
          connectionIdentity: connectionId,
          database,
        }
      : undefined;
  }

  private async sharing(): Promise<ConnectionSharingApi | undefined> {
    if (this.sharingApi) return this.sharingApi;
    if (this.sharingRequest) return this.sharingRequest;
    const pending = this.getApi().then((api) => api?.connectionSharing);
    this.sharingRequest = pending;
    try {
      const sharing = await pending;
      if (sharing) this.sharingApi = sharing;
      return sharing;
    } finally {
      if (this.sharingRequest === pending) this.sharingRequest = undefined;
    }
  }
}

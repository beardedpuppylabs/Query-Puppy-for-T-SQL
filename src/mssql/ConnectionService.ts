import type { ConnectionSharingApi, MssqlExtensionApi } from "./MssqlApi.js";
import type { SimpleExecuteResult } from "./SimpleExecuteResult.js";
import { validateSimpleExecuteResult } from "./SimpleExecuteResult.js";

export interface ActiveConnection {
  readonly connectionId: string;
  readonly database: string;
}

export class ConnectionService {
  constructor(
    private readonly extensionId: string,
    private readonly getApi: () => Promise<MssqlExtensionApi | undefined>,
  ) {}
  async active(): Promise<ActiveConnection | undefined> {
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
    return database ? { connectionId, database } : undefined;
  }
  async query(
    connection: ActiveConnection,
    sql: string,
  ): Promise<SimpleExecuteResult> {
    const sharing = await this.sharing();
    if (!sharing)
      throw new Error("Microsoft mssql connection sharing is unavailable.");
    const uri = await sharing.connect(
      this.extensionId,
      connection.connectionId,
      connection.database,
    );
    if (!uri) throw new Error("mssql did not provide a shared connection URI.");
    try {
      if (!sharing.isConnected(uri))
        throw new Error("The shared mssql connection is not connected.");
      return validateSimpleExecuteResult(
        await sharing.executeSimpleQuery(uri, sql),
      );
    } finally {
      sharing.disconnect(uri);
    }
  }
  async available(): Promise<boolean> {
    return (await this.sharing()) !== undefined;
  }
  async listDatabases(connection: ActiveConnection): Promise<string[]> {
    const sharing = await this.sharing();
    if (!sharing)
      throw new Error("Microsoft mssql connection sharing is unavailable.");
    const uri = await sharing.connect(
      this.extensionId,
      connection.connectionId,
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
  private async sharing(): Promise<ConnectionSharingApi | undefined> {
    return (await this.getApi())?.connectionSharing;
  }
}

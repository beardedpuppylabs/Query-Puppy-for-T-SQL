import assert from "node:assert/strict";
import test from "node:test";
import { ConnectionService } from "../src/mssql/ConnectionService.js";
import type { ConnectionSharingApi } from "../src/mssql/MssqlApi.js";
test("connection abstraction reuses mssql identity/database and disconnects shared URI", async () => {
  const calls: string[] = [];
  const api: ConnectionSharingApi = {
    getActiveEditorConnectionId: async (id) => {
      calls.push(`active:${id}`);
      return "connection-1";
    },
    getActiveDatabase: async () => "ERP",
    getDatabaseForConnectionId: async () => undefined,
    connect: async (id, connection, database) => {
      calls.push(`connect:${id}:${connection}:${database}`);
      return "uri";
    },
    disconnect: (uri) => {
      calls.push(`disconnect:${uri}`);
    },
    isConnected: () => true,
    executeSimpleQuery: async (uri, sql) => {
      calls.push(`query:${uri}:${sql}`);
      return { rowCount: 0, rows: [] };
    },
  };
  const service = new ConnectionService("publisher.extension", async () => ({
    connectionSharing: api,
  }));
  const active = await service.active();
  assert.deepEqual(active, { connectionId: "connection-1", database: "ERP" });
  await service.query(active!, "SELECT 1");
  assert.deepEqual(calls, [
    "active:publisher.extension",
    "connect:publisher.extension:connection-1:ERP",
    "query:uri:SELECT 1",
    "disconnect:uri",
  ]);
});

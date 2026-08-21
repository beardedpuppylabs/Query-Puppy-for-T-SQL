import assert from "node:assert/strict";
import test from "node:test";
import { ConnectionService } from "../src/mssql/ConnectionService.js";
import type {
  ConnectionSharingApi,
  MssqlExtensionApi,
} from "../src/mssql/MssqlApi.js";

function sharingApi(
  overrides: Partial<ConnectionSharingApi> = {},
): ConnectionSharingApi {
  return {
    getActiveEditorConnectionId: async () => "connection-1",
    getActiveDatabase: async () => "ERP",
    getDatabaseForConnectionId: async () => undefined,
    connect: async () => "uri",
    disconnect: () => undefined,
    isConnected: () => true,
    executeSimpleQuery: async () => ({ rowCount: 0, rows: [] }),
    listDatabases: async () => ["ERP"],
    ...overrides,
  };
}

test("connection abstraction reuses one transient shared URI for related queries", async () => {
  const calls: string[] = [];
  const api = sharingApi({
    getActiveEditorConnectionId: async (id) => {
      calls.push(`active:${id}`);
      return "connection-1";
    },
    connect: async (id, connection, database) => {
      calls.push(`connect:${id}:${connection}:${database}`);
      return "uri";
    },
    disconnect: (uri) => {
      calls.push(`disconnect:${uri}`);
    },
    executeSimpleQuery: async (uri, sql) => {
      calls.push(`query:${uri}:${sql}`);
      return { rowCount: 0, rows: [] };
    },
  });
  const service = new ConnectionService("publisher.extension", async () => ({
    connectionSharing: api,
  }));
  const active = await service.active();
  assert.deepEqual(active, { connectionId: "connection-1", database: "ERP" });
  await service.queryMany(active!, ["SELECT 1", "SELECT 2"]);
  assert.deepEqual(calls, [
    "active:publisher.extension",
    "connect:publisher.extension:connection-1:ERP",
    "query:uri:SELECT 1",
    "query:uri:SELECT 2",
    "disconnect:uri",
  ]);
});

test("concurrent active-context callers share one in-flight lookup", async () => {
  let release: (() => void) | undefined;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  let activeIdCalls = 0;
  let activeDatabaseCalls = 0;
  const api = sharingApi({
    getActiveEditorConnectionId: async () => {
      activeIdCalls++;
      await blocked;
      return "connection-1";
    },
    getActiveDatabase: async () => {
      activeDatabaseCalls++;
      return "ERP";
    },
  });
  const service = new ConnectionService("publisher.extension", async () => ({
    connectionSharing: api,
  }));
  const requests = Array.from({ length: 25 }, () => service.active());
  release!();
  assert.deepEqual(
    await Promise.all(requests),
    Array.from({ length: 25 }, () => ({
      connectionId: "connection-1",
      database: "ERP",
    })),
  );
  assert.equal(activeIdCalls, 1);
  assert.equal(activeDatabaseCalls, 1);
});

test("successful mssql API acquisition is reused while active context stays dynamic", async () => {
  let apiRequests = 0;
  let connectionId = "connection-1";
  let database = "ERP";
  const api = sharingApi({
    getActiveEditorConnectionId: async () => connectionId,
    getActiveDatabase: async () => database,
  });
  const service = new ConnectionService("publisher.extension", async () => {
    apiRequests++;
    return { connectionSharing: api };
  });

  assert.deepEqual(await service.active(), {
    connectionId: "connection-1",
    database: "ERP",
  });
  connectionId = "connection-2";
  database = "Reporting";
  assert.deepEqual(await service.active(), {
    connectionId: "connection-2",
    database: "Reporting",
  });
  assert.equal(apiRequests, 1);
});

test("failed mssql API acquisition does not wedge a later retry", async () => {
  let attempts = 0;
  const api: MssqlExtensionApi = { connectionSharing: sharingApi() };
  const service = new ConnectionService("publisher.extension", async () => {
    attempts++;
    if (attempts === 1) throw new Error("activation failed");
    return api;
  });

  await assert.rejects(service.active(), /activation failed/);
  assert.deepEqual(await service.active(), {
    connectionId: "connection-1",
    database: "ERP",
  });
  assert.equal(attempts, 2);
});

test("temporarily unavailable mssql API does not become a cached failure", async () => {
  let attempts = 0;
  const api: MssqlExtensionApi = { connectionSharing: sharingApi() };
  const service = new ConnectionService("publisher.extension", async () => {
    attempts++;
    return attempts === 1 ? undefined : api;
  });

  assert.equal(await service.active(), undefined);
  assert.deepEqual(await service.active(), {
    connectionId: "connection-1",
    database: "ERP",
  });
  assert.equal(attempts, 2);
});

test("failed active-context lookup remains retryable", async () => {
  let attempts = 0;
  const api = sharingApi({
    getActiveEditorConnectionId: async () => {
      attempts++;
      if (attempts === 1) throw new Error("permission unavailable");
      return "connection-1";
    },
  });
  const service = new ConnectionService("publisher.extension", async () => ({
    connectionSharing: api,
  }));

  await assert.rejects(service.active(), /permission unavailable/);
  assert.deepEqual(await service.active(), {
    connectionId: "connection-1",
    database: "ERP",
  });
  assert.equal(attempts, 2);
});

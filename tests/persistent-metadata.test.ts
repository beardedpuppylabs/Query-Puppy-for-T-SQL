import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CompletionScopeResolver } from "../src/completion/CompletionScopeResolver.js";
import { DatabaseIndex } from "../src/metadata/DatabaseIndex.js";
import {
  DEFAULT_SCHEMA_REFRESH_INTERVAL_MS,
  MetadataCache,
  type MetadataLifecycleEvent,
} from "../src/metadata/MetadataCache.js";
import type { DatabaseMetadata } from "../src/metadata/MetadataModels.js";
import { isWritableColumn } from "../src/metadata/MetadataModels.js";
import {
  FileMetadataSnapshotStore,
  METADATA_CACHE_FORMAT_VERSION,
  type MetadataSnapshotStore,
  type PersistedDatabaseSnapshot,
} from "../src/metadata/PersistentMetadataStore.js";
import type { MetadataBackend } from "../src/backend/MetadataBackend.js";
import type { MetadataLoader } from "../src/metadata/MetadataLoader.js";
import { resolveSqlContext } from "../src/parser/SqlContextResolver.js";

const metadata = (database: string, version = 1): DatabaseMetadata => ({
  database,
  schemas: ["dbo", "sales"],
  loadedAt: version,
  objects: [
    {
      id: 1,
      schema: "dbo",
      name: `CustomersV${String(version)}`,
      normalizedName: `customersv${String(version)}`,
      kind: "table",
      columns: [
        {
          name: "CustomerId",
          normalizedName: "customerid",
          type: { name: "bigint" },
          nullable: false,
          ordinal: 1,
          identity: true,
        },
        {
          name: "DisplayName",
          normalizedName: "displayname",
          type: { name: "nvarchar", maxLength: 400 },
          nullable: true,
          ordinal: 2,
        },
        {
          name: "ComputedCode",
          normalizedName: "computedcode",
          type: { name: "decimal", precision: 18, scale: 4 },
          nullable: true,
          ordinal: 3,
          computed: true,
        },
      ],
      parameters: [],
    },
    {
      id: 2,
      schema: "sales",
      name: "Orders",
      normalizedName: "orders",
      kind: "table",
      columns: [
        {
          name: "CustomerId",
          normalizedName: "customerid",
          type: { name: "bigint" },
          nullable: false,
          ordinal: 1,
        },
        {
          name: "OrderId",
          normalizedName: "orderid",
          type: { name: "bigint" },
          nullable: false,
          ordinal: 2,
        },
        {
          name: "IncludedOnly",
          normalizedName: "includedonly",
          type: { name: "nvarchar", maxLength: 100 },
          nullable: true,
          ordinal: 3,
        },
      ],
      parameters: [],
    },
    {
      id: 3,
      schema: "dbo",
      name: "FormatCustomer",
      normalizedName: "formatcustomer",
      kind: "scalarFunction",
      columns: [],
      parameters: [
        {
          name: "@CustomerId",
          type: { name: "bigint" },
          output: false,
          ordinal: 1,
        },
      ],
      returnType: { name: "nvarchar", maxLength: 200 },
    },
    {
      id: 4,
      schema: "dbo",
      name: "GetCustomers",
      normalizedName: "getcustomers",
      kind: "tableValuedFunction",
      columns: [
        {
          name: "CustomerId",
          normalizedName: "customerid",
          type: { name: "bigint" },
          nullable: false,
          ordinal: 1,
        },
      ],
      parameters: [
        {
          name: "@Prefix",
          type: { name: "varchar", maxLength: 50 },
          output: false,
          ordinal: 1,
        },
      ],
    },
    {
      id: 5,
      schema: "sales",
      name: `CustomersV${String(version)}`,
      normalizedName: `customersv${String(version)}`,
      kind: "view",
      columns: [],
      parameters: [],
    },
    {
      id: 6,
      schema: "dbo",
      name: "Customer",
      normalizedName: "customer",
      kind: "table",
      columns: [],
      parameters: [],
    },
    {
      id: 7,
      schema: "dbo",
      name: "CustomerArchive",
      normalizedName: "customerarchive",
      kind: "table",
      columns: [],
      parameters: [],
    },
  ],
  keys: [
    {
      database,
      objectId: 1,
      schema: "dbo",
      objectName: `CustomersV${String(version)}`,
      name: "PK_Customers",
      kind: "primaryKey",
      columns: [
        { columnId: 1, columnName: "CustomerId", ordinal: 1 },
        { columnId: 2, columnName: "DisplayName", ordinal: 2 },
      ],
      filtered: false,
    },
    {
      database,
      objectId: 2,
      schema: "sales",
      objectName: "Orders",
      name: "UX_Orders_Customer_Order",
      kind: "uniqueIndex",
      columns: [
        { columnId: 1, columnName: "CustomerId", ordinal: 1 },
        { columnId: 2, columnName: "OrderId", ordinal: 2 },
      ],
      filtered: true,
      filterDefinition: "[CustomerId] IS NOT NULL",
    },
  ],
  foreignKeys: [
    {
      database,
      id: 10,
      name: "FK_Orders_Customers",
      parentObjectId: 2,
      parentSchema: "sales",
      parentObjectName: "Orders",
      referencedObjectId: 1,
      referencedSchema: "dbo",
      referencedObjectName: `CustomersV${String(version)}`,
      columns: [
        {
          parentColumnId: 1,
          parentColumnName: "CustomerId",
          referencedColumnId: 1,
          referencedColumnName: "CustomerId",
          ordinal: 1,
        },
        {
          parentColumnId: 2,
          parentColumnName: "OrderId",
          referencedColumnId: 1,
          referencedColumnName: "CustomerId",
          ordinal: 2,
        },
      ],
      deleteAction: "CASCADE",
      updateAction: "NO_ACTION",
      disabled: false,
      notTrusted: false,
    },
  ],
});

const index = (database: string, version = 1): DatabaseIndex =>
  new DatabaseIndex(metadata(database, version));

class MemoryStore implements MetadataSnapshotStore {
  readonly snapshots = new Map<string, PersistedDatabaseSnapshot>();
  readonly loads: string[] = [];
  readonly saves: string[] = [];
  readonly deletes: string[] = [];

  async load(
    connectionId: string,
    database: string,
  ): Promise<PersistedDatabaseSnapshot | undefined> {
    const key = this.key(connectionId, database);
    this.loads.push(key);
    return this.snapshots.get(key);
  }

  async save(
    connectionId: string,
    database: string,
    value: DatabaseIndex,
    lastSuccessfulRefreshAt: number,
  ): Promise<void> {
    const key = this.key(connectionId, database);
    this.saves.push(key);
    this.snapshots.set(key, snapshot(value, lastSuccessfulRefreshAt));
  }

  async delete(connectionId: string, database: string): Promise<void> {
    const key = this.key(connectionId, database);
    this.deletes.push(key);
    this.snapshots.delete(key);
  }

  seed(
    connectionId: string,
    database: string,
    value: DatabaseIndex,
    lastSuccessfulRefreshAt: number,
  ): void {
    this.snapshots.set(
      this.key(connectionId, database),
      snapshot(value, lastSuccessfulRefreshAt),
    );
  }

  key(connectionId: string, database: string): string {
    return `${connectionId}\u0000${database.toLowerCase()}`;
  }
}

const snapshot = (
  value: DatabaseIndex,
  lastSuccessfulRefreshAt: number,
): PersistedDatabaseSnapshot => ({
  index: value,
  createdAt: lastSuccessfulRefreshAt,
  lastSuccessfulRefreshAt,
  objectCount: value.count,
  columnCount: value.objects.reduce(
    (count, object) => count + object.columns.length,
    0,
  ),
  relationshipCount: value.metadata.foreignKeys?.length ?? 0,
});

const deferred = <T>() => {
  let resolve: ((value: T) => void) | undefined;
  let reject: ((error: unknown) => void) | undefined;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve: resolve!, reject: reject! };
};

test("contract: persistent round trip rebuilds canonical catalog and relationship indexes", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "query-puppy-cache-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new FileMetadataSnapshotStore(directory);
  const original = index("IntelliSenseLab");
  await store.save("server-a", "IntelliSenseLab", original, 1234);
  const loaded = await store.load("server-a", "intellisenselab");
  assert.ok(loaded);
  assert.deepEqual(loaded.index.metadata, original.metadata);
  const customers = loaded.index.findObject("dbo", "CustomersV1");
  const orders = loaded.index.findObject("sales", "Orders");
  assert.ok(customers);
  assert.ok(orders);
  assert.notEqual(loaded.index.findObject("sales", "CustomersV1"), customers);
  assert.ok(loaded.index.findObject("dbo", "Customer"));
  assert.ok(loaded.index.findObject("dbo", "CustomerArchive"));
  assert.equal(loaded.index.keysForObject(customers)[0]?.columns.length, 2);
  assert.deepEqual(
    loaded.index.keysForObject(orders).map((key) => key.kind),
    ["uniqueIndex"],
  );
  assert.deepEqual(loaded.index.keysForColumn(orders, "IncludedOnly"), []);
  assert.equal(
    loaded.index.relationshipsBetween(customers, orders)[0]?.columns.length,
    2,
  );
  assert.equal(isWritableColumn(customers.columns[0]!), false);
  assert.equal(isWritableColumn(customers.columns[1]!), true);
  assert.equal(
    loaded.index.findObject("dbo", "FormatCustomer")?.returnType?.maxLength,
    200,
  );
});

test("contract: cold load coalesces consumers reports progress and persists once", async () => {
  const store = new MemoryStore();
  const events: MetadataLifecycleEvent[] = [];
  const cache = new MetadataCache({
    store,
    onEvent: (event) => events.push(event),
  });
  const loading = deferred<DatabaseIndex>();
  let loaderCalls = 0;
  const loader = () => {
    loaderCalls++;
    return loading.promise;
  };
  const requests = Array.from({ length: 20 }, () =>
    cache.ensureLoaded("server", "DatabaseA", loader),
  );
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(loaderCalls, 1);
  assert.equal(cache.status("server", "DatabaseA"), "loading");
  loading.resolve(index("DatabaseA"));
  const values = await Promise.all(requests);
  assert.ok(values.every((value) => value === values[0]));
  assert.equal(store.loads.length, 1);
  assert.equal(store.saves.length, 1);
  assert.deepEqual(
    events
      .filter((event) => event.kind.startsWith("coldLoad"))
      .map((event) => event.kind),
    ["coldLoadStarted", "coldLoadCompleted"],
  );
});

test("contract: warm hydration returns stale data while refresh atomically swaps", async () => {
  const store = new MemoryStore();
  const first = index("DatabaseA", 1);
  const second = index("DatabaseA", 2);
  store.seed("server", "DatabaseA", first, 100);
  const refreshing = deferred<DatabaseIndex>();
  let refreshes = 0;
  const loader = () => {
    refreshes++;
    return refreshing.promise;
  };
  const cache = new MetadataCache({ store, now: () => 200 });
  const warm = await cache.ensureLoaded("server", "DatabaseA", loader);
  assert.equal(warm, first);
  assert.equal(refreshes, 1);
  assert.equal(cache.get("server", "DatabaseA"), first);
  const repeated = await Promise.all(
    Array.from({ length: 20 }, () =>
      cache.ensureLoaded("server", "DatabaseA", loader),
    ),
  );
  assert.ok(repeated.every((value) => value === first));
  assert.equal(refreshes, 1);
  const joined = cache.refresh("server", "DatabaseA", loader);
  refreshing.resolve(second);
  assert.equal(await joined, second);
  assert.equal(cache.get("server", "DatabaseA"), second);
  assert.equal(store.saves.length, 1);
});

test("contract: refresh replacement remains atomic until persistence completes", async () => {
  const saving = deferred<undefined>();
  class BlockingStore extends MemoryStore {
    override async save(
      connectionId: string,
      database: string,
      value: DatabaseIndex,
      lastSuccessfulRefreshAt: number,
    ): Promise<void> {
      await saving.promise;
      await super.save(connectionId, database, value, lastSuccessfulRefreshAt);
    }
  }
  const store = new BlockingStore();
  const first = index("DatabaseA", 1);
  const second = index("DatabaseA", 2);
  store.seed("server", "DatabaseA", first, 1);
  const cache = new MetadataCache({ store });
  await cache.ensureLoaded("server", "DatabaseA", async () => second);
  const refreshing = cache.refresh("server", "DatabaseA", async () => second);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(cache.get("server", "DatabaseA"), first);
  saving.resolve(undefined);
  assert.equal(await refreshing, second);
  assert.equal(cache.get("server", "DatabaseA"), second);
});

test("contract: refresh failure retains stale snapshots with bounded retry", async () => {
  let now = 1_000;
  const store = new MemoryStore();
  const first = index("DatabaseA", 1);
  store.seed("server", "DatabaseA", first, 500);
  const failing = deferred<DatabaseIndex>();
  const cache = new MetadataCache({ store, now: () => now });
  assert.equal(
    await cache.ensureLoaded("server", "DatabaseA", () => failing.promise),
    first,
  );
  const failedRefresh = cache.refresh(
    "server",
    "DatabaseA",
    () => failing.promise,
  );
  failing.reject(new Error("offline"));
  await assert.rejects(failedRefresh, /offline/);
  assert.equal(cache.get("server", "DatabaseA"), first);
  assert.equal(
    store.snapshots.get(store.key("server", "DatabaseA"))?.index,
    first,
  );
  assert.equal(store.saves.length, 0);
  let retries = 0;
  await cache.ensureLoaded("server", "DatabaseA", async () => {
    retries++;
    return index("DatabaseA", 2);
  });
  assert.equal(retries, 0, "the next keystroke must not retry immediately");
  now += DEFAULT_SCHEMA_REFRESH_INTERVAL_MS;
  const retrying = deferred<DatabaseIndex>();
  await cache.ensureLoaded("server", "DatabaseA", () => {
    retries++;
    return retrying.promise;
  });
  assert.equal(retries, 1);
  const joined = cache.refresh("server", "DatabaseA", () => retrying.promise);
  retrying.resolve(index("DatabaseA", 2));
  await joined;
  assert.equal(cache.get("server", "DatabaseA")?.metadata.loadedAt, 2);
});

test("contract: cold-load failure persists nothing and remains retryable", async () => {
  const store = new MemoryStore();
  const cache = new MetadataCache({ store });
  await assert.rejects(
    cache.ensureLoaded("server", "DatabaseA", async () => {
      throw new Error("catalog timeout");
    }),
    /catalog timeout/,
  );
  assert.equal(store.saves.length, 0);
  assert.equal(cache.get("server", "DatabaseA"), undefined);
  const recovered = await cache.ensureLoaded("server", "DatabaseA", async () =>
    index("DatabaseA", 2),
  );
  assert.equal(recovered.metadata.loadedAt, 2);
  assert.equal(store.loads.length, 1, "disk is checked once per session");
  assert.equal(store.saves.length, 1);
});

test("contract: storage failure does not discard a successful SQL catalog load", async () => {
  class FailingStore extends MemoryStore {
    override async save(): Promise<void> {
      throw new Error("disk unavailable");
    }
  }
  const events: MetadataLifecycleEvent[] = [];
  const cache = new MetadataCache({
    store: new FailingStore(),
    onEvent: (event) => events.push(event),
  });
  const loaded = await cache.ensureLoaded("server", "DatabaseA", async () =>
    index("DatabaseA", 1),
  );
  assert.equal(loaded.metadata.loadedAt, 1);
  assert.equal(cache.get("server", "DatabaseA"), loaded);
  assert.deepEqual(
    events
      .filter((event) =>
        ["snapshotPersistFailed", "coldLoadCompleted"].includes(event.kind),
      )
      .map((event) => event.kind),
    ["snapshotPersistFailed", "coldLoadCompleted"],
  );
});

test("contract: cache freshness is demand-driven at the fifteen-minute threshold", async () => {
  let now = 10_000;
  const store = new MemoryStore();
  store.seed("server", "DatabaseA", index("DatabaseA", 1), now - 1);
  const firstRefresh = deferred<DatabaseIndex>();
  let refreshes = 0;
  const cache = new MetadataCache({ store, now: () => now });
  await cache.ensureLoaded("server", "DatabaseA", () => {
    refreshes++;
    return firstRefresh.promise;
  });
  const firstJoined = cache.refresh(
    "server",
    "DatabaseA",
    () => firstRefresh.promise,
  );
  firstRefresh.resolve(index("DatabaseA", 2));
  await firstJoined;
  assert.equal(refreshes, 1, "new sessions refresh even a fresh disk snapshot");

  now += DEFAULT_SCHEMA_REFRESH_INTERVAL_MS - 1;
  await cache.ensureLoaded("server", "DatabaseA", async () => {
    refreshes++;
    return index("DatabaseA", 3);
  });
  assert.equal(refreshes, 1);

  now++;
  const intervalRefresh = deferred<DatabaseIndex>();
  await cache.ensureLoaded("server", "DatabaseA", () => {
    refreshes++;
    return intervalRefresh.promise;
  });
  assert.equal(refreshes, 2);
  const intervalJoined = cache.refresh(
    "server",
    "DatabaseA",
    () => intervalRefresh.promise,
  );
  intervalRefresh.resolve(index("DatabaseA", 3));
  await intervalJoined;
});

test("contract: manual refresh bypasses freshness and coalesces concurrent refreshes", async () => {
  const cache = new MetadataCache();
  const first = index("DatabaseA", 1);
  await cache.ensureLoaded("server", "DatabaseA", async () => first);
  const refreshing = deferred<DatabaseIndex>();
  let refreshes = 0;
  const loader = () => {
    refreshes++;
    return refreshing.promise;
  };
  const manual = cache.refresh("server", "DatabaseA", loader);
  const concurrent = cache.refresh("server", "DatabaseA", loader);
  assert.equal(await cache.ensureLoaded("server", "DatabaseA", loader), first);
  assert.equal(refreshes, 1);
  refreshing.resolve(index("DatabaseA", 2));
  assert.equal(await manual, await concurrent);
  assert.equal(cache.get("server", "DatabaseA")?.metadata.loadedAt, 2);
});

test("contract: snapshot identities isolate databases and serialized data is allow-listed", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "query-puppy-cache-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = new FileMetadataSnapshotStore(directory);
  const unsafe = {
    ...metadata("DatabaseX", 1),
    password: "must-not-persist",
    accessToken: "must-not-persist",
    objects: metadata("DatabaseX", 1).objects.map((object, objectIndex) =>
      objectIndex === 0
        ? {
            ...object,
            connectionString: "must-not-persist",
            columns: object.columns.map((column, columnIndex) =>
              columnIndex === 0
                ? { ...column, refreshToken: "must-not-persist" }
                : column,
            ),
          }
        : object,
    ),
  } as DatabaseMetadata;
  await Promise.all([
    store.save("ServerA", "DatabaseX", new DatabaseIndex(unsafe), 1),
    store.save("ServerA", "DatabaseY", index("DatabaseY", 2), 2),
    store.save("ServerB", "DatabaseX", index("DatabaseX", 3), 3),
  ]);
  assert.equal((await readdir(directory)).length, 3);
  assert.equal(
    (await store.load("ServerA", "DatabaseX"))?.index.metadata.loadedAt,
    1,
  );
  assert.equal(
    (await store.load("ServerA", "DatabaseY"))?.index.metadata.loadedAt,
    2,
  );
  assert.equal(
    (await store.load("ServerB", "DatabaseX"))?.index.metadata.loadedAt,
    3,
  );
  const serialized = await Promise.all(
    (await readdir(directory)).map((file) =>
      readFile(join(directory, file), "utf8"),
    ),
  );
  assert.ok(
    serialized.every((text) => !/password|token|connectionstring/i.test(text)),
  );
  assert.ok(
    serialized.every(
      (text) =>
        (JSON.parse(text) as { cacheFormatVersion?: unknown })
          .cacheFormatVersion === METADATA_CACHE_FORMAT_VERSION,
    ),
  );
});

test("contract: corrupt or incompatible snapshots fall back to a cold load", async (t) => {
  for (const corruption of ["invalid-json", "wrong-version"] as const) {
    const directory = await mkdtemp(join(tmpdir(), "query-puppy-cache-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const diagnostics: string[] = [];
    const store = new FileMetadataSnapshotStore(directory, (message) =>
      diagnostics.push(message),
    );
    await store.save("server", "DatabaseA", index("DatabaseA", 1), 1);
    const file = join(directory, (await readdir(directory))[0]!);
    if (corruption === "invalid-json") await writeFile(file, "{", "utf8");
    else {
      const parsed = JSON.parse(await readFile(file, "utf8")) as Record<
        string,
        unknown
      >;
      parsed["cacheFormatVersion"] = METADATA_CACHE_FORMAT_VERSION + 1;
      await writeFile(file, JSON.stringify(parsed), "utf8");
    }
    let coldLoads = 0;
    const cache = new MetadataCache({ store });
    const loaded = await cache.ensureLoaded("server", "DatabaseA", async () => {
      coldLoads++;
      return index("DatabaseA", 2);
    });
    assert.equal(loaded.metadata.loadedAt, 2);
    assert.equal(coldLoads, 1);
    assert.equal(diagnostics.length, 1);
    assert.equal(
      (await store.load("server", "DatabaseA"))?.index.metadata.loadedAt,
      2,
    );
  }
});

test("contract: memory is the hot path and secondary databases hydrate on demand", async () => {
  const store = new MemoryStore();
  store.seed("server", "DatabaseA", index("DatabaseA", 1), 1);
  store.seed("server", "DatabaseB", index("DatabaseB", 1), 1);
  store.seed("server", "DatabaseC", index("DatabaseC", 1), 1);
  let sqlLoads = 0;
  const loader = {
    load: async ({ database }: { database: string }) => {
      sqlLoads++;
      return index(database, 2);
    },
  } as unknown as MetadataLoader;
  const connections = {
    listDatabases: async () => ["DatabaseA", "DatabaseB", "DatabaseC"],
  } as unknown as MetadataBackend;
  const cache = new MetadataCache({ store });
  const resolver = new CompletionScopeResolver(
    connections,
    loader,
    cache,
    () => undefined,
  );
  const active = {
    backendId: "fake",
    connectionIdentity: "server",
    database: "DatabaseA",
  };
  await resolver.resolve(active, resolveSqlContext("SELECT * FROM customer"));
  assert.deepEqual(store.loads, [store.key("server", "DatabaseA")]);
  await Promise.all(
    Array.from({ length: 50 }, () =>
      cache.ensureLoaded("server", "DatabaseA", () => loader.load(active)),
    ),
  );
  assert.equal(store.loads.length, 1, "disk hydration occurs once per session");
  assert.equal(sqlLoads, 1, "only the first-session refresh used SQL");

  await resolver.resolve(
    active,
    resolveSqlContext("SELECT * FROM DatabaseB.dbo.customer"),
  );
  assert.deepEqual(store.loads, [
    store.key("server", "DatabaseA"),
    store.key("server", "DatabaseB"),
  ]);
  assert.equal(store.loads.includes(store.key("server", "DatabaseC")), false);
});

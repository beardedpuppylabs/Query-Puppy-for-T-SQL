import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import type {
  ActiveConnectionContext,
  ConnectionContextResolver,
  MetadataBackend,
  MetadataCellValue,
  MetadataQueryResult,
} from "../src/backend/MetadataBackend.js";
import { CompletionScopeResolver } from "../src/completion/CompletionScopeResolver.js";
import { MetadataCache } from "../src/metadata/MetadataCache.js";
import { MetadataLoader } from "../src/metadata/MetadataLoader.js";
import { resolveSqlContext } from "../src/parser/SqlContextResolver.js";

const activeContext = (database = "DatabaseA"): ActiveConnectionContext => ({
  backendId: "fake",
  connectionIdentity: "fake-server",
  database,
  serverIdentity: "fake-server-name",
});

const cell = (displayValue?: string): MetadataCellValue => ({
  displayValue: displayValue ?? "",
  isNull: displayValue === undefined,
});

const row = (...values: (string | undefined)[]): MetadataCellValue[] =>
  values.map(cell);

const metadataResult = (database: string): MetadataQueryResult => ({
  rowCount: 4,
  rows: [
    row("D", "1", database),
    row("S", undefined, "dbo"),
    row("O", "1", "dbo", "Customers", "table"),
    row(
      "C",
      "1",
      "dbo",
      "Customers",
      undefined,
      "CustomerId",
      "sys",
      "bigint",
      "8",
      "19",
      "0",
      "False",
      undefined,
      "1",
    ),
  ],
});

const emptyRelationshipResult: MetadataQueryResult = { rowCount: 0, rows: [] };

class FakeBackend implements ConnectionContextResolver, MetadataBackend {
  readonly id = "fake";
  readonly queriedDatabases: string[] = [];
  databaseListCalls = 0;

  async active(): Promise<ActiveConnectionContext | undefined> {
    return activeContext();
  }

  async available(): Promise<boolean> {
    return true;
  }

  async executeMetadataQueries(
    connection: ActiveConnectionContext,
    sqlStatements: readonly string[],
  ): Promise<readonly MetadataQueryResult[]> {
    this.queriedDatabases.push(connection.database);
    return sqlStatements.map((_, index) =>
      index === 0
        ? metadataResult(connection.database)
        : emptyRelationshipResult,
    );
  }

  async listDatabases(): Promise<readonly string[]> {
    this.databaseListCalls++;
    return ["DatabaseA", "DatabaseB"];
  }
}

test("contract: metadata and scope consumers operate through a fake backend", async () => {
  const backend = new FakeBackend();
  const loader = new MetadataLoader(backend);
  const cache = new MetadataCache();
  const resolver = new CompletionScopeResolver(
    backend,
    loader,
    cache,
    () => undefined,
  );
  const active = await backend.active();
  assert.deepEqual(active, activeContext());

  const scope = await resolver.resolve(
    active!,
    resolveSqlContext("SELECT * FROM DatabaseB.dbo.Customers"),
  );

  assert.deepEqual(backend.queriedDatabases, ["DatabaseA", "DatabaseB"]);
  assert.equal(backend.databaseListCalls, 1);
  assert.ok(scope.indexes.has("databasea"));
  assert.ok(scope.indexes.has("databaseb"));
  assert.equal(
    cache.get("fake-server", "DatabaseA")?.metadata.database,
    "DatabaseA",
  );
  assert.equal(
    cache.get("fake-server", "DatabaseB")?.metadata.database,
    "DatabaseB",
  );
});

test("contract: backend metadata failures remain retryable after a cold-load failure", async () => {
  let attempts = 0;
  const backend: MetadataBackend = {
    id: "fake",
    executeMetadataQueries: async (connection) => {
      attempts++;
      if (attempts === 1) throw new Error("temporary backend failure");
      return [metadataResult(connection.database), emptyRelationshipResult];
    },
    listDatabases: async () => ["DatabaseA"],
  };
  const cache = new MetadataCache();
  const loader = new MetadataLoader(backend);

  await assert.rejects(
    cache.ensureLoaded("fake-server", "DatabaseA", () =>
      loader.load(activeContext()),
    ),
    /temporary backend failure/,
  );
  const index = await cache.ensureLoaded("fake-server", "DatabaseA", () =>
    loader.load(activeContext()),
  );
  assert.equal(index.metadata.database, "DatabaseA");
  assert.equal(attempts, 2);
});

test("contract: concurrent neutral metadata loads coalesce per database identity", async () => {
  let release: (() => void) | undefined;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  let loads = 0;
  const backend: MetadataBackend = {
    id: "fake",
    executeMetadataQueries: async (connection) => {
      loads++;
      await blocked;
      return [metadataResult(connection.database), emptyRelationshipResult];
    },
    listDatabases: async () => ["DatabaseA"],
  };
  const cache = new MetadataCache();
  const loader = new MetadataLoader(backend);
  const active = activeContext();
  const requests = Array.from({ length: 20 }, () =>
    cache.ensureLoaded(active.connectionIdentity, active.database, () =>
      loader.load(active),
    ),
  );
  release!();

  const loaded = await Promise.all(requests);
  assert.equal(loads, 1);
  assert.equal(new Set(loaded).size, 1);
});

const productionTypeScriptFiles = async (
  directory: string,
): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) return productionTypeScriptFiles(entryPath);
        return entry.isFile() && entry.name.endsWith(".ts") ? [entryPath] : [];
      }),
    )
  ).flat();
};

test("contract: mssql implementation details cannot leak above the adapter boundary", async () => {
  const sourceRoot = path.resolve("src");
  const files = await productionTypeScriptFiles(sourceRoot);
  const mssqlRoot = `${path.join(sourceRoot, "mssql")}${path.sep}`;
  const prohibitedSymbols = [
    "connectionSharing",
    "ConnectionSharingApi",
    "MssqlExtensionApi",
    "getMssqlApi",
    "ConnectionService",
    "SimpleExecuteResult",
    "DbCellValue",
  ];
  const symbolLeaks: string[] = [];
  const importLeaks: string[] = [];
  const terminologyLeaks: string[] = [];

  for (const file of files) {
    const source = await readFile(file, "utf8");
    const relative = path.relative(sourceRoot, file);
    if (!file.startsWith(mssqlRoot))
      for (const symbol of prohibitedSymbols)
        if (source.includes(symbol)) symbolLeaks.push(`${relative}: ${symbol}`);
    if (relative !== "extension.ts" && /from\s+["'][^"']*mssql\//.test(source))
      importLeaks.push(relative);
    if (
      ["backend", "commands", "completion", "metadata", "parser"].includes(
        relative.split(path.sep)[0] ?? "",
      ) &&
      /mssql/i.test(source)
    )
      terminologyLeaks.push(relative);
  }

  assert.deepEqual(symbolLeaks, []);
  assert.deepEqual(importLeaks, []);
  assert.deepEqual(terminologyLeaks, []);
});

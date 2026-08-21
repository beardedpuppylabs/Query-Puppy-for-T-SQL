import assert from "node:assert/strict";
import test from "node:test";
import { CompletionScopeResolver } from "../src/completion/CompletionScopeResolver.js";
import { DatabaseIndex } from "../src/metadata/DatabaseIndex.js";
import { MetadataCache } from "../src/metadata/MetadataCache.js";
import type { ConnectionService } from "../src/mssql/ConnectionService.js";
import type { MetadataLoader } from "../src/mssql/MetadataLoader.js";
import { resolveSqlContext } from "../src/parser/SqlContextResolver.js";

const databaseIndex = (database: string, schemas: string[]): DatabaseIndex =>
  new DatabaseIndex({ database, schemas, objects: [], loadedAt: 0 });

test("contract: secondary metadata is lazy and unqualified scope stays database-local", async () => {
  const loads: string[] = [];
  let lists = 0;
  const connections = {
    listDatabases: async () => {
      lists++;
      return ["DatabaseA", "DatabaseB"];
    },
  } as unknown as ConnectionService;
  const loader = {
    load: async ({ database }: { database: string }) => {
      loads.push(database);
      return databaseIndex(
        database,
        database === "DatabaseA" ? ["dbo"] : ["dbo", "reporting"],
      );
    },
  } as unknown as MetadataLoader;
  const resolver = new CompletionScopeResolver(
    connections,
    loader,
    new MetadataCache(),
    () => undefined,
  );
  const active = { connectionId: "connection", database: "DatabaseA" };

  const ordinary = await resolver.resolve(
    active,
    resolveSqlContext("SELECT * FROM cust"),
  );
  assert.deepEqual(loads, ["DatabaseA"]);
  assert.deepEqual([...ordinary.indexes.keys()], ["databasea"]);
  assert.deepEqual(ordinary.databaseNames, ["DatabaseA", "DatabaseB"]);
  assert.equal(lists, 1);

  const [first, second] = await Promise.all([
    resolver.resolve(
      active,
      resolveSqlContext("SELECT * FROM DatabaseB.reporting.addr"),
    ),
    resolver.resolve(
      active,
      resolveSqlContext("SELECT * FROM DatabaseB.reporting.cust"),
    ),
  ]);
  assert.deepEqual(loads, ["DatabaseA", "DatabaseB"]);
  assert.ok(first.indexes.has("databaseb"));
  assert.ok(second.indexes.has("databaseb"));
  assert.equal(lists, 1);

  const schemas = await resolver.resolve(
    active,
    resolveSqlContext("SELECT * FROM DatabaseB.rep"),
  );
  assert.ok(schemas.indexes.has("databaseb"));
  assert.equal(lists, 1);
});

test("contract: database discovery does not eagerly load secondary metadata", async () => {
  const loads: string[] = [];
  const connections = {
    listDatabases: async () => ["IntelliSenseLab", "IntelliSenseLabReporting"],
  } as unknown as ConnectionService;
  const loader = {
    load: async ({ database }: { database: string }) => {
      loads.push(database);
      return databaseIndex(database, ["dbo"]);
    },
  } as unknown as MetadataLoader;
  const resolver = new CompletionScopeResolver(
    connections,
    loader,
    new MetadataCache(),
    () => undefined,
  );
  const scope = await resolver.resolve(
    { connectionId: "connection", database: "IntelliSenseLab" },
    resolveSqlContext("SELECT * FROM Intelli"),
  );
  assert.deepEqual(scope.databaseNames, [
    "IntelliSenseLab",
    "IntelliSenseLabReporting",
  ]);
  assert.deepEqual(loads, ["IntelliSenseLab"]);
  assert.equal(scope.indexes.has("intellisenselabreporting"), false);
});

test("contract: database-qualified aliases request their originating database", async () => {
  const loads: string[] = [];
  const connections = {
    listDatabases: async () => ["DatabaseA", "DatabaseB"],
  } as unknown as ConnectionService;
  const loader = {
    load: async ({ database }: { database: string }) => {
      loads.push(database);
      return databaseIndex(database, ["dbo", "sales"]);
    },
  } as unknown as MetadataLoader;
  const resolver = new CompletionScopeResolver(
    connections,
    loader,
    new MetadataCache(),
    () => undefined,
  );
  const sql = "SELECT b. FROM DatabaseB.sales.Customers b";
  await resolver.resolve(
    { connectionId: "connection", database: "DatabaseA" },
    resolveSqlContext(sql, "SELECT b.".length),
  );
  assert.deepEqual(loads, ["DatabaseA", "DatabaseB"]);
});

test("CTE projection loads databases explicitly referenced inside its statement", async () => {
  const loads: string[] = [];
  const connections = {
    listDatabases: async () => ["DatabaseA", "DatabaseB"],
  } as unknown as ConnectionService;
  const loader = {
    load: async ({ database }: { database: string }) => {
      loads.push(database);
      return databaseIndex(database, ["dbo", "archive"]);
    },
  } as unknown as MetadataLoader;
  const resolver = new CompletionScopeResolver(
    connections,
    loader,
    new MetadataCache(),
    () => undefined,
  );
  const sql =
    "WITH x AS (SELECT * FROM DatabaseB.archive.CustomerAddressArchive a) SELECT y. FROM x y";
  const scope = await resolver.resolve(
    { connectionId: "connection", database: "DatabaseA" },
    resolveSqlContext(sql, sql.indexOf("y.") + 2),
  );
  assert.deepEqual(loads, ["DatabaseA", "DatabaseB"]);
  assert.ok(scope.indexes.has("databaseb"));
});

test("changing the active database selects its own cached default scope", async () => {
  const connections = {
    listDatabases: async () => [],
  } as unknown as ConnectionService;
  const loader = {
    load: async ({ database }: { database: string }) =>
      databaseIndex(database, ["dbo"]),
  } as unknown as MetadataLoader;
  const resolver = new CompletionScopeResolver(
    connections,
    loader,
    new MetadataCache(),
    () => undefined,
  );
  const context = resolveSqlContext("SELECT * FROM cust");
  const first = await resolver.resolve(
    { connectionId: "same", database: "DatabaseA" },
    context,
  );
  const second = await resolver.resolve(
    { connectionId: "same", database: "DatabaseB" },
    context,
  );
  assert.deepEqual([...first.indexes.keys()], ["databasea"]);
  assert.deepEqual([...second.indexes.keys()], ["databaseb"]);
});

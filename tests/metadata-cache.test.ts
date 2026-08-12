import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseIndex } from "../src/metadata/DatabaseIndex.js";
import { MetadataCache } from "../src/metadata/MetadataCache.js";

const index = (count: number): DatabaseIndex =>
  new DatabaseIndex({
    database: "db",
    schemas: ["dbo"],
    loadedAt: 0,
    objects: Array.from({ length: count }, (_, id) => ({
      id,
      schema: "dbo",
      name: `Object${String(id)}`,
      normalizedName: `object${String(id)}`,
      kind: "table" as const,
      columns: [],
      parameters: [],
    })),
  });

test("cache distinguishes not loaded, loading, loaded, and unexpectedly empty", async () => {
  const cache = new MetadataCache();
  assert.equal(cache.status("connection", "missing"), "notLoaded");
  let finish: ((value: DatabaseIndex) => void) | undefined;
  const pending = cache.ensureLoaded(
    "connection",
    "loaded",
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  assert.equal(cache.status("connection", "loaded"), "loading");
  assert.ok(finish);
  finish(index(1));
  await pending;
  assert.equal(cache.status("connection", "loaded"), "loaded");
  await cache.ensureLoaded("connection", "empty", async () => index(0));
  assert.equal(cache.status("connection", "empty"), "unexpectedEmpty");
});

test("cache retains a useful failed state", async () => {
  const cache = new MetadataCache();
  await assert.rejects(
    cache.ensureLoaded("connection", "failed", async () =>
      Promise.reject(new Error("denied")),
    ),
  );
  assert.equal(cache.status("connection", "failed"), "failed");
  assert.equal(cache.error("connection", "failed"), "denied");
});

test("database identities are independent and targeted invalidation preserves siblings", async () => {
  const cache = new MetadataCache();
  const first = index(1);
  const second = index(2);
  await cache.ensureLoaded("connection", "DatabaseA", async () => first);
  await cache.ensureLoaded("connection", "DatabaseB", async () => second);
  assert.equal(cache.get("connection", "databasea"), first);
  assert.equal(cache.get("connection", "DATABASEB"), second);
  cache.invalidate("connection", "DatabaseB");
  assert.equal(cache.get("connection", "DatabaseA"), first);
  assert.equal(cache.get("connection", "DatabaseB"), undefined);
});

test("concurrent requests for one database coalesce into one load", async () => {
  const cache = new MetadataCache();
  let loads = 0;
  const loader = async (): Promise<DatabaseIndex> => {
    loads++;
    await Promise.resolve();
    return index(1);
  };
  const [first, second] = await Promise.all([
    cache.ensureLoaded("connection", "DatabaseB", loader),
    cache.ensureLoaded("connection", "databaseb", loader),
  ]);
  assert.equal(loads, 1);
  assert.equal(first, second);
});

test("a failed secondary load does not poison active database metadata", async () => {
  const cache = new MetadataCache();
  const active = index(1);
  await cache.ensureLoaded("connection", "DatabaseA", async () => active);
  await assert.rejects(
    cache.ensureLoaded("connection", "DatabaseB", async () =>
      Promise.reject(new Error("offline")),
    ),
  );
  assert.equal(cache.get("connection", "DatabaseA"), active);
  assert.equal(cache.status("connection", "DatabaseB"), "failed");
});

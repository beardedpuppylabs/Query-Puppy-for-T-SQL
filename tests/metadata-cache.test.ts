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
  assert.equal(cache.status("missing"), "notLoaded");
  let finish: ((value: DatabaseIndex) => void) | undefined;
  const pending = cache.load(
    "loaded",
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  assert.equal(cache.status("loaded"), "loading");
  assert.ok(finish);
  finish(index(1));
  await pending;
  assert.equal(cache.status("loaded"), "loaded");
  await cache.load("empty", async () => index(0));
  assert.equal(cache.status("empty"), "unexpectedEmpty");
});

test("cache retains a useful failed state", async () => {
  const cache = new MetadataCache();
  await assert.rejects(
    cache.load("failed", async () => Promise.reject(new Error("denied"))),
  );
  assert.equal(cache.status("failed"), "failed");
  assert.equal(cache.error("failed"), "denied");
});

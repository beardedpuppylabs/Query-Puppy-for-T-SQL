import assert from "node:assert/strict";
import test from "node:test";
import { DocumentSemanticCache } from "../src/parser/DocumentSemanticCache.js";

test("document semantic cache reuses exact versions and invalidates edits and closes", () => {
  const cache = new DocumentSemanticCache();
  const first = cache.get("file:///query.sql", 1, "SELECT 1", 8);
  assert.equal(cache.get("file:///query.sql", 1, "SELECT 1", 8), first);
  const edited = cache.get("file:///query.sql", 2, "SELECT 2", 8);
  assert.notEqual(edited, first);
  cache.delete("file:///query.sql");
  assert.notEqual(cache.get("file:///query.sql", 2, "SELECT 2", 8), edited);
});

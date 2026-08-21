import assert from "node:assert/strict";
import test from "node:test";
import { DocumentSemanticCache } from "../src/parser/DocumentSemanticCache.js";

test("contract: document semantic cache reuses versions and invalidates edits and closes", () => {
  const cache = new DocumentSemanticCache();
  const first = cache.get("file:///query.sql", 1, "SELECT 1", 8);
  assert.equal(cache.get("file:///query.sql", 1, "SELECT 1", 8), first);
  const edited = cache.get("file:///query.sql", 2, "SELECT 2", 8);
  assert.notEqual(edited, first);
  const nestedSql =
    "SELECT * FROM dbo.Customers c WHERE EXISTS (SELECT 1 FROM dbo.Customers o WHERE o.)";
  const nested = cache.get(
    "file:///query.sql",
    3,
    nestedSql,
    nestedSql.length - 1,
  );
  assert.equal(nested.activeQueryScope?.kind, "correlatedExpressionSubquery");
  const flattenedSql = "SELECT * FROM dbo.Customers c WHERE c.";
  const flattened = cache.get(
    "file:///query.sql",
    4,
    flattenedSql,
    flattenedSql.length,
  );
  assert.equal(flattened.activeQueryScope?.kind, "topLevelQuery");
  assert.notEqual(flattened, nested);
  const setSql =
    "SELECT 1 AS Id UNION ALL SELECT 2 AS IgnoredName INTERSECT SELECT 3";
  const setModel = cache.get("file:///query.sql", 5, setSql, setSql.length);
  assert.equal(setModel.setQueryExpressions.length, 1);
  assert.deepEqual(
    setModel.setQueryExpressions[0]?.projection.map((column) => column.name),
    ["Id"],
  );
  assert.notEqual(setModel, flattened);
  cache.delete("file:///query.sql");
  assert.notEqual(cache.get("file:///query.sql", 2, "SELECT 2", 8), edited);
});

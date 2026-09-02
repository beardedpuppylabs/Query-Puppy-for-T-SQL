import assert from "node:assert/strict";
import test from "node:test";
import { resolveDocumentSemanticNavigationTarget } from "../src/navigation/DocumentSemanticNavigation.js";
import { DocumentSemanticCache } from "../src/parser/DocumentSemanticCache.js";
import { semanticOccurrencesForSymbol } from "../src/parser/DocumentSemanticSymbols.js";

test("navigation consumers reuse analysis only when they share one semantic cache", () => {
  const sql = "WITH Recent AS (SELECT 1 AS Id) SELECT * FROM Recent";
  const uri = "file:///shared-navigation.sql";
  const cursor = sql.lastIndexOf("Recent");
  const shared = new DocumentSemanticCache();
  const first = shared.get(uri, 1, sql, cursor);

  assert.equal(shared.get(uri, 1, sql, cursor), first);
  assert.notEqual(new DocumentSemanticCache().get(uri, 1, sql, cursor), first);
});

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

test("declaration and reference navigation share one canonical target", () => {
  const variableSql = "DECLARE @CustomerId int = 42;\nSELECT @CustomerId;";
  const cteSql =
    ";WITH CustomerData AS (SELECT 1 AS Id) SELECT * FROM CustomerData;";
  const aliasSql =
    ";WITH CustomerData AS (SELECT 1 AS Id) SELECT cd.Id FROM CustomerData AS cd WHERE cd.Id = 1;";
  for (const navigationCase of [
    {
      sql: variableSql,
      declaration: variableSql.indexOf("@CustomerId"),
      reference: variableSql.lastIndexOf("@CustomerId"),
      occurrences: [
        variableSql.indexOf("@CustomerId"),
        variableSql.lastIndexOf("@CustomerId"),
      ],
    },
    {
      sql: cteSql,
      declaration: cteSql.indexOf("CustomerData"),
      reference: cteSql.lastIndexOf("CustomerData"),
      occurrences: [
        cteSql.indexOf("CustomerData"),
        cteSql.lastIndexOf("CustomerData"),
      ],
    },
    {
      sql: aliasSql,
      declaration: aliasSql.indexOf("cd WHERE"),
      reference: aliasSql.lastIndexOf("cd.Id"),
      occurrences: [
        aliasSql.indexOf("cd.Id"),
        aliasSql.indexOf("cd WHERE"),
        aliasSql.lastIndexOf("cd.Id"),
      ],
    },
  ]) {
    const cache = new DocumentSemanticCache();
    const uri = `file:///navigation-${String(navigationCase.declaration)}.sql`;
    const fromDeclaration = resolveDocumentSemanticNavigationTarget(
      cache,
      uri,
      1,
      navigationCase.sql,
      navigationCase.declaration,
    );
    const fromReference = resolveDocumentSemanticNavigationTarget(
      cache,
      uri,
      1,
      navigationCase.sql,
      navigationCase.reference,
    );
    assert.ok(fromDeclaration);
    assert.ok(fromReference);
    assert.equal(
      fromDeclaration.occurrence.symbol.id,
      fromReference.occurrence.symbol.id,
    );
    assert.deepEqual(
      semanticOccurrencesForSymbol(
        fromDeclaration.index,
        fromDeclaration.occurrence.symbol.id,
      ).map((occurrence) => occurrence.range.start),
      navigationCase.occurrences,
    );
    assert.deepEqual(
      semanticOccurrencesForSymbol(
        fromReference.index,
        fromReference.occurrence.symbol.id,
      ).map((occurrence) => occurrence.range.start),
      navigationCase.occurrences,
    );
  }
});

test("declaration-aware navigation fallback remains fail closed", () => {
  const sql = "SELECT Missing.Id;";
  assert.equal(
    resolveDocumentSemanticNavigationTarget(
      new DocumentSemanticCache(),
      "file:///unresolved.sql",
      1,
      sql,
      sql.indexOf("Missing"),
    ),
    undefined,
  );
});

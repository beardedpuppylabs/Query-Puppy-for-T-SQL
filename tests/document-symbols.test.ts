import assert from "node:assert/strict";
import test from "node:test";
import { collectDocumentSemanticDeclarations } from "../src/parser/DocumentSemanticAnalyzer.js";
import { tokenizeSql } from "../src/parser/SqlTokenizer.js";
import { documentStatementTokenRanges } from "../src/parser/StatementBoundary.js";

const summary = (sql: string) =>
  collectDocumentSemanticDeclarations(sql).map((symbol) => ({
    name: symbol.name,
    kind: symbol.kind,
    start: symbol.declaration.start,
    end: symbol.declaration.end,
  }));

test("a single CTE contributes exactly one document declaration", () => {
  const sql =
    "WITH CustomerOrders AS (SELECT 1 AS Id) SELECT * FROM CustomerOrders";
  assert.deepEqual(summary(sql), [
    {
      name: "CustomerOrders",
      kind: "cte",
      start: sql.indexOf("CustomerOrders"),
      end: sql.indexOf("CustomerOrders") + "CustomerOrders".length,
    },
  ]);
});

test("chained CTE declarations remain unique and source ordered", () => {
  const sql =
    "WITH CustomerOrders AS (SELECT 1 AS Id), RecentOrders AS (SELECT * FROM CustomerOrders) SELECT * FROM RecentOrders";
  assert.deepEqual(
    summary(sql).map(({ name, kind }) => ({ name, kind })),
    [
      { name: "CustomerOrders", kind: "cte" },
      { name: "RecentOrders", kind: "cte" },
    ],
  );
});

test("explicit aliases retain distinct declarations across shadowed scopes", () => {
  const sql =
    "SELECT o.Id FROM dbo.Orders AS o WHERE EXISTS (SELECT 1 FROM dbo.Other AS o WHERE o.Id > 0)";
  const declarations = collectDocumentSemanticDeclarations(sql);
  assert.deepEqual(
    declarations.map((symbol) => [symbol.name, symbol.kind]),
    [
      ["o", "rowSourceAlias"],
      ["o", "rowSourceAlias"],
    ],
  );
  assert.deepEqual(
    declarations.map((symbol) => symbol.declaration.start),
    [sql.indexOf("o WHERE"), sql.lastIndexOf("o WHERE")],
  );
  assert.notEqual(declarations[0]?.id, declarations[1]?.id);
});

test("scalar declarations from multiple implicit statements appear once", () => {
  const sql =
    "DECLARE @First int\nSELECT @First\nDECLARE @Second bigint\nSELECT @First, @Second";
  assert.deepEqual(
    summary(sql).map(({ name, kind }) => ({ name, kind })),
    [
      { name: "@First", kind: "localVariable" },
      { name: "@Second", kind: "localVariable" },
    ],
  );
});

test("same-name variables in separate GO batches remain distinct", () => {
  const sql = "DECLARE @Value int;\nGO\nDECLARE @Value bigint;\nGO";
  const declarations = collectDocumentSemanticDeclarations(sql);
  assert.deepEqual(
    declarations.map((symbol) => symbol.name),
    ["@Value", "@Value"],
  );
  assert.notEqual(declarations[0]?.id, declarations[1]?.id);
  assert.notEqual(declarations[0]?.scope.id, declarations[1]?.scope.id);
});

test("table variables and temporary tables remain canonical and unique", () => {
  const sql = [
    "DECLARE @Orders TABLE (Id int);",
    "SELECT tv.Id FROM @Orders AS tv;",
    "CREATE TABLE #Orders (Id int);",
    "SELECT tempAlias.Id FROM #Orders AS tempAlias;",
  ].join("\n");
  assert.deepEqual(
    summary(sql).map(({ name, kind }) => ({ name, kind })),
    [
      { name: "@Orders", kind: "tableVariable" },
      { name: "tv", kind: "rowSourceAlias" },
      { name: "#Orders", kind: "temporaryTable" },
      { name: "tempAlias", kind: "rowSourceAlias" },
    ],
  );
});

test("mixed documents preserve exact ranges and exclude projection and physical names", () => {
  const sql = [
    "DECLARE @CustomerId int;",
    "WITH CustomerOrders AS (",
    "  SELECT c.CustomerId AS ProjectionId",
    "  FROM dbo.Customers AS c",
    ")",
    "SELECT co.CustomerId",
    "FROM CustomerOrders AS co;",
  ].join("\n");
  const declarations = collectDocumentSemanticDeclarations(sql);
  assert.deepEqual(
    declarations.map((symbol) => [symbol.name, symbol.kind]),
    [
      ["@CustomerId", "localVariable"],
      ["CustomerOrders", "cte"],
      ["c", "rowSourceAlias"],
      ["co", "rowSourceAlias"],
    ],
  );
  for (const symbol of declarations)
    assert.equal(
      sql.slice(symbol.declaration.start, symbol.declaration.end),
      symbol.name,
    );
  assert.equal(
    declarations.some((symbol) =>
      ["ProjectionId", "Customers"].includes(symbol.name),
    ),
    false,
  );
  assert.equal(
    new Set(declarations.map((symbol) => symbol.id)).size,
    declarations.length,
  );
});

test("whole-document collection performs one semantic pass per statement, not per symbol", () => {
  const sql = [
    "DECLARE @First int, @Second int;",
    "SELECT outerAlias.Id",
    "FROM dbo.Orders AS outerAlias",
    "WHERE EXISTS (SELECT 1 FROM dbo.Other AS innerAlias);",
  ].join("\n");
  const statements = documentStatementTokenRanges(tokenizeSql(sql));
  const declarations = collectDocumentSemanticDeclarations(sql);
  assert.equal(statements.length, 2);
  assert.deepEqual(
    declarations.map((symbol) => symbol.name),
    ["@First", "@Second", "outerAlias", "innerAlias"],
  );
  assert.ok(statements.length < declarations.length);
});

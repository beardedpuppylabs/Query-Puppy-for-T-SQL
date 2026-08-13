import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseIndex } from "../src/metadata/DatabaseIndex.js";
import {
  analyzeDocumentSemantics,
  resolveSelectWildcard,
  wildcardColumnExpressions,
} from "../src/parser/DocumentSemanticAnalyzer.js";
import {
  aliasFromObjectName,
  resolveSmartAliasContext,
} from "../src/parser/SmartAlias.js";

const columns = Array.from({ length: 200 }, (_, index) => ({
  name: `Column${String(index + 1)}`,
  normalizedName: `column${String(index + 1)}`,
  type: { name: "int" },
  nullable: false,
  ordinal: index + 1,
}));
const index = new DatabaseIndex({
  database: "Db",
  schemas: ["dbo", "sales"],
  loadedAt: 0,
  objects: [
    {
      schema: "dbo",
      name: "Customers",
      normalizedName: "customers",
      kind: "table",
      parameters: [],
      columns,
    },
    {
      schema: "sales",
      name: "CustomerOrders",
      normalizedName: "customerorders",
      kind: "table",
      parameters: [],
      columns: columns.slice(0, 3),
    },
    {
      schema: "dbo",
      name: "Contacts",
      normalizedName: "contacts",
      kind: "table",
      parameters: [],
      columns: columns.slice(0, 2),
    },
  ],
});
const catalog = { activeDatabase: "Db", indexes: new Map([["db", index]]) };

test("projection wildcard resolution is strict, ordered, and supports large tables", () => {
  const sql = "SELECT c.* FROM dbo.Customers AS c";
  const expansion = resolveSelectWildcard(sql, sql.indexOf("*") + 1, catalog);
  assert.ok(expansion);
  assert.equal(expansion.qualification, "qualified");
  assert.equal(expansion.sources.length, 1);
  const source = expansion.sources[0];
  assert.ok(source);
  assert.equal(source.qualifier, "c");
  assert.equal(source.columns.length, 200);
  assert.equal(source.columns[0]?.name, "Column1");
  assert.equal(source.columns[199]?.name, "Column200");
  assert.deepEqual(wildcardColumnExpressions(expansion).slice(0, 2), [
    "c.Column1",
    "c.Column2",
  ]);
  for (const invalid of [
    "SELECT COUNT(*) FROM dbo.Customers",
    "SELECT '*' FROM dbo.Customers",
    "SELECT 2 * 3",
  ])
    assert.equal(
      resolveSelectWildcard(invalid, invalid.indexOf("*") + 1, catalog),
      undefined,
    );
});

test("plain wildcard preserves source order and aliases", () => {
  const sql =
    "SELECT * FROM dbo.Customers c JOIN dbo.Contacts co ON co.Column1 = c.Column1";
  const expansion = resolveSelectWildcard(sql, sql.indexOf("*") + 1, catalog);
  assert.ok(expansion);
  assert.equal(expansion.qualification, "qualified");
  assert.deepEqual(
    expansion.sources.map((source) => source.qualifier),
    ["c", "co"],
  );
  assert.deepEqual(
    expansion.sources.map((source) => source.columns.length),
    [200, 2],
  );
});

test("plain wildcard qualification follows the SELECT scope", () => {
  const single = "SELECT * FROM dbo.Customers";
  const unaliased = resolveSelectWildcard(
    single,
    single.indexOf("*") + 1,
    catalog,
  );
  assert.ok(unaliased);
  assert.equal(unaliased.qualification, "unqualified");
  assert.equal(unaliased.sources[0]?.qualifier, "Customers");
  assert.deepEqual(wildcardColumnExpressions(unaliased).slice(0, 2), [
    "Column1",
    "Column2",
  ]);

  const aliasedSql = "SELECT * FROM dbo.Customers AS c";
  const aliased = resolveSelectWildcard(
    aliasedSql,
    aliasedSql.indexOf("*") + 1,
    catalog,
  );
  assert.ok(aliased);
  assert.equal(aliased.qualification, "qualified");
  assert.equal(aliased.sources[0]?.qualifier, "c");
  assert.deepEqual(wildcardColumnExpressions(aliased).slice(0, 2), [
    "c.Column1",
    "c.Column2",
  ]);

  const mixed =
    "SELECT * FROM dbo.Customers JOIN dbo.Contacts co ON co.Column1 = Customers.Column1";
  const multiple = resolveSelectWildcard(
    mixed,
    mixed.indexOf("*") + 1,
    catalog,
  );
  assert.ok(multiple);
  assert.equal(multiple.qualification, "qualified");
  assert.deepEqual(
    multiple.sources.map((source) => source.qualifier),
    ["Customers", "co"],
  );
  assert.deepEqual(wildcardColumnExpressions(multiple).slice(-2), [
    "co.Column1",
    "co.Column2",
  ]);
  assert.equal(wildcardColumnExpressions(multiple)[0], "Customers.Column1");
});

test("local row-source wildcards use the same qualification policy", () => {
  const cte =
    "WITH X AS (SELECT Column1, Column2 FROM dbo.Customers) SELECT * FROM X";
  const unaliased = resolveSelectWildcard(
    cte,
    cte.indexOf("*", cte.indexOf("SELECT *")) + 1,
    catalog,
  );
  assert.ok(unaliased);
  assert.equal(unaliased.qualification, "unqualified");

  const aliasedCte = `${cte} AS x`;
  const aliased = resolveSelectWildcard(
    aliasedCte,
    aliasedCte.indexOf("*", aliasedCte.indexOf("SELECT *")) + 1,
    catalog,
  );
  assert.ok(aliased);
  assert.equal(aliased.qualification, "qualified");
  assert.equal(aliased.sources[0]?.qualifier, "x");

  const temp = "CREATE TABLE #T (Id int, Value int); SELECT * FROM #T";
  const tempExpansion = resolveSelectWildcard(
    temp,
    temp.indexOf("*") + 1,
    catalog,
  );
  assert.ok(tempExpansion);
  assert.equal(tempExpansion.qualification, "unqualified");
});

test("smart aliases split names and avoid visible collisions", () => {
  assert.deepEqual(
    [
      "Customers",
      "CustomerOrders",
      "CustomerOrderLines",
      "customer_orders",
    ].map(aliasFromObjectName),
    ["c", "co", "col", "co"],
  );
  const sql = "SELECT * FROM dbo.Customers AS co JOIN sales.CustomerOrders ";
  const semantics = analyzeDocumentSemantics(sql, sql.length, catalog);
  assert.deepEqual(
    resolveSmartAliasContext(sql, sql.length, semantics, catalog),
    {
      objectName: "CustomerOrders",
      alias: "co2",
      leadingSpace: false,
    },
  );
  assert.equal(
    resolveSmartAliasContext("SELECT 1 ", 9, semantics, catalog),
    undefined,
  );
});

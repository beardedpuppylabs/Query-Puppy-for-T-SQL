import assert from "node:assert/strict";
import test from "node:test";
import { resolveSqlContext } from "../src/parser/SqlContextResolver.js";
test("resolves FROM, JOIN, EXEC, schema, alias contains, and CTE contexts", () => {
  assert.equal(resolveSqlContext("SELECT * FROM addr").kind, "rowSource");
  assert.equal(
    resolveSqlContext("SELECT * FROM dbo.X x JOIN cust").kind,
    "rowSource",
  );
  assert.equal(resolveSqlContext("EXEC GetCust").kind, "execute");
  const schema = resolveSqlContext("SELECT * FROM dbo.addr");
  assert.equal(schema.kind, "qualified");
  assert.deepEqual(schema.qualifier?.parts, ["dbo", "addr"]);
  assert.equal(schema.search, "addr");
  const aliasSql = "SELECT c.addr\nFROM dbo.Customers c";
  const alias = resolveSqlContext(aliasSql, "SELECT c.addr".length);
  assert.equal(alias.kind, "member");
  assert.deepEqual(alias.qualifier?.parts, ["c", "addr"]);
  assert.deepEqual(alias.aliasSource, {
    schema: "dbo",
    name: "Customers",
    alias: "c",
  });
  assert.equal(alias.search, "addr");
  const cte = resolveSqlContext(
    "WITH Recent AS (SELECT 1 AS Id) SELECT * FROM Rec",
  );
  assert.equal(
    cte.symbols.locals.some(
      (local) => local.kind === "cte" && local.name === "Recent",
    ),
    true,
  );
});

test("parses supported SQL Server object qualification without treating linked servers as databases", () => {
  const one = resolveSqlContext("SELECT * FROM Customers");
  assert.equal(one.kind, "rowSource");
  assert.equal(one.search, "Customers");

  const two = resolveSqlContext("SELECT * FROM dbo.Customers");
  assert.deepEqual(two.qualifier?.parts, ["dbo", "Customers"]);

  const three = resolveSqlContext("SELECT * FROM ReportingDb.dbo.Customers");
  assert.equal(three.qualifier?.database, "ReportingDb");
  assert.equal(three.qualifier.schema, "dbo");

  const doubleDot = resolveSqlContext("SELECT * FROM ReportingDb..Customers");
  assert.equal(doubleDot.qualifier?.doubleDot, true);
  assert.equal(doubleDot.qualifier.schema, "dbo");

  const schemaPartial = resolveSqlContext("SELECT * FROM ReportingDb.rep");
  assert.deepEqual(schemaPartial.qualifier?.parts, ["ReportingDb", "rep"]);
  const objectPartial = resolveSqlContext(
    "SELECT * FROM ReportingDb.reporting.addr",
  );
  assert.equal(objectPartial.search, "addr");

  const linked = resolveSqlContext(
    "SELECT * FROM Server.Database.dbo.Customers",
  );
  assert.equal(linked.kind, "unsupported");
  assert.equal(linked.qualifier?.unsupported, true);
});

test("database-qualified aliases retain database, schema, and object identity", () => {
  const sql = "SELECT r.\nFROM ReportingDb.dbo.Customers r";
  const context = resolveSqlContext(sql, "SELECT r.".length);
  assert.deepEqual(context.aliasSource, {
    database: "ReportingDb",
    schema: "dbo",
    name: "Customers",
    alias: "r",
  });
});
test("contract: comments and strings do not produce RowSource aliases", () => {
  const context = resolveSqlContext(
    "-- FROM dbo.Bad b\nSELECT 'FROM dbo.Nope n', x",
  );
  assert.equal(context.symbols.aliases.size, 0);
});

test("nested aliases do not leak outward and outer aliases remain correlated", () => {
  const outer =
    "SELECT innerAlias. FROM dbo.Customers outerAlias WHERE EXISTS (SELECT 1 FROM dbo.Customers innerAlias)";
  assert.equal(
    resolveSqlContext(outer, outer.indexOf("innerAlias.") + 11).aliasSource,
    undefined,
  );
  const correlated =
    "SELECT * FROM dbo.Customers outerAlias WHERE EXISTS (SELECT outerAlias. FROM dbo.Customers innerAlias)";
  assert.equal(
    resolveSqlContext(correlated, correlated.indexOf("outerAlias.", 30) + 11)
      .aliasSource?.alias,
    "outerAlias",
  );
});

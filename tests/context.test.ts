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
  assert.equal(schema.kind, "member");
  assert.equal(schema.qualifier, "dbo");
  assert.equal(schema.search, "addr");
  const aliasSql = "SELECT c.addr\nFROM dbo.Customers c";
  const alias = resolveSqlContext(aliasSql, "SELECT c.addr".length);
  assert.equal(alias.kind, "member");
  assert.equal(alias.qualifier, "c");
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
test("comments and strings do not produce aliases", () => {
  const context = resolveSqlContext(
    "-- FROM dbo.Bad b\nSELECT 'FROM dbo.Nope n', x",
  );
  assert.equal(context.symbols.aliases.size, 0);
});

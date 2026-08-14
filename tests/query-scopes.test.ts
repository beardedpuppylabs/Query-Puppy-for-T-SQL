import assert from "node:assert/strict";
import test from "node:test";
import { createCandidates } from "../src/completion/CandidateFactory.js";
import { DatabaseIndex } from "../src/metadata/DatabaseIndex.js";
import { analyzeDocumentSemantics } from "../src/parser/DocumentSemanticAnalyzer.js";
import { resolveSqlContext } from "../src/parser/SqlContextResolver.js";

const column = (name: string, ordinal: number) => ({
  name,
  normalizedName: name.toLowerCase(),
  type: { name: "bigint" },
  nullable: false,
  ordinal,
});
const database = (name: string) =>
  new DatabaseIndex({
    database: name,
    schemas: ["dbo", "sales"],
    loadedAt: 0,
    objects: [
      {
        schema: "dbo",
        name: "Customers",
        normalizedName: "customers",
        kind: "table" as const,
        parameters: [],
        columns: [
          column(
            name === "Reporting" ? "ReportingCustomerId" : "CustomerCode",
            1,
          ),
          column("CustomerId", 2),
        ],
      },
      {
        schema: "sales",
        name: "CustomerOrders",
        normalizedName: "customerorders",
        kind: "table" as const,
        parameters: [],
        columns: [column("CustomerOrderId", 1), column("OrderNumber", 2)],
      },
      {
        schema: "dbo",
        name: "CustomerAddresses",
        normalizedName: "customeraddresses",
        kind: "table" as const,
        parameters: [],
        columns: [column("CustomerAddressId", 1), column("AddressLabel", 2)],
      },
    ],
  });
const lab = database("Lab");
const reporting = database("Reporting");
const scope = {
  activeDatabase: "Lab",
  indexes: new Map([
    ["lab", lab],
    ["reporting", reporting],
  ]),
};
const at = (sql: string, needle: string, occurrence = 0) => {
  let start = -1;
  for (let i = 0; i <= occurrence; i++) start = sql.indexOf(needle, start + 1);
  assert.notEqual(start, -1);
  const cursor = start + needle.length;
  return createCandidates(resolveSqlContext(sql, cursor), scope).map(
    (candidate) => candidate.name,
  );
};

test("top-level and EXISTS scopes resolve local and correlated aliases", () => {
  const sql =
    "SELECT c. FROM dbo.Customers c WHERE EXISTS (SELECT o. FROM sales.CustomerOrders o WHERE c.)";
  assert.deepEqual(at(sql, "c."), ["CustomerCode", "CustomerId"]);
  assert.deepEqual(at(sql, "SELECT o."), ["CustomerOrderId", "OrderNumber"]);
  assert.deepEqual(at(sql, "c.", 1), ["CustomerCode", "CustomerId"]);
  const model = analyzeDocumentSemantics(
    sql,
    sql.indexOf("SELECT o.") + "SELECT o.".length,
    scope,
  );
  assert.equal(model.activeQueryScope?.kind, "correlatedExpressionSubquery");
  assert.deepEqual(
    model.visibleRowSources.map((source) => source.qualifier),
    ["o", "c"],
  );
});

test("scoped outer bindings rebind cached catalog metadata without global alias fallback", () => {
  const sql =
    "SELECT * FROM Lab.dbo.Customers c WHERE EXISTS (SELECT 1 FROM Lab.sales.CustomerOrders o WHERE o.CustomerOrderId = c.)";
  const cursor = sql.indexOf("c.)") + 2;
  const semanticsWithoutCatalog = analyzeDocumentSemantics(sql, cursor);
  assert.equal(semanticsWithoutCatalog.aliases.get("c")?.columns.length, 0);
  assert.deepEqual(
    createCandidates(
      resolveSqlContext(sql, cursor),
      scope,
      semanticsWithoutCatalog,
    ).map((candidate) => candidate.name),
    ["CustomerCode", "CustomerId"],
  );
  const derived =
    "SELECT * FROM Lab.dbo.Customers c JOIN (SELECT 1 FROM Lab.sales.CustomerOrders o WHERE c.) x ON 1=1";
  const derivedCursor = derived.indexOf("c.)") + 2;
  assert.deepEqual(
    createCandidates(
      resolveSqlContext(derived, derivedCursor),
      scope,
      analyzeDocumentSemantics(derived, derivedCursor),
    ),
    [],
  );
});

test("inner aliases do not leak out and sibling scopes are isolated", () => {
  const closed =
    "SELECT c. FROM dbo.Customers c WHERE EXISTS (SELECT 1 FROM sales.CustomerOrders o) AND o.";
  assert.deepEqual(at(closed, "AND o."), []);
  const siblings =
    "SELECT * FROM dbo.Customers c WHERE EXISTS (SELECT 1 FROM sales.CustomerOrders o) AND EXISTS (SELECT o. FROM dbo.CustomerAddresses ca)";
  assert.deepEqual(at(siblings, "SELECT o."), []);
});

test("alias shadowing is local-first without merging columns", () => {
  const sql =
    "SELECT * FROM dbo.Customers c WHERE EXISTS (SELECT c. FROM sales.CustomerOrders c)";
  assert.deepEqual(at(sql, "c."), ["CustomerOrderId", "OrderNumber"]);
});

test("three-level correlation walks parent and grandparent scopes", () => {
  const sql =
    "SELECT * FROM dbo.Customers c WHERE EXISTS (SELECT 1 FROM sales.CustomerOrders o WHERE EXISTS (SELECT ca. FROM dbo.CustomerAddresses ca WHERE o. IS NULL AND c. IS NULL))";
  assert.deepEqual(at(sql, "ca."), ["AddressLabel", "CustomerAddressId"]);
  assert.deepEqual(at(sql, "WHERE o."), ["CustomerOrderId", "OrderNumber"]);
  assert.deepEqual(at(sql, "c."), ["CustomerCode", "CustomerId"]);
  const model = analyzeDocumentSemantics(sql, sql.indexOf("ca.") + 3, scope);
  assert.deepEqual(
    model.queryScopes.map((queryScope) => ({
      id: queryScope.id,
      kind: queryScope.kind,
      parentId: queryScope.parentId,
      locals: queryScope.localRowSources.map((source) => source.qualifier),
      correlated: queryScope.allowsOuterReferences,
    })),
    [
      {
        id: "query-1",
        kind: "topLevelQuery",
        parentId: undefined,
        locals: ["c"],
        correlated: false,
      },
      {
        id: "query-2",
        kind: "correlatedExpressionSubquery",
        parentId: "query-1",
        locals: ["o"],
        correlated: true,
      },
      {
        id: "query-3",
        kind: "correlatedExpressionSubquery",
        parentId: "query-2",
        locals: ["ca"],
        correlated: true,
      },
    ],
  );
});

test("scalar and IN subqueries allow correlation", () => {
  const scalar =
    "SELECT (SELECT o. FROM sales.CustomerOrders o WHERE c. IS NULL) FROM dbo.Customers c";
  assert.deepEqual(at(scalar, "o."), ["CustomerOrderId", "OrderNumber"]);
  assert.deepEqual(at(scalar, "c."), ["CustomerCode", "CustomerId"]);
  const insideIn =
    "SELECT * FROM dbo.Customers c WHERE c.CustomerId IN (SELECT o. FROM sales.CustomerOrders o WHERE c. IS NULL)";
  assert.deepEqual(at(insideIn, "c.", 1), ["CustomerCode", "CustomerId"]);
});

test("ordinary derived tables block correlation", () => {
  const sql =
    "SELECT * FROM dbo.Customers c JOIN (SELECT c. FROM sales.CustomerOrders o) x ON 1=1";
  assert.deepEqual(at(sql, "c."), []);
  assert.equal(
    analyzeDocumentSemantics(sql, sql.indexOf("c.") + 2, scope).activeQueryScope
      ?.kind,
    "derivedTable",
  );
});

test("CTE definitions are isolated from consuming-query aliases", () => {
  const sql =
    "WITH A AS (SELECT c. FROM sales.CustomerOrders o) SELECT * FROM A a JOIN dbo.Customers c ON 1=1";
  assert.deepEqual(at(sql, "c."), []);
  assert.equal(
    analyzeDocumentSemantics(sql, sql.indexOf("c.") + 2, scope).activeQueryScope
      ?.kind,
    "cteDefinition",
  );
});

test("CROSS and OUTER APPLY allow left-side correlation without leaking internals", () => {
  for (const keyword of ["CROSS APPLY", "OUTER APPLY"]) {
    const sql = `SELECT o. FROM dbo.Customers c ${keyword} (SELECT o.OrderNumber FROM sales.CustomerOrders o WHERE c. IS NULL) x`;
    assert.deepEqual(at(sql, "c."), ["CustomerCode", "CustomerId"]);
    assert.deepEqual(at(sql, "o."), []);
    assert.equal(
      analyzeDocumentSemantics(sql, sql.indexOf("c.") + 2, scope)
        .activeQueryScope?.kind,
      "applyRightQuery",
    );
  }
});

test("cross-database correlated sources retain database identity", () => {
  const sql =
    "SELECT * FROM Reporting.dbo.Customers r WHERE EXISTS (SELECT r. FROM Lab.dbo.CustomerAddresses ca)";
  assert.deepEqual(at(sql, "r."), ["CustomerId", "ReportingCustomerId"]);
  const model = analyzeDocumentSemantics(sql, sql.indexOf("r.") + 2, scope);
  assert.equal(model.aliases.get("r")?.database, "Reporting");
});

test("unfinished nested queries stay active", () => {
  const sql =
    "SELECT * FROM dbo.Customers c WHERE EXISTS (SELECT 1 FROM sales.CustomerOrders o WHERE o.";
  assert.deepEqual(at(sql, "WHERE o."), ["CustomerOrderId", "OrderNumber"]);
  assert.equal(
    analyzeDocumentSemantics(sql, sql.length, scope).activeQueryScope?.kind,
    "correlatedExpressionSubquery",
  );
});

test("comments, strings, and statements do not create or share scopes", () => {
  const fake =
    "SELECT 'SELECT fake. FROM dbo.Customers fake' FROM dbo.Customers c -- SELECT nope.\nWHERE c.";
  assert.deepEqual(at(fake, "c."), ["CustomerCode", "CustomerId"]);
  const statements = "SELECT * FROM dbo.Customers c; SELECT c.";
  assert.deepEqual(at(statements, "c."), []);
});

test("unqualified columns preserve local-before-outer scope tiers and origins", () => {
  const sql =
    "SELECT * FROM dbo.Customers c WHERE EXISTS (SELECT Ord FROM sales.CustomerOrders o WHERE Cust)";
  const cursor = sql.indexOf("Ord") + 3;
  const local = createCandidates(resolveSqlContext(sql, cursor), scope);
  assert.equal(local[0]?.name, "CustomerOrderId");
  const outerCursor = sql.lastIndexOf("Cust") + 4;
  const visible = createCandidates(resolveSqlContext(sql, outerCursor), scope);
  assert.equal(visible[0]?.sourceQualifier, "o");
  assert.ok(
    visible.some(
      (candidate) => candidate.sourceQualifier === "c" && candidate.outerScope,
    ),
  );
});

test("SELECT modifiers preserve the first derived projection item", () => {
  const variants = [
    "",
    "TOP 1 ",
    "TOP (1) ",
    "TOP (@Count) ",
    "TOP (10 + 5) ",
    "TOP (SELECT 1) ",
    "TOP 10 PERCENT ",
    "TOP (10) PERCENT ",
    "TOP 1 WITH TIES ",
    "TOP (1) WITH TIES ",
    "DISTINCT ",
    "ALL ",
  ];
  for (const modifier of variants) {
    const sql = `SELECT x. FROM (SELECT ${modifier}o.CustomerOrderId, o.OrderNumber FROM sales.CustomerOrders o) x`;
    const model = analyzeDocumentSemantics(sql, sql.indexOf("x.") + 2, scope);
    assert.deepEqual(
      model.aliases.get("x")?.columns.map((item) => item.name),
      ["CustomerOrderId", "OrderNumber"],
      modifier || "plain SELECT",
    );
  }
});

test("TOP projection preserves three columns, expression aliases, and star order", () => {
  const three =
    "SELECT x. FROM (SELECT TOP 1 o.CustomerOrderId, o.CustomerId, o.OrderNumber FROM sales.CustomerOrders o) x";
  assert.deepEqual(
    analyzeDocumentSemantics(three, three.indexOf("x.") + 2, scope)
      .aliases.get("x")
      ?.columns.map((item) => item.name),
    ["CustomerOrderId", "CustomerId", "OrderNumber"],
  );
  const aliases =
    "SELECT x. FROM (SELECT TOP 1 o.CustomerOrderId AS Id, o.OrderNumber AS Number FROM sales.CustomerOrders o) x";
  assert.deepEqual(
    analyzeDocumentSemantics(aliases, aliases.indexOf("x.") + 2, scope)
      .aliases.get("x")
      ?.columns.map((item) => item.name),
    ["Id", "Number"],
  );
  const star =
    "SELECT x. FROM (SELECT TOP 1 o.* FROM sales.CustomerOrders o) x";
  assert.deepEqual(
    analyzeDocumentSemantics(star, star.indexOf("x.") + 2, scope)
      .aliases.get("x")
      ?.columns.map((item) => item.name),
    ["CustomerOrderId", "OrderNumber"],
  );
});

test("TOP projections are complete for CROSS APPLY and OUTER APPLY", () => {
  for (const apply of ["CROSS APPLY", "OUTER APPLY"]) {
    const sql = `SELECT lastOrder. FROM dbo.Customers c ${apply} (SELECT TOP 1 o.CustomerOrderId, o.OrderNumber FROM sales.CustomerOrders o WHERE o.CustomerOrderId = c.CustomerId) lastOrder`;
    assert.deepEqual(at(sql, "lastOrder."), ["CustomerOrderId", "OrderNumber"]);
  }
});

test("CTE TOP projection preserves all selected columns", () => {
  const sql =
    "WITH X AS (SELECT TOP 1 CustomerOrderId, OrderNumber FROM sales.CustomerOrders) SELECT x. FROM X x";
  assert.deepEqual(at(sql, "x."), ["CustomerOrderId", "OrderNumber"]);
});

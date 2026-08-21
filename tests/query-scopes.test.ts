import assert from "node:assert/strict";
import test from "node:test";
import { createCandidates } from "../src/completion/CandidateFactory.js";
import { DatabaseIndex } from "../src/metadata/DatabaseIndex.js";
import {
  analyzeDocumentSemantics,
  resolveSelectWildcard,
  wildcardColumnExpressions,
} from "../src/parser/DocumentSemanticAnalyzer.js";
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
      {
        schema: "billing",
        name: "BillingAddresses",
        normalizedName: "billingaddresses",
        kind: "table" as const,
        parameters: [],
        columns: [
          column("BillingAddressId", 1),
          column("BillingEmailAddress", 2),
        ],
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

test("contract: nested scopes resolve local and legally correlated aliases", () => {
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

test("contract: inner aliases do not leak and sibling scopes stay isolated", () => {
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

test("contract: comments strings and statements do not create or share scopes", () => {
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

test("set operators use the first branch projection names by ordinal", () => {
  for (const operator of ["UNION", "UNION ALL", "INTERSECT", "EXCEPT"]) {
    const sql = `WITH X AS (SELECT c.CustomerId AS Id, c.CustomerCode AS Value FROM dbo.Customers c ${operator} SELECT o.CustomerOrderId AS WrongId, o.OrderNumber AS WrongValue FROM sales.CustomerOrders o) SELECT x. FROM X x`;
    const model = analyzeDocumentSemantics(sql, sql.indexOf("x.") + 2, scope);
    assert.deepEqual(
      model.aliases.get("x")?.columns.map((item) => item.name),
      ["Id", "Value"],
    );
    assert.deepEqual(at(sql, "x."), ["Id", "Value"]);
  }
});

test("set projections preserve first shape through three, short, long, and incomplete branches", () => {
  for (const tail of [
    "SELECT o.CustomerOrderId FROM sales.CustomerOrders o",
    "SELECT o.CustomerOrderId, o.OrderNumber, o.CustomerId FROM sales.CustomerOrders o",
    "SELECT o.CustomerOrderId, FROM sales.CustomerOrders o",
    "SELECT o.CustomerOrderId FROM sales.CustomerOrders o UNION ALL SELECT ca.CustomerAddressId FROM dbo.CustomerAddresses ca",
  ]) {
    const sql = `WITH X AS (SELECT c.CustomerId AS Id, c.CustomerCode AS Value FROM dbo.Customers c UNION ALL ${tail}) SELECT x. FROM X x`;
    assert.deepEqual(
      analyzeDocumentSemantics(sql, sql.indexOf("x.") + 2, scope)
        .aliases.get("x")
        ?.columns.map((item) => item.name),
      ["Id", "Value"],
    );
  }
});

test("set projections support star, alias star, TOP, DISTINCT, and explicit CTE columns", () => {
  for (const first of [
    "SELECT c.* FROM dbo.Customers c",
    "SELECT TOP (1) c.* FROM dbo.Customers c",
    "SELECT DISTINCT c.* FROM dbo.Customers c",
  ]) {
    const sql = `WITH X AS (${first} UNION ALL SELECT c2.* FROM dbo.Customers c2) SELECT x. FROM X x`;
    assert.deepEqual(at(sql, "x."), ["CustomerCode", "CustomerId"]);
  }
  const explicit =
    "WITH X (EntityId, AddressValue) AS (SELECT c.CustomerId, c.CustomerCode FROM dbo.Customers c UNION SELECT o.CustomerOrderId, o.OrderNumber FROM sales.CustomerOrders o) SELECT x. FROM X x";
  assert.deepEqual(at(explicit, "x."), ["AddressValue", "EntityId"]);
});

test("contract: set operators reconcile expanded stars before ordinal projection", () => {
  for (const operator of ["UNION", "UNION ALL", "INTERSECT", "EXCEPT"]) {
    const sql = `WITH X AS (SELECT c.* FROM Lab.dbo.Customers c ${operator} SELECT c2.* FROM Lab.dbo.Customers c2) SELECT x. FROM X x`;
    assert.deepEqual(at(sql, "x."), ["CustomerCode", "CustomerId"]);
    assert.deepEqual(
      analyzeDocumentSemantics(
        sql,
        sql.indexOf("x.") + 2,
        scope,
      ).setQueryExpressions[0]?.projection.map((item) => item.name),
      ["CustomerCode", "CustomerId"],
    );
  }
});

test("star set projections preserve first-branch names, duplicates, and three branches", () => {
  const firstStar =
    "WITH X AS (SELECT c.* FROM Lab.dbo.Customers c UNION SELECT o.CustomerOrderId, o.OrderNumber FROM sales.CustomerOrders o) SELECT x. FROM X x";
  assert.deepEqual(at(firstStar, "x."), ["CustomerCode", "CustomerId"]);
  const secondStar =
    "WITH X AS (SELECT c.CustomerId AS Id, c.CustomerCode AS Value FROM dbo.Customers c UNION SELECT c2.* FROM dbo.Customers c2) SELECT x. FROM X x";
  assert.deepEqual(at(secondStar, "x."), ["Id", "Value"]);
  const threeStars =
    "WITH X AS (SELECT c.* FROM dbo.Customers c UNION ALL SELECT c2.* FROM dbo.Customers c2 EXCEPT SELECT c3.* FROM dbo.Customers c3) SELECT x. FROM X x";
  assert.deepEqual(at(threeStars, "x."), ["CustomerCode", "CustomerId"]);
  const duplicate =
    "WITH X AS (SELECT c.CustomerId, c.* FROM dbo.Customers c UNION ALL SELECT c2.CustomerId, c2.* FROM dbo.Customers c2) SELECT x. FROM X x";
  assert.deepEqual(
    analyzeDocumentSemantics(
      duplicate,
      duplicate.length,
      scope,
    ).setQueryExpressions[0]?.projection.map((item) => item.name),
    ["CustomerId", "CustomerCode", "CustomerId"],
  );
});

test("set-expression tree honors INTERSECT precedence and UNION/EXCEPT left associativity", () => {
  const sql =
    "SELECT c.CustomerId FROM dbo.Customers c UNION SELECT o.CustomerOrderId FROM sales.CustomerOrders o INTERSECT SELECT ca.CustomerAddressId FROM dbo.CustomerAddresses ca EXCEPT SELECT b.BillingAddressId FROM billing.BillingAddresses b";
  const expression = analyzeDocumentSemantics(sql, sql.length, scope)
    .setQueryExpressions[0];
  assert.equal(expression?.kind, "set");
  assert.equal(expression.operator, "except");
  assert.equal(expression.left.kind, "set");
  assert.equal(expression.left.operator, "union");
  assert.equal(expression.left.right.kind, "set");
  assert.equal(expression.left.right.operator, "intersect");
});

test("parentheses produce nested set expressions", () => {
  const sql =
    "SELECT c.CustomerId FROM dbo.Customers c UNION ALL (SELECT o.CustomerOrderId FROM sales.CustomerOrders o UNION SELECT ca.CustomerAddressId FROM dbo.CustomerAddresses ca)";
  const expression = analyzeDocumentSemantics(sql, sql.length, scope)
    .setQueryExpressions[0];
  assert.equal(expression?.kind, "set");
  assert.equal(expression.operator, "unionAll");
  assert.equal(expression.right.kind, "set");
  assert.equal(expression.right.operator, "union");
});

test("set branches isolate local aliases while retaining legal outer correlation", () => {
  const isolated =
    "SELECT c.CustomerId FROM dbo.Customers c UNION ALL SELECT b.BillingAddressId FROM billing.BillingAddresses b WHERE c.";
  assert.deepEqual(at(isolated, "WHERE c."), []);
  assert.deepEqual(at(isolated, "b."), [
    "BillingAddressId",
    "BillingEmailAddress",
  ]);
  const correlated =
    "SELECT * FROM dbo.Customers c WHERE EXISTS (SELECT o.CustomerOrderId FROM sales.CustomerOrders o UNION ALL SELECT ca.CustomerAddressId FROM dbo.CustomerAddresses ca WHERE c. AND o.)";
  assert.deepEqual(at(correlated, "WHERE c."), ["CustomerCode", "CustomerId"]);
  assert.deepEqual(at(correlated, "ca."), [
    "AddressLabel",
    "CustomerAddressId",
  ]);
  assert.deepEqual(at(correlated, "AND o."), []);
});

test("fully qualified set branches resolve first, later, incomplete, and correlated members", () => {
  const first = `SELECT c., b.
FROM Lab.dbo.Customers AS c
UNION ALL
SELECT b.CustomerId FROM Lab.billing.BillingAddresses AS b`;
  assert.deepEqual(at(first, "SELECT c."), ["CustomerCode", "CustomerId"]);
  assert.deepEqual(at(first, ", b."), []);
  for (const operator of ["UNION", "UNION ALL", "INTERSECT", "EXCEPT"]) {
    const second = `SELECT c.CustomerId FROM Lab.dbo.Customers AS c
${operator}
SELECT b., c.
FROM Lab.billing.BillingAddresses AS b`;
    assert.deepEqual(at(second, "SELECT b."), [
      "BillingAddressId",
      "BillingEmailAddress",
    ]);
    assert.deepEqual(at(second, "c.", 1), []);
  }
  const third = `SELECT c.CustomerId FROM dbo.Customers c
UNION SELECT b.CustomerId FROM billing.BillingAddresses b
UNION ALL SELECT o. FROM sales.CustomerOrders o`;
  assert.deepEqual(at(third, "SELECT o."), ["CustomerOrderId", "OrderNumber"]);
  const parenthesized = `SELECT c.CustomerId FROM dbo.Customers c
UNION ALL (SELECT b. FROM billing.BillingAddresses b
INTERSECT SELECT o.CustomerOrderId FROM sales.CustomerOrders o)`;
  assert.deepEqual(at(parenthesized, "SELECT b."), [
    "BillingAddressId",
    "BillingEmailAddress",
  ]);
  const correlated = `SELECT * FROM Lab.dbo.Customers c WHERE EXISTS
  (SELECT o.CustomerOrderId FROM Lab.sales.CustomerOrders o WHERE c.
   UNION ALL SELECT ca.CustomerAddressId FROM Lab.dbo.CustomerAddresses ca WHERE c.
   EXCEPT SELECT b.BillingAddressId FROM Lab.billing.BillingAddresses b WHERE c.)`;
  for (let occurrence = 0; occurrence < 3; occurrence++)
    assert.deepEqual(at(correlated, "c.", occurrence), [
      "CustomerCode",
      "CustomerId",
    ]);
});

test("set results flow through derived tables and APPLY", () => {
  const derived =
    "SELECT x. FROM (SELECT c.CustomerId AS Id, c.CustomerCode AS Code FROM dbo.Customers c UNION ALL SELECT o.CustomerOrderId, o.OrderNumber FROM sales.CustomerOrders o) x";
  assert.deepEqual(at(derived, "x."), ["Code", "Id"]);
  const apply =
    "SELECT x. FROM dbo.Customers c CROSS APPLY (SELECT o.CustomerOrderId AS Id, o.OrderNumber AS Value FROM sales.CustomerOrders o UNION ALL SELECT ca.CustomerAddressId, ca.AddressLabel FROM dbo.CustomerAddresses ca) x";
  assert.deepEqual(at(apply, "x."), ["Id", "Value"]);
});

test("set-result CTEs and derived tables support SELECT star expansion", () => {
  const cte =
    "WITH X AS (SELECT c.CustomerId AS Id, c.CustomerCode AS Value FROM dbo.Customers c UNION ALL SELECT o.CustomerOrderId, o.OrderNumber FROM sales.CustomerOrders o) SELECT * FROM X";
  const cteExpansion = resolveSelectWildcard(
    cte,
    cte.lastIndexOf("*") + 1,
    scope,
  );
  assert.ok(cteExpansion);
  assert.deepEqual(wildcardColumnExpressions(cteExpansion), ["Id", "Value"]);
  const derived =
    "SELECT x.* FROM (SELECT c.CustomerId AS Id, c.CustomerCode AS Value FROM dbo.Customers c UNION SELECT b.BillingAddressId, b.BillingEmailAddress FROM billing.BillingAddresses b) x";
  const derivedExpansion = resolveSelectWildcard(
    derived,
    derived.indexOf("*") + 1,
    scope,
  );
  assert.ok(derivedExpansion);
  assert.deepEqual(wildcardColumnExpressions(derivedExpansion), [
    "x.Id",
    "x.Value",
  ]);
});

test("cross-database set branches retain local source identity", () => {
  const sql =
    "SELECT c.CustomerId AS Id FROM Lab.dbo.Customers c UNION ALL SELECT r. FROM Reporting.dbo.Customers r";
  const candidates = createCandidates(
    resolveSqlContext(sql, sql.indexOf("r.") + 2),
    scope,
  );
  assert.deepEqual(
    candidates.map((candidate) => candidate.name),
    ["CustomerId", "ReportingCustomerId"],
  );
  assert.ok(
    candidates.every((candidate) => candidate.database === "Reporting"),
  );
});

test("strings and comments do not create set expressions", () => {
  for (const sql of [
    "SELECT 'UNION SELECT fake'",
    "SELECT 1 -- UNION SELECT fake",
    "SELECT 1 /* EXCEPT SELECT fake */",
  ])
    assert.deepEqual(
      analyzeDocumentSemantics(sql, sql.length, scope).setQueryExpressions,
      [],
    );
});

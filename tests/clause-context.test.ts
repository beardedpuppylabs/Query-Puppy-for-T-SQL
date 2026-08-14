import assert from "node:assert/strict";
import test from "node:test";
import { createCandidates } from "../src/completion/CandidateFactory.js";
import { DatabaseIndex } from "../src/metadata/DatabaseIndex.js";
import {
  analyzeDocumentSemantics,
  resolveVisibleRowSource,
} from "../src/parser/DocumentSemanticAnalyzer.js";
import {
  classifyCompletionContext,
  completionDomainPolicy,
} from "../src/parser/CompletionContextClassifier.js";
import { resolveSqlContext } from "../src/parser/SqlContextResolver.js";

const column = (name: string, ordinal: number) => ({
  name,
  normalizedName: name.toLowerCase(),
  type: { name: "int" },
  nullable: false,
  ordinal,
});
const index = new DatabaseIndex({
  database: "Db",
  schemas: ["dbo", "sales"],
  loadedAt: 1,
  objects: [
    {
      schema: "dbo",
      name: "Customers",
      normalizedName: "customers",
      kind: "table",
      parameters: [],
      columns: [column("CustomerId", 1), column("EmailAddress", 2)],
    },
    {
      schema: "sales",
      name: "CustomerOrders",
      normalizedName: "customerorders",
      kind: "view",
      parameters: [],
      columns: [column("CustomerId", 1), column("OrderNumber", 2)],
    },
    {
      schema: "dbo",
      name: "GetRows",
      normalizedName: "getrows",
      kind: "tableValuedFunction",
      parameters: [],
      columns: [],
    },
    {
      schema: "dbo",
      name: "CalculateValue",
      normalizedName: "calculatevalue",
      kind: "scalarFunction",
      parameters: [],
      columns: [],
      returnType: { name: "int" },
    },
    {
      schema: "dbo",
      name: "RunReport",
      normalizedName: "runreport",
      kind: "procedure",
      parameters: [],
      columns: [],
    },
  ],
});
const scope = { activeDatabase: "Db", indexes: new Map([["db", index]]) };
const classify = (sql: string, cursor = sql.length) => {
  const semantics = analyzeDocumentSemantics(sql, cursor, scope);
  return classifyCompletionContext(sql, cursor, semantics);
};
const candidates = (sql: string, cursor = sql.length) =>
  createCandidates(resolveSqlContext(sql, cursor), scope).map(
    (item) => item.name,
  );

test("classifies SELECT, WHERE, GROUP BY, HAVING, ORDER BY, and incomplete clauses", () => {
  for (const [sql, clause] of [
    ["SELECT addr FROM dbo.Customers c", "select"],
    ["SELECT * FROM dbo.Customers c WHERE addr", "where"],
    ["SELECT * FROM dbo.Customers c GROUP BY addr", "groupBy"],
    ["SELECT CustomerId FROM dbo.Customers c HAVING addr", "having"],
    ["SELECT CustomerId FROM dbo.Customers c ORDER BY addr", "orderBy"],
  ] as const)
    assert.equal(classify(sql).clause, clause);
});

test("function arguments are most-specific and nested SELECT clauses win", () => {
  assert.equal(
    classify("SELECT dbo.CalculateValue(Email FROM dbo.Customers c").clause,
    "functionArgument",
  );
  assert.equal(
    classify("SELECT * FROM dbo.Customers c WHERE dbo.CalculateValue(Email")
      .clause,
    "functionArgument",
  );
  const nested =
    "SELECT * FROM dbo.Customers c WHERE EXISTS (SELECT Order FROM sales.CustomerOrders o)";
  assert.equal(
    classify(nested, nested.indexOf("Order FROM") + 5).clause,
    "select",
  );
});

test("JOIN ON exposes structured left/current-right context and excludes future joins", () => {
  const sql =
    "SELECT * FROM dbo.Customers c JOIN sales.CustomerOrders o ON o.CustomerId = c.CustomerId JOIN dbo.Customers future ON future.CustomerId = c.CustomerId";
  const cursor = sql.indexOf("o.CustomerId") + 2;
  const context = classify(sql, cursor);
  assert.equal(context.clause, "joinOn");
  assert.equal(context.join?.currentRightRowSource?.qualifier, "o");
  assert.deepEqual(
    context.join.leftVisibleRowSources.map((source) => source.qualifier),
    ["c"],
  );
  assert.equal(
    context.join.leftVisibleRowSources.some(
      (source) => source.qualifier === "future",
    ),
    false,
  );
});

test("JOIN explicit members use positional visibility across multiple ON clauses", () => {
  const sql =
    "SELECT * FROM dbo.Customers c JOIN sales.CustomerOrders o ON c. AND o. AND future. JOIN dbo.Customers future ON c. AND o. AND future.";
  const at = (needle: string, occurrence = 0) => {
    let start = -1;
    for (let index = 0; index <= occurrence; index++)
      start = sql.indexOf(needle, start + 1);
    return candidates(sql, start + needle.length);
  };
  assert.deepEqual(at("ON c."), ["CustomerId", "EmailAddress"]);
  assert.deepEqual(at("AND o."), ["CustomerId", "OrderNumber"]);
  assert.deepEqual(at("AND future."), []);
  assert.deepEqual(at("ON c.", 1), ["CustomerId", "EmailAddress"]);
  assert.deepEqual(at("AND o.", 1), ["CustomerId", "OrderNumber"]);
  assert.deepEqual(at("AND future.", 1), ["CustomerId", "EmailAddress"]);
});

test("expression policy excludes RowSources while FROM and EXEC retain their domains", () => {
  const sql = "SELECT  FROM dbo.Customers c";
  const cursor = "SELECT ".length;
  const domain = createCandidates(resolveSqlContext(sql, cursor), scope);
  assert.ok(domain.some((item) => item.name === "CustomerId"));
  assert.ok(domain.some((item) => item.name === "c"));
  assert.ok(domain.some((item) => item.name === "CalculateValue"));
  assert.ok(
    domain.every(
      (item) =>
        ![
          "table",
          "view",
          "tableValuedFunction",
          "procedure",
          "schema",
          "database",
        ].includes(item.kind),
    ),
  );
  assert.ok(candidates("SELECT * FROM cust").includes("Customers"));
  assert.ok(candidates("EXEC run").includes("RunReport"));
  const policy = completionDomainPolicy(classify(sql, cursor));
  assert.equal(policy.allowColumns, true);
  assert.equal(policy.allowRowSources, false);
});

test("projection aliases are peer/GROUP/HAVING-invisible and ORDER-BY-visible", () => {
  for (const sql of [
    "SELECT c.EmailAddress AS Contact, cont FROM dbo.Customers c",
    "SELECT c.EmailAddress AS Contact FROM dbo.Customers c GROUP BY cont",
    "SELECT c.EmailAddress AS Contact FROM dbo.Customers c HAVING cont",
  ])
    assert.equal(candidates(sql).includes("Contact"), false);
  const order =
    "SELECT c.EmailAddress AS Contact, c.CustomerId AS EntityId FROM dbo.Customers c ORDER BY cont";
  assert.deepEqual(candidates(order), ["Contact"]);
});

test("final set ORDER BY uses composed result and rejects branch members", () => {
  const sql =
    "SELECT c.CustomerId AS Id, c.EmailAddress AS Value FROM dbo.Customers c UNION ALL SELECT o.CustomerId AS WrongId, o.OrderNumber AS WrongValue FROM sales.CustomerOrders o ORDER BY val";
  assert.equal(candidates(sql)[0], "Value");
  assert.ok(candidates(sql).includes("CalculateValue"));
  const member = `${sql.slice(0, sql.lastIndexOf("val"))}o.`;
  assert.deepEqual(candidates(member), []);
});

test("comments and strings do not create clauses", () => {
  assert.equal(
    classify("SELECT 'WHERE fake', addr FROM dbo.Customers c").clause,
    "select",
  );
  assert.equal(
    classify("SELECT addr -- ORDER BY fake\nFROM dbo.Customers c").clause,
    "select",
  );
});

test("correlated expression candidates rank local before outer without alias leakage", () => {
  const sql =
    "SELECT * FROM dbo.Customers c WHERE EXISTS (SELECT customer FROM sales.CustomerOrders o WHERE customer)";
  const result = createCandidates(resolveSqlContext(sql), scope).filter(
    (item) => item.name === "CustomerId",
  );
  assert.deepEqual(
    result.map((item) => item.sourceQualifier),
    ["o", "c"],
  );
  const semantics = analyzeDocumentSemantics(sql, sql.length, scope);
  assert.equal(resolveVisibleRowSource(semantics, "o")?.scopeDistance, 0);
  assert.equal(resolveVisibleRowSource(semantics, "c")?.scopeDistance, 1);
});

test("UPDATE RHS uses expression candidates while SET targets remain writable", () => {
  const rhs = "UPDATE c SET CustomerId = addr FROM dbo.Customers c";
  assert.ok(candidates(rhs, rhs.indexOf("addr") + 4).includes("EmailAddress"));
  const target = "UPDATE c SET cust FROM dbo.Customers c";
  assert.deepEqual(candidates(target, target.indexOf("cust") + 4), [
    "CustomerId",
  ]);
});

import assert from "node:assert/strict";
import test from "node:test";
import { collectHighConfidenceDocumentIssues } from "../src/parser/DocumentSemanticDiagnostics.js";

test("cross-GO local-variable references produce one exact error", () => {
  const sql = "DECLARE @CustomerId int;\nGO\nSELECT @CustomerId;";
  const issues = collectHighConfidenceDocumentIssues(sql);
  const invalid = sql.lastIndexOf("@CustomerId");
  assert.deepEqual(issues, [
    {
      code: "QP1001",
      severity: "error",
      message:
        "Local variable '@CustomerId' is not available in this GO batch.",
      range: { start: invalid, end: invalid + "@CustomerId".length },
    },
  ]);
});

test("same-batch variables and current-batch redeclarations remain valid", () => {
  assert.deepEqual(
    collectHighConfidenceDocumentIssues(
      "DECLARE @CustomerId int;\nSELECT @CustomerId;",
    ),
    [],
  );
  assert.deepEqual(
    collectHighConfidenceDocumentIssues(
      "DECLARE @CustomerId int;\nGO\nDECLARE @CustomerId int;\nSELECT @CustomerId;",
    ),
    [],
  );
});

test("whole-document diagnostics retain every invalid batch-local reference in source order", () => {
  const sql = [
    "DECLARE @First int;",
    "GO",
    "SELECT @First;",
    "DECLARE @Second int;",
    "GO",
    "SELECT @Second;",
  ].join("\n");
  assert.deepEqual(
    collectHighConfidenceDocumentIssues(sql).map((issue) => ({
      code: issue.code,
      text: sql.slice(issue.range.start, issue.range.end),
      start: issue.range.start,
    })),
    [
      {
        code: "QP1001",
        text: "@First",
        start: sql.indexOf("@First", sql.indexOf("GO")),
      },
      {
        code: "QP1001",
        text: "@Second",
        start: sql.lastIndexOf("@Second"),
      },
    ],
  );
});

test("table variables retain the same GO batch boundary", () => {
  const sql = "DECLARE @Rows TABLE (Id int);\nGO\nSELECT * FROM @Rows;";
  const issues = collectHighConfidenceDocumentIssues(sql);
  assert.equal(issues.length, 1);
  const issue = issues[0];
  assert.ok(issue);
  assert.equal(issue.code, "QP1001");
  assert.equal(sql.slice(issue.range.start, issue.range.end), "@Rows");
});

test("only tokenizer-validated standalone GO separates variable scope", () => {
  assert.deepEqual(
    collectHighConfidenceDocumentIssues(
      'DECLARE @Value int;\nSELECT [go], "go", @Value;',
    ),
    [],
  );
});

test("module parameters, unresolved variables, and incomplete SQL fail closed", () => {
  assert.deepEqual(
    collectHighConfidenceDocumentIssues(
      "DECLARE @Value int;\nGO\nCREATE PROCEDURE p @Value int AS SELECT @Value;",
    ),
    [],
  );
  assert.deepEqual(
    collectHighConfidenceDocumentIssues(
      "SELECT @Unknown;\nSELECT c.\nWHERE c.Id =",
    ),
    [],
  );
});

test("use before a same-batch declaration remains deferred", () => {
  assert.deepEqual(
    collectHighConfidenceDocumentIssues(
      "DECLARE @Value int;\nGO\nSELECT @Value;\nDECLARE @Value int;",
    ),
    [],
  );
});

test("inner alias referenced from its outer scope produces one exact QP1002 error", () => {
  const sql = [
    "SELECT p.Id",
    "FROM dbo.Parent AS p",
    "WHERE EXISTS (",
    "    SELECT 1",
    "    FROM dbo.Child AS c",
    "    WHERE c.ParentId = p.Id",
    ")",
    "  AND c.Id > 0;",
  ].join("\n");
  const invalid = sql.lastIndexOf("c.Id");

  assert.deepEqual(collectHighConfidenceDocumentIssues(sql), [
    {
      code: "QP1002",
      severity: "error",
      message: "Row-source alias 'c' is not visible in this query scope.",
      range: { start: invalid, end: invalid + 1 },
    },
  ]);
});

test("each proven out-of-scope alias reference produces one issue", () => {
  const sql = [
    "SELECT p.Id",
    "FROM dbo.Parent AS p",
    "WHERE EXISTS (SELECT 1 FROM dbo.Child AS c)",
    "  AND c.Id > 0",
    "  AND c.ParentId = p.Id;",
  ].join("\n");
  const first = sql.indexOf("c.Id");
  const second = sql.indexOf("c.ParentId");

  assert.deepEqual(collectHighConfidenceDocumentIssues(sql), [
    {
      code: "QP1002",
      severity: "error",
      message: "Row-source alias 'c' is not visible in this query scope.",
      range: { start: first, end: first + 1 },
    },
    {
      code: "QP1002",
      severity: "error",
      message: "Row-source alias 'c' is not visible in this query scope.",
      range: { start: second, end: second + 1 },
    },
  ]);
});

test("unique aliases referenced across sibling and derived-table scopes produce QP1002", () => {
  const siblingSql = [
    "SELECT 1",
    "WHERE EXISTS (",
    "    SELECT 1",
    "    FROM dbo.TableA AS a",
    "    WHERE a.Id > 0",
    ")",
    "  AND EXISTS (",
    "    SELECT 1",
    "    FROM dbo.TableB AS b",
    "    WHERE a.Id = b.Id",
    ");",
  ].join("\n");
  const derivedSql = [
    "SELECT d.Id",
    "FROM (",
    "    SELECT i.Id",
    "    FROM dbo.InnerTable AS i",
    ") AS d",
    "WHERE i.Id > 0;",
  ].join("\n");

  for (const [sql, alias, reference] of [
    [siblingSql, "a", "a.Id ="],
    [derivedSql, "i", "i.Id >"],
  ] as const) {
    const invalid = sql.lastIndexOf(reference);
    assert.deepEqual(collectHighConfidenceDocumentIssues(sql), [
      {
        code: "QP1002",
        severity: "error",
        message: `Row-source alias '${alias}' is not visible in this query scope.`,
        range: { start: invalid, end: invalid + alias.length },
      },
    ]);
  }
});

test("visible correlation, shadowing, and APPLY left-side aliases remain valid", () => {
  const validSql = [
    [
      "SELECT p.Id",
      "FROM dbo.Parent AS p",
      "WHERE EXISTS (",
      "    SELECT 1",
      "    FROM dbo.Child AS c",
      "    WHERE c.ParentId = p.Id",
      ");",
    ].join("\n"),
    [
      "SELECT p.Id",
      "FROM dbo.Parent AS p",
      "WHERE EXISTS (",
      "    SELECT 1",
      "    FROM dbo.Child AS p",
      "    WHERE p.ParentId > 0",
      ");",
    ].join("\n"),
    [
      "SELECT a.Id, x.Value",
      "FROM dbo.TableA AS a",
      "CROSS APPLY (",
      "    SELECT a.Id AS Value",
      ") AS x;",
    ].join("\n"),
  ];

  for (const sql of validSql)
    assert.deepEqual(collectHighConfidenceDocumentIssues(sql), []);
});

test("unknown and physical qualifiers fail closed", () => {
  const sqlCases = [
    "SELECT mystery.Id\nFROM dbo.TableA AS a;",
    "SELECT dbo.TableA.Id\nFROM dbo.TableA AS a;",
    [
      "SELECT dbo.TableA.Id",
      "FROM (",
      "    SELECT 1",
      "    FROM dbo.OtherTable AS dbo",
      ") AS d;",
    ].join("\n"),
    [
      "SELECT dbo.CalculateValue()",
      "WHERE EXISTS (SELECT 1 FROM dbo.OtherTable AS dbo);",
    ].join("\n"),
  ];

  for (const sql of sqlCases)
    assert.deepEqual(collectHighConfidenceDocumentIssues(sql), []);
});

test("unrelated and ambiguous alias declarations fail closed", () => {
  const sqlCases = [
    "SELECT a.Id FROM dbo.TableA AS a;\nSELECT a.Id FROM dbo.TableB AS b;",
    "SELECT a.Id FROM dbo.TableA AS a;\nGO\nSELECT a.Id FROM dbo.TableB AS b;",
    [
      "SELECT 1",
      "WHERE EXISTS (SELECT 1 FROM dbo.TableA AS a)",
      "  AND EXISTS (SELECT 1 FROM dbo.TableB AS a)",
      "  AND a.Id > 0;",
    ].join("\n"),
    [
      "SELECT 1",
      "WHERE EXISTS (SELECT 1 FROM dbo.TableA AS a)",
      "  AND EXISTS (SELECT 1 FROM dbo.a)",
      "  AND a.Id > 0;",
    ].join("\n"),
  ];

  for (const sql of sqlCases)
    assert.deepEqual(collectHighConfidenceDocumentIssues(sql), []);
});

test("module bodies and positional APPLY references remain outside QP1002", () => {
  const sqlCases = [
    [
      "CREATE PROCEDURE dbo.Test AS",
      "SELECT p.Id",
      "FROM dbo.Parent AS p",
      "WHERE EXISTS (SELECT 1 FROM dbo.Child AS c)",
      "  AND c.Id > 0;",
    ].join("\n"),
    [
      "SELECT x.Value",
      "FROM dbo.TableA AS a",
      "CROSS APPLY (",
      "    SELECT b.Id AS Value",
      ") AS x",
      "JOIN dbo.TableB AS b ON b.Id = a.Id;",
    ].join("\n"),
  ];

  for (const sql of sqlCases)
    assert.deepEqual(collectHighConfidenceDocumentIssues(sql), []);
});

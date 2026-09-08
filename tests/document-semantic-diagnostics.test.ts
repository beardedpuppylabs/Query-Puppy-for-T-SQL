import assert from "node:assert/strict";
import test from "node:test";
import {
  collectHighConfidenceDocumentIssues,
  statementMayHaveDuplicateExplicitAliasIssue,
  statementMayHaveInvisibleAliasIssue,
} from "../src/parser/DocumentSemanticDiagnostics.js";
import { tokenizeSql } from "../src/parser/SqlTokenizer.js";
import { documentStatementTokenRanges } from "../src/parser/StatementBoundary.js";

test("QP1002 analysis skips ordinary statements but retains plausible candidates", () => {
  const candidateSql =
    "SELECT 1 WHERE EXISTS (SELECT 1 FROM dbo.Account AS a) AND a.Id > 0;";
  const ordinary = tokenizeSql(
    "SELECT a.Id FROM dbo.Account AS a WHERE a.Id > 0;",
  );
  const candidate = tokenizeSql(candidateSql);

  assert.equal(
    statementMayHaveInvisibleAliasIssue(
      ordinary,
      documentStatementTokenRanges(ordinary)[0]!,
    ),
    false,
  );
  assert.equal(
    statementMayHaveInvisibleAliasIssue(
      candidate,
      documentStatementTokenRanges(candidate)[0]!,
    ),
    true,
  );
  const invalid = candidateSql.lastIndexOf("a.Id");
  assert.deepEqual(collectHighConfidenceDocumentIssues(candidateSql), [
    {
      code: "QP1002",
      severity: "error",
      message: "Row-source alias 'a' is not visible in this query scope.",
      range: { start: invalid, end: invalid + 1 },
    },
  ]);
});

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

test("a later current-batch declaration does not suppress cross-GO evidence", () => {
  const sql = "DECLARE @Value int;\nGO\nSELECT @Value;\nDECLARE @Value int;";
  const invalid = sql.indexOf("@Value", sql.indexOf("GO"));

  assert.deepEqual(collectHighConfidenceDocumentIssues(sql), [
    {
      code: "QP1001",
      severity: "error",
      message: "Local variable '@Value' is not available in this GO batch.",
      range: { start: invalid, end: invalid + "@Value".length },
    },
  ]);
});

test("table-variable declarations become available only at their position", () => {
  const invalidSql = [
    "DECLARE @Rows TABLE (Id int);",
    "GO",
    "SELECT * FROM @Rows;",
    "DECLARE @Rows TABLE (Id int);",
  ].join("\n");
  const invalid = invalidSql.indexOf("@Rows", invalidSql.indexOf("GO"));
  assert.deepEqual(collectHighConfidenceDocumentIssues(invalidSql), [
    {
      code: "QP1001",
      severity: "error",
      message: "Local variable '@Rows' is not available in this GO batch.",
      range: { start: invalid, end: invalid + "@Rows".length },
    },
  ]);

  assert.deepEqual(
    collectHighConfidenceDocumentIssues(
      [
        "DECLARE @Rows TABLE (Id int);",
        "GO",
        "DECLARE @Rows TABLE (Id int);",
        "SELECT * FROM @Rows;",
      ].join("\n"),
    ),
    [],
  );
});

test("multiple declarations suppress only references at or after their positions", () => {
  const sql = [
    "DECLARE @First int, @Second int;",
    "GO",
    "SELECT @Second, @First;",
    "DECLARE @First int, @Second int;",
    "SELECT @Second, @First;",
  ].join("\n");
  const secondBatch = sql.indexOf("GO");
  const firstReference = sql.indexOf("@Second", secondBatch);
  const secondReference = sql.indexOf("@First", firstReference);

  assert.deepEqual(
    collectHighConfidenceDocumentIssues(sql).map((issue) => ({
      code: issue.code,
      text: sql.slice(issue.range.start, issue.range.end),
      start: issue.range.start,
    })),
    [
      { code: "QP1001", text: "@Second", start: firstReference },
      { code: "QP1001", text: "@First", start: secondReference },
    ],
  );
});

test("same-batch use before declaration without earlier GO evidence remains deferred", () => {
  assert.deepEqual(
    collectHighConfidenceDocumentIssues("SELECT @Value;\nDECLARE @Value int;"),
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

test("QP1003 reports duplicate explicit aliases with and without AS", () => {
  for (const sql of [
    "SELECT a.Id FROM dbo.Account AS a JOIN dbo.Address AS a ON a.Id = a.AccountId;",
    "SELECT a.Id FROM dbo.Account a JOIN dbo.Address a ON a.Id = a.AccountId;",
  ]) {
    const duplicate = sql.indexOf("a", sql.indexOf("JOIN"));
    assert.deepEqual(collectHighConfidenceDocumentIssues(sql), [
      {
        code: "QP1003",
        severity: "error",
        message:
          "Row-source alias 'a' is declared more than once in this query scope.",
        range: { start: duplicate, end: duplicate + 1 },
      },
    ]);
  }
});

test("QP1003 normalization preserves spelling and diagnoses every additional declaration", () => {
  const sql =
    "SELECT a.Id FROM dbo.First AS a JOIN dbo.Second AS A ON 1 = 1 JOIN dbo.Third AS [a] ON 1 = 1;";
  const second = sql.indexOf(" AS A") + " AS ".length;
  const third = sql.indexOf("[a]");

  assert.deepEqual(collectHighConfidenceDocumentIssues(sql), [
    {
      code: "QP1003",
      severity: "error",
      message:
        "Row-source alias 'A' is declared more than once in this query scope.",
      range: { start: second, end: second + 1 },
    },
    {
      code: "QP1003",
      severity: "error",
      message:
        "Row-source alias 'a' is declared more than once in this query scope.",
      range: { start: third, end: third + "[a]".length },
    },
  ]);
});

test("QP1003 reuses canonical bindings for physical, local, derived, CTE, and VALUES sources", () => {
  const sqlCases = [
    "SELECT a.Id FROM dbo.Account a JOIN (SELECT 1 AS Id) a ON 1 = 1;",
    "WITH cte AS (SELECT 1 AS Id) SELECT a.Id FROM dbo.Account a JOIN cte a ON 1 = 1;",
    "SELECT a.Id FROM #Rows AS a JOIN @Rows a ON 1 = 1;",
    "SELECT a.Id FROM (VALUES (1)) AS a(Id) JOIN dbo.Account a ON 1 = 1;",
  ];

  for (const sql of sqlCases) {
    const duplicate = sql.lastIndexOf(" a ");
    assert.deepEqual(collectHighConfidenceDocumentIssues(sql), [
      {
        code: "QP1003",
        severity: "error",
        message:
          "Row-source alias 'a' is declared more than once in this query scope.",
        range: { start: duplicate + 1, end: duplicate + 2 },
      },
    ]);
  }
});

test("QP1003 keeps nested, sibling, CTE, set-branch, statement, and batch scopes isolated", () => {
  const sqlCases = [
    "SELECT a.Id FROM dbo.OuterTable a WHERE EXISTS (SELECT 1 FROM dbo.InnerTable a);",
    "SELECT 1 WHERE EXISTS (SELECT 1 FROM dbo.First a) AND EXISTS (SELECT 1 FROM dbo.Second a);",
    "WITH first_cte AS (SELECT 1 FROM dbo.First a), second_cte AS (SELECT 1 FROM dbo.Second a) SELECT 1;",
    "SELECT a.Id FROM dbo.First a UNION ALL SELECT a.Id FROM dbo.Second a;",
    "SELECT a.Id FROM dbo.First a; SELECT a.Id FROM dbo.Second a;",
    "SELECT a.Id FROM dbo.First a\nGO\nSELECT a.Id FROM dbo.Second a;",
  ];

  for (const sql of sqlCases)
    assert.deepEqual(collectHighConfidenceDocumentIssues(sql), []);
});

test("QP1003 follows canonical APPLY ownership and visibility", () => {
  const duplicateSql =
    "SELECT a.Id FROM dbo.Account a CROSS APPLY (SELECT 1 AS Id) a;";
  const duplicate = duplicateSql.lastIndexOf(" a");
  assert.deepEqual(collectHighConfidenceDocumentIssues(duplicateSql), [
    {
      code: "QP1003",
      severity: "error",
      message:
        "Row-source alias 'a' is declared more than once in this query scope.",
      range: { start: duplicate + 1, end: duplicate + 2 },
    },
  ]);

  assert.deepEqual(
    collectHighConfidenceDocumentIssues(
      "SELECT a.Id FROM dbo.Account a CROSS APPLY (SELECT 1 FROM dbo.Address a) x;",
    ),
    [],
  );
});

test("QP1003 fails closed outside proven distinct explicit bindings", () => {
  const sqlCases = [
    "SELECT a.Id FROM dbo.a JOIN dbo.Other a ON 1 = 1;",
    "SELECT 1 AS a FROM dbo.Account a;",
    "SELECT unknown.Id FROM dbo.Account a JOIN dbo.Address b ON 1 = 1;",
    "SELECT a.Id FROM dbo.Account a JOIN dbo. AS a",
    "SELECT a.Id FROM dbo.Account a JOIN dbo.Address AS",
    "SELECT a.Id FROM dbo.Account a, dbo.Address a;",
    "CREATE PROCEDURE dbo.Test AS SELECT a.Id FROM dbo.Account a JOIN dbo.Address a ON 1 = 1;",
  ];

  for (const sql of sqlCases)
    assert.deepEqual(collectHighConfidenceDocumentIssues(sql), []);
});

test("QP1003 candidate gate retains a supported single-SELECT duplicate", () => {
  const sql =
    "SELECT a.Id FROM dbo.Account a JOIN dbo.Address a ON a.Id = a.AccountId;";
  const tokens = tokenizeSql(sql);
  const statement = documentStatementTokenRanges(tokens)[0]!;

  assert.equal(statementMayHaveInvisibleAliasIssue(tokens, statement), false);
  assert.equal(
    statementMayHaveDuplicateExplicitAliasIssue(tokens, statement),
    true,
  );
  assert.equal(collectHighConfidenceDocumentIssues(sql)[0]?.code, "QP1003");
});

test("QP1002 and QP1003 share one statement result without changing issue order", () => {
  const sql = [
    "SELECT a.Id",
    "FROM dbo.First a",
    "JOIN dbo.Second a ON 1 = 1",
    "WHERE EXISTS (SELECT 1 FROM dbo.Child c)",
    "  AND c.Id > 0;",
  ].join("\n");
  const duplicate = sql.indexOf("a", sql.indexOf("JOIN"));
  const invisible = sql.lastIndexOf("c.Id");

  assert.deepEqual(collectHighConfidenceDocumentIssues(sql), [
    {
      code: "QP1003",
      severity: "error",
      message:
        "Row-source alias 'a' is declared more than once in this query scope.",
      range: { start: duplicate, end: duplicate + 1 },
    },
    {
      code: "QP1002",
      severity: "error",
      message: "Row-source alias 'c' is not visible in this query scope.",
      range: { start: invisible, end: invisible + 1 },
    },
  ]);
});

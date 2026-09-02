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

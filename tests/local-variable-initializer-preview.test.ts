import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeDocumentSemantics,
  collectDocumentSemanticDeclarations,
} from "../src/parser/DocumentSemanticAnalyzer.js";
import {
  semanticSymbolAtOffset,
  type DocumentSemanticSymbol,
} from "../src/parser/DocumentSemanticSymbols.js";
import { resolveBatchLocalVariables } from "../src/parser/LocalVariableSymbols.js";
import { tokenizeSql } from "../src/parser/SqlTokenizer.js";
import {
  LOCAL_VARIABLE_INITIALIZER_PREVIEW_LIMIT,
  localVariableDocumentSymbolDetail,
} from "../src/navigation/DocumentSymbolPresentation.js";

const variables = (sql: string) =>
  resolveBatchLocalVariables(tokenizeSql(sql), sql.length);

const initializerText = (
  sql: string,
  variable: ReturnType<typeof variables>[number],
): string | undefined =>
  variable.initializer
    ? sql.slice(variable.initializer.start, variable.initializer.end)
    : undefined;

const scalarDeclaration = (sql: string): DocumentSemanticSymbol => {
  const declaration = collectDocumentSemanticDeclarations(sql).find(
    (symbol) => symbol.kind === "localVariable",
  );
  assert.ok(declaration);
  return declaration;
};

test("direct scalar literals retain exact initializer source ranges", () => {
  const cases = [
    ["DECLARE @x int = 42;", "42"],
    ["DECLARE @x int = -42;", "-42"],
    ["DECLARE @x decimal(10,2) = 12.50;", "12.50"],
    ["DECLARE @x varchar(20) = 'Alice';", "'Alice'"],
    ["DECLARE @x nvarchar(20) = N'Alice';", "N'Alice'"],
    ["DECLARE @x int = NULL;", "NULL"],
  ] as const;

  for (const [sql, expected] of cases) {
    const variable = variables(sql)[0];
    assert.ok(variable);
    assert.equal(initializerText(sql, variable), expected);
  }
});

test("compound and indirect initializer expressions fail closed", () => {
  for (const sql of [
    "DECLARE @x int = 20 + 22;",
    "DECLARE @x datetime = GETDATE();",
    "DECLARE @x int = @Other;",
    "DECLARE @x int = (SELECT 42);",
    "DECLARE @x int = (1);",
    "DECLARE @x int = + 42;",
  ]) {
    const variable = variables(sql)[0];
    assert.ok(variable);
    assert.equal(variable.initializer, undefined, sql);
  }
});

test("multiple declarations, comments, and formatting preserve literal ownership", () => {
  const sql = [
    "DECLARE @a int = /* before */ 1,",
    "        @b int =",
    "          2 /* after */,",
    "        @c int = 3 + 4;",
  ].join("\n");
  assert.deepEqual(
    variables(sql).map((variable) => [
      variable.name,
      initializerText(sql, variable),
    ]),
    [
      ["@a", "1"],
      ["@b", "2"],
      ["@c", undefined],
    ],
  );
});

test("table variables and multiline string literals have no scalar preview", () => {
  const tableSql = "DECLARE @Items TABLE (Id int);";
  const table = variables(tableSql)[0];
  assert.ok(table);
  assert.equal(table.kind, "table");
  assert.equal(table.initializer, undefined);

  const multilineSql = "DECLARE @x nvarchar(max) = N'first\nsecond';";
  const multiline = variables(multilineSql)[0];
  assert.ok(multiline);
  assert.equal(multiline.initializer, undefined);
});

test("declaration and reference occurrences share canonical initializer metadata", () => {
  const sql =
    "DECLARE @CustomerId int = 42; SET @CustomerId = 99; SELECT @CustomerId;";
  const declarationOffset = sql.indexOf("@CustomerId");
  const referenceOffset = sql.lastIndexOf("@CustomerId");
  const declaration = scalarDeclaration(sql);
  const model = collectDocumentSemanticDeclarations(sql);
  assert.equal(model.length, 1);

  const analyzed = analyzeDocumentSemantics(sql, sql.length);
  const declarationOccurrence = semanticSymbolAtOffset(
    analyzed.documentLocalSymbols,
    declarationOffset,
  );
  const referenceOccurrence = semanticSymbolAtOffset(
    analyzed.documentLocalSymbols,
    referenceOffset,
  );

  assert.ok(declarationOccurrence);
  assert.ok(referenceOccurrence);
  assert.equal(referenceOccurrence.symbol.id, declarationOccurrence.symbol.id);
  assert.deepEqual(
    referenceOccurrence.symbol.initializer,
    declarationOccurrence.symbol.initializer,
  );
  assert.deepEqual(referenceOccurrence.symbol.sqlType, { name: "int" });
  assert.equal(
    sql.slice(declaration.initializer?.start, declaration.initializer?.end),
    "42",
  );
});

test("local-variable detail truncates only over-limit literal previews", () => {
  const exactLiteral = `N'${"a".repeat(LOCAL_VARIABLE_INITIALIZER_PREVIEW_LIMIT - 3)}'`;
  assert.equal(exactLiteral.length, LOCAL_VARIABLE_INITIALIZER_PREVIEW_LIMIT);
  const exactSql = `DECLARE @x nvarchar(max) = ${exactLiteral};`;
  assert.equal(
    localVariableDocumentSymbolDetail(scalarDeclaration(exactSql), exactSql),
    `Local variable nvarchar(max) = ${exactLiteral}`,
  );

  const longLiteral = `N'${"b".repeat(LOCAL_VARIABLE_INITIALIZER_PREVIEW_LIMIT)}'`;
  const longSql = `DECLARE @x nvarchar(max) = ${longLiteral};`;
  const detail = localVariableDocumentSymbolDetail(
    scalarDeclaration(longSql),
    longSql,
  );
  const preview = detail.slice(detail.indexOf(" = ") + 3);
  assert.equal(preview.length, LOCAL_VARIABLE_INITIALIZER_PREVIEW_LIMIT);
  assert.equal(
    preview,
    `${longLiteral.slice(0, LOCAL_VARIABLE_INITIALIZER_PREVIEW_LIMIT - 1)}…`,
  );
  assert.equal(preview.includes("\n"), false);
});

test("declaration formatting is excluded from compact semantic detail", () => {
  const sql = "DECLARE @x int =\n  /* value */ 42;";
  assert.equal(
    localVariableDocumentSymbolDetail(scalarDeclaration(sql), sql),
    "Local variable int = 42",
  );
});

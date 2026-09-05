import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeDocumentSemantics,
  collectDocumentSemanticDeclarations,
} from "../src/parser/DocumentSemanticAnalyzer.js";
import { semanticSymbolAtOffset } from "../src/parser/DocumentSemanticSymbols.js";
import {
  localVariableDocumentSymbolDetail,
  localVariableSemanticDescription,
} from "../src/navigation/DocumentSymbolPresentation.js";

test("editor semantic descriptions include every supported literal initializer", () => {
  const sql = [
    "DECLARE @IntValue int = 42;",
    "DECLARE @NegativeValue int = -7;",
    "DECLARE @DecimalValue decimal(10,2) = 12.50;",
    "DECLARE @TextValue varchar(50) = 'Alice';",
    "DECLARE @UnicodeValue nvarchar(50) = N'ÄÖÜ Test';",
    "DECLARE @NullValue int = NULL;",
    "SELECT @IntValue, @NegativeValue, @DecimalValue, @TextValue, @UnicodeValue, @NullValue;",
  ].join("\n");
  const expected = [
    "local variable @IntValue int = 42",
    "local variable @NegativeValue int = -7",
    "local variable @DecimalValue decimal(10,2) = 12.50",
    "local variable @TextValue varchar(50) = 'Alice'",
    "local variable @UnicodeValue nvarchar(50) = N'ÄÖÜ Test'",
    "local variable @NullValue int = NULL",
  ];
  const declarations = collectDocumentSemanticDeclarations(sql);
  assert.deepEqual(
    declarations.map((symbol) => localVariableSemanticDescription(symbol, sql)),
    expected,
  );
  const model = analyzeDocumentSemantics(sql, sql.length);
  assert.deepEqual(
    declarations.map((symbol) => {
      const reference = semanticSymbolAtOffset(
        model.documentLocalSymbols,
        sql.lastIndexOf(symbol.name),
      );
      assert.ok(reference);
      return localVariableSemanticDescription(reference.symbol, sql);
    }),
    expected,
  );
});

test("editor semantic descriptions omit unsupported expression initializers", () => {
  const sql = [
    "DECLARE @ExpressionValue int = 20 + 22;",
    "DECLARE @FunctionValue datetime = GETDATE();",
    "SELECT @ExpressionValue, @FunctionValue;",
  ].join("\n");
  const expected = [
    "local variable @ExpressionValue int",
    "local variable @FunctionValue datetime",
  ];
  const declarations = collectDocumentSemanticDeclarations(sql);
  assert.deepEqual(
    declarations.map((symbol) => localVariableSemanticDescription(symbol, sql)),
    expected,
  );
  const model = analyzeDocumentSemantics(sql, sql.length);
  assert.deepEqual(
    declarations.map((symbol) => {
      const reference = semanticSymbolAtOffset(
        model.documentLocalSymbols,
        sql.lastIndexOf(symbol.name),
      );
      assert.ok(reference);
      return localVariableSemanticDescription(reference.symbol, sql);
    }),
    expected,
  );
});

test("declaration reference and Outline descriptions share one canonical suffix", () => {
  const sql = [
    "DECLARE @CustomerId int = 42;",
    "SET @CustomerId = 99;",
    "SELECT @CustomerId;",
  ].join("\n");
  const model = analyzeDocumentSemantics(sql, sql.length);
  const declaration = semanticSymbolAtOffset(
    model.documentLocalSymbols,
    sql.indexOf("@CustomerId"),
  );
  const reference = semanticSymbolAtOffset(
    model.documentLocalSymbols,
    sql.lastIndexOf("@CustomerId"),
  );
  assert.ok(declaration);
  assert.ok(reference);
  assert.equal(declaration.symbol.id, reference.symbol.id);
  assert.equal(
    localVariableSemanticDescription(declaration.symbol, sql),
    "local variable @CustomerId int = 42",
  );
  assert.equal(
    localVariableSemanticDescription(reference.symbol, sql),
    "local variable @CustomerId int = 42",
  );
  assert.equal(
    localVariableDocumentSymbolDetail(reference.symbol, sql),
    "Local variable int = 42",
  );
});

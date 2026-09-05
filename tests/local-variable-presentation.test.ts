import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeDocumentSemantics,
  collectDocumentSemanticDeclarations,
} from "../src/parser/DocumentSemanticAnalyzer.js";
import { semanticSymbolAtOffset } from "../src/parser/DocumentSemanticSymbols.js";
import {
  localVariableDocumentSymbolDetail,
  localVariableInitializerPreview,
} from "../src/navigation/DocumentSymbolPresentation.js";

const combinedSql = [
  "DECLARE @IntValue int = 42;",
  "DECLARE @NegativeValue int = -7;",
  "DECLARE @DecimalValue decimal(10, 2) = 12.50;",
  "DECLARE @TextValue varchar(50) = 'Alice';",
  "DECLARE @UnicodeValue nvarchar(50) = N'ÄÖÜ Test';",
  "DECLARE @NullValue int = NULL;",
  "",
  "DECLARE @ExpressionValue int = 20 + 22;",
  "DECLARE @FunctionValue datetime = GETDATE();",
  "",
  "SELECT",
  "    @IntValue,",
  "    @NegativeValue,",
  "    @DecimalValue,",
  "    @TextValue,",
  "    @UnicodeValue,",
  "    @NullValue,",
  "    @ExpressionValue,",
  "    @FunctionValue;",
].join("\n");

const expectedInitializers = new Map<string, string | undefined>([
  ["@IntValue", "42"],
  ["@NegativeValue", "-7"],
  ["@DecimalValue", "12.50"],
  ["@TextValue", "'Alice'"],
  ["@UnicodeValue", "N'ÄÖÜ Test'"],
  ["@NullValue", "NULL"],
  ["@ExpressionValue", undefined],
  ["@FunctionValue", undefined],
]);

test("contract: combined editor semantics retain canonical initializer metadata at declarations and references", () => {
  const sql = combinedSql;
  const declarations = collectDocumentSemanticDeclarations(sql);
  assert.equal(declarations.length, expectedInitializers.size);
  const model = analyzeDocumentSemantics(sql, sql.length);

  for (const declaration of declarations) {
    assert.ok(expectedInitializers.has(declaration.name));
    const expected = expectedInitializers.get(declaration.name);
    const declarationOccurrence = semanticSymbolAtOffset(
      model.documentLocalSymbols,
      sql.indexOf(declaration.name) + 1,
    );
    const referenceOccurrence = semanticSymbolAtOffset(
      model.documentLocalSymbols,
      sql.lastIndexOf(declaration.name) + 1,
    );
    assert.ok(declarationOccurrence);
    assert.ok(referenceOccurrence);
    assert.equal(declarationOccurrence.role, "declaration");
    assert.equal(referenceOccurrence.role, "reference");
    assert.equal(declarationOccurrence.symbol.id, declaration.id);
    assert.equal(referenceOccurrence.symbol.id, declaration.id);
    assert.deepEqual(
      referenceOccurrence.symbol.initializer,
      declaration.initializer,
    );
    assert.equal(
      localVariableInitializerPreview(declarationOccurrence.symbol, sql),
      expected,
    );
    assert.equal(
      localVariableInitializerPreview(referenceOccurrence.symbol, sql),
      expected,
    );
  }

  assert.deepEqual(
    declarations
      .filter((symbol) => symbol.initializer)
      .map((symbol) =>
        sql.slice(symbol.initializer?.start, symbol.initializer?.end),
      ),
    ["42", "-7", "12.50", "'Alice'", "N'ÄÖÜ Test'", "NULL"],
  );
  assert.deepEqual(
    declarations
      .filter((symbol) =>
        ["@ExpressionValue", "@FunctionValue"].includes(symbol.name),
      )
      .map((symbol) => symbol.initializer),
    [undefined, undefined],
  );
});

test("declaration reference and Outline share one canonical initializer preview", () => {
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
  assert.equal(localVariableInitializerPreview(declaration.symbol, sql), "42");
  assert.equal(localVariableInitializerPreview(reference.symbol, sql), "42");
  assert.equal(
    localVariableDocumentSymbolDetail(reference.symbol, sql),
    "Local variable int = 42",
  );
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeDocumentSemantics,
  type DocumentSemanticModel,
} from "../src/parser/DocumentSemanticAnalyzer.js";
import {
  semanticReferencesForSymbol,
  semanticSymbolAtOffset,
  type DocumentSemanticSymbol,
  type DocumentSemanticSymbolKind,
} from "../src/parser/DocumentSemanticSymbols.js";

const analyze = (sql: string, cursor = sql.length): DocumentSemanticModel =>
  analyzeDocumentSemantics(sql, cursor);

const findSymbol = (
  model: DocumentSemanticModel,
  kind: DocumentSemanticSymbolKind,
  name: string,
  occurrence = 0,
): DocumentSemanticSymbol => {
  const matches = model.documentLocalSymbols.symbols.filter(
    (symbol) => symbol.kind === kind && symbol.name === name,
  );
  const symbol = matches[occurrence];
  assert.ok(
    symbol,
    `missing ${kind} symbol ${name} at occurrence ${occurrence}`,
  );
  return symbol;
};

const rangeText = (
  sql: string,
  range: { readonly start: number; readonly end: number },
): string => sql.slice(range.start, range.end);

test("contract: CTE declarations and consuming references share semantic identity", () => {
  const sql =
    "WITH CustomerOrders AS (SELECT 1 AS Id) SELECT co.Id FROM CustomerOrders AS co";
  const model = analyze(sql);
  const cte = findSymbol(model, "cte", "CustomerOrders");
  const alias = findSymbol(model, "rowSourceAlias", "co");

  assert.equal(rangeText(sql, cte.declaration), "CustomerOrders");
  assert.deepEqual(
    semanticReferencesForSymbol(model.documentLocalSymbols, cte.id).map(
      (reference) => rangeText(sql, reference.range),
    ),
    ["CustomerOrders"],
  );
  assert.deepEqual(
    semanticReferencesForSymbol(model.documentLocalSymbols, alias.id).map(
      (reference) => rangeText(sql, reference.range),
    ),
    ["co"],
  );
  assert.equal(
    semanticSymbolAtOffset(
      model.documentLocalSymbols,
      sql.lastIndexOf("CustomerOrders") + 1,
    )?.symbol.id,
    cte.id,
  );
});

test("chained CTE references bind to their declaration in declaration order", () => {
  const sql =
    "WITH FirstCte AS (SELECT 1 AS Id), SecondCte AS (SELECT f.Id FROM FirstCte AS f) SELECT s.Id FROM SecondCte AS s";
  const model = analyze(sql);
  const first = findSymbol(model, "cte", "FirstCte");
  const second = findSymbol(model, "cte", "SecondCte");

  assert.deepEqual(
    semanticReferencesForSymbol(model.documentLocalSymbols, first.id).map(
      (reference) => rangeText(sql, reference.range),
    ),
    ["FirstCte"],
  );
  assert.deepEqual(
    semanticReferencesForSymbol(model.documentLocalSymbols, second.id).map(
      (reference) => rangeText(sql, reference.range),
    ),
    ["SecondCte"],
  );
  assert.notEqual(first.id, second.id);
});

test("an unaliased CTE qualifier remains the same local CTE symbol", () => {
  const sql = "WITH Orders AS (SELECT 1 AS Id) SELECT Orders.Id FROM Orders";
  const model = analyze(sql);
  const cte = findSymbol(model, "cte", "Orders");

  assert.deepEqual(
    semanticReferencesForSymbol(model.documentLocalSymbols, cte.id).map(
      (reference) => reference.range.start,
    ),
    [sql.indexOf("Orders.Id"), sql.lastIndexOf("Orders")],
  );
});

test("explicit RowSource alias declarations bind qualified references", () => {
  const sql = "SELECT o.Id FROM dbo.Orders AS o";
  const model = analyze(sql);
  const alias = findSymbol(model, "rowSourceAlias", "o");
  const referenceOffset = sql.indexOf("o.Id");

  assert.equal(rangeText(sql, alias.declaration), "o");
  assert.deepEqual(
    semanticReferencesForSymbol(model.documentLocalSymbols, alias.id).map(
      (reference) => rangeText(sql, reference.range),
    ),
    ["o"],
  );
  assert.deepEqual(
    semanticSymbolAtOffset(model.documentLocalSymbols, referenceOffset),
    {
      symbol: alias,
      range: { start: referenceOffset, end: referenceOffset + 1 },
      role: "reference",
    },
  );
});

test("nested aliases shadow outer aliases while outer references remain distinct", () => {
  const sql =
    "SELECT x.Id FROM dbo.OuterTable AS x WHERE EXISTS (SELECT x.Id FROM dbo.InnerTable AS x WHERE x.Id > 0) AND x.Id > 0";
  const model = analyze(sql);
  const outer = findSymbol(model, "rowSourceAlias", "x", 0);
  const inner = findSymbol(model, "rowSourceAlias", "x", 1);

  assert.notEqual(outer.id, inner.id);
  assert.deepEqual(
    semanticReferencesForSymbol(model.documentLocalSymbols, outer.id).map(
      (reference) => reference.range.start,
    ),
    [sql.indexOf("x.Id"), sql.lastIndexOf("x.Id")],
  );
  assert.deepEqual(
    semanticReferencesForSymbol(model.documentLocalSymbols, inner.id).map(
      (reference) => reference.range.start,
    ),
    [sql.indexOf("x.Id", sql.indexOf("EXISTS")), sql.indexOf("x.Id > 0")],
  );
});

test("an inner unaliased RowSource shadows an outer explicit alias", () => {
  const sql =
    "SELECT x.Id FROM dbo.OuterTable AS x WHERE EXISTS (SELECT x.Id FROM dbo.x)";
  const model = analyze(sql);
  const outer = findSymbol(model, "rowSourceAlias", "x");

  assert.deepEqual(
    semanticReferencesForSymbol(model.documentLocalSymbols, outer.id).map(
      (reference) => reference.range.start,
    ),
    [sql.indexOf("x.Id")],
  );
  assert.equal(
    semanticSymbolAtOffset(model.documentLocalSymbols, sql.lastIndexOf("x.Id")),
    undefined,
  );
});

test("correlated subqueries bind legal outer aliases", () => {
  const sql =
    "SELECT c.Id FROM dbo.Customers AS c WHERE EXISTS (SELECT 1 FROM dbo.Orders AS o WHERE o.CustomerId = c.Id)";
  const model = analyze(sql);
  const customer = findSymbol(model, "rowSourceAlias", "c");

  assert.deepEqual(
    semanticReferencesForSymbol(model.documentLocalSymbols, customer.id).map(
      (reference) => reference.range.start,
    ),
    [sql.indexOf("c.Id"), sql.lastIndexOf("c.Id")],
  );
});

test("derived-table and APPLY aliases reuse QueryScope binding", () => {
  const derived =
    "SELECT d.Id FROM (SELECT i.Id FROM dbo.InnerTable AS i) AS d";
  const derivedModel = analyze(derived);
  for (const name of ["d", "i"]) {
    const alias = findSymbol(derivedModel, "rowSourceAlias", name);
    assert.deepEqual(
      semanticReferencesForSymbol(
        derivedModel.documentLocalSymbols,
        alias.id,
      ).map((reference) => rangeText(derived, reference.range)),
      [name],
    );
  }

  const apply =
    "SELECT o.Id, f.Id FROM dbo.Orders AS o CROSS APPLY dbo.Func(o.Id) AS f";
  const applyModel = analyze(apply);
  const outer = findSymbol(applyModel, "rowSourceAlias", "o");
  const applied = findSymbol(applyModel, "rowSourceAlias", "f");
  assert.equal(
    semanticReferencesForSymbol(applyModel.documentLocalSymbols, outer.id)
      .length,
    2,
  );
  assert.equal(
    semanticReferencesForSymbol(applyModel.documentLocalSymbols, applied.id)
      .length,
    1,
  );
});

test("sibling query scopes do not leak alias bindings", () => {
  const sql =
    "SELECT * FROM dbo.A AS a WHERE EXISTS (SELECT b.Id FROM dbo.B AS b) AND EXISTS (SELECT b.Id FROM dbo.C AS c)";
  const model = analyze(sql);
  const siblingAlias = findSymbol(model, "rowSourceAlias", "b");
  const references = semanticReferencesForSymbol(
    model.documentLocalSymbols,
    siblingAlias.id,
  );

  assert.deepEqual(
    references.map((reference) => reference.range.start),
    [sql.indexOf("b.Id")],
  );
  assert.equal(
    semanticSymbolAtOffset(model.documentLocalSymbols, sql.lastIndexOf("b.Id")),
    undefined,
  );
});

test("scalar local declarations and references bind within one batch", () => {
  const sql = "DECLARE @CustomerId int; SELECT @CustomerId";
  const model = analyze(sql);
  const variable = findSymbol(model, "localVariable", "@CustomerId");

  assert.equal(rangeText(sql, variable.declaration), "@CustomerId");
  assert.deepEqual(
    semanticReferencesForSymbol(model.documentLocalSymbols, variable.id).map(
      (reference) => rangeText(sql, reference.range),
    ),
    ["@CustomerId"],
  );
});

test("a real GO boundary prevents variable binding across batches", () => {
  const sql = "DECLARE @CustomerId int;\nGO\nSELECT @CustomerId";
  const reference = sql.lastIndexOf("@CustomerId");
  const model = analyze(sql);

  assert.equal(
    model.documentLocalSymbols.symbols.some(
      (symbol) => symbol.name === "@CustomerId",
    ),
    false,
  );
  assert.equal(
    semanticSymbolAtOffset(model.documentLocalSymbols, reference),
    undefined,
  );
});

test("table-variable source and alias occurrences keep distinct identities", () => {
  const sql = "DECLARE @Orders TABLE (Id int); SELECT o.Id FROM @Orders AS o";
  const model = analyze(sql);
  const table = findSymbol(model, "tableVariable", "@Orders");
  const alias = findSymbol(model, "rowSourceAlias", "o");

  assert.notEqual(table.id, alias.id);
  assert.deepEqual(
    semanticReferencesForSymbol(model.documentLocalSymbols, table.id).map(
      (reference) => rangeText(sql, reference.range),
    ),
    ["@Orders"],
  );
  assert.deepEqual(
    semanticReferencesForSymbol(model.documentLocalSymbols, alias.id).map(
      (reference) => rangeText(sql, reference.range),
    ),
    ["o"],
  );
});

test("temporary-table source references bind to the local CREATE declaration", () => {
  const sql = "CREATE TABLE #Items (Id int); SELECT i.Id FROM #Items AS i";
  const model = analyze(sql);
  const temporaryTable = findSymbol(model, "temporaryTable", "#Items");

  assert.equal(rangeText(sql, temporaryTable.declaration), "#Items");
  assert.deepEqual(
    semanticReferencesForSymbol(
      model.documentLocalSymbols,
      temporaryTable.id,
    ).map((reference) => rangeText(sql, reference.range)),
    ["#Items"],
  );
});

test("unresolved and ambiguous qualifiers do not receive manufactured bindings", () => {
  const unresolved = "SELECT missing.Id FROM dbo.Orders AS o";
  const unresolvedModel = analyze(unresolved);
  assert.equal(
    semanticSymbolAtOffset(
      unresolvedModel.documentLocalSymbols,
      unresolved.indexOf("missing"),
    ),
    undefined,
  );

  const ambiguous =
    "SELECT x.Id FROM dbo.Orders AS x JOIN dbo.ArchivedOrders AS x ON 1 = 1";
  const ambiguousModel = analyze(ambiguous);
  assert.equal(
    ambiguousModel.documentLocalSymbols.symbols.filter(
      (symbol) =>
        symbol.kind === "rowSourceAlias" && symbol.normalizedName === "x",
    ).length,
    2,
  );
  assert.equal(
    semanticSymbolAtOffset(
      ambiguousModel.documentLocalSymbols,
      ambiguous.indexOf("x.Id"),
    ),
    undefined,
  );
});

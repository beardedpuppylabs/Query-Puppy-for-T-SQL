import assert from "node:assert/strict";
import test from "node:test";
import { createCandidates } from "../src/completion/CandidateFactory.js";
import { DatabaseIndex } from "../src/metadata/DatabaseIndex.js";
import { analyzeDocumentSemantics } from "../src/parser/DocumentSemanticAnalyzer.js";
import { resolveSqlContext } from "../src/parser/SqlContextResolver.js";

const index = new DatabaseIndex({
  database: "Db",
  schemas: ["dbo"],
  loadedAt: 0,
  objects: [
    {
      schema: "dbo",
      name: "Artikel",
      normalizedName: "artikel",
      kind: "table",
      parameters: [],
      columns: [
        {
          name: "Mandant",
          normalizedName: "mandant",
          type: { name: "int" },
          nullable: false,
          ordinal: 1,
        },
      ],
    },
  ],
});
const scope = { activeDatabase: "Db", indexes: new Map([["db", index]]) };

const candidates = (sql: string) => {
  const context = resolveSqlContext(sql);
  const semantics = analyzeDocumentSemantics(sql, sql.length, scope);
  return {
    context,
    semantics,
    candidates: createCandidates(context, scope, semantics),
  };
};

test("contract: batch scalar variables complete after @ with types and exact replacement", () => {
  const sql = `DECLARE
  @Mandant int = 1,
  @Aktiv bit = 1,
  @Artikelnummer varchar(50);
SELECT @`;
  const result = candidates(sql);
  assert.equal(result.context.replacementStart, sql.length - 1);
  assert.deepEqual(
    result.candidates
      .filter((candidate) => candidate.kind === "variable")
      .map((candidate) => [
        candidate.name,
        candidate.insertText,
        candidate.sqlType,
      ]),
    [
      ["@Aktiv", undefined, { name: "bit" }],
      ["@Artikelnummer", undefined, { name: "varchar", maxLength: 50 }],
      ["@Mandant", undefined, { name: "int" }],
    ],
  );
});

test("variable Contains matching, no initializer, and no-semicolon lifetime are deterministic", () => {
  const noInitializer = candidates(
    "DECLARE @Mandant int\nSELECT * FROM dbo.Artikel WHERE Mandant = @Man",
  );
  assert.deepEqual(
    noInitializer.candidates.map((candidate) => candidate.name),
    ["@Mandant"],
  );
  assert.equal(
    noInitializer.context.replacementStart,
    noInitializer.context.cursor - 4,
  );
});

test("semicolon preserves batch variables while GO resets them", () => {
  assert.deepEqual(
    candidates("DECLARE @Mandant int; SELECT @").candidates.map(
      (candidate) => candidate.name,
    ),
    ["@Mandant"],
  );
  assert.equal(
    candidates("DECLARE @Mandant int;\nGO\nSELECT @").candidates.some(
      (candidate) => candidate.name === "@Mandant",
    ),
    false,
  );
  for (const identifier of ["[go]", '"go"'])
    assert.equal(
      candidates(
        `DECLARE @Mandant int; SELECT ${identifier} FROM dbo.Artikel; SELECT @`,
      ).candidates.some((candidate) => candidate.name === "@Mandant"),
      true,
    );
});

test("variables remain batch-visible in nested queries and coexist with alias columns", () => {
  const sql =
    "DECLARE @Mandant int; SELECT * FROM dbo.Artikel AS a WHERE EXISTS (SELECT 1 WHERE a.Mandant = @)";
  const result = candidates(sql);
  assert.equal(
    result.candidates.some(
      (candidate) =>
        candidate.kind === "variable" && candidate.name === "@Mandant",
    ),
    true,
  );
  const columnSql =
    "DECLARE @Mandant int; SELECT * FROM dbo.Artikel AS a WHERE ";
  assert.equal(
    candidates(columnSql).candidates.find(
      (candidate) => candidate.name === "Mandant",
    )?.insertText,
    "a.Mandant",
  );
});

test("table variables remain RowSources and never become scalar variable candidates", () => {
  const expression = candidates(
    "DECLARE @Items TABLE (Artikelnummer varchar(50), Menge int); SELECT @",
  );
  assert.equal(
    expression.candidates.some(
      (candidate) =>
        candidate.kind === "variable" && candidate.name === "@Items",
    ),
    false,
  );
  const from = candidates(
    "DECLARE @Items TABLE (Artikelnummer varchar(50), Menge int); SELECT * FROM @I",
  );
  assert.equal(
    from.candidates.some(
      (candidate) =>
        candidate.kind === "tableVariable" && candidate.name === "@Items",
    ),
    true,
  );
  assert.equal(
    candidates("SELECT * FROM @Man").candidates.some(
      (candidate) => candidate.kind === "variable",
    ),
    false,
  );
});

test("SET text never invents an undeclared variable", () => {
  assert.equal(
    candidates("SET @Foo = 1; SELECT @F").candidates.some(
      (candidate) => candidate.kind === "variable",
    ),
    false,
  );
});

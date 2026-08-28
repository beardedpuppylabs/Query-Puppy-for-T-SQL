import assert from "node:assert/strict";
import test from "node:test";
import { createCandidates } from "../src/completion/CandidateFactory.js";
import { DatabaseIndex } from "../src/metadata/DatabaseIndex.js";
import { analyzeDocumentSemantics } from "../src/parser/DocumentSemanticAnalyzer.js";
import { resolveSqlContext } from "../src/parser/SqlContextResolver.js";
import { tokenizeSql } from "../src/parser/SqlTokenizer.js";
import { statementTokenRangeAtCursor } from "../src/parser/StatementBoundary.js";

const columns = [
  {
    name: "Id",
    normalizedName: "id",
    type: { name: "int" },
    nullable: false,
    ordinal: 1,
  },
];
const index = new DatabaseIndex({
  database: "Db",
  schemas: ["dbo"],
  loadedAt: 0,
  objects: ["Artikel", "Kunden", "Ziel"].map((name) => ({
    schema: "dbo",
    name,
    normalizedName: name.toLocaleLowerCase("en-US"),
    kind: "table" as const,
    columns,
    parameters: [],
  })),
});
const scope = { activeDatabase: "Db", indexes: new Map([["db", index]]) };

const currentStatement = (sql: string): string => {
  const tokens = tokenizeSql(sql);
  const range = statementTokenRangeAtCursor(tokens, sql.length);
  return sql.slice(
    tokens[range.start]?.start ?? 0,
    tokens[range.end]?.start ?? sql.length,
  );
};

const domain = (sql: string) => {
  const context = resolveSqlContext(sql);
  const semantics = analyzeDocumentSemantics(sql, sql.length, scope);
  return {
    context,
    semantics,
    candidates: createCandidates(context, scope, semantics),
  };
};

test("contract: independent DML and query statements own separate semantic ranges", () => {
  const select = "SELECT * FROM dbo.Artikel AS stale";
  for (const sql of [
    `${select}\nUPDATE dbo.Artikel SET `,
    `${select}\nDELETE FROM `,
    `${select}\nINSERT INTO `,
    `${select}\nEXEC `,
    "UPDATE dbo.Artikel SET Id = 1\nSELECT * FROM ",
    "DELETE FROM dbo.Artikel\nSELECT * FROM ",
  ]) {
    const result = domain(sql);
    assert.equal(result.semantics.aliases.has("stale"), false);
    assert.equal(
      result.candidates.some(
        (candidate) =>
          candidate.kind === "rowSourceAlias" && candidate.name === "stale",
      ),
      false,
    );
  }
  assert.equal(
    domain(`${select}\nUPDATE dbo.Artikel SET `).context.kind,
    "expression",
  );
  assert.equal(domain(`${select}\nDELETE FROM `).context.kind, "dmlTarget");
  assert.equal(domain(`${select}\nINSERT INTO `).context.kind, "dmlTarget");
  assert.equal(domain(`${select}\nEXEC `).context.kind, "execute");
  assert.equal(
    domain("UPDATE dbo.Artikel SET Id = 1\nSELECT * FROM ").context.kind,
    "rowSource",
  );
});

test("INSERT SELECT, CTE consumers, set branches, and nested SELECTs remain one statement", () => {
  const insertSelect = "INSERT INTO dbo.Ziel (Id)\nSELECT Id FROM dbo.Artikel";
  assert.equal(currentStatement(insertSelect), insertSelect);

  const insertValuesThenSelect =
    "INSERT INTO dbo.Ziel (Id) VALUES (1)\nSELECT * FROM dbo.Artikel";
  assert.equal(
    currentStatement(insertValuesThenSelect),
    "SELECT * FROM dbo.Artikel",
  );

  const insertExec = "INSERT INTO dbo.Ziel EXEC dbo.LoadZiel";
  assert.equal(currentStatement(insertExec), insertExec);

  assert.equal(
    currentStatement("EXEC dbo.DoWork\nSELECT * FROM dbo.Artikel"),
    "SELECT * FROM dbo.Artikel",
  );

  const cte = "WITH x AS (SELECT Id FROM dbo.Artikel) SELECT * FROM x";
  assert.equal(currentStatement(cte), cte);

  for (const operator of ["UNION", "INTERSECT", "EXCEPT"]) {
    const sql = `SELECT Id FROM dbo.Artikel ${operator} SELECT Id FROM dbo.Kunden`;
    assert.equal(currentStatement(sql), sql);
  }

  const correlated =
    "SELECT * FROM dbo.Artikel a WHERE EXISTS (SELECT 1 FROM dbo.Kunden k WHERE k.Id = a.Id)";
  assert.equal(currentStatement(correlated), correlated);
  const semantics = analyzeDocumentSemantics(
    correlated,
    correlated.indexOf("a.Id") + 2,
    scope,
  );
  assert.equal(
    semantics.visibleRowSources.some(
      (binding) => binding.qualifier === "a" && binding.outer,
    ),
    true,
  );

  const merge =
    "MERGE dbo.Ziel AS z USING dbo.Artikel AS a ON a.Id = z.Id WHEN MATCHED THEN UPDATE SET z.Id = a.Id WHEN NOT MATCHED THEN INSERT (Id) VALUES (a.Id);";
  const mergeBeforeTerminator = merge.slice(0, -1);
  assert.equal(currentStatement(mergeBeforeTerminator), mergeBeforeTerminator);
});

test("contract: only standalone tokenizer GO tokens split a client batch", () => {
  const separated = tokenizeSql("DECLARE @x int = 1;\nGO -- batch\nSELECT @x");
  assert.equal(
    separated.filter((token) => token.kind === "batchSeparator").length,
    1,
  );
  for (const sql of [
    "SELECT [go] FROM dbo.Artikel",
    'SELECT "go" FROM dbo.Artikel',
    "SELECT go FROM dbo.Artikel",
  ])
    assert.equal(
      tokenizeSql(sql).some((token) => token.kind === "batchSeparator"),
      false,
    );
});

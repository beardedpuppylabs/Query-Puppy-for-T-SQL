import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import {
  prepareFormattingDocument,
  selectExactFormattingUnit,
} from "../src/formatting/FormattingPreparation.js";
import { scanFormattingSql } from "../src/formatting/LosslessSqlScanner.js";
import { validateFormattingOutput } from "../src/formatting/OutputPreservationGuard.js";

const fixture = (name: string): Promise<string> =>
  readFile(resolve("tests", "fixtures", "formatting", name), "utf8");

test("lossless formatting scanner preserves raw UTF-16 source and protected text", () => {
  const sql =
    "SELECT N'a''😀', [x]]y], \"q\"\"z\", @p, @@ROWCOUNT, #t, ##g, ?, 0xAF, 1.2, 3e-2, .5 -- exact\n/* outer /* inner */ done */ FROM élève;";
  const result = scanFormattingSql(sql);
  assert.equal(result.ok, true);
  assert.equal(result.tokens.map((token) => token.text).join(""), sql);
  const variable = result.tokens.find((token) => token.text === "@p");
  assert.deepEqual(variable && { start: variable.start, end: variable.end }, {
    start: sql.indexOf("@p"),
    end: sql.indexOf("@p") + 2,
  });
  assert.deepEqual(
    result.tokens.filter((token) => token.protected).map((token) => token.text),
    [
      "N'a''😀'",
      "[x]]y]",
      '"q""z"',
      "-- exact",
      "/* outer /* inner */ done */",
    ],
  );
});

test("scanner declines unterminated and unsupported lexical forms", () => {
  const cases = new Map([
    ["SELECT 'x", "unterminated string literal"],
    ["SELECT [x", "unterminated bracketed identifier"],
    ['SELECT "x', "unterminated double-quoted identifier"],
    ["SELECT /* x", "unterminated block comment"],
    ["SELECT 0x", "malformed hexadecimal literal"],
    ["SELECT 1e+", "malformed numeric exponent"],
    ["SELECT `x`", "unsupported lexical character"],
    ["SELECT {x}", "unsupported lexical character"],
    ["SELECT ]", "unsupported lexical character"],
  ]);
  for (const [sql, reason] of cases) {
    const result = scanFormattingSql(sql);
    assert.equal(result.ok, false, sql);
    assert.match(result.error.reason, new RegExp(reason));
  }
});

test("ordinary SELECT, CTE, JOIN, APPLY and common DML become exact supported units", async () => {
  const source = await fixture("ordinary.sql");
  const result = prepareFormattingDocument(source);
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.units.map((unit) => unit.kind),
    ["select", "cte", "insert", "update", "delete"],
  );
  assert.equal(result.declined.length, 0);
  assert.equal(result.units.map((unit) => unit.text).join("\n") + "\n", source);
  assert.ok(result.units.every((unit) => unit.terminalSemicolon));
});

test("GO separators, repeat counts, comments and final newline remain exact", async () => {
  const source = await fixture("batches-lf.sql");
  const result = prepareFormattingDocument(source);
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.separators.map((separator) => ({
      text: separator.text,
      repeatCount: separator.repeatCount,
    })),
    [
      { text: "GO\n", repeatCount: 1 },
      { text: "  GO 3 -- repeat exactly\n", repeatCount: 3 },
      { text: "GO /* final delimiter */\n", repeatCount: 1 },
    ],
  );
  assert.equal(result.separators.at(-1)?.range.end, source.length);
  assert.deepEqual(
    result.units.map((unit) => unit.kind),
    ["select", "update", "delete"],
  );
});

test("GO in protected text and identifiers is never a separator", () => {
  const source = [
    "SELECT N'line one\nGO\nline three', [go], \"go\";",
    "/* GO 3 */",
    "SELECT go FROM dbo.T;",
  ].join("\n");
  const result = prepareFormattingDocument(source);
  assert.equal(result.ok, true);
  assert.equal(result.separators.length, 0);
  assert.equal(result.units.length, 2);
});

test("unsupported GO forms decline the document instead of becoming SQL", () => {
  for (const separator of ["GO 0", "GO -1", "GO x", "GO 2 extra", "GO;"]) {
    const result = prepareFormattingDocument(
      `SELECT 1;\n${separator}\nSELECT 2;`,
    );
    assert.equal(result.ok, false, separator);
    assert.match(result.reason, /unsupported GO/);
  }
});

test("a multiline trailing GO comment cannot split a protected token", () => {
  const source = "SELECT 1;\nGO /* comment\ncontinues */\nSELECT 2;";
  const result = prepareFormattingDocument(source);
  assert.deepEqual(result, {
    ok: false,
    source,
    offset: source.indexOf("/*"),
    reason: "unsupported multiline GO separator comment",
  });
});

test("CRLF, nested comments, quoted identifiers, strings and operators round-trip", async () => {
  const source = await fixture("protected-crlf.sql");
  assert.equal(/(^|[^\r])\n/.test(source), false);
  const result = prepareFormattingDocument(source);
  assert.equal(result.ok, true);
  assert.equal(result.tokens.map((token) => token.text).join(""), source);
  assert.equal(result.units.length, 1);
  assert.equal(result.units[0]?.text.endsWith(";"), true);
});

test("procedural/module batches and MERGE remain explicitly declined", async () => {
  const source = await fixture("unsupported.sql");
  const result = prepareFormattingDocument(source);
  assert.equal(result.ok, true);
  assert.equal(result.units.length, 0);
  assert.deepEqual(
    result.declined.map((region) => region.reason),
    [
      "unsupported procedural or module batch starting with CREATE",
      "unsupported top-level MERGE",
      "unsupported top-level DECLARE",
      "unsupported top-level EXEC",
    ],
  );
});

test("supported units are retained around an explicitly declined neighbor", () => {
  const source = [
    "SELECT 1 AS Before;",
    "MERGE dbo.T AS t USING dbo.S AS s ON s.Id=t.Id WHEN MATCHED THEN UPDATE SET t.Value=s.Value;",
    "UPDATE dbo.T SET Value=@value OUTPUT inserted.Id WHERE Id=@id;",
  ].join("\n");
  const result = prepareFormattingDocument(source);
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.units.map((unit) => unit.kind),
    ["select", "update"],
  );
  assert.deepEqual(
    result.declined.map((region) => region.reason),
    ["unsupported top-level MERGE"],
  );
  assert.equal(result.declined[0]?.text.startsWith("MERGE"), true);
});

test("SQLCMD, template placeholders and malformed nesting fail closed", () => {
  const cases = new Map([
    [":setvar DatabaseName TestDb\nSELECT 1;", "SQLCMD command region"],
    ["!! dir\nSELECT 1;", "SQLCMD shell command region"],
    ["SELECT * FROM $(DatabaseName).dbo.T;", "template placeholder region"],
    ["SELECT (1;", "unbalanced parenthesis"],
    ["SELECT 1);", "unbalanced closing parenthesis"],
  ]);
  for (const [source, reason] of cases) {
    const result = prepareFormattingDocument(source);
    assert.equal(result.ok, false, source);
    assert.equal(result.reason, reason);
  }

  for (const protectedSource of [
    "SELECT N':setvar X Y';",
    "SELECT N'$(DatabaseName)';",
    "SELECT N'!! dir';",
    "SELECT 1 /* :setvar X Y $(Z) */;",
  ])
    assert.equal(prepareFormattingDocument(protectedSource).ok, true);
});

test("incomplete and semicolon-less adjacent statements are declined", () => {
  const cases = [
    "SELECT CASE WHEN Active=1 THEN Name FROM dbo.T;",
    "SELECT * FROM dbo.T WHERE Id =",
    "WITH x AS (SELECT 1 AS Id)",
    "INSERT INTO dbo.T(Id)",
    "INSERT INTO dbo.T(Id) DEFAULT",
    "UPDATE dbo.T WHERE Id=1",
    "SELECT 1 AS First\nSELECT 2 AS Second",
  ];
  for (const source of cases) {
    const result = prepareFormattingDocument(source);
    assert.equal(result.ok, true, source);
    assert.equal(result.units.length, 0, source);
    assert.equal(result.declined.length, 1, source);
  }
});

test("a later procedural/module start declines the remainder of its batch", () => {
  const source = [
    "SELECT 0 AS SafeBefore;",
    "CREATE PROCEDURE dbo.p AS SELECT 1;",
    "SELECT 2 AS StillModuleBody;",
  ].join("\n");
  const result = prepareFormattingDocument(source);
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.units.map((unit) => unit.text),
    ["SELECT 0 AS SafeBefore;"],
  );
  assert.equal(result.declined.length, 1);
  assert.equal(
    result.declined[0]?.text,
    source.slice(source.indexOf("CREATE")),
  );
});

test("table hints, INSERT SELECT and set operations remain one supported unit", () => {
  for (const source of [
    "SELECT * FROM dbo.T WITH (NOLOCK);",
    "INSERT INTO dbo.T(Id) SELECT Id FROM dbo.S;",
    "WITH x AS (SELECT Id FROM dbo.T) UPDATE x SET Id=2;",
    "SELECT Id FROM dbo.A UNION ALL SELECT Id FROM dbo.B;",
  ]) {
    const result = prepareFormattingDocument(source);
    assert.equal(result.ok, true, source);
    assert.equal(result.units.length, 1, source);
    assert.equal(result.declined.length, 0, source);
  }
});

test("mandatory nested SELECT range is declined without changing source", async () => {
  const source = await fixture("unsafe-nested-selection.sql");
  const result = prepareFormattingDocument(source);
  assert.equal(result.ok, true);
  const nested = "SELECT Id,Name FROM dbo.T WHERE Active=1";
  const start = source.indexOf(nested);
  const selection = selectExactFormattingUnit(result, {
    start,
    end: start + nested.length,
  });
  assert.deepEqual(selection, {
    ok: false,
    reason:
      "range is not exactly one complete supported top-level formatting unit",
  });
  assert.equal(source, await fixture("unsafe-nested-selection.sql"));
});

test("exact complete range selects one unit and leaves outside bytes addressable", async () => {
  const source = await fixture("unsafe-nested-selection.sql");
  const preparation = prepareFormattingDocument(source);
  assert.equal(preparation.ok, true);
  const unit = preparation.units[1];
  assert.ok(unit);
  const selection = selectExactFormattingUnit(preparation, unit.range);
  assert.equal(selection.ok, true);
  const candidate = selection.unit.text.replaceAll(" ", "\n");
  const guard = validateFormattingOutput(selection.unit.text, candidate);
  assert.deepEqual(guard, { ok: true });
  const replaced =
    source.slice(0, unit.range.start) +
    candidate +
    source.slice(unit.range.end);
  assert.equal(
    replaced.slice(0, unit.range.start),
    source.slice(0, unit.range.start),
  );
  assert.equal(
    replaced.slice(unit.range.start + candidate.length),
    source.slice(unit.range.end),
  );
});

test("output guard accepts whitespace-only layout changes", () => {
  const original = "SELECT a.Id,b.Name FROM dbo.Accounts AS a WHERE a.Id>=@id;";
  const candidate =
    "SELECT\n  a.Id,\n  b.Name\nFROM dbo.Accounts AS a\nWHERE a.Id >= @id;";
  assert.deepEqual(validateFormattingOutput(original, candidate), { ok: true });
});

test("output guard rejects token, spelling, casing and terminator changes", () => {
  const original =
    "SELECT a.Id,b.Name FROM dbo.Accounts AS a OUTER APPLY (SELECT 1 AS X) AS x WHERE a.Id>=@id;";
  for (const candidate of [
    original.replace("OUTER ", ""),
    `${original.slice(0, -1)} OPTION (RECOMPILE);`,
    original.replace("a.Id,b.Name", "b.Name,a.Id"),
    original.replace("Accounts", "ACCOUNTS"),
    original.replace("SELECT", "select"),
    original.slice(0, -1),
    original.replace(">", "> ="),
  ])
    assert.equal(validateFormattingOutput(original, candidate).ok, false);
});

test("output guard rejects token merging, splitting and comment movement", () => {
  const cases = [
    ["SELECT alpha beta;", "SELECT alphabeta;"],
    ["SELECT N'value';", "SELECT N 'value';"],
    ["SELECT a>=b;", "SELECT a > = b;"],
    ["SELECT a -- exact\nFROM dbo.T;", "SELECT a\n-- exact\nFROM dbo.T;"],
    ["SELECT a/* exact */FROM dbo.T;", "SELECT a\n/* exact */\nFROM dbo.T;"],
    ["SELECT a -- exact\nFROM dbo.T;", "SELECT a -- exact FROM dbo.T;"],
  ];
  for (const [original, candidate] of cases)
    assert.equal(
      validateFormattingOutput(original ?? "", candidate ?? "").ok,
      false,
    );
});

test("output guard preserves unit-edge whitespace protecting outside trivia", () => {
  assert.deepEqual(validateFormattingOutput("SELECT 1", "SELECT\n1\n"), {
    ok: false,
    reason: "unit boundary whitespace changed",
  });
  assert.deepEqual(validateFormattingOutput("SELECT 1", " SELECT\n1"), {
    ok: false,
    reason: "unit boundary whitespace changed",
  });
});

test("large deterministic preparation reconstructs source and reports every unit", () => {
  const statement =
    "SELECT a.Id,a.Name FROM dbo.Accounts AS a WHERE a.Id>=@minimum ORDER BY a.Name;\n";
  let source = "";
  while (source.length < 300 * 1024) source += statement;
  const result = prepareFormattingDocument(source);
  assert.equal(result.ok, true);
  assert.equal(result.tokens.map((token) => token.text).join(""), source);
  assert.equal(result.units.length, source.length / statement.length);
  assert.equal(result.declined.length, 0);
});

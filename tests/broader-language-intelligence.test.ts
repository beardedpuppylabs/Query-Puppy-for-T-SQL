import assert from "node:assert/strict";
import test from "node:test";
import {
  createCandidates,
  type CompletionScope,
} from "../src/completion/CandidateFactory.js";
import { DatabaseIndex } from "../src/metadata/DatabaseIndex.js";
import {
  DATEPART_VALUES,
  findBuiltinFunction,
} from "../src/parser/BuiltinFunctionCatalog.js";
import {
  callableSignatureLabel,
  resolveCallableAtCursor,
} from "../src/parser/CallableAnalyzer.js";
import { classifyCompletionContext } from "../src/parser/CompletionContextClassifier.js";
import { analyzeDocumentSemantics } from "../src/parser/DocumentSemanticAnalyzer.js";
import { inferExpressionType } from "../src/parser/SqlTypeInference.js";
import { resolveSqlContext } from "../src/parser/SqlContextResolver.js";

const index = new DatabaseIndex({
  database: "Db",
  schemas: ["dbo"],
  loadedAt: 0,
  objects: [
    {
      schema: "dbo",
      name: "Metrics",
      normalizedName: "metrics",
      kind: "table",
      parameters: [],
      columns: [
        {
          name: "BigCount",
          normalizedName: "bigcount",
          type: { name: "bigint" },
          nullable: false,
          ordinal: 1,
        },
        {
          name: "Count",
          normalizedName: "count",
          type: { name: "int" },
          nullable: false,
          ordinal: 2,
        },
        {
          name: "Amount",
          normalizedName: "amount",
          type: { name: "decimal", precision: 18, scale: 4 },
          nullable: true,
          ordinal: 3,
        },
        {
          name: "CreatedAt",
          normalizedName: "createdat",
          type: { name: "datetime2", scale: 3 },
          nullable: false,
          ordinal: 4,
        },
        {
          name: "Name",
          normalizedName: "name",
          type: { name: "nvarchar", maxLength: 200 },
          nullable: true,
          ordinal: 5,
        },
        {
          name: "Code",
          normalizedName: "code",
          type: { name: "varchar", maxLength: 50 },
          nullable: false,
          ordinal: 6,
        },
        {
          name: "ExternalKey",
          normalizedName: "externalkey",
          type: { name: "uniqueidentifier" },
          nullable: true,
          ordinal: 7,
        },
      ],
    },
    {
      schema: "dbo",
      name: "OtherMetrics",
      normalizedName: "othermetrics",
      kind: "table",
      parameters: [],
      columns: [
        {
          name: "OtherOnly",
          normalizedName: "otheronly",
          type: { name: "int" },
          nullable: false,
          ordinal: 1,
        },
      ],
    },
  ],
});

const scope: CompletionScope = {
  activeDatabase: "Db",
  indexes: new Map([["db", index]]),
};
const model = (sql: string, cursor = sql.length) =>
  analyzeDocumentSemantics(sql, cursor, scope);
const infer = (expression: string) =>
  inferExpressionType(
    expression,
    0,
    expression.length,
    scope,
    model("SELECT * FROM dbo.Metrics AS m"),
  );
const atMarker = (marked: string) => {
  const cursor = marked.indexOf("|");
  assert.notEqual(cursor, -1);
  const sql = marked.replace("|", "");
  return {
    sql,
    cursor,
    candidates: createCandidates(
      resolveSqlContext(sql, cursor),
      scope,
      model(sql, cursor),
    ),
  };
};

test("contract: expanded built-ins complete by Contains in expression contexts only", () => {
  const all = createCandidates(resolveSqlContext("SELECT "), scope)
    .filter((candidate) => candidate.kind === "builtinFunction")
    .map((candidate) => candidate.name);
  for (const name of [
    "ISNULL",
    "EOMONTH",
    "LEN",
    "ABS",
    "COUNT",
    "SUM",
    "ROW_NUMBER",
    "LAG",
  ])
    assert.ok(all.includes(name), name);
  assert.deepEqual(
    createCandidates(resolveSqlContext("SELECT ens"), scope)
      .filter((candidate) => candidate.kind === "builtinFunction")
      .map((candidate) => candidate.name),
    ["DENSE_RANK"],
  );
  assert.equal(
    createCandidates(resolveSqlContext("SELECT * FROM ran"), scope).some(
      (candidate) => candidate.kind === "builtinFunction",
    ),
    false,
  );
});

test("contract: shared Signature Help metadata covers scalar aggregate and window callables", () => {
  for (const name of [
    "ISNULL",
    "REPLACE",
    "EOMONTH",
    "ABS",
    "NTILE",
    "LAG",
    "LEAD",
  ]) {
    const firstSql = `SELECT ${name}(`;
    const first = resolveCallableAtCursor(firstSql, firstSql.length, scope);
    assert.ok(first, name);
    assert.equal(first.activeParameter, 0, name);
    assert.match(
      callableSignatureLabel(first.signature),
      new RegExp(`^${name}\\(`),
    );
  }
  assert.equal(
    resolveCallableAtCursor("SELECT REPLACE(m.Name, N'x', ", 30, scope)
      ?.activeParameter,
    2,
  );
  assert.equal(
    resolveCallableAtCursor("SELECT EOMONTH(m.CreatedAt, ", 30, scope)
      ?.signature.parameters[1]?.optional,
    true,
  );
  const nested = "SELECT ISNULL(LAG(m.Name, 1, ";
  assert.equal(
    resolveCallableAtCursor(nested, nested.length, scope)?.signature.name,
    "LAG",
  );
  const lead = "SELECT LEAD(m.Name, 2, ";
  assert.equal(
    resolveCallableAtCursor(lead, lead.length, scope)?.activeParameter,
    2,
  );
  assert.equal(findBuiltinFunction("LTRIM")?.parameters[1]?.optional, true);
  assert.equal(
    findBuiltinFunction("LTRIM")?.parameters[1]?.minimumCompatibilityLevel,
    160,
  );
});

test("contract: aggregate and window return inference follows callable metadata", () => {
  assert.equal(infer("COUNT(*)").normalizedName, "int");
  assert.equal(infer("COUNT(m.Name)").normalizedName, "int");
  assert.equal(infer("COUNT_BIG(m.Count)").normalizedName, "bigint");
  assert.deepEqual(
    [
      infer("SUM(m.Amount)").normalizedName,
      infer("SUM(m.Amount)").precision,
      infer("SUM(m.Amount)").scale,
    ],
    ["decimal", 38, 4],
  );
  assert.equal(infer("SUM(m.Count)").normalizedName, "int");
  assert.deepEqual(
    [
      infer("AVG(m.Amount)").normalizedName,
      infer("AVG(m.Amount)").precision,
      infer("AVG(m.Amount)").scale,
    ],
    ["decimal", 38, 6],
  );
  assert.equal(infer("MIN(m.CreatedAt)").normalizedName, "datetime2");
  assert.equal(infer("MAX(m.Name)").normalizedName, "nvarchar");
  assert.equal(
    infer("ROW_NUMBER() OVER (ORDER BY m.CreatedAt)").normalizedName,
    "bigint",
  );
  for (const name of ["RANK", "DENSE_RANK"])
    assert.equal(
      infer(`${name}() OVER (ORDER BY m.CreatedAt)`).normalizedName,
      "bigint",
      name,
    );
  assert.equal(
    infer("NTILE(4) OVER (ORDER BY m.CreatedAt)").normalizedName,
    "bigint",
  );
  assert.equal(
    infer("LAG(m.Name, 1, N'') OVER (ORDER BY m.CreatedAt)").normalizedName,
    "nvarchar",
  );
  assert.equal(
    infer("LEAD(m.Code) OVER (ORDER BY m.CreatedAt)").normalizedName,
    "varchar",
  );
  assert.equal(
    infer("SUM(CASE WHEN m.Count > 0 THEN m.Amount ELSE 0 END)").normalizedName,
    "decimal",
  );
});

test("contract: ISNULL NULLIF COALESCE and CASE retain distinct type rules", () => {
  assert.equal(infer("ISNULL(m.Count, m.Amount)").normalizedName, "int");
  assert.equal(infer("ISNULL(NULL, m.Name)").normalizedName, "nvarchar");
  assert.equal(infer("NULLIF(m.Name, m.Code)").normalizedName, "nvarchar");
  assert.equal(infer("COALESCE(m.Count, m.BigCount)").normalizedName, "bigint");
  assert.equal(infer("COALESCE(m.Name, m.Name)").normalizedName, "nvarchar");
  assert.equal(
    infer("COALESCE(NULL, m.Code, m.Name)").normalizedName,
    "nvarchar",
  );
  assert.equal(infer("COALESCE(m.Count, MissingValue)").kind, "unknown");
  assert.equal(
    infer("CASE WHEN m.Count > 0 THEN m.Count ELSE m.BigCount END")
      .normalizedName,
    "bigint",
  );
  assert.equal(
    infer("CASE m.Count WHEN 1 THEN m.Code ELSE m.Name END").normalizedName,
    "nvarchar",
  );
  assert.equal(
    infer("CASE WHEN m.Count > 0 THEN m.Amount").normalizedName,
    "decimal",
  );
  assert.equal(
    infer("CASE WHEN m.Count > 0 THEN MissingValue ELSE m.Amount END").kind,
    "unknown",
  );
});

test("contract: function ExpectedType ranks but never hides qualified members", () => {
  for (const [marked, first] of [
    ["SELECT LEN(m.|) FROM dbo.Metrics AS m", "Code"],
    ["SELECT ABS(m.|) FROM dbo.Metrics AS m", "Amount"],
    ["SELECT SUM(m.|) FROM dbo.Metrics AS m", "Amount"],
    ["SELECT ISNULL(m.Count, m.|) FROM dbo.Metrics AS m", "Count"],
    ["SELECT NULLIF(m.Name, m.|) FROM dbo.Metrics AS m", "Name"],
  ] as const) {
    const columns = atMarker(marked).candidates.filter(
      (candidate) => candidate.kind === "column",
    );
    assert.equal(columns[0]?.name, first, marked);
    assert.deepEqual(
      new Set(columns.map((candidate) => candidate.name)),
      new Set([
        "Amount",
        "BigCount",
        "Code",
        "Count",
        "CreatedAt",
        "ExternalKey",
        "Name",
      ]),
    );
    assert.equal(
      columns.some((candidate) => candidate.name === "OtherOnly"),
      false,
    );
  }
});

test("contract: COALESCE CASE and LAG preserve surrounding ExpectedType for members", () => {
  for (const marked of [
    "SELECT * FROM dbo.Metrics AS m WHERE m.Name = COALESCE(m.|",
    "SELECT * FROM dbo.Metrics AS m WHERE m.Name = CASE WHEN m.Count > 0 THEN m.|",
    "SELECT * FROM dbo.Metrics AS m WHERE m.Name = LAG(m.|",
  ]) {
    const result = atMarker(marked);
    const columns = result.candidates.filter(
      (candidate) => candidate.kind === "column",
    );
    assert.equal(columns[0]?.name, "Name", marked);
    assert.equal(
      columns.some((candidate) => candidate.name === "OtherOnly"),
      false,
    );
  }
});

test("contract: PARTITION BY and window ORDER BY reuse qualified QueryScope members", () => {
  const window = atMarker("SELECT ROW_NUMBER() OVER (|) FROM dbo.Metrics AS m");
  assert.deepEqual(
    window.candidates.map((candidate) => candidate.name),
    ["ORDER BY", "PARTITION BY"],
  );
  assert.equal(
    classifyCompletionContext(
      window.sql,
      window.cursor,
      model(window.sql, window.cursor),
    ).clause,
    "window",
  );
  for (const [marked, clause] of [
    [
      "SELECT ROW_NUMBER() OVER (PARTITION BY m.| FROM dbo.Metrics AS m",
      "windowPartitionBy",
    ],
    [
      "SELECT ROW_NUMBER() OVER (ORDER BY m.| FROM dbo.Metrics AS m",
      "windowOrderBy",
    ],
  ] as const) {
    const result = atMarker(marked);
    assert.equal(
      classifyCompletionContext(
        result.sql,
        result.cursor,
        model(result.sql, result.cursor),
      ).clause,
      clause,
    );
    assert.deepEqual(
      result.candidates.map((candidate) => candidate.name),
      [
        "Amount",
        "BigCount",
        "Code",
        "Count",
        "CreatedAt",
        "ExternalKey",
        "Name",
      ],
    );
    assert.ok(
      result.candidates.every((candidate) => candidate.kind === "column"),
    );
    assert.ok(result.candidates.every((candidate) => candidate.physicalColumn));
  }
});

test("contract: datepart grammar completion is scoped deterministic and Contains-aware", () => {
  const expected = [...DATEPART_VALUES.map((value) => value.name)].sort();
  for (const name of ["DATEADD", "DATEDIFF", "DATEPART", "DATENAME"]) {
    const result = atMarker(`SELECT ${name}(|) FROM dbo.Metrics AS m`);
    assert.deepEqual(
      result.candidates.map((candidate) => candidate.name),
      expected,
      name,
    );
    assert.ok(
      result.candidates.every((candidate) => candidate.kind === "keyword"),
    );
  }
  assert.deepEqual(
    atMarker(
      "SELECT DATEADD(yyyy|, 1, m.CreatedAt) FROM dbo.Metrics AS m",
    ).candidates.map((candidate) => candidate.name),
    ["year"],
  );
  const later = atMarker(
    "SELECT DATEPART(day, m.|) FROM dbo.Metrics AS m",
  ).candidates;
  assert.ok(later.some((candidate) => candidate.name === "CreatedAt"));
  assert.equal(
    later.some((candidate) => candidate.name === "year"),
    false,
  );
  const languageOnlyScope: CompletionScope = {
    activeDatabase: "Unavailable",
    indexes: new Map(),
  };
  assert.ok(
    createCandidates(
      resolveSqlContext("SELECT DATEPART(ye"),
      languageOnlyScope,
    ).some((candidate) => candidate.name === "year"),
  );
});

test("contract: fixed and derived function results drive surrounding comparison ranking", () => {
  const eomonth = infer("EOMONTH(m.CreatedAt)");
  const sysdatetime = infer("SYSDATETIME()");
  assert.equal(eomonth.normalizedName, "date");
  assert.equal(sysdatetime.normalizedName, "datetime2");
  assert.equal(infer("DATEPART(day, m.CreatedAt)").normalizedName, "int");
  assert.equal(
    infer("DATENAME(month, m.CreatedAt)").normalizedName,
    "nvarchar",
  );
  assert.equal(
    infer("LEN(CAST(m.Name AS nvarchar(max)))").normalizedName,
    "bigint",
  );
  assert.equal(infer("LEFT(m.Name, 2)").normalizedName, "nvarchar");
  assert.equal(infer("REPLACE(m.Code, 'a', 'b')").normalizedName, "varchar");
  assert.equal(infer("CONCAT(m.Code, m.Name)").normalizedName, "nvarchar");
  assert.equal(infer("COALESCE(m.Name, m.Code)").normalizedName, "nvarchar");
  assert.equal(infer("LOWER(m.Name)").normalizedName, "nvarchar");
  assert.equal(infer("GETDATE()").normalizedName, "datetime");
  assert.equal(infer("SYSUTCDATETIME()").scale, 7);
  assert.equal(infer("ABS(CAST(1 AS bit))").normalizedName, "float");
  assert.equal(infer("CEILING(m.Amount)").precision, 38);
  assert.equal(infer("FLOOR(m.Amount)").scale, 4);
  const ranked = atMarker(
    "SELECT * FROM dbo.Metrics AS m WHERE EOMONTH(m.CreatedAt) = m.|",
  ).candidates.filter((candidate) => candidate.kind === "column");
  assert.equal(ranked[0]?.name, "CreatedAt");
  assert.ok(ranked.some((candidate) => candidate.name === "ExternalKey"));
});

test("contract: window definitions encode required OVER ordering without frame claims", () => {
  for (const name of [
    "ROW_NUMBER",
    "RANK",
    "DENSE_RANK",
    "NTILE",
    "LAG",
    "LEAD",
  ])
    assert.deepEqual(findBuiltinFunction(name)?.over, {
      required: true,
      orderByRequired: true,
      frameAllowed: false,
    });
  for (const name of ["COUNT", "COUNT_BIG", "SUM", "AVG", "MIN", "MAX"])
    assert.deepEqual(findBuiltinFunction(name)?.over, {
      required: false,
      orderByRequired: false,
      frameAllowed: true,
    });
  assert.equal(findBuiltinFunction("STRING_AGG")?.over, undefined);
});

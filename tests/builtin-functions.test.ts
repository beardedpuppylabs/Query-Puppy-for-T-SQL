import assert from "node:assert/strict";
import test from "node:test";
import {
  createCandidates,
  type CompletionScope,
} from "../src/completion/CandidateFactory.js";
import { DatabaseIndex } from "../src/metadata/DatabaseIndex.js";
import {
  BUILTIN_FUNCTIONS,
  findBuiltinFunction,
} from "../src/parser/BuiltinFunctionCatalog.js";
import { analyzeDocumentSemantics } from "../src/parser/DocumentSemanticAnalyzer.js";
import {
  callableSignatureLabel,
  parseCallSite,
  resolveCallableAtCursor,
} from "../src/parser/CallableAnalyzer.js";
import {
  inferExpectedTypeAtCursor,
  inferExpressionType,
} from "../src/parser/SqlTypeInference.js";
import { resolveSqlContext } from "../src/parser/SqlContextResolver.js";

const index = new DatabaseIndex({
  database: "Db",
  schemas: ["dbo"],
  loadedAt: 0,
  objects: [
    {
      schema: "dbo",
      name: "Values",
      normalizedName: "values",
      kind: "table",
      parameters: [],
      columns: [
        {
          name: "Amount",
          normalizedName: "amount",
          type: { name: "decimal", precision: 18, scale: 4 },
          nullable: true,
          ordinal: 1,
        },
        {
          name: "CreatedAt",
          normalizedName: "createdat",
          type: { name: "datetime2", scale: 3 },
          nullable: false,
          ordinal: 2,
        },
        {
          name: "Name",
          normalizedName: "name",
          type: { name: "nvarchar", maxLength: 200 },
          nullable: true,
          ordinal: 3,
        },
        {
          name: "Opaque",
          normalizedName: "opaque",
          type: { name: "uniqueidentifier" },
          nullable: true,
          ordinal: 4,
        },
        {
          name: "Count",
          normalizedName: "count",
          type: { name: "int" },
          nullable: false,
          ordinal: 5,
        },
      ],
    },
    {
      schema: "dbo",
      name: "DATEADD",
      normalizedName: "dateadd",
      kind: "scalarFunction",
      parameters: [],
      columns: [],
      returnType: { name: "uniqueidentifier" },
    },
    {
      schema: "dbo",
      name: "Calculate",
      normalizedName: "calculate",
      kind: "scalarFunction",
      parameters: [
        {
          name: "@Value",
          type: { name: "decimal", precision: 18, scale: 4 },
          output: false,
          ordinal: 1,
        },
      ],
      columns: [],
      returnType: { name: "decimal", precision: 18, scale: 4 },
    },
    {
      schema: "dbo",
      name: "OtherValues",
      normalizedName: "othervalues",
      kind: "table",
      parameters: [],
      columns: [
        {
          name: "OtherOnly",
          normalizedName: "otheronly",
          type: { name: "datetime2" },
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
const semantics = (sql: string, cursor = sql.length) =>
  analyzeDocumentSemantics(sql, cursor, scope);

const builtinNames = [
  "ABS",
  "AVG",
  "CEILING",
  "CHARINDEX",
  "COALESCE",
  "CONCAT",
  "COUNT",
  "COUNT_BIG",
  "DATEADD",
  "DATEDIFF",
  "DATEFROMPARTS",
  "DATENAME",
  "DATEPART",
  "DENSE_RANK",
  "EOMONTH",
  "FLOOR",
  "GETDATE",
  "ISNULL",
  "LAG",
  "LEAD",
  "LEFT",
  "LEN",
  "LOWER",
  "LTRIM",
  "MAX",
  "MIN",
  "NTILE",
  "NULLIF",
  "RANK",
  "REPLACE",
  "RIGHT",
  "ROUND",
  "ROW_NUMBER",
  "RTRIM",
  "STRING_AGG",
  "SUBSTRING",
  "SUM",
  "SYSDATETIME",
  "SYSUTCDATETIME",
  "UPPER",
] as const;

test("contract: built-in catalog is deterministic unique valid and case-insensitive", () => {
  assert.deepEqual(
    BUILTIN_FUNCTIONS.map((item) => item.name),
    builtinNames,
  );
  assert.equal(
    new Set(BUILTIN_FUNCTIONS.map((item) => item.normalizedName)).size,
    builtinNames.length,
  );
  assert.equal(findBuiltinFunction("dateadd")?.name, "DATEADD");
  for (const builtin of BUILTIN_FUNCTIONS) {
    assert.equal(Object.isFrozen(builtin), true);
    assert.equal(Object.isFrozen(builtin.parameters), true);
    assert.equal(Object.isFrozen(builtin.returnRule), true);
    assert.ok(builtin.minimumServerMajor > 0);
    assert.ok(
      ["scalar", "aggregate", "window", "expression"].includes(builtin.kind),
    );
    assert.deepEqual(
      builtin.parameters.map((parameter) => parameter.ordinal),
      builtin.parameters.map((_, index_) => index_ + 1),
    );
    const firstOptional = builtin.parameters.findIndex(
      (parameter) => parameter.optional,
    );
    if (firstOptional >= 0)
      assert.equal(
        builtin.parameters
          .slice(firstOptional)
          .every((parameter) => parameter.optional),
        true,
      );
  }
});

test("contract: built-ins use Contains and never pollute RowSource completion", () => {
  const expression = createCandidates(resolveSqlContext("SELECT dat"), scope);
  assert.deepEqual(
    expression
      .filter((item) => item.kind === "builtinFunction")
      .map((item) => item.name),
    [
      "DATEADD",
      "DATEDIFF",
      "DATEFROMPARTS",
      "DATENAME",
      "DATEPART",
      "GETDATE",
      "SYSDATETIME",
      "SYSUTCDATETIME",
    ],
  );
  const all = createCandidates(resolveSqlContext("SELECT "), scope)
    .filter((item) => item.kind === "builtinFunction")
    .map((item) => item.name);
  assert.deepEqual(all, builtinNames);
  assert.equal(new Set(all).size, all.length);
  assert.equal(
    createCandidates(resolveSqlContext("SELECT * FROM dat"), scope).some(
      (item) => item.kind === "builtinFunction",
    ),
    false,
  );
});

test("contract: shared callable resolution handles optional nested and qualified calls", () => {
  const sql = "SELECT DATEADD(day, DATEDIFF(day, a, b), ";
  const resolved = resolveCallableAtCursor(sql, sql.length, scope);
  assert.ok(resolved);
  assert.equal(resolved.signature.name, "DATEADD");
  assert.equal(resolved.activeParameter, 2);
  assert.match(
    callableSignatureLabel(resolved!.signature),
    /datepart datepart/,
  );
  assert.equal(findBuiltinFunction("ROUND")?.parameters[2]?.optional, true);
  assert.equal(
    resolveCallableAtCursor("SELECT dbo.DATEADD(", 19, scope)?.signature
      .catalogObject?.schema,
    "dbo",
  );
  assert.equal(parseCallSite("SELECT DATEADD(", 15)?.nameParts.length, 1);
  for (const name of builtinNames) {
    const first = resolveCallableAtCursor(
      `SELECT ${name}(`,
      `SELECT ${name}(`.length,
      scope,
    );
    const second = resolveCallableAtCursor(
      `SELECT ${name}(x, `,
      `SELECT ${name}(x, `.length,
      scope,
    );
    assert.ok(first);
    assert.ok(second);
    assert.equal(first.activeParameter, 0, name);
    assert.equal(
      second.activeParameter,
      Math.min(1, Math.max(0, first.signature.parameters.length - 1)),
      name,
    );
    assert.match(
      callableSignatureLabel(first!.signature),
      new RegExp(`^${name}\\(`),
    );
  }
});

test("contract: built-in ExpectedType uses families and leaves datepart untyped", () => {
  const expected = (marked: string) => {
    const cursor = marked.indexOf("|");
    const sql = marked.replace("|", "");
    return inferExpectedTypeAtCursor(
      sql,
      cursor,
      scope,
      semantics(sql, cursor),
    );
  };
  assert.equal(
    expected("SELECT DATEADD(day, v.|, v.CreatedAt) FROM dbo.Values v")
      ?.expectedType.family,
    "integer",
  );
  assert.deepEqual(
    expected("SELECT DATEADD(|, v.Amount, v.CreatedAt) FROM dbo.Values v"),
    undefined,
  );
  assert.equal(
    expected("SELECT DATEADD(day, v.Amount, v.|) FROM dbo.Values v")
      ?.expectedType.sqlName,
    "date/time",
  );
  assert.equal(
    expected("SELECT SUBSTRING(v.|, 1, 2) FROM dbo.Values v")?.expectedType
      .sqlName,
    "string/unicodeString/binary",
  );
});

test("contract: built-in return inference covers fixed derived and datatype-dependent rules", () => {
  const model = semantics("SELECT * FROM dbo.Values v");
  const infer = (expression: string) =>
    inferExpressionType(expression, 0, expression.length, scope, model);
  assert.equal(
    infer("DATEDIFF(day, v.CreatedAt, v.CreatedAt)").normalizedName,
    "int",
  );
  assert.equal(
    infer("DATEADD(day, 1, v.CreatedAt)").normalizedName,
    "datetime2",
  );
  assert.equal(
    infer("DATEADD(day, 1, '2024-01-01')").normalizedName,
    "datetime",
  );
  assert.equal(infer("SUBSTRING(v.Name, 1, 2)").normalizedName, "nvarchar");
  assert.equal(
    infer("CHARINDEX(N'x', CAST(v.Name AS nvarchar(max)))").normalizedName,
    "bigint",
  );
  assert.equal(
    infer("ROUND(CAST(v.Amount AS smallint), 0)").normalizedName,
    "int",
  );
  assert.equal(infer("STRING_AGG(v.Name, N',')").normalizedName, "nvarchar");
});

test("contract: built-in ExpectedType ranks without hiding incompatible members", () => {
  const marked = "SELECT DATEADD(day, 1, v.|) FROM dbo.Values v";
  const cursor = marked.indexOf("|");
  const sql = marked.replace("|", "");
  const candidates = createCandidates(
    resolveSqlContext(sql, cursor),
    scope,
    semantics(sql, cursor),
  );
  const columns = candidates.filter((candidate) => candidate.kind === "column");
  assert.ok(columns[0]);
  assert.equal(columns[0].name, "CreatedAt");
  assert.equal(columns[0].typeCompatibility, "compatibleFamily");
  assert.ok(
    columns.some(
      (candidate) =>
        candidate.name === "Opaque" &&
        candidate.typeCompatibility === "incompatible",
    ),
  );
});

test("contract: qualified members survive incomplete built-in and catalog callable arguments", () => {
  const candidates = (marked: string) => {
    const cursor = marked.indexOf("|");
    const sql = marked.replace("|", "");
    return createCandidates(
      resolveSqlContext(sql, cursor),
      scope,
      semantics(sql, cursor),
    );
  };
  const temporal = candidates(
    "SELECT DATEADD(day, 1, v.|\nFROM dbo.Values AS v CROSS JOIN dbo.OtherValues AS o;",
  );
  assert.ok(temporal[0]);
  assert.equal(temporal[0].name, "CreatedAt");
  assert.equal(temporal[0].typeCompatibility, "compatibleFamily");
  assert.equal(temporal[0].physicalColumn, true);
  assert.equal(temporal[0].nullable, false);
  assert.deepEqual(
    temporal
      .filter((candidate) => candidate.kind === "column")
      .map((candidate) => candidate.name),
    ["CreatedAt", "Amount", "Count", "Name", "Opaque"],
  );
  assert.equal(
    temporal.some((candidate) => candidate.name === "OtherOnly"),
    false,
  );
  const autoClosed = candidates(
    "SELECT DATEADD(day, 1, v.|)\nFROM dbo.Values AS v;",
  );
  assert.equal(autoClosed[0]?.name, "CreatedAt");

  const numeric = candidates("SELECT DATEADD(day, v.|\nFROM dbo.Values AS v;");
  assert.equal(numeric[0]?.name, "Count");
  assert.ok(numeric.some((candidate) => candidate.name === "Name"));

  const string = candidates("SELECT SUBSTRING(v.|\nFROM dbo.Values AS v;");
  assert.equal(string[0]?.name, "Name");
  assert.ok(string.some((candidate) => candidate.name === "Opaque"));

  const nested = candidates(
    "SELECT DATEADD(day, DATEDIFF(day, v.|\nFROM dbo.Values AS v;",
  );
  assert.equal(nested[0]?.name, "CreatedAt");

  const udf = candidates("SELECT dbo.Calculate(v.|\nFROM dbo.Values AS v;");
  assert.equal(udf[0]?.name, "Amount");
  assert.ok(udf.some((candidate) => candidate.name === "Opaque"));
});

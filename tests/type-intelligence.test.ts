import assert from "node:assert/strict";
import test from "node:test";
import {
  createCandidates,
  type CompletionScope,
} from "../src/completion/CandidateFactory.js";
import { DatabaseIndex } from "../src/metadata/DatabaseIndex.js";
import type {
  ColumnMetadata,
  DatabaseMetadata,
  SqlType,
} from "../src/metadata/MetadataModels.js";
import {
  compareSqlTypes,
  describeSqlType,
} from "../src/metadata/SqlTypeDescriptor.js";
import { analyzeDocumentSemantics } from "../src/parser/DocumentSemanticAnalyzer.js";
import {
  inferExpectedTypeAtCursor,
  inferExpressionType,
  updateAssignmentAtCursor,
} from "../src/parser/SqlTypeInference.js";
import { resolveSqlContext } from "../src/parser/SqlContextResolver.js";

const column = (
  name: string,
  type: SqlType,
  ordinal: number,
): ColumnMetadata => ({
  name,
  normalizedName: name.toLowerCase(),
  type,
  nullable: true,
  ordinal,
});
const customerColumns = [
  column("CustomerId", { name: "bigint" }, 1),
  column("PrimaryAddressId", { name: "bigint" }, 2),
  column("RegionId", { name: "int" }, 3),
  column("Amount", { name: "decimal", precision: 18, scale: 4 }, 4),
  column("CustomerCode", { name: "varchar", maxLength: 50 }, 5),
  column("DisplayName", { name: "nvarchar", maxLength: 400 }, 6),
  column("ExternalKey", { name: "uniqueidentifier" }, 7),
  column("CreatedAt", { name: "datetime2", scale: 3 }, 8),
  column("Opaque", { name: "Mystery", schema: "dbo", userDefined: true }, 9),
];
const metadata: DatabaseMetadata = {
  database: "Db",
  schemas: ["dbo", "billing"],
  loadedAt: 0,
  objects: [
    {
      schema: "dbo",
      name: "Customers",
      normalizedName: "customers",
      kind: "table",
      parameters: [],
      columns: customerColumns,
    },
    {
      schema: "dbo",
      name: "Targets",
      normalizedName: "targets",
      kind: "table",
      parameters: [],
      columns: [
        column("CustomerId", { name: "bigint" }, 1),
        column("ExternalReference", { name: "uniqueidentifier" }, 2),
        column("Amount", { name: "decimal", precision: 18, scale: 2 }, 3),
      ],
    },
    {
      schema: "billing",
      name: "Calculate",
      normalizedName: "calculate",
      kind: "scalarFunction",
      columns: [],
      parameters: [
        {
          name: "@Amount",
          type: { name: "decimal", precision: 18, scale: 2 },
          output: false,
          ordinal: 1,
        },
        {
          name: "@Rate",
          type: { name: "decimal", precision: 9, scale: 4 },
          output: false,
          ordinal: 2,
        },
      ],
      returnType: { name: "decimal", precision: 18, scale: 2 },
    },
    {
      schema: "billing",
      name: "Amounts",
      normalizedName: "amounts",
      kind: "tableValuedFunction",
      columns: customerColumns,
      parameters: [],
    },
  ],
};
const index = new DatabaseIndex(metadata);
const scope: CompletionScope = {
  activeDatabase: "Db",
  indexes: new Map([["db", index]]),
};
const semantics = (sql: string, cursor = sql.length) =>
  analyzeDocumentSemantics(sql, cursor, scope);
const names = (sql: string, cursor = sql.length) =>
  createCandidates(resolveSqlContext(sql, cursor), scope).map(
    (item) => item.name,
  );

test("normalizes SQL type families while preserving display facets and UDT identity", () => {
  const cases: readonly [
    SqlType,
    string,
    string,
    number | undefined,
    number | undefined,
    number | undefined,
  ][] = [
    [{ name: "int" }, "integer", "int", undefined, undefined, undefined],
    [{ name: "bigint" }, "integer", "bigint", undefined, undefined, undefined],
    [
      { name: "varchar", maxLength: 50 },
      "string",
      "varchar",
      50,
      undefined,
      undefined,
    ],
    [
      { name: "varchar", maxLength: -1 },
      "string",
      "varchar",
      -1,
      undefined,
      undefined,
    ],
    [
      { name: "nvarchar", maxLength: 400 },
      "unicodeString",
      "nvarchar",
      400,
      undefined,
      undefined,
    ],
    [
      { name: "decimal", precision: 18, scale: 4 },
      "decimal",
      "decimal",
      undefined,
      18,
      4,
    ],
    [
      { name: "decimal", precision: 38, scale: 18 },
      "decimal",
      "decimal",
      undefined,
      38,
      18,
    ],
    [
      { name: "datetime2", scale: 3 },
      "dateTime",
      "datetime2",
      undefined,
      undefined,
      3,
    ],
    [
      { name: "datetimeoffset", scale: 7 },
      "dateTime",
      "datetimeoffset",
      undefined,
      undefined,
      7,
    ],
    [
      { name: "uniqueidentifier" },
      "guid",
      "uniqueidentifier",
      undefined,
      undefined,
      undefined,
    ],
    [
      { name: "varbinary", maxLength: -1 },
      "binary",
      "varbinary",
      -1,
      undefined,
      undefined,
    ],
  ];
  for (const [type, family, name, length, precision, scale] of cases) {
    const descriptor = describeSqlType(type);
    assert.equal(descriptor.family, family);
    assert.equal(descriptor.normalizedName, name);
    assert.equal(descriptor.length, length);
    assert.equal(descriptor.precision, precision);
    assert.equal(descriptor.scale, scale);
  }
  assert.equal(describeSqlType({ name: "unknown" }).kind, "unknown");
  assert.equal(
    describeSqlType({
      name: "CustomerCode",
      schema: "dbo",
      userDefined: true,
      underlyingSystemType: "varchar",
    }).userDefinedTypeName,
    "dbo.CustomerCode",
  );
});

test("classifies deterministic conservative compatibility tiers", () => {
  const compare = (expected: SqlType, actual: SqlType) =>
    compareSqlTypes(describeSqlType(expected), describeSqlType(actual));
  assert.equal(compare({ name: "bigint" }, { name: "bigint" }), "exact");
  assert.equal(
    compare(
      { name: "decimal", precision: 18, scale: 2 },
      { name: "decimal", precision: 18, scale: 2 },
    ),
    "exact",
  );
  assert.equal(
    compare(
      { name: "decimal", precision: 18, scale: 2 },
      { name: "decimal", precision: 18, scale: 4 },
    ),
    "sameBaseType",
  );
  assert.equal(
    compare(
      { name: "varchar", maxLength: 50 },
      { name: "varchar", maxLength: 20 },
    ),
    "sameBaseType",
  );
  assert.equal(
    compare({ name: "int" }, { name: "bigint" }),
    "compatibleFamily",
  );
  assert.equal(
    compare({ name: "bigint" }, { name: "decimal" }),
    "compatibleFamily",
  );
  assert.equal(
    compare({ name: "varchar" }, { name: "nvarchar" }),
    "compatibleFamily",
  );
  assert.equal(
    compare({ name: "datetime2" }, { name: "datetimeoffset" }),
    "compatibleFamily",
  );
  assert.equal(
    compare({ name: "uniqueidentifier" }, { name: "varchar" }),
    "incompatible",
  );
  assert.equal(
    compare({ name: "varbinary" }, { name: "varchar" }),
    "incompatible",
  );
  assert.equal(compare({ name: "unknown" }, { name: "bigint" }), "unknown");
});

test("contract: expression inference covers columns literals casts UDFs arithmetic and CASE", () => {
  const base = "SELECT c.CustomerId FROM dbo.Customers c";
  const model = semantics(base);
  const infer = (expression: string) =>
    inferExpressionType(expression, 0, expression.length, scope, model);
  assert.equal(infer("c.CustomerId").normalizedName, "bigint");
  assert.equal(infer("1").normalizedName, "int");
  assert.equal(infer("2147483648").normalizedName, "bigint");
  assert.deepEqual([infer("1.25").precision, infer("1.25").scale], [3, 2]);
  assert.equal(infer("'abc'").family, "string");
  assert.equal(infer("N'abc'").family, "unicodeString");
  assert.equal(infer("0xCAFE").family, "binary");
  assert.equal(infer("NULL").kind, "unknown");
  assert.equal(
    infer("CAST(c.CustomerId AS decimal(18,2))").normalizedName,
    "decimal",
  );
  assert.equal(
    infer("CONVERT(uniqueidentifier, c.ExternalKey)").family,
    "guid",
  );
  assert.equal(infer("(c.CustomerId)").normalizedName, "bigint");
  assert.equal(
    infer("billing.Calculate(c.Amount, 1.0)").normalizedName,
    "decimal",
  );
  assert.equal(infer("billing.Amounts()").kind, "unknown");
  assert.ok(["integer", "decimal"].includes(infer("c.CustomerId + 1").family));
  assert.equal(
    infer("CASE WHEN 1=1 THEN c.CustomerId ELSE c.PrimaryAddressId END")
      .normalizedName,
    "bigint",
  );
  assert.equal(
    infer("CASE WHEN 1=1 THEN c.CustomerId ELSE c.ExternalKey END").kind,
    "unknown",
  );

  for (const [localSql, expression] of [
    [
      "WITH x AS (SELECT c.CustomerId FROM dbo.Customers c) SELECT x.CustomerId FROM x",
      "x.CustomerId",
    ],
    [
      "SELECT d.CustomerId FROM (SELECT c.CustomerId FROM dbo.Customers c) d",
      "d.CustomerId",
    ],
    [
      "SELECT x.CustomerId FROM (SELECT c.CustomerId FROM dbo.Customers c UNION ALL SELECT c.PrimaryAddressId FROM dbo.Customers c) x",
      "x.CustomerId",
    ],
  ] as const) {
    const localModel = semantics(localSql);
    assert.equal(
      inferExpressionType(expression, 0, expression.length, scope, localModel)
        .normalizedName,
      "bigint",
    );
  }
});

test("contract: ExpectedType covers comparison callable DML LIKE and arithmetic contexts", () => {
  const expected = (sql: string, cursor = sql.length) =>
    inferExpectedTypeAtCursor(sql, cursor, scope, semantics(sql, cursor));
  assert.equal(
    expected("SELECT * FROM dbo.Customers c WHERE c.CustomerId = c.")
      ?.expectedType.normalizedName,
    "bigint",
  );
  const lhs = "SELECT * FROM dbo.Customers c WHERE c. = c.ExternalKey";
  assert.equal(expected(lhs, lhs.indexOf(" ="))?.expectedType.family, "guid");
  assert.equal(
    expected(
      "SELECT * FROM dbo.Customers c JOIN dbo.Targets t ON t.CustomerId = c.",
    )?.source,
    "comparisonOperand",
  );
  const argumentOne = "SELECT billing.Calculate(c., 0.19) FROM dbo.Customers c";
  assert.equal(
    expected(argumentOne, argumentOne.indexOf(","))?.expectedType
      .normalizedName,
    "decimal",
  );
  const argumentTwo =
    "SELECT billing.Calculate(c.Amount, c.) FROM dbo.Customers c";
  assert.equal(
    expected(argumentTwo, argumentTwo.indexOf(")"))?.expectedType.scale,
    4,
  );
  const nestedArgument =
    "SELECT billing.Calculate(c.Amount, billing.Calculate(c., 0.1)) FROM dbo.Customers c";
  assert.equal(
    expected(nestedArgument, nestedArgument.indexOf(", 0.1"))?.expectedType
      .precision,
    18,
  );
  const updateOne = "UPDATE c SET ExternalKey = c. FROM dbo.Customers c";
  assert.equal(
    expected(updateOne, updateOne.indexOf(" FROM"))?.source,
    "updateAssignment",
  );
  const updateTwo =
    "UPDATE c SET CustomerId=1, ExternalKey = c. FROM dbo.Customers c";
  assert.equal(
    expected(updateTwo, updateTwo.indexOf(" FROM"))?.expectedType.family,
    "guid",
  );
  const updateDistinctAliases =
    "UPDATE t SET CustomerId = c.CustomerId, ExternalReference = c. FROM dbo.Targets AS t CROSS JOIN dbo.Customers AS c";
  const distinctCursor = updateDistinctAliases.indexOf(" FROM");
  assert.equal(
    expected(updateDistinctAliases, distinctCursor)?.source,
    "updateAssignment",
  );
  assert.equal(
    expected(updateDistinctAliases, distinctCursor)?.expectedType.family,
    "guid",
  );
  assert.equal(
    expected(
      "INSERT INTO dbo.Targets (CustomerId, ExternalReference, Amount) VALUES (c.",
    )?.expectedType.normalizedName,
    "bigint",
  );
  assert.equal(
    expected(
      "INSERT INTO dbo.Targets (CustomerId, ExternalReference, Amount) VALUES (1, c.",
    )?.expectedType.family,
    "guid",
  );
  assert.equal(
    expected(
      "INSERT INTO dbo.Targets (CustomerId, ExternalReference, Amount) SELECT c.CustomerId, c.ExternalKey, c. FROM dbo.Customers c",
    )?.expectedType.normalizedName,
    "decimal",
  );
  assert.equal(
    expected("SELECT * FROM dbo.Customers c WHERE c.CustomerCode LIKE c.")
      ?.source,
    "likeOperand",
  );
  const arithmetic = "SELECT c.CustomerId + c. FROM dbo.Customers c";
  assert.equal(
    expected(arithmetic, arithmetic.indexOf(" FROM"))?.source,
    "arithmeticOperand",
  );
  assert.equal(expected("SELECT c. FROM dbo.Customers c"), undefined);
});

test("contract: UPDATE assignment ownership is positional and depth-aware", () => {
  const cases = [
    [
      "UPDATE s SET ExternalReference = c.| FROM dbo.Targets s CROSS JOIN dbo.Customers c",
      1,
      "ExternalReference",
    ],
    [
      "UPDATE s SET CustomerId = c.|, ExternalReference = c.ExternalKey FROM dbo.Targets s CROSS JOIN dbo.Customers c",
      1,
      "CustomerId",
    ],
    [
      "UPDATE s SET CustomerId = c.CustomerId, ExternalReference = c.| FROM dbo.Targets s CROSS JOIN dbo.Customers c",
      2,
      "ExternalReference",
    ],
    [
      "UPDATE s SET CustomerId = CONVERT(bigint, Func(c.CustomerId, 1)), ExternalReference = c.ExternalKey, Amount = c.| FROM dbo.Targets s CROSS JOIN dbo.Customers c",
      3,
      "Amount",
    ],
  ] as const;
  for (const [marked, ordinal, target] of cases) {
    const cursor = marked.indexOf("|");
    const assignment = updateAssignmentAtCursor(
      marked.replace("|", ""),
      cursor,
    );
    assert.equal(assignment?.ordinal, ordinal);
    assert.equal(assignment.targetColumnName, target);
    assert.ok(assignment.rhsStart <= cursor);
    assert.ok(assignment.rhsEnd >= cursor);
  }
});

test("contract: type ranking preserves Contains qualifier strictness and candidate visibility", () => {
  const bigint = names("SELECT * FROM dbo.Customers c WHERE c.CustomerId = c.");
  assert.deepEqual(bigint.slice(0, 2), ["CustomerId", "PrimaryAddressId"]);
  assert.ok(bigint.indexOf("RegionId") < bigint.indexOf("CustomerCode"));
  assert.ok(bigint.includes("ExternalKey"));
  assert.ok(bigint.indexOf("ExternalKey") > bigint.indexOf("RegionId"));

  const varchar = names(
    "SELECT * FROM dbo.Customers c WHERE c.CustomerCode = c.",
  );
  assert.equal(varchar[0], "CustomerCode");
  assert.ok(varchar.indexOf("DisplayName") < varchar.indexOf("ExternalKey"));
  const guid = names("SELECT * FROM dbo.Customers c WHERE c.ExternalKey = c.");
  assert.equal(guid[0], "ExternalKey");
  const date = names("SELECT * FROM dbo.Customers c WHERE c.CreatedAt = c.");
  assert.equal(date[0], "CreatedAt");

  const contains = names(
    "SELECT * FROM dbo.Customers c WHERE c.CustomerId = c.id",
  );
  assert.deepEqual(contains, ["CustomerId", "PrimaryAddressId", "RegionId"]);
  const oldOrder = names("SELECT c. FROM dbo.Customers c");
  assert.deepEqual(
    oldOrder,
    [...oldOrder].sort((a, b) => a.localeCompare(b)),
  );
  assert.equal(
    names("SELECT * FROM dbo.Targets t WHERE t.CustomerId = c.").length,
    0,
  );
});

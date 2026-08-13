import assert from "node:assert/strict";
import test from "node:test";
import { createCandidates } from "../src/completion/CandidateFactory.js";
import { DatabaseIndex } from "../src/metadata/DatabaseIndex.js";
import { analyzeDocumentSemantics } from "../src/parser/DocumentSemanticAnalyzer.js";
import { resolveSqlContext } from "../src/parser/SqlContextResolver.js";

const index = new DatabaseIndex({
  database: "Db",
  schemas: ["dbo", "reporting"],
  loadedAt: 0,
  objects: [
    {
      schema: "dbo",
      name: "Customers",
      normalizedName: "customers",
      kind: "table",
      parameters: [],
      columns: [
        {
          name: "CustomerId",
          normalizedName: "customerid",
          type: { name: "bigint" },
          nullable: false,
          ordinal: 1,
        },
        {
          name: "BillingAddressId",
          normalizedName: "billingaddressid",
          type: { name: "bigint" },
          nullable: true,
          ordinal: 2,
        },
        {
          name: "EmailAddress",
          normalizedName: "emailaddress",
          type: { name: "nvarchar", maxLength: 400 },
          nullable: true,
          ordinal: 3,
        },
        {
          name: "CreditLimit",
          normalizedName: "creditlimit",
          type: { name: "decimal", precision: 18, scale: 2 },
          nullable: false,
          ordinal: 4,
        },
      ],
    },
    {
      schema: "reporting",
      name: "GetCustomerAddresses",
      normalizedName: "getcustomeraddresses",
      kind: "tableValuedFunction",
      parameters: [],
      columns: [
        {
          name: "AddressId",
          normalizedName: "addressid",
          type: { name: "bigint" },
          nullable: false,
          ordinal: 1,
        },
        {
          name: "AddressText",
          normalizedName: "addresstext",
          type: { name: "nvarchar", maxLength: 400 },
          nullable: true,
          ordinal: 2,
        },
      ],
    },
  ],
});
const scope = { activeDatabase: "Db", indexes: new Map([["db", index]]) };
const complete = (sql: string, marker = sql.length) =>
  createCandidates(resolveSqlContext(sql, marker), scope);
const analyzeDocumentSemanticsForTest = (
  sql: string,
  catalog: Parameters<typeof analyzeDocumentSemantics>[2],
) => analyzeDocumentSemantics(sql, sql.length, catalog);

test("CTE projections, aliases, explicit lists, and catalog types resolve", () => {
  const basic =
    "WITH X AS (SELECT CustomerId, EmailAddress FROM dbo.Customers) SELECT x. FROM X x";
  assert.deepEqual(
    complete(basic, basic.indexOf("x.") + 2).map((x) => x.name),
    ["CustomerId", "EmailAddress"],
  );
  const aliases =
    "WITH X AS (SELECT CustomerId AS Id, EmailAddress AS Mail FROM dbo.Customers) SELECT x. FROM X x";
  assert.deepEqual(
    complete(aliases, aliases.indexOf("x.") + 2).map((x) => x.name),
    ["Id", "Mail"],
  );
  const explicit =
    "WITH X(Id, Mail) AS (SELECT CustomerId, EmailAddress FROM dbo.Customers) SELECT x. FROM X x";
  const result = complete(explicit, explicit.indexOf("x.") + 2);
  assert.deepEqual(
    result.map((x) => x.name),
    ["Id", "Mail"],
  );
  assert.equal(result[0]?.sqlType?.name, "bigint");
  assert.equal(result[0].nullable, false);
});

test("multiple CTEs resolve in order and do not leak to later statements", () => {
  const sql =
    "WITH A AS (SELECT CustomerId FROM dbo.Customers), B AS (SELECT a.CustomerId AS Id FROM A a) SELECT b. FROM B b";
  assert.deepEqual(
    complete(sql, sql.indexOf("b.") + 2).map((x) => x.name),
    ["Id"],
  );
  const leaked =
    "WITH X AS (SELECT CustomerId FROM dbo.Customers) SELECT * FROM X; SELECT * FROM X";
  assert.equal(
    complete(leaked).some((x) => x.name === "X" && x.kind === "cte"),
    false,
  );
});

test("CREATE temp and table variable definitions preserve columns and scalar variables are excluded", () => {
  const sql =
    "CREATE TABLE #T (Id bigint NOT NULL, [Address Text] nvarchar(200) NULL); DECLARE @Scalar bigint; DECLARE @Rows TABLE (Name nvarchar(100) NULL); SELECT t. FROM #T t";
  const result = complete(sql, sql.indexOf("t.") + 2);
  assert.deepEqual(
    result.map((x) => x.name),
    ["Address Text", "Id"],
  );
  assert.equal(result.find((x) => x.name === "Id")?.nullable, false);
  assert.equal(
    result.find((x) => x.name === "Address Text")?.sqlType?.maxLength,
    400,
  );
  assert.equal(
    complete(sql).some(
      (x) => x.name === "@Scalar" && x.kind === "tableVariable",
    ),
    false,
  );
  assert.equal(
    complete(`${sql}; SELECT * FROM @Ro`).some(
      (x) => x.name === "@Rows" && x.kind === "tableVariable",
    ),
    true,
  );
  const global =
    "CREATE TABLE ##GlobalTemp (Id int NOT NULL); SELECT g. FROM ##GlobalTemp g";
  assert.deepEqual(
    complete(global, global.indexOf("g.") + 2).map((x) => x.name),
    ["Id"],
  );
});

test("ALTER TABLE temp ADD extends subsequent local metadata", () => {
  const sql =
    "CREATE TABLE #T (Id int NOT NULL); ALTER TABLE #T ADD Name nvarchar(50) NULL, Flag bit NOT NULL; SELECT t. FROM #T t";
  const result = complete(sql, sql.indexOf("t.") + 2);
  assert.deepEqual(
    result.map((x) => x.name),
    ["Flag", "Id", "Name"],
  );
  assert.equal(result.find((x) => x.name === "Name")?.sqlType?.maxLength, 100);
  assert.equal(result.find((x) => x.name === "Flag")?.nullable, false);
});

test("SELECT INTO supports aliases, computed aliases, and star expansion", () => {
  const sql =
    "SELECT CustomerId AS Id, EmailAddress AS Mail, CreditLimit * 2 AS Gross INTO #T FROM dbo.Customers; SELECT t. FROM #T t";
  const result = complete(sql, sql.indexOf("t.") + 2);
  assert.deepEqual(
    result.map((x) => x.name),
    ["Gross", "Id", "Mail"],
  );
  assert.equal(result.find((x) => x.name === "Id")?.sqlType?.name, "bigint");
  assert.equal(
    result.find((x) => x.name === "Gross")?.sqlType?.name,
    "unknown",
  );
  const star = "SELECT c.* INTO #T FROM dbo.Customers c; SELECT t. FROM #T t";
  assert.equal(complete(star, star.indexOf("t.") + 2).length, 4);
});

test("derived tables and nested projections expose only projected columns", () => {
  const sql =
    "SELECT x. FROM (SELECT CustomerId AS Id, EmailAddress AS Mail FROM dbo.Customers) x";
  assert.deepEqual(
    complete(sql, sql.indexOf("x.") + 2).map((x) => x.name),
    ["Id", "Mail"],
  );
  const star = "SELECT x. FROM (SELECT c.* FROM dbo.Customers c) x";
  assert.equal(complete(star, star.indexOf("x.") + 2).length, 4);
  const nested =
    "SELECT y. FROM (SELECT x.* FROM (SELECT CustomerId FROM dbo.Customers) x) y";
  assert.deepEqual(
    complete(nested, nested.indexOf("y.") + 2).map((x) => x.name),
    ["CustomerId"],
  );
});

test("VALUES aliases, APPLY TVFs, and derived APPLY resolve columns", () => {
  const values = "SELECT v. FROM (VALUES (1, 'A'), (2, 'B')) v(Id, Name)";
  assert.deepEqual(
    complete(values, values.indexOf("v.") + 2).map((x) => x.name),
    ["Id", "Name"],
  );
  for (const keyword of ["CROSS APPLY", "OUTER APPLY"]) {
    const tvf = `SELECT a. FROM dbo.Customers c ${keyword} reporting.GetCustomerAddresses(c.CustomerId) a`;
    assert.deepEqual(
      complete(tvf, tvf.indexOf("a.") + 2).map((x) => x.name),
      ["AddressId", "AddressText"],
    );
  }
  const derived =
    "SELECT a. FROM dbo.Customers c CROSS APPLY (SELECT c.CustomerId, c.EmailAddress) a";
  const derivedResult = complete(derived, derived.indexOf("a.") + 2);
  assert.deepEqual(
    derivedResult.map((x) => x.name),
    ["CustomerId", "EmailAddress"],
  );
  assert.equal(derivedResult[0]?.sqlType?.name, "bigint");
});

test("ORDER BY projection aliases use Contains and fake SQL is ignored", () => {
  const sql =
    "SELECT CustomerId AS Id, EmailAddress AS Mail, CreditLimit * 2 AS GrossLimit FROM dbo.Customers ORDER BY Ma";
  assert.equal(
    complete(sql).some((x) => x.name === "Mail"),
    true,
  );
  const fake =
    "-- CREATE TABLE #Fake (Id int)\nSELECT 'WITH X AS (SELECT 1)' FROM #Fa";
  assert.equal(
    complete(fake).some((x) => ["#Fake", "X"].includes(x.name)),
    false,
  );
});

test("local definitions after the cursor and aliases in other statements do not leak", () => {
  const sql = "SELECT * FROM #T; CREATE TABLE #T (Id int);";
  assert.equal(
    complete(sql, sql.indexOf("#T") + 2).some((x) => x.name === "#T"),
    false,
  );
  const aliases = "SELECT c. FROM dbo.Customers c; SELECT 1";
  assert.deepEqual(
    complete(aliases, aliases.indexOf("c.") + 2).map((x) => x.name),
    ["BillingAddressId", "CreditLimit", "CustomerId", "EmailAddress"],
  );
});

test("table variables do not leak across GO while document-known temps remain conservative", () => {
  const sql =
    "DECLARE @Rows TABLE (Id int); CREATE TABLE #T (Id int);\nGO\nSELECT * FROM @Ro";
  assert.equal(
    complete(sql).some((x) => x.name === "@Rows"),
    false,
  );
  assert.equal(
    complete(`${sql}; SELECT * FROM #`).some((x) => x.name === "#T"),
    true,
  );
});

const billingIndex = new DatabaseIndex({
  database: "IntelliSenseLab",
  schemas: ["billing"],
  loadedAt: 0,
  objects: [
    {
      schema: "billing",
      name: "BillingAddress_0001",
      normalizedName: "billingaddress_0001",
      kind: "table",
      parameters: [],
      columns: [
        {
          name: "BillingAddressId",
          normalizedName: "billingaddressid",
          type: { name: "bigint" },
          nullable: false,
          ordinal: 1,
        },
        {
          name: "BillingCode",
          normalizedName: "billingcode",
          type: { name: "nvarchar", maxLength: 100 },
          nullable: false,
          ordinal: 2,
        },
      ],
    },
  ],
});
const archiveColumns = [
  {
    name: "ArchiveId",
    normalizedName: "archiveid",
    type: { name: "bigint" },
    nullable: false,
    ordinal: 1,
  },
  {
    name: "CustomerId",
    normalizedName: "customerid",
    type: { name: "bigint" },
    nullable: false,
    ordinal: 2,
  },
  {
    name: "AddressId",
    normalizedName: "addressid",
    type: { name: "bigint" },
    nullable: true,
    ordinal: 3,
  },
  {
    name: "ArchivedAddressText",
    normalizedName: "archivedaddresstext",
    type: { name: "nvarchar", maxLength: 800 },
    nullable: true,
    ordinal: 4,
  },
  {
    name: "ArchivedEmailAddress",
    normalizedName: "archivedemailaddress",
    type: { name: "nvarchar", maxLength: 640 },
    nullable: true,
    ordinal: 5,
  },
  {
    name: "ArchivedAt",
    normalizedName: "archivedat",
    type: { name: "datetime2", scale: 3 },
    nullable: false,
    ordinal: 6,
  },
] as const;
const archiveIndex = new DatabaseIndex({
  database: "IntelliSenseLabReporting",
  schemas: ["archive"],
  loadedAt: 0,
  objects: [
    {
      schema: "archive",
      name: "CustomerAddressArchive",
      normalizedName: "customeraddressarchive",
      kind: "table",
      parameters: [],
      columns: archiveColumns,
    },
  ],
});
const twoDatabaseScope = {
  activeDatabase: "IntelliSenseLab",
  indexes: new Map([
    ["intellisenselab", billingIndex],
    ["intellisenselabreporting", archiveIndex],
  ]),
};

test("exact two-CTE regression keeps explicit and cross-database star projections independent", () => {
  const sql = `WITH bla AS
(
    SELECT a.BillingAddressId, a.BillingCode
    FROM IntelliSenseLab.billing.BillingAddress_0001 AS a
),
ala AS
(
    SELECT *
    FROM IntelliSenseLabReporting.archive.CustomerAddressArchive AS b
)
SELECT *
FROM bla AS x
JOIN ala AS y ON y.`;
  const y = createCandidates(resolveSqlContext(sql), twoDatabaseScope);
  assert.deepEqual(
    y.map((candidate) => candidate.name),
    [
      "AddressId",
      "ArchivedAddressText",
      "ArchivedAt",
      "ArchivedEmailAddress",
      "ArchiveId",
      "CustomerId",
    ],
  );
  assert.ok(y.every((candidate) => candidate.kind === "column"));
  for (const forbidden of [
    "a",
    "ala",
    "archive",
    "as",
    "b",
    "billing",
    "bla",
    "from",
    "IntelliSenseLab",
  ])
    assert.equal(
      y.some((candidate) => candidate.name === forbidden),
      false,
    );

  const xSql = sql.replace("ON y.", "ON x.");
  const x = createCandidates(resolveSqlContext(xSql), twoDatabaseScope);
  assert.deepEqual(
    x.map((candidate) => candidate.name),
    ["BillingAddressId", "BillingCode"],
  );
  const model = analyzeDocumentSemanticsForTest(sql, twoDatabaseScope);
  assert.equal(model.aliases.has("a"), false);
  assert.equal(model.aliases.has("b"), false);
  assert.equal(model.aliases.get("x")?.name, "bla");
  assert.equal(model.aliases.get("y")?.name, "ala");
});

test("sibling explicit and star CTEs retain their own source projections", () => {
  const orders = new DatabaseIndex({
    database: "Db",
    schemas: ["dbo"],
    loadedAt: 0,
    objects: [
      ...index.objects,
      {
        schema: "dbo",
        name: "Orders",
        normalizedName: "orders",
        kind: "table",
        parameters: [],
        columns: [
          {
            name: "OrderId",
            normalizedName: "orderid",
            type: { name: "bigint" },
            nullable: false,
            ordinal: 1,
          },
          {
            name: "OrderNumber",
            normalizedName: "ordernumber",
            type: { name: "nvarchar", maxLength: 40 },
            nullable: false,
            ordinal: 2,
          },
        ],
      },
    ],
  });
  const localScope = {
    activeDatabase: "Db",
    indexes: new Map([["db", orders]]),
  };
  for (const star of [false, true]) {
    const firstProjection = star ? "*" : "CustomerId, EmailAddress";
    const secondProjection = star ? "*" : "OrderId, OrderNumber";
    const sql = `WITH first AS (SELECT ${firstProjection} FROM dbo.Customers), second AS (SELECT ${secondProjection} FROM dbo.Orders) SELECT * FROM first f JOIN second s ON s.`;
    assert.deepEqual(
      createCandidates(resolveSqlContext(sql), localScope).map((x) => x.name),
      ["OrderId", "OrderNumber"],
    );
    const fSql = sql.replace("ON s.", "ON f.");
    const expected = star
      ? ["BillingAddressId", "CreditLimit", "CustomerId", "EmailAddress"]
      : ["CustomerId", "EmailAddress"];
    assert.deepEqual(
      createCandidates(resolveSqlContext(fSql), localScope).map((x) => x.name),
      expected,
    );
  }
});

test("star dependency, alias star, mixed projection order, and immutable ownership", () => {
  const dependency =
    "WITH first AS (SELECT CustomerId, EmailAddress FROM dbo.Customers), second AS (SELECT * FROM first) SELECT s. FROM second s";
  assert.deepEqual(
    complete(dependency, dependency.indexOf("s.") + 2).map((x) => x.name),
    ["CustomerId", "EmailAddress"],
  );
  const aliasStar =
    "WITH x AS (SELECT c.* FROM dbo.Customers c) SELECT a. FROM x a";
  assert.equal(complete(aliasStar, aliasStar.indexOf("a.") + 2).length, 4);
  const mixed =
    "WITH x AS (SELECT c.*, a.AddressId AS OtherAddressId FROM dbo.Customers c JOIN dbo.Customers a ON 1=1) SELECT z. FROM x z";
  assert.deepEqual(
    complete(mixed, mixed.indexOf("z.") + 2).map((x) => x.name),
    [
      "BillingAddressId",
      "CreditLimit",
      "CustomerId",
      "EmailAddress",
      "OtherAddressId",
    ],
  );

  const model = analyzeDocumentSemanticsForTest(
    "WITH first AS (SELECT CustomerId FROM dbo.Customers), second AS (SELECT EmailAddress FROM dbo.Customers) SELECT * FROM first f JOIN second s ON s.",
    scope,
  );
  const first = model.rowSources.find((source) => source.name === "first");
  const second = model.rowSources.find((source) => source.name === "second");
  assert.ok(first && second);
  assert.notEqual(first.columns, second.columns);
  assert.equal(Object.isFrozen(first.columns), true);
  assert.throws(() =>
    (first.columns as unknown as { push(value: unknown): void }).push(
      second.columns[0],
    ),
  );
  assert.deepEqual(
    first.columns.map((column) => column.name),
    ["CustomerId"],
  );
});

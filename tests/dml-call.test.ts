import assert from "node:assert/strict";
import test from "node:test";
import { createCandidates } from "../src/completion/CandidateFactory.js";
import { DatabaseIndex } from "../src/metadata/DatabaseIndex.js";
import { isWritableColumn } from "../src/metadata/MetadataModels.js";
import { quoteIdentifier } from "../src/metadata/SqlTypeFormatter.js";
import {
  functionInvocationDatabase,
  functionSignatureLabel,
  resolveFunctionSignature,
} from "../src/parser/DmlCallAnalyzer.js";
import { resolveSqlContext } from "../src/parser/SqlContextResolver.js";

const columns = [
  {
    name: "CustomerId",
    normalizedName: "customerid",
    type: { name: "bigint" },
    nullable: false,
    ordinal: 1,
    identity: true,
  },
  {
    name: "CustomerCode",
    normalizedName: "customercode",
    type: { name: "nvarchar", maxLength: 40 },
    nullable: false,
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
    name: "PrimaryAddressId",
    normalizedName: "primaryaddressid",
    type: { name: "bigint" },
    nullable: true,
    ordinal: 4,
  },
  {
    name: "BillingAddressId",
    normalizedName: "billingaddressid",
    type: { name: "bigint" },
    nullable: true,
    ordinal: 5,
  },
  {
    name: "ShippingAddressId",
    normalizedName: "shippingaddressid",
    type: { name: "bigint" },
    nullable: true,
    ordinal: 6,
  },
  {
    name: "ComputedName",
    normalizedName: "computedname",
    type: { name: "nvarchar", maxLength: 100 },
    nullable: true,
    ordinal: 7,
    computed: true,
  },
  {
    name: "PeriodStart",
    normalizedName: "periodstart",
    type: { name: "datetime2" },
    nullable: false,
    ordinal: 8,
    generatedAlways: true,
  },
  {
    name: "RowVersion",
    normalizedName: "rowversion",
    type: { name: "timestamp" },
    nullable: false,
    ordinal: 9,
  },
  {
    name: "Customer Name",
    normalizedName: "customer name",
    type: { name: "nvarchar", maxLength: 200 },
    nullable: true,
    ordinal: 10,
  },
] as const;
const index = new DatabaseIndex({
  database: "Db",
  schemas: ["dbo", "billing", "reporting"],
  loadedAt: 0,
  objects: [
    {
      schema: "dbo",
      name: "Customers",
      normalizedName: "customers",
      kind: "table",
      parameters: [],
      columns,
    },
    {
      schema: "dbo",
      name: "CustomerAddresses",
      normalizedName: "customeraddresses",
      kind: "table",
      parameters: [],
      columns: [
        {
          name: "AddressId",
          normalizedName: "addressid",
          type: { name: "bigint" },
          nullable: false,
          ordinal: 1,
        },
      ],
    },
    {
      schema: "sales",
      name: "CustomerOrders",
      normalizedName: "customerorders",
      kind: "table",
      parameters: [],
      columns: [
        {
          name: "CustomerOrderId",
          normalizedName: "customerorderid",
          type: { name: "bigint" },
          nullable: false,
          ordinal: 1,
          identity: true,
        },
        {
          name: "GrossAmount",
          normalizedName: "grossamount",
          type: { name: "decimal", precision: 18, scale: 2 },
          nullable: false,
          ordinal: 2,
          computed: true,
        },
      ],
    },
    {
      schema: "dbo",
      name: "FindCustomerAddress",
      normalizedName: "findcustomeraddress",
      kind: "procedure",
      columns: [],
      parameters: [
        {
          name: "@Search",
          type: { name: "nvarchar", maxLength: 400 },
          output: false,
          ordinal: 1,
        },
        { name: "@MaxRows", type: { name: "int" }, output: false, ordinal: 2 },
        {
          name: "@RowsAffected",
          type: { name: "int" },
          output: true,
          ordinal: 3,
        },
      ],
    },
    {
      schema: "billing",
      name: "CalculateBillingTotal_0001",
      normalizedName: "calculatebillingtotal_0001",
      kind: "scalarFunction",
      columns: [],
      parameters: [
        {
          name: "@NetAmount",
          type: { name: "decimal", precision: 18, scale: 2 },
          output: false,
          ordinal: 1,
        },
        {
          name: "@TaxRate",
          type: { name: "decimal", precision: 9, scale: 4 },
          output: false,
          ordinal: 2,
        },
      ],
      returnType: { name: "decimal", precision: 18, scale: 2 },
    },
    {
      schema: "reporting",
      name: "GetCustomerAddresses_0001",
      normalizedName: "getcustomeraddresses_0001",
      kind: "tableValuedFunction",
      columns: [],
      parameters: [
        {
          name: "@CustomerId",
          type: { name: "bigint" },
          output: false,
          ordinal: 1,
        },
      ],
    },
  ],
});
const otherIndex = new DatabaseIndex({
  ...index.metadata,
  database: "Other",
});
const scope = {
  activeDatabase: "Db",
  indexes: new Map([
    ["db", index],
    ["other", otherIndex],
  ]),
};
const names = (sql: string, cursor = sql.length) =>
  createCandidates(resolveSqlContext(sql, cursor), scope).map((x) => x.name);

test("writable metadata excludes identity, computed, generated, and rowversion columns", () => {
  assert.deepEqual(
    columns.filter(isWritableColumn).map((c) => c.name),
    [
      "CustomerCode",
      "EmailAddress",
      "PrimaryAddressId",
      "BillingAddressId",
      "ShippingAddressId",
      "Customer Name",
    ],
  );
});
test("INSERT columns are target-only, contains matched, and exclude used columns", () => {
  assert.deepEqual(names("INSERT INTO dbo.Customers (Ema"), ["EmailAddress"]);
  assert.deepEqual(names("INSERT INTO dbo.Customers (CustomerCode, Ema"), [
    "EmailAddress",
  ]);
  const bracketed = createCandidates(
    resolveSqlContext("INSERT INTO dbo.Customers (Customer", 35),
    scope,
  ).find((candidate) => candidate.name === "Customer Name");
  assert.ok(bracketed);
  assert.equal(quoteIdentifier(bracketed.name), "[Customer Name]");
});

test("cross-database DML, EXEC, and function signatures use the qualified catalog", () => {
  assert.deepEqual(names("INSERT INTO Other.dbo.Customers (Ema"), [
    "EmailAddress",
  ]);
  assert.deepEqual(names("EXEC Other.dbo.FindCustomerAddress @Sea"), [
    "@Search",
  ]);
  const sql = "SELECT Other.billing.CalculateBillingTotal_0001(1, ";
  const signature = resolveFunctionSignature(sql, sql.length, scope);
  assert.ok(signature);
  assert.equal(signature.object.schema, "billing");
  assert.equal(signature.activeParameter, 1);
});
test("UPDATE target and alias SET completion excludes used targets while RHS remains alias members", () => {
  assert.deepEqual(names("UPDATE dbo.Customers SET Addr"), [
    "BillingAddressId",
    "EmailAddress",
    "PrimaryAddressId",
    "ShippingAddressId",
  ]);
  assert.deepEqual(names("UPDATE Other.dbo.Customers SET Addr"), [
    "BillingAddressId",
    "EmailAddress",
    "PrimaryAddressId",
    "ShippingAddressId",
  ]);
  const aliasUpdate =
    "UPDATE c SET CustomerCode=N'x', Ema FROM dbo.Customers c";
  assert.deepEqual(names(aliasUpdate, aliasUpdate.indexOf("Ema") + 3), [
    "EmailAddress",
  ]);
  const rhs =
    "UPDATE c SET BillingAddressId = a. FROM dbo.Customers c JOIN dbo.CustomerAddresses a ON 1=1";
  assert.deepEqual(names(rhs, rhs.indexOf("a.") + 2), ["AddressId"]);
});
test("DELETE aliases remain normal member scopes", () => {
  const sql =
    "DELETE c FROM dbo.Customers c JOIN dbo.CustomerAddresses ca ON 1=1 WHERE ca.";
  assert.deepEqual(names(sql, sql.length), ["AddressId"]);
});
test("EXEC named parameters preserve declaration order, used exclusion, OUTPUT, and EXECUTE", () => {
  assert.deepEqual(names("EXEC dbo.FindCustomerAddress @Sea"), ["@Search"]);
  const result = createCandidates(
    resolveSqlContext("EXECUTE dbo.FindCustomerAddress @Search=N'x', @"),
    scope,
  );
  assert.deepEqual(
    result.map((x) => x.name),
    ["@MaxRows", "@RowsAffected"],
  );
  assert.equal(result[1]?.parameterOutput, true);
});
test("function signatures track arguments and ignore nested commas", () => {
  const first = resolveFunctionSignature(
    "SELECT billing.CalculateBillingTotal_0001(",
    51,
    scope,
  );
  assert.ok(first);
  assert.equal(first.activeParameter, 0);
  assert.equal(first.object.returnType?.precision, 18);
  assert.equal(
    functionSignatureLabel(first.object),
    "billing.CalculateBillingTotal_0001(@NetAmount decimal(18,2), @TaxRate decimal(9,4)) → decimal(18,2)",
  );
  const qualifiedCall = "SELECT Other.billing.CalculateBillingTotal_0001(";
  assert.equal(
    functionInvocationDatabase(qualifiedCall, qualifiedCall.length),
    "Other",
  );
  const afterComma =
    "SELECT Other.billing.CalculateBillingTotal_0001(COALESCE(1, 2), ";
  assert.equal(
    functionInvocationDatabase(afterComma, afterComma.length),
    "Other",
  );
  const stringsAndComments =
    "SELECT billing.CalculateBillingTotal_0001('a,b' /* x,y */, ";
  assert.equal(
    resolveFunctionSignature(
      stringsAndComments,
      stringsAndComments.length,
      scope,
    )?.activeParameter,
    1,
  );
  const autoClosed = "SELECT billing.CalculateBillingTotal_0001() ; SELECT 1";
  const autoClosedCursor = autoClosed.indexOf("(") + 1;
  assert.equal(
    resolveFunctionSignature(autoClosed, autoClosedCursor, scope)
      ?.activeParameter,
    0,
  );
  const secondSql =
    "SELECT billing.CalculateBillingTotal_0001(COALESCE(1, 2), ";
  assert.equal(
    resolveFunctionSignature(secondSql, secondSql.length, scope)
      ?.activeParameter,
    1,
  );
  const tvf = "SELECT * FROM reporting.GetCustomerAddresses_0001(";
  assert.equal(
    resolveFunctionSignature(tvf, tvf.length, scope)?.object.kind,
    "tableValuedFunction",
  );
  const tvfObject = resolveFunctionSignature(tvf, tvf.length, scope)?.object;
  assert.equal(
    tvfObject && functionSignatureLabel(tvfObject),
    "reporting.GetCustomerAddresses_0001(@CustomerId bigint) → table",
  );
});
test("OUTPUT inserted/deleted availability follows DML semantics", () => {
  assert.deepEqual(
    names("INSERT INTO dbo.Customers (CustomerCode) OUTPUT inserted."),
    [...columns].map((c) => c.name).sort(),
  );
  assert.deepEqual(
    names("DELETE FROM dbo.Customers OUTPUT deleted."),
    [...columns].map((c) => c.name).sort(),
  );
  assert.deepEqual(
    names("INSERT INTO dbo.Customers (CustomerCode) OUTPUT deleted."),
    [],
  );
  assert.deepEqual(names("DELETE FROM dbo.Customers OUTPUT inserted."), []);
  assert.deepEqual(
    names("UPDATE dbo.Customers SET CustomerCode=N'x' OUTPUT inserted."),
    [...columns].map((c) => c.name).sort(),
  );
  assert.deepEqual(
    names("UPDATE dbo.Customers SET CustomerCode=N'x' OUTPUT deleted."),
    [...columns].map((c) => c.name).sort(),
  );
  const aliasSql =
    "UPDATE c SET CustomerCode=N'x' OUTPUT inserted. FROM dbo.Customers c";
  assert.deepEqual(
    names(aliasSql, aliasSql.indexOf("inserted.") + "inserted.".length),
    [...columns].map((c) => c.name).sort(),
  );
});

test("DML targets and synthetic sources are isolated to the cursor statement", () => {
  const sql = `INSERT INTO sales.CustomerOrders (GrossAmount) OUTPUT inserted.;
DELETE FROM dbo.Customers OUTPUT inserted.;
DELETE FROM dbo.Customers OUTPUT deleted.`;
  const invalid = sql.indexOf("inserted.;", sql.indexOf("DELETE"));
  assert.deepEqual(names(sql, invalid + "inserted.".length), []);
  const deleted = sql.lastIndexOf("deleted.") + "deleted.".length;
  assert.deepEqual(
    names(sql, deleted),
    [...columns].map((column) => column.name).sort(),
  );
  const containsSql =
    "UPDATE dbo.Customers SET CustomerCode=N'x' OUTPUT inserted.addr";
  assert.deepEqual(names(containsSql), [
    "BillingAddressId",
    "EmailAddress",
    "PrimaryAddressId",
    "ShippingAddressId",
  ]);
});

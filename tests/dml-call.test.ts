import assert from "node:assert/strict";
import test from "node:test";
import { createCandidates } from "../src/completion/CandidateFactory.js";
import { DatabaseIndex } from "../src/metadata/DatabaseIndex.js";
import { isWritableColumn } from "../src/metadata/MetadataModels.js";
import { quoteIdentifier } from "../src/metadata/SqlTypeFormatter.js";
import { physicalColumnDisplayRow } from "../src/completion/PresentationModel.js";
import {
  callableDatabase,
  callableSignatureLabel,
  parseCallSite,
  resolveCallableAtCursor,
} from "../src/parser/CallableAnalyzer.js";
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
      id: 1,
      schema: "dbo",
      name: "Customers",
      normalizedName: "customers",
      kind: "table",
      parameters: [],
      columns,
    },
    {
      id: 2,
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
    ...["Foo", "FooBar", "FooBarBaz"].map((name, offset) => ({
      id: 20 + offset,
      schema: "dbo",
      name,
      normalizedName: name.toLocaleLowerCase("en-US"),
      kind: "table" as const,
      parameters: [],
      columns: [
        {
          name: `${name}Id`,
          normalizedName: `${name.toLocaleLowerCase("en-US")}id`,
          type: { name: "int" },
          nullable: false,
          ordinal: 1,
        },
      ],
    })),
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
  keys: [
    {
      database: "Db",
      objectId: 1,
      schema: "dbo",
      objectName: "Customers",
      name: "PK_Customers",
      kind: "primaryKey",
      filtered: false,
      columns: [{ columnId: 1, columnName: "CustomerId", ordinal: 1 }],
    },
    {
      database: "Db",
      objectId: 1,
      schema: "dbo",
      objectName: "Customers",
      name: "UQ_Customers_CustomerCode",
      kind: "uniqueConstraint",
      filtered: false,
      columns: [{ columnId: 2, columnName: "CustomerCode", ordinal: 1 }],
    },
  ],
  foreignKeys: [
    {
      database: "Db",
      id: 10,
      name: "FK_Customers_BillingAddress",
      parentObjectId: 1,
      parentSchema: "dbo",
      parentObjectName: "Customers",
      referencedObjectId: 2,
      referencedSchema: "dbo",
      referencedObjectName: "CustomerAddresses",
      columns: [
        {
          parentColumnId: 5,
          parentColumnName: "BillingAddressId",
          referencedColumnId: 1,
          referencedColumnName: "AddressId",
          ordinal: 1,
        },
      ],
      deleteAction: "SET_NULL",
      updateAction: "NO_ACTION",
      disabled: false,
      notTrusted: false,
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
const candidates = (sql: string, cursor = sql.length) =>
  createCandidates(resolveSqlContext(sql, cursor), scope);

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

test("contract: DML target positions complete target RowSources with Contains", () => {
  for (const sql of ["UPDATE ", "INSERT INTO ", "DELETE FROM "]) {
    assert.equal(resolveSqlContext(sql).kind, "dmlTarget", sql);
    assert.ok(
      candidates(sql).some((candidate) => candidate.kind === "table"),
      sql,
    );
    assert.equal(
      candidates(sql).some((candidate) => candidate.kind === "builtinFunction"),
      false,
      sql,
    );
  }
  for (const sql of ["UPDATE Foo", "INSERT INTO Foo", "DELETE FROM Foo"])
    assert.deepEqual(
      candidates(sql)
        .filter((candidate) => candidate.kind === "table")
        .map((candidate) => candidate.name),
      ["Foo", "FooBar", "FooBarBaz"],
      sql,
    );
  for (const sql of [
    "UPDATE dbo.Foo",
    "INSERT INTO dbo.Foo",
    "DELETE FROM dbo.Foo",
    "UPDATE Db.dbo.Foo",
    "INSERT INTO Db.dbo.Foo",
    "DELETE FROM Db.dbo.Foo",
  ])
    assert.deepEqual(
      candidates(sql)
        .filter((candidate) => candidate.kind === "table")
        .map((candidate) => candidate.name),
      ["Foo", "FooBar", "FooBarBaz"],
      sql,
    );
});

test("contract: DML target completion stays out of assignment expressions", () => {
  const rhs = candidates("UPDATE dbo.Customers SET EmailAddress = Foo");
  assert.equal(
    rhs.some((candidate) => candidate.kind === "table"),
    false,
    "UPDATE RHS must remain expression completion, not target-object completion",
  );
  const targetColumn = candidates("UPDATE dbo.Customers SET Foo");
  assert.equal(
    targetColumn.some((candidate) => candidate.kind === "table"),
    false,
    "UPDATE SET target column phase must not offer target RowSources",
  );
});

test("UPDATE alias qualification is syntax-aware across SET targets and RHS expressions", () => {
  const lhsSql = "UPDATE c SET Customer FROM dbo.Customers AS c";
  const lhs = candidates(lhsSql, lhsSql.indexOf(" FROM")).find(
    (candidate) => candidate.name === "CustomerCode",
  );
  assert.ok(lhs);
  assert.equal(lhs.insertText, undefined);

  const sql = "UPDATE c SET EmailAddress = Customer FROM dbo.Customers AS c";
  const cursor = sql.indexOf(" FROM");
  const rhs = candidates(sql, cursor).find(
    (candidate) => candidate.name === "CustomerCode",
  );
  assert.ok(rhs);
  assert.equal(rhs.insertText, "c.CustomerCode");
  assert.equal(rhs.sourceQualifier, "c");
  assert.equal(rhs.sourceObject?.name, "Customers");
});

test("contract: INSERT columns are target-only Contains-matched and exclude used columns", () => {
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

test("contract: DML physical columns preserve canonical metadata", () => {
  const ordinarySql = "SELECT c. FROM dbo.Customers c";
  const ordinary = createCandidates(
    resolveSqlContext(ordinarySql, ordinarySql.indexOf("c.") + 2),
    scope,
  );
  const contexts = [
    createCandidates(resolveSqlContext("INSERT INTO dbo.Customers ("), scope),
    createCandidates(resolveSqlContext("UPDATE dbo.Customers SET "), scope),
    createCandidates(
      resolveSqlContext(
        "UPDATE dbo.Customers SET EmailAddress=N'x' OUTPUT inserted.",
      ),
      scope,
    ),
    createCandidates(
      resolveSqlContext("DELETE FROM dbo.Customers OUTPUT deleted."),
      scope,
    ),
  ];
  for (const candidates of contexts)
    for (const name of ["CustomerCode", "BillingAddressId", "EmailAddress"]) {
      const expected = ordinary.find((candidate) => candidate.name === name);
      const actual = candidates.find((candidate) => candidate.name === name);
      assert.ok(expected, `ordinary candidate missing ${name}`);
      assert.ok(actual, `DML candidate missing ${name}`);
      assert.equal(actual.physicalColumn, true);
      assert.equal(actual.database, expected.database);
      assert.equal(actual.schema, expected.schema);
      assert.equal(actual.sourceObject, expected.sourceObject);
      assert.equal(actual.column, expected.column);
      assert.deepEqual(actual.keyRoles, expected.keyRoles);
      assert.deepEqual(actual.keys, expected.keys);
      assert.deepEqual(actual.relationships, expected.relationships);
      assert.equal(
        physicalColumnDisplayRow(actual),
        physicalColumnDisplayRow(expected),
      );
    }
  assert.deepEqual(
    contexts
      .slice(0, 2)
      .map((candidates) =>
        candidates.some((candidate) => candidate.name === "CustomerId"),
      ),
    [false, false],
    "writable targets must still exclude the identity PK",
  );
  assert.deepEqual(
    contexts
      .slice(2)
      .map(
        (candidates) =>
          candidates.find((candidate) => candidate.name === "CustomerId")
            ?.keyRoles,
      ),
    [["PK"], ["PK"]],
    "OUTPUT pseudo sources must retain non-writable PK columns",
  );
});

test("cross-database DML, EXEC, and function signatures use the qualified catalog", () => {
  assert.deepEqual(names("INSERT INTO Other.dbo.Customers (Ema"), [
    "EmailAddress",
  ]);
  assert.deepEqual(names("EXEC Other.dbo.FindCustomerAddress @Sea"), [
    "@Search",
  ]);
  const sql = "SELECT Other.billing.CalculateBillingTotal_0001(1, ";
  const signature = resolveCallableAtCursor(sql, sql.length, scope);
  assert.ok(signature);
  assert.equal(signature.signature.schema, "billing");
  assert.equal(signature.activeParameter, 1);
});
test("contract: UPDATE targets exclude used columns while RHS retains alias members", () => {
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
test("contract: DELETE aliases remain normal member scopes", () => {
  const sql =
    "DELETE c FROM dbo.Customers c JOIN dbo.CustomerAddresses ca ON 1=1 WHERE ca.";
  assert.deepEqual(names(sql, sql.length), ["AddressId"]);
});
test("contract: EXEC parameters preserve order exclusion OUTPUT and EXECUTE", () => {
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
test("contract: catalog signatures track arguments and ignore nested commas", () => {
  const first = resolveCallableAtCursor(
    "SELECT billing.CalculateBillingTotal_0001(",
    51,
    scope,
  );
  assert.ok(first);
  assert.equal(first.activeParameter, 0);
  assert.equal(first.signature.returnType?.precision, 18);
  assert.equal(
    callableSignatureLabel(first.signature),
    "billing.CalculateBillingTotal_0001(@NetAmount decimal(18,2), @TaxRate decimal(9,4)) → decimal(18,2)",
  );
  const qualifiedCall = "SELECT Other.billing.CalculateBillingTotal_0001(";
  assert.equal(
    callableDatabase(parseCallSite(qualifiedCall, qualifiedCall.length)),
    "Other",
  );
  const afterComma =
    "SELECT Other.billing.CalculateBillingTotal_0001(COALESCE(1, 2), ";
  assert.equal(
    callableDatabase(parseCallSite(afterComma, afterComma.length)),
    "Other",
  );
  const stringsAndComments =
    "SELECT billing.CalculateBillingTotal_0001('a,b' /* x,y */, ";
  assert.equal(
    resolveCallableAtCursor(
      stringsAndComments,
      stringsAndComments.length,
      scope,
    )?.activeParameter,
    1,
  );
  const autoClosed = "SELECT billing.CalculateBillingTotal_0001() ; SELECT 1";
  const autoClosedCursor = autoClosed.indexOf("(") + 1;
  assert.equal(
    resolveCallableAtCursor(autoClosed, autoClosedCursor, scope)
      ?.activeParameter,
    0,
  );
  const secondSql =
    "SELECT billing.CalculateBillingTotal_0001(COALESCE(1, 2), ";
  assert.equal(
    resolveCallableAtCursor(secondSql, secondSql.length, scope)
      ?.activeParameter,
    1,
  );
  const tvf = "SELECT * FROM reporting.GetCustomerAddresses_0001(";
  assert.equal(
    resolveCallableAtCursor(tvf, tvf.length, scope)?.signature.kind,
    "tableValued",
  );
  const tvfObject = resolveCallableAtCursor(tvf, tvf.length, scope)?.signature;
  assert.equal(
    tvfObject && callableSignatureLabel(tvfObject),
    "reporting.GetCustomerAddresses_0001(@CustomerId bigint) → table",
  );
});
test("shared call sites own qualification, argument ranges, and nested active arguments", () => {
  const firstSql = "SELECT billing.CalculateBillingTotal_0001(";
  const first = parseCallSite(firstSql, firstSql.length);
  assert.ok(first);
  assert.deepEqual(first.nameParts, ["billing", "CalculateBillingTotal_0001"]);
  assert.equal(first.name, "CalculateBillingTotal_0001");
  assert.equal(first.schema, "billing");
  assert.equal(first.database, undefined);
  assert.equal(first.activeArgument, 0);
  assert.equal(first.complete, false);

  const laterSql =
    "SELECT Other.billing.CalculateBillingTotal_0001(COALESCE(1, 2), CAST(3 AS decimal(18, 2)), ";
  const later = parseCallSite(laterSql, laterSql.length);
  assert.ok(later);
  assert.deepEqual(later.nameParts, [
    "Other",
    "billing",
    "CalculateBillingTotal_0001",
  ]);
  assert.equal(later.database, "Other");
  assert.equal(later.activeArgument, 2);
  assert.equal(later.arguments.length, 3);
  assert.equal(
    laterSql.slice(later.arguments[0]?.start, later.arguments[0]?.end).trim(),
    "COALESCE(1, 2)",
  );
  assert.equal(
    laterSql.slice(later.arguments[1]?.start, later.arguments[1]?.end).trim(),
    "CAST(3 AS decimal(18, 2))",
  );
});
test("contract: OUTPUT inserted and deleted availability follows DML semantics", () => {
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

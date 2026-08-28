import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseIndex } from "../src/metadata/DatabaseIndex.js";
import { createCandidates } from "../src/completion/CandidateFactory.js";
import { resolveSqlContext } from "../src/parser/SqlContextResolver.js";
const type = { name: "int" };
const index = new DatabaseIndex({
  database: "Db",
  schemas: ["dbo", "sales"],
  loadedAt: 0,
  objects: [
    {
      id: 1,
      schema: "dbo",
      name: "Customers",
      normalizedName: "customers",
      kind: "table",
      parameters: [],
      columns: [
        {
          name: "CustomerId",
          normalizedName: "customerid",
          type,
          nullable: false,
          ordinal: 1,
        },
        {
          name: "AddressId",
          normalizedName: "addressid",
          type,
          nullable: true,
          ordinal: 2,
        },
        {
          name: "BillingAddressId",
          normalizedName: "billingaddressid",
          type,
          nullable: true,
          ordinal: 3,
        },
        {
          name: "EmailAddress",
          normalizedName: "emailaddress",
          type: { name: "nvarchar", maxLength: 510 },
          nullable: true,
          ordinal: 4,
        },
        {
          name: "ShippingAddressId",
          normalizedName: "shippingaddressid",
          type,
          nullable: true,
          ordinal: 5,
        },
      ],
    },
    {
      id: 2,
      schema: "dbo",
      name: "Addresses",
      normalizedName: "addresses",
      kind: "table",
      parameters: [],
      columns: [],
    },
    {
      id: 3,
      schema: "sales",
      name: "AddressLog",
      normalizedName: "addresslog",
      kind: "view",
      parameters: [],
      columns: [],
    },
    {
      id: 4,
      schema: "dbo",
      name: "GetAddresses",
      normalizedName: "getaddresses",
      kind: "tableValuedFunction",
      parameters: [],
      columns: [],
    },
  ],
});
test("contract: explicit alias completion is columns-only and uses Contains", () => {
  const sql = "SELECT c.addr FROM dbo.Customers c";
  const result = createCandidates(
    resolveSqlContext(sql, "SELECT c.addr".length),
    index,
  );
  assert.deepEqual(
    result.map((x) => x.name),
    ["AddressId", "BillingAddressId", "EmailAddress", "ShippingAddressId"],
  );
  assert.equal(
    result.every((x) => x.kind === "column"),
    true,
  );
});
test("schema qualification excludes unrelated schemas", () => {
  const result = createCandidates(
    resolveSqlContext("SELECT * FROM dbo.addr"),
    index,
  );
  assert.deepEqual(
    result.map((x) => x.name),
    ["Addresses", "GetAddresses"],
  );
});

test("an ambiguous unqualified alias source returns no columns", () => {
  const ambiguous = new DatabaseIndex({
    database: "Db",
    schemas: ["dbo", "sales"],
    loadedAt: 0,
    objects: [
      ...index.objects,
      {
        id: 9,
        schema: "sales",
        name: "Customers",
        normalizedName: "customers",
        kind: "table",
        parameters: [],
        columns: [
          {
            name: "WrongColumn",
            normalizedName: "wrongcolumn",
            type,
            nullable: false,
            ordinal: 1,
          },
        ],
      },
    ],
  });
  const sql = "SELECT c.addr FROM Customers c";
  assert.deepEqual(
    createCandidates(resolveSqlContext(sql, "SELECT c.addr".length), ambiguous),
    [],
  );
});

test("contract: exact RowSource matches retain longer prefix-family Contains candidates", () => {
  const family = new DatabaseIndex({
    database: "Db",
    schemas: ["dbo"],
    loadedAt: 0,
    objects: ["Foo", "FooBar", "FooBarBaz"].map((name, index) => ({
      id: 100 + index,
      schema: "dbo",
      name,
      normalizedName: name.toLocaleLowerCase("en-US"),
      kind: "table" as const,
      parameters: [],
      columns: [
        {
          name: `${name}Id`,
          normalizedName: `${name.toLocaleLowerCase("en-US")}id`,
          type,
          nullable: false,
          ordinal: 1,
        },
      ],
    })),
  });
  for (const sql of ["SELECT * FROM Foo", "SELECT * FROM dbo.Foo"]) {
    const context = resolveSqlContext(sql);
    assert.equal(sql.slice(context.replacementStart), "Foo");
    assert.deepEqual(
      createCandidates(context, family).map((candidate) => candidate.name),
      ["Foo", "FooBar", "FooBarBaz"],
    );
  }
  for (const name of ["FooBar", "FooBarBaz"]) {
    const sql = `SELECT * FROM dbo.${name} AS f WHERE f.`;
    const candidates = createCandidates(resolveSqlContext(sql), family);
    assert.deepEqual(
      candidates.map((candidate) => candidate.name),
      [`${name}Id`],
    );
    assert.equal(candidates[0]?.sourceObject?.name, name);
  }
});

test("contract: sequential SELECT boundaries keep FROM completion in the RowSource domain", () => {
  const statementIndex = new DatabaseIndex({
    database: "Db",
    schemas: ["dbo", "reporting"],
    loadedAt: 0,
    objects: [
      {
        id: 101,
        schema: "dbo",
        name: "Artikel",
        normalizedName: "artikel",
        kind: "table",
        parameters: [],
        columns: [
          {
            name: "Mandant",
            normalizedName: "mandant",
            type,
            nullable: false,
            ordinal: 1,
          },
        ],
      },
      {
        id: 102,
        schema: "reporting",
        name: "ArtikelOverview",
        normalizedName: "artikeloverview",
        kind: "view",
        parameters: [],
        columns: [],
      },
      {
        id: 103,
        schema: "reporting",
        name: "GetArtikel",
        normalizedName: "getartikel",
        kind: "tableValuedFunction",
        parameters: [],
        columns: [],
      },
      {
        id: 104,
        schema: "dbo",
        name: "CalculateArtikel",
        normalizedName: "calculateartikel",
        kind: "scalarFunction",
        parameters: [],
        columns: [],
        returnType: type,
      },
      {
        id: 105,
        schema: "dbo",
        name: "DropArtikel",
        normalizedName: "dropartikel",
        kind: "procedure",
        parameters: [],
        columns: [],
      },
    ],
  });
  const prefix = `select *
from Artikel as a
where a.Mandant = 1
order by a.Mandant`;
  for (const separator of ["\n\n", ";\n\n"]) {
    const sql = `${prefix}${separator}select *\nfrom `;
    const context = resolveSqlContext(sql);
    const candidates = createCandidates(context, statementIndex);
    assert.equal(context.kind, "rowSource");
    assert.deepEqual(
      candidates.map((candidate) => [candidate.name, candidate.kind]),
      [
        ["dbo", "schema"],
        ["reporting", "schema"],
        ["Artikel", "table"],
        ["ArtikelOverview", "view"],
        ["GetArtikel", "tableValuedFunction"],
      ],
    );
    assert.equal(
      candidates.some((candidate) =>
        ["column", "rowSourceAlias", "scalarFunction", "procedure"].includes(
          candidate.kind,
        ),
      ),
      false,
    );
  }
});

const reportingIndex = new DatabaseIndex({
  database: "ReportingDb",
  schemas: ["dbo", "reporting", "sales"],
  loadedAt: 0,
  objects: [
    {
      id: 20,
      schema: "reporting",
      name: "CustomerAddressReport",
      normalizedName: "customeraddressreport",
      kind: "view",
      parameters: [],
      columns: [
        {
          name: "ReportAddressId",
          normalizedName: "reportaddressid",
          type,
          nullable: false,
          ordinal: 1,
        },
        {
          name: "EmailAddress",
          normalizedName: "emailaddress",
          type,
          nullable: true,
          ordinal: 2,
        },
      ],
    },
    {
      id: 21,
      schema: "dbo",
      name: "CustomerArchive",
      normalizedName: "customerarchive",
      kind: "table",
      parameters: [],
      columns: [],
    },
    {
      id: 22,
      schema: "sales",
      name: "CustomerAddress",
      normalizedName: "customeraddress",
      kind: "table",
      parameters: [],
      columns: [],
    },
  ],
});
const crossDatabaseScope = {
  activeDatabase: "Db",
  databaseNames: ["Db", "IntelliSenseLab", "IntelliSenseLabReporting"],
  indexes: new Map([
    ["db", index],
    ["reportingdb", reportingIndex],
  ]),
};

test("database names use Contains matching in row-source context", () => {
  const result = createCandidates(
    resolveSqlContext("SELECT * FROM Intelli"),
    crossDatabaseScope,
  );
  assert.deepEqual(
    result.map((candidate) => [candidate.name, candidate.kind]),
    [
      ["IntelliSenseLab", "database"],
      ["IntelliSenseLabReporting", "database"],
    ],
  );
});

test("unqualified row sources remain scoped to the active database", () => {
  const result = createCandidates(
    resolveSqlContext("SELECT * FROM addr"),
    crossDatabaseScope,
  );
  assert.deepEqual(
    result.map((candidate) => `${candidate.database}.${candidate.name}`),
    ["Db.Addresses", "Db.AddressLog", "Db.GetAddresses"],
  );
});

test("contract: same-server three-part completion preserves database and schema scope", () => {
  const explicit = createCandidates(
    resolveSqlContext("SELECT * FROM ReportingDb.reporting.addr"),
    crossDatabaseScope,
  );
  assert.deepEqual(
    explicit.map((candidate) => candidate.name),
    ["CustomerAddressReport"],
  );
  const doubleDot = createCandidates(
    resolveSqlContext("SELECT * FROM ReportingDb..cust"),
    crossDatabaseScope,
  );
  assert.deepEqual(
    doubleDot.map((candidate) => candidate.name),
    ["CustomerArchive"],
  );
});

test("contract: row-source completion includes tables views and TVFs", () => {
  const result = createCandidates(
    resolveSqlContext("SELECT * FROM ReportingDb.reporting.customer"),
    crossDatabaseScope,
  );
  assert.deepEqual(
    result.map((candidate) => [candidate.name, candidate.kind]),
    [["CustomerAddressReport", "view"]],
  );
  const mixedIndex = new DatabaseIndex({
    database: "ReportingDb",
    schemas: ["reporting"],
    loadedAt: 0,
    objects: [
      {
        id: 1,
        schema: "reporting",
        name: "CustomerAddressReport",
        normalizedName: "customeraddressreport",
        kind: "table",
        parameters: [],
        columns: [],
      },
      {
        id: 2,
        schema: "reporting",
        name: "ActiveCustomerAddresses",
        normalizedName: "activecustomeraddresses",
        kind: "view",
        parameters: [],
        columns: [],
      },
      {
        id: 3,
        schema: "reporting",
        name: "GetCustomerAddresses",
        normalizedName: "getcustomeraddresses",
        kind: "tableValuedFunction",
        parameters: [],
        columns: [],
      },
    ],
  });
  const mixed = createCandidates(
    resolveSqlContext("SELECT * FROM ReportingDb.reporting.addr"),
    {
      activeDatabase: "Db",
      indexes: new Map([
        ["db", index],
        ["reportingdb", mixedIndex],
      ]),
    },
  );
  assert.deepEqual(
    mixed.map((candidate) => candidate.kind),
    ["table", "view", "tableValuedFunction"],
  );
});

test("database-dot completion contains-matches schemas", () => {
  const result = createCandidates(
    resolveSqlContext("SELECT * FROM ReportingDb.rep"),
    crossDatabaseScope,
  );
  assert.deepEqual(
    result.map((candidate) => candidate.name),
    ["reporting", "reporting.CustomerAddressReport"],
  );
  assert.equal(result[0]?.kind, "schema");
});

test("empty database qualifier returns schemas only", () => {
  const result = createCandidates(
    resolveSqlContext("SELECT * FROM ReportingDb."),
    crossDatabaseScope,
  );
  assert.deepEqual(
    result.map((candidate) => [candidate.name, candidate.kind]),
    [
      ["dbo", "schema"],
      ["reporting", "schema"],
      ["sales", "schema"],
    ],
  );
});

test("database shortcut searches all schemas, keeps schema priority, and inserts valid SQL", () => {
  const shortcutIndex = new DatabaseIndex({
    database: "ReportingDb",
    schemas: ["billing", "crm", "dbo", "reporting"],
    loadedAt: 0,
    objects: [
      {
        id: 30,
        schema: "dbo",
        name: "CustomerAddresses",
        normalizedName: "customeraddresses",
        kind: "table",
        parameters: [],
        columns: [],
      },
      {
        id: 31,
        schema: "crm",
        name: "CustomerAddress_0001",
        normalizedName: "customeraddress_0001",
        kind: "table",
        parameters: [],
        columns: [],
      },
      {
        id: 32,
        schema: "reporting",
        name: "CustomerAddressOverview",
        normalizedName: "customeraddressoverview",
        kind: "view",
        parameters: [],
        columns: [],
      },
      {
        id: 33,
        schema: "reporting",
        name: "GetCustomerAddresses",
        normalizedName: "getcustomeraddresses",
        kind: "tableValuedFunction",
        parameters: [],
        columns: [],
      },
    ],
  });
  const scope = {
    activeDatabase: "Db",
    indexes: new Map([
      ["db", index],
      ["reportingdb", shortcutIndex],
    ]),
  };
  const result = createCandidates(
    resolveSqlContext("SELECT * FROM ReportingDb.addr"),
    scope,
  );
  assert.deepEqual(
    result.map((candidate) => [candidate.name, candidate.kind]),
    [
      ["crm.CustomerAddress_0001", "table"],
      ["dbo.CustomerAddresses", "table"],
      ["reporting.CustomerAddressOverview", "view"],
      ["reporting.GetCustomerAddresses", "tableValuedFunction"],
    ],
  );
  const schemaFirst = createCandidates(
    resolveSqlContext("SELECT * FROM ReportingDb.cr"),
    scope,
  );
  assert.equal(schemaFirst[0]?.name, "crm");
  assert.equal(schemaFirst[0].kind, "schema");
  const sql = "SELECT * FROM ReportingDb.addr";
  const context = resolveSqlContext(sql);
  const selected = result.find(
    (candidate) => candidate.name === "crm.CustomerAddress_0001",
  );
  assert.ok(selected?.insertText);
  assert.equal(
    `${sql.slice(0, context.replacementStart)}${selected.insertText}`,
    "SELECT * FROM ReportingDb.crm.CustomerAddress_0001",
  );
});

test("explicit database schema remains strict and shortcut never leaks databases", () => {
  const strict = createCandidates(
    resolveSqlContext("SELECT * FROM ReportingDb.reporting.addr"),
    crossDatabaseScope,
  );
  assert.ok(strict.every((candidate) => candidate.schema === "reporting"));
  const shortcut = createCandidates(
    resolveSqlContext("SELECT * FROM ReportingDb.addr"),
    crossDatabaseScope,
  );
  assert.ok(
    shortcut.every((candidate) => candidate.database === "ReportingDb"),
  );
});

test("active schema semantics win over a same-named database shortcut", () => {
  const reportingDatabase = new DatabaseIndex({
    database: "sales",
    schemas: ["dbo"],
    loadedAt: 0,
    objects: [
      {
        id: 50,
        schema: "dbo",
        name: "WrongCustomer",
        normalizedName: "wrongcustomer",
        kind: "table",
        parameters: [],
        columns: [],
      },
    ],
  });
  const result = createCandidates(
    resolveSqlContext("SELECT * FROM sales.addr"),
    {
      activeDatabase: "Db",
      databaseNames: ["sales"],
      indexes: new Map([
        ["db", index],
        ["sales", reportingDatabase],
      ]),
    },
  );
  assert.deepEqual(
    result.map((candidate) => candidate.name),
    ["AddressLog"],
  );
  assert.ok(result.every((candidate) => candidate.database === "Db"));
});

test("active-database schemas participate in unqualified row-source completion", () => {
  const active = new DatabaseIndex({
    database: "IntelliSenseLab",
    schemas: ["dbo", "crm", "INFORMATION_SCHEMA", "sys"],
    loadedAt: 0,
    objects: [
      {
        id: 60,
        schema: "dbo",
        name: "CrmCustomers",
        normalizedName: "crmcustomers",
        kind: "table",
        parameters: [],
        columns: [],
      },
      {
        id: 61,
        schema: "crm",
        name: "CustomerCrmOverview",
        normalizedName: "customercrmoverview",
        kind: "view",
        parameters: [],
        columns: [],
      },
      {
        id: 62,
        schema: "crm",
        name: "GetCrmCustomers",
        normalizedName: "getcrmcustomers",
        kind: "tableValuedFunction",
        parameters: [],
        columns: [],
      },
      {
        id: 63,
        schema: "INFORMATION_SCHEMA",
        name: "TABLES",
        normalizedName: "tables",
        kind: "view",
        parameters: [],
        columns: [],
      },
      {
        id: 64,
        schema: "INFORMATION_SCHEMA",
        name: "COLUMNS",
        normalizedName: "columns",
        kind: "view",
        parameters: [],
        columns: [],
      },
      {
        id: 65,
        schema: "sys",
        name: "tables",
        normalizedName: "tables",
        kind: "view",
        parameters: [],
        columns: [],
      },
      {
        id: 66,
        schema: "sys",
        name: "columns",
        normalizedName: "columns",
        kind: "view",
        parameters: [],
        columns: [],
      },
    ],
  });

  for (const fragment of ["inf", "schem"])
    assert.ok(
      createCandidates(
        resolveSqlContext(`SELECT * FROM ${fragment}`),
        active,
      ).some(
        (candidate) =>
          candidate.name === "INFORMATION_SCHEMA" &&
          candidate.kind === "schema",
      ),
    );
  assert.ok(
    createCandidates(resolveSqlContext("SELECT * FROM sy"), active).some(
      (candidate) => candidate.name === "sys" && candidate.kind === "schema",
    ),
  );

  const crm = createCandidates(resolveSqlContext("SELECT * FROM cr"), active);
  assert.equal(crm[0]?.name, "crm");
  assert.equal(crm[0].kind, "schema");
  assert.deepEqual(
    crm.slice(1).map((candidate) => candidate.kind),
    ["table", "view", "tableValuedFunction"],
  );
  assert.equal(crm[0].insertText, "crm.");
  assert.equal(crm[0].triggerSuggest, true);

  assert.deepEqual(
    createCandidates(
      resolveSqlContext("SELECT * FROM INFORMATION_SCHEMA."),
      active,
    ).map((candidate) => candidate.name),
    ["COLUMNS", "TABLES"],
  );
  assert.deepEqual(
    createCandidates(resolveSqlContext("SELECT * FROM sys."), active).map(
      (candidate) => candidate.name,
    ),
    ["columns", "tables"],
  );
});

test("sys and INFORMATION_SCHEMA behave as strict developer metadata schemas", () => {
  const systemIndex = new DatabaseIndex({
    database: "SystemDb",
    schemas: ["INFORMATION_SCHEMA", "sys"],
    loadedAt: 0,
    objects: [
      ...[
        "tables",
        "columns",
        "all_columns",
        "computed_columns",
        "identity_columns",
        "objects",
        "schemas",
      ].map((name, id) => ({
        id: 100 + id,
        schema: "sys",
        name,
        normalizedName: name,
        kind: "view" as const,
        parameters: [],
        columns: [],
      })),
      {
        id: 120,
        schema: "INFORMATION_SCHEMA",
        name: "TABLES",
        normalizedName: "tables",
        kind: "view",
        parameters: [],
        columns: [],
      },
      {
        id: 121,
        schema: "INFORMATION_SCHEMA",
        name: "COLUMNS",
        normalizedName: "columns",
        kind: "view",
        parameters: [],
        columns: [],
      },
    ],
  });
  const scope = {
    activeDatabase: "SystemDb",
    indexes: new Map([["systemdb", systemIndex]]),
  };
  const sys = createCandidates(
    resolveSqlContext("SELECT * FROM sys.col"),
    scope,
  );
  assert.deepEqual(
    sys.map((candidate) => candidate.name),
    ["all_columns", "columns", "computed_columns", "identity_columns"],
  );
  const information = createCandidates(
    resolveSqlContext("SELECT * FROM INFORMATION_SCHEMA.COL"),
    scope,
  );
  assert.deepEqual(
    information.map((candidate) => candidate.name),
    ["COLUMNS"],
  );
});

test("contract: cross-database aliases return only their database members", () => {
  const sql = `SELECT c.addr, r.addr
FROM dbo.Customers c
JOIN ReportingDb.reporting.CustomerAddressReport r ON r.ReportAddressId = c.AddressId`;
  const active = createCandidates(
    resolveSqlContext(sql, "SELECT c.addr".length),
    crossDatabaseScope,
  );
  assert.deepEqual(
    active.map((candidate) => candidate.name),
    ["AddressId", "BillingAddressId", "EmailAddress", "ShippingAddressId"],
  );
  assert.ok(active.every((candidate) => candidate.database === "Db"));
  const externalCursor = "SELECT c.addr, r.addr".length;
  const external = createCandidates(
    resolveSqlContext(sql, externalCursor),
    crossDatabaseScope,
  );
  assert.deepEqual(
    external.map((candidate) => candidate.name),
    ["EmailAddress", "ReportAddressId"],
  );
  assert.ok(
    external.every((candidate) => candidate.database === "ReportingDb"),
  );
});

test("four-part identifiers produce no candidates", () => {
  const context = resolveSqlContext(
    "SELECT * FROM Server.ReportingDb.dbo.Customers",
  );
  assert.doesNotThrow(() => createCandidates(context, crossDatabaseScope));
  assert.deepEqual(createCandidates(context, crossDatabaseScope), []);
});

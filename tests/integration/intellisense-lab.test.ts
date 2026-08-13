import assert from "node:assert/strict";
import test from "node:test";
import * as sql from "mssql";
import { createCandidates } from "../../src/completion/CandidateFactory.js";
import { MetadataCache } from "../../src/metadata/MetadataCache.js";
import { MetadataLoader } from "../../src/mssql/MetadataLoader.js";
import type { ConnectionService } from "../../src/mssql/ConnectionService.js";
import type { DbCellValue } from "../../src/mssql/SimpleExecuteResult.js";
import { resolveSqlContext } from "../../src/parser/SqlContextResolver.js";

const names = [
  "MSSQL_TEST_SERVER",
  "MSSQL_TEST_DATABASE",
  "MSSQL_TEST_USER",
  "MSSQL_TEST_PASSWORD",
] as const;
const enabled = names.every((name) => Boolean(process.env[name]));

test(
  "loads and completes against IntelliSenseLab",
  { skip: !enabled },
  async (context) => {
    const pool = createTestPool(process.env["MSSQL_TEST_DATABASE"] ?? "");
    await pool.connect();
    context.after(async () => pool.close());

    const diagnostic = await pool
      .request()
      .query<{ CurrentDatabase: string; ObjectCount: number }>(
        "SELECT DB_NAME() AS CurrentDatabase, (SELECT COUNT(*) FROM sys.objects WHERE is_ms_shipped = 0) AS ObjectCount;",
      );
    const diagnosticRow = diagnostic.recordset[0];
    assert.ok(diagnosticRow);
    assert.equal(diagnosticRow.CurrentDatabase, "IntelliSenseLab");
    assert.ok(diagnosticRow.ObjectCount > 0);

    const connections = metadataConnection(pool);
    const index = await new MetadataLoader(connections).load({
      connectionId: "integration",
      database: process.env["MSSQL_TEST_DATABASE"] ?? "",
    });
    assert.ok(index.count > 0);
    assert.ok(index.findObject("dbo", "Customers"));
    assert.ok(index.findObject("dbo", "CustomerAddresses"));
    assert.ok(index.findObject("billing", "BillingAddresses"));
    assert.ok(
      index.objects.some(
        (object) => object.schema === "reporting" && object.kind === "view",
      ),
    );
    assert.ok(index.objects.some((object) => object.kind === "scalarFunction"));
    assert.ok(
      index.objects.some((object) => object.kind === "tableValuedFunction"),
    );
    assert.ok(index.objects.some((object) => object.kind === "procedure"));
    const customers = index.findObject("dbo", "Customers");
    assert.ok(
      customers?.columns.some((column) => column.name === "CustomerId"),
    );
    assert.ok(
      customers?.columns.some((column) => column.name === "BillingAddressId"),
    );
    assert.ok(
      customers?.columns.every(
        (column) => column.type.name && typeof column.nullable === "boolean",
      ),
    );

    const from = createCandidates(
      resolveSqlContext("SELECT * FROM addr"),
      index,
    );
    assert.ok(
      from.some(
        (candidate) =>
          candidate.normalizedName.includes("addr") &&
          !candidate.normalizedName.startsWith("addr"),
      ),
    );
    const aliasSql = "SELECT c.addr\nFROM dbo.Customers AS c";
    const alias = createCandidates(
      resolveSqlContext(aliasSql, "SELECT c.addr".length),
      index,
    );
    for (const expected of [
      "PrimaryAddressId",
      "BillingAddressId",
      "ShippingAddressId",
      "EmailAddress",
    ])
      assert.ok(
        alias.some((candidate) => candidate.name === expected),
        `missing alias candidate ${expected}`,
      );
    assert.ok(
      alias.every(
        (candidate) =>
          candidate.kind === "column" &&
          candidate.sourceObject?.schema === "dbo" &&
          candidate.sourceObject.name === "Customers",
      ),
    );

    const localScope = {
      activeDatabase: process.env["MSSQL_TEST_DATABASE"] ?? "",
      indexes: new Map([
        [(process.env["MSSQL_TEST_DATABASE"] ?? "").toLowerCase(), index],
      ]),
    };
    const cteSql = `WITH X AS
(
  SELECT CustomerId, BillingAddressId, EmailAddress
  FROM ${process.env["MSSQL_TEST_DATABASE"] ?? ""}.dbo.Customers
)
SELECT x.addr
FROM X x`;
    const cteCandidates = createCandidates(
      resolveSqlContext(cteSql, cteSql.indexOf("x.addr") + "x.addr".length),
      localScope,
    );
    assert.deepEqual(
      cteCandidates.map((candidate) => candidate.name),
      ["BillingAddressId", "EmailAddress"],
    );
    assert.ok(cteCandidates.every((candidate) => candidate.kind === "column"));

    const intoSql = `SELECT CustomerId, BillingAddressId
INTO #T
FROM ${process.env["MSSQL_TEST_DATABASE"] ?? ""}.dbo.Customers;
SELECT t.
FROM #T t`;
    const intoCandidates = createCandidates(
      resolveSqlContext(intoSql, intoSql.indexOf("t.") + 2),
      localScope,
    );
    assert.deepEqual(
      intoCandidates.map((candidate) => candidate.name),
      ["BillingAddressId", "CustomerId"],
    );
    assert.equal(
      intoCandidates.find((candidate) => candidate.name === "CustomerId")
        ?.sqlType?.name,
      "bigint",
    );
  },
);

const secondaryDatabase = process.env["MSSQL_TEST_SECONDARY_DATABASE"];
test(
  "loads independent same-server cross-database metadata and aliases",
  { skip: !enabled || !secondaryDatabase },
  async (context) => {
    assert.ok(secondaryDatabase);
    const activeDatabase = process.env["MSSQL_TEST_DATABASE"] ?? "";
    const pool = createTestPool(activeDatabase);
    await pool.connect();
    context.after(async () => pool.close());
    const loader = new MetadataLoader(metadataConnection(pool));
    const cache = new MetadataCache();
    const active = await cache.ensureLoaded("integration", activeDatabase, () =>
      loader.load({ connectionId: "integration", database: activeDatabase }),
    );
    const secondary = await cache.ensureLoaded(
      "integration",
      secondaryDatabase,
      () =>
        loader.load({
          connectionId: "integration",
          database: secondaryDatabase,
        }),
    );
    assert.ok(active.count > 0);
    assert.ok(secondary.count > 0);
    assert.notEqual(active, secondary);
    assert.ok(secondary.findObject("sales", "CustomerOrders"));
    assert.equal(
      secondary.findObject("reporting", "CustomerAddressReport")?.kind,
      "table",
    );
    assert.equal(
      secondary.findObject("reporting", "ActiveCustomerAddresses")?.kind,
      "view",
    );
    assert.equal(
      secondary.findObject("reporting", "GetCustomerAddresses")?.kind,
      "tableValuedFunction",
    );
    assert.equal(
      secondary.findObject("billing", "GetBillingsByCustomer")?.kind,
      "tableValuedFunction",
    );
    const databaseResult = await pool
      .request()
      .query<{ name: string }>(
        "SELECT name FROM sys.databases WHERE HAS_DBACCESS(name) = 1 ORDER BY name;",
      );
    const databaseNames = databaseResult.recordset.map((row) => row.name);
    assert.ok(databaseNames.includes(activeDatabase));
    assert.ok(databaseNames.includes(secondaryDatabase));
    const scope = {
      activeDatabase,
      databaseNames,
      indexes: new Map([
        [activeDatabase.toLowerCase(), active],
        [secondaryDatabase.toLowerCase(), secondary],
      ]),
    };
    const databaseCandidates = createCandidates(
      resolveSqlContext("SELECT * FROM Intelli"),
      scope,
    );
    assert.deepEqual(
      databaseCandidates
        .filter((candidate) => candidate.kind === "database")
        .map((candidate) => candidate.name),
      [activeDatabase, secondaryDatabase],
    );
    const emptyDatabaseQualifier = createCandidates(
      resolveSqlContext(`SELECT * FROM ${activeDatabase}.`),
      scope,
    );
    assert.ok(emptyDatabaseQualifier.length > 0);
    assert.ok(
      emptyDatabaseQualifier.every((candidate) => candidate.kind === "schema"),
    );
    assert.ok(
      emptyDatabaseQualifier.some((candidate) => candidate.name === "crm"),
    );
    const activeShortcut = createCandidates(
      resolveSqlContext(`SELECT * FROM ${activeDatabase}.addr`),
      scope,
    );
    assert.ok(
      activeShortcut.some((candidate) => candidate.name === "dbo.Addresses"),
    );
    assert.ok(
      activeShortcut.some(
        (candidate) => candidate.name === "dbo.CustomerAddresses",
      ),
    );
    assert.ok(
      new Set(activeShortcut.map((candidate) => candidate.schema)).size > 1,
    );
    assert.ok(activeShortcut.some((candidate) => candidate.kind === "view"));
    assert.ok(
      activeShortcut.some(
        (candidate) => candidate.kind === "tableValuedFunction",
      ),
    );
    assert.ok(
      activeShortcut.every(
        (candidate) => candidate.database === activeDatabase,
      ),
    );
    const strictCrm = createCandidates(
      resolveSqlContext(`SELECT * FROM ${activeDatabase}.crm.addr`),
      scope,
    );
    assert.ok(strictCrm.length > 0);
    assert.ok(strictCrm.every((candidate) => candidate.schema === "crm"));
    const secondaryShortcut = createCandidates(
      resolveSqlContext(`SELECT * FROM ${secondaryDatabase}.addr`),
      scope,
    );
    assert.ok(secondaryShortcut.length > 0);
    assert.ok(
      secondaryShortcut.every(
        (candidate) => candidate.database === secondaryDatabase,
      ),
    );
    const sysCandidates = createCandidates(
      resolveSqlContext(`SELECT * FROM ${activeDatabase}.sys.tab`),
      scope,
    );
    assert.ok(sysCandidates.some((candidate) => candidate.name === "tables"));
    assert.ok(sysCandidates.every((candidate) => candidate.schema === "sys"));
    for (const systemView of ["tables", "columns", "objects", "schemas"])
      assert.equal(active.findObject("sys", systemView)?.kind, "view");
    assert.equal(active.findObject("sys", "internal_tables"), undefined);
    const informationSchema = createCandidates(
      resolveSqlContext(
        `SELECT * FROM ${activeDatabase}.INFORMATION_SCHEMA.COL`,
      ),
      scope,
    );
    assert.ok(
      informationSchema.some((candidate) => candidate.name === "COLUMNS"),
    );
    assert.ok(
      informationSchema.every(
        (candidate) => candidate.schema === "INFORMATION_SCHEMA",
      ),
    );
    for (const informationView of [
      "TABLES",
      "COLUMNS",
      "VIEWS",
      "ROUTINES",
      "PARAMETERS",
      "SCHEMATA",
      "TABLE_CONSTRAINTS",
      "KEY_COLUMN_USAGE",
      "REFERENTIAL_CONSTRAINTS",
    ])
      assert.equal(
        active.findObject("INFORMATION_SCHEMA", informationView)?.kind,
        "view",
      );
    const qualified = createCandidates(
      resolveSqlContext(`SELECT * FROM ${secondaryDatabase}.reporting.addr`),
      scope,
    );
    assert.ok(
      qualified.some((candidate) => candidate.name === "CustomerAddressReport"),
    );
    assert.ok(
      qualified.some(
        (candidate) => candidate.name === "ActiveCustomerAddresses",
      ),
    );
    assert.ok(
      qualified.every(
        (candidate) =>
          candidate.database === secondaryDatabase &&
          candidate.schema === "reporting" &&
          candidate.normalizedName.includes("addr"),
      ),
    );
    const customerCandidates = createCandidates(
      resolveSqlContext(
        `SELECT * FROM ${secondaryDatabase}.reporting.Customer`,
      ),
      scope,
    );
    assert.ok(
      customerCandidates.some((candidate) => candidate.kind === "table"),
    );
    assert.ok(
      customerCandidates.some((candidate) => candidate.kind === "view"),
    );
    assert.ok(
      customerCandidates.some(
        (candidate) => candidate.kind === "tableValuedFunction",
      ),
    );
    const customerKinds = [
      ...new Set(customerCandidates.map((candidate) => candidate.kind)),
    ];
    assert.deepEqual(customerKinds.slice(0, 3), [
      "table",
      "view",
      "tableValuedFunction",
    ]);
    assert.ok(
      customerKinds.every((kind) =>
        ["table", "view", "tableValuedFunction", "synonym"].includes(kind),
      ),
    );
    const sqlText = `SELECT c.addr, r.addr
FROM ${activeDatabase}.dbo.Customers c
JOIN ${secondaryDatabase}.reporting.CustomerAddressReport r ON r.CustomerId = c.CustomerId`;
    const activeColumns = createCandidates(
      resolveSqlContext(sqlText, "SELECT c.addr".length),
      scope,
    );
    const secondaryColumns = createCandidates(
      resolveSqlContext(sqlText, "SELECT c.addr, r.addr".length),
      scope,
    );
    assert.ok(
      activeColumns.every((candidate) => candidate.database === activeDatabase),
    );
    assert.ok(
      secondaryColumns.some(
        (candidate) => candidate.name === "CustomerAddressId",
      ),
    );
    assert.ok(
      secondaryColumns.every(
        (candidate) => candidate.database === secondaryDatabase,
      ),
    );
    const billingSource = active.findObject("billing", "BillingAddress_0001");
    const archiveSource = secondary.findObject(
      "archive",
      "CustomerAddressArchive",
    );
    assert.ok(
      billingSource,
      "missing real billing.BillingAddress_0001 fixture",
    );
    assert.ok(
      archiveSource,
      "missing real archive.CustomerAddressArchive fixture",
    );
    const cteSql = `WITH bla AS
(
    SELECT a.BillingAddressId, a.BillingCode
    FROM ${activeDatabase}.billing.BillingAddress_0001 AS a
),
ala AS
(
    SELECT *
    FROM ${secondaryDatabase}.archive.CustomerAddressArchive AS b
)
SELECT *
FROM bla AS x
JOIN ala AS y ON y.`;
    const yColumns = createCandidates(resolveSqlContext(cteSql), scope);
    const xColumns = createCandidates(
      resolveSqlContext(cteSql.replace("ON y.", "ON x.")),
      scope,
    );
    assert.deepEqual(
      xColumns.map((candidate) => candidate.name),
      ["BillingAddressId", "BillingCode"],
    );
    assert.deepEqual(
      new Set(yColumns.map((candidate) => candidate.name)),
      new Set(archiveSource.columns.map((column) => column.name)),
    );
    assert.ok(
      yColumns.every(
        (candidate) =>
          candidate.kind === "column" &&
          !["BillingAddressId", "BillingCode"].includes(candidate.name),
      ),
    );
    context.diagnostic(
      `CTE aliases verified: x=${String(xColumns.length)} columns, y=${String(yColumns.length)} columns`,
    );
    assert.equal(cache.get("integration", activeDatabase), active);
    assert.equal(cache.get("integration", secondaryDatabase), secondary);
  },
);

function createTestPool(database: string): sql.ConnectionPool {
  const serverValue = process.env["MSSQL_TEST_SERVER"] ?? "";
  const comma = serverValue.lastIndexOf(",");
  const portText = comma >= 0 ? serverValue.slice(comma + 1) : undefined;
  const port =
    portText && /^\d+$/.test(portText) ? Number(portText) : undefined;
  return new sql.ConnectionPool({
    server: port ? serverValue.slice(0, comma) : serverValue,
    database,
    user: process.env["MSSQL_TEST_USER"] ?? "",
    password: process.env["MSSQL_TEST_PASSWORD"] ?? "",
    ...(port ? { port } : {}),
    options: { encrypt: false, trustServerCertificate: true },
  });
}

function metadataConnection(pool: sql.ConnectionPool): ConnectionService {
  return {
    query: async (_connection: unknown, query: string) => {
      const result = await pool.request().query<Record<string, unknown>>(query);
      const rows: DbCellValue[][] = result.recordset.map((record) =>
        Object.values(record).map((raw) => ({
          isNull: raw === null || raw === undefined,
          displayValue: toDisplayValue(raw),
        })),
      );
      return { rowCount: rows.length, rows };
    },
  } as unknown as ConnectionService;
}

function toDisplayValue(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  if (typeof raw === "string") return raw;
  if (
    typeof raw === "number" ||
    typeof raw === "bigint" ||
    typeof raw === "boolean"
  )
    return String(raw);
  if (raw instanceof Date) return raw.toISOString();
  if (Buffer.isBuffer(raw)) return raw.toString("base64");
  throw new Error(
    "Integration query returned an unsupported metadata cell type.",
  );
}

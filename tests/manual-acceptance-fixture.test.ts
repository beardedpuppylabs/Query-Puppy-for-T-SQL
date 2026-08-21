import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const fixturePath = resolve(
  "manual-acceptance/extend-intellisenselab-0.11.0-fixtures.sql",
);

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const guardedTable = (sql: string, qualifiedName: string): void => {
  const name = escapeRegExp(qualifiedName);
  assert.match(
    sql,
    new RegExp(
      `IF\\s+OBJECT_ID\\(N'${name}',\\s*N'U'\\)\\s+IS\\s+NULL[\\s\\S]*?CREATE\\s+TABLE\\s+${name}\\b`,
      "i",
    ),
    `${qualifiedName} must have an idempotent table-creation guard`,
  );
};

const createOrAlter = (
  sql: string,
  kind: "FUNCTION" | "PROCEDURE" | "VIEW",
  qualifiedName: string,
): void => {
  assert.match(
    sql,
    new RegExp(
      `CREATE\\s+OR\\s+ALTER\\s+${kind}\\s+${escapeRegExp(qualifiedName)}\\b`,
      "i",
    ),
    `${qualifiedName} must be provisioned idempotently`,
  );
};

const auditedObject = (
  sql: string,
  schema: string,
  object: string,
  type: string,
): void => {
  assert.match(
    sql,
    new RegExp(
      `\\(N'${escapeRegExp(schema)}',\\s*N'${escapeRegExp(object)}',\\s*N'${escapeRegExp(type)}'\\)`,
      "i",
    ),
    `${schema}.${object} must participate in the final completeness audit`,
  );
};

test("manual 0.11.0 fixture provisions every documented qpacc acceptance object idempotently", async () => {
  const sql = await readFile(fixturePath, "utf8");
  const reportingMarker = "USE [IntelliSenseLabReporting];";
  const reportingStart = sql.indexOf(reportingMarker);
  assert.ok(reportingStart >= 0, "reporting database context is required");
  const active = sql.slice(0, reportingStart);
  const reporting = sql.slice(reportingStart);
  assert.match(active, /USE\s+\[IntelliSenseLab\];/i);
  assert.match(reporting, /USE\s+\[IntelliSenseLabReporting\];/i);

  const activeTables = [
    ["qpacc_ref", "Regions"],
    ["qpacc", "Addresses"],
    ["qpacc", "Customers"],
    ["qpacc", "OrderHeaders"],
    ["qpacc", "OrderLines"],
    ["qpacc", "CustomerAliases"],
    ["qpacc", "Products"],
    ["qpacc", "LegacyCustomerLinks"],
    ["qpacc", "CompletionLayoutStress"],
    ["qpacc", "TypedTargets"],
    ["qpacc", "Belege"],
    ["qpacc", "BelegePositionen"],
    ["qpacc", "BelegePositionenDetails"],
  ] as const;
  for (const [schema, object] of activeTables) {
    guardedTable(active, `${schema}.${object}`);
    auditedObject(active, schema, object, "U");
  }
  createOrAlter(active, "FUNCTION", "qpacc.CalculateBillingTotal_Manual");
  createOrAlter(active, "FUNCTION", "qpacc.GetCustomerAddresses_Manual");
  createOrAlter(active, "VIEW", "qpacc.ActiveCustomerAddresses");
  createOrAlter(active, "PROCEDURE", "qpacc.FindCustomerAddress_Manual");
  auditedObject(active, "qpacc", "CalculateBillingTotal_Manual", "FN");
  auditedObject(active, "qpacc", "GetCustomerAddresses_Manual", "IF");
  auditedObject(active, "qpacc", "ActiveCustomerAddresses", "V");
  auditedObject(active, "qpacc", "FindCustomerAddress_Manual", "P");

  const reportingTables = [
    ["qpacc", "Customers"],
    ["qpacc", "Auftraege"],
    ["qpacc", "AuftraegePositionen"],
    ["qpacc_archive", "CustomerAddressArchive"],
  ] as const;
  for (const [schema, object] of reportingTables) {
    guardedTable(reporting, `${schema}.${object}`);
    auditedObject(reporting, schema, object, "U");
  }
  createOrAlter(reporting, "VIEW", "qpacc.ActiveCustomerAddresses");
  createOrAlter(reporting, "VIEW", "qpacc.CustomerAddressReport");
  createOrAlter(reporting, "FUNCTION", "qpacc.GetCustomerAddresses");
  auditedObject(reporting, "qpacc", "ActiveCustomerAddresses", "V");
  auditedObject(reporting, "qpacc", "CustomerAddressReport", "V");
  auditedObject(reporting, "qpacc", "GetCustomerAddresses", "IF");

  const executableSql = sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "");
  assert.doesNotMatch(executableSql, /\b(?:DROP|TRUNCATE)\b/i);
  assert.match(active, /THROW\s+51001,\s*@MissingIntelliSenseLabObjects/i);
  assert.match(
    reporting,
    /THROW\s+51002,\s*@MissingIntelliSenseLabReportingObjects/i,
  );
});

test("manual 0.11.0 OrderLines DDL preserves the canonical acceptance shape", async () => {
  const sql = await readFile(fixturePath, "utf8");
  const start = sql.indexOf("IF OBJECT_ID(N'qpacc.OrderLines', N'U') IS NULL");
  const end = sql.indexOf(
    "IF OBJECT_ID(N'qpacc.CustomerAliases', N'U') IS NULL",
    start,
  );
  assert.ok(
    start >= 0 && end > start,
    "OrderLines provisioning block is required",
  );
  const block = sql.slice(start, end);

  const create =
    /CREATE TABLE qpacc\.OrderLines\s*\(([\s\S]*?)\);\s*END;/i.exec(block);
  const createBody = create?.[1];
  assert.ok(createBody);
  assert.deepEqual(
    createBody
      .trim()
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/,$/, "")),
    [
      "CompanyId int NOT NULL",
      "OrderId bigint NOT NULL",
      "[LineNo] int NOT NULL",
      "ProductCode varchar(50) NOT NULL",
      "Quantity decimal(18,4) NOT NULL",
      "AmountExact decimal(38,18) NULL",
    ],
  );
  assert.doesNotMatch(
    createBody,
    /FOREIGN\s+KEY/i,
    "base table creation must not be rolled back by FK dependency binding",
  );
  assert.match(
    block,
    /IF OBJECT_ID\(N'qpacc\.PK_qpacc_OrderLines', N'PK'\) IS NULL[\s\S]*?PRIMARY KEY \(CompanyId, OrderId, \[LineNo\]\)/i,
  );
  assert.match(
    block,
    /IF OBJECT_ID\(N'qpacc\.FK_qpacc_OrderLines_OrderHeaders', N'F'\) IS NULL[\s\S]*?FOREIGN KEY \(CompanyId, OrderId\)[\s\S]*?REFERENCES qpacc\.OrderHeaders\(CompanyId, OrderId\)/i,
  );
  assert.match(block, /THROW 51000,[\s\S]*?THROW 51003,[\s\S]*?THROW 51004,/i);
});

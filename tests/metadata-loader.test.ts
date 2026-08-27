import assert from "node:assert/strict";
import test from "node:test";
import {
  DEVELOPER_SYS_VIEWS,
  METADATA_QUERY,
  MetadataLoader,
  RELATIONSHIP_QUERY,
} from "../src/metadata/MetadataLoader.js";
import type {
  MetadataBackend,
  MetadataCellValue,
} from "../src/backend/MetadataBackend.js";

const cell = (displayValue?: string): MetadataCellValue => ({
  displayValue: displayValue ?? "",
  isNull: displayValue === undefined,
});
const row = (...values: (string | undefined)[]): MetadataCellValue[] =>
  values.map(cell);

const metadataConnection = (
  query: (
    connection: unknown,
    sql: string,
  ) => Promise<{ rowCount: number; rows: readonly MetadataCellValue[][] }>,
): MetadataBackend =>
  ({
    executeMetadataQueries: async (
      connection: unknown,
      sqlStatements: readonly string[],
    ) => Promise.all(sqlStatements.map((sql) => query(connection, sql))),
  }) as unknown as MetadataBackend;

test("metadata assembly is independent of result row order", async () => {
  const rows = [
    row("D", "25", "IntelliSenseLab"),
    row(
      "C",
      "7",
      "dbo",
      "Customers",
      undefined,
      "AddressId",
      "sys",
      "int",
      "4",
      "10",
      "0",
      "True",
      undefined,
      "1",
    ),
    row(
      "P",
      "8",
      "dbo",
      "GetName",
      undefined,
      "@Id",
      "sys",
      "int",
      "4",
      "10",
      "0",
      undefined,
      "False",
      "1",
    ),
    row("O", "7", "dbo", "Customers", "table"),
    row("O", "8", "dbo", "GetName", "scalarFunction"),
    row("S", undefined, "dbo"),
  ];
  let executedSql = "";
  const connections = metadataConnection(
    async (_connection: unknown, sql: string) => {
      executedSql = sql;
      return { rowCount: rows.length, rows };
    },
  );
  const index = await new MetadataLoader(connections).load({
    backendId: "fake",
    connectionIdentity: "c",
    database: "IntelliSenseLab",
  });
  assert.match(executedSql, /^USE \[IntelliSenseLab\];/);
  assert.equal(
    index.findObject("dbo", "Customers")?.columns[0]?.name,
    "AddressId",
  );
  assert.equal(index.findObject("dbo", "GetName")?.parameters[0]?.name, "@Id");
});

test("contract: scalar return metadata supports the unnamed return parameter", async () => {
  const rows = [
    row("O", "8", "dbo", "GetName", "scalarFunction"),
    row(
      "P",
      "8",
      "dbo",
      "GetName",
      undefined,
      undefined,
      "sys",
      "nvarchar",
      "400",
      "0",
      "0",
      undefined,
      "False",
      "0",
    ),
  ];
  const connections = metadataConnection(async () => ({
    rowCount: rows.length,
    rows,
  }));
  const index = await new MetadataLoader(connections).load({
    backendId: "fake",
    connectionIdentity: "c",
    database: "db",
  });
  assert.deepEqual(index.findObject("dbo", "GetName")?.returnType, {
    name: "nvarchar",
    maxLength: 400,
    precision: 0,
    scale: 0,
  });
});

test("developer-facing system views are mapped without enabling all system noise", async () => {
  const rows = [
    row("O", "-10", "sys", "tables", "view"),
    row("O", "-11", "sys", "columns", "view"),
    row("O", "-12", "INFORMATION_SCHEMA", "TABLES", "view"),
    row("O", "-13", "INFORMATION_SCHEMA", "COLUMNS", "view"),
    row(
      "C",
      "-10",
      "sys",
      "tables",
      undefined,
      "name",
      "sys",
      "nvarchar",
      "256",
      "0",
      "0",
      "False",
      undefined,
      "1",
    ),
  ];
  const connections = metadataConnection(async () => ({
    rowCount: rows.length,
    rows,
  }));
  const index = await new MetadataLoader(connections).load({
    backendId: "fake",
    connectionIdentity: "c",
    database: "db",
  });
  assert.equal(index.findObject("sys", "tables")?.kind, "view");
  assert.equal(index.findObject("sys", "tables")?.columns[0]?.name, "name");
  assert.equal(index.findObject("sys", "columns")?.kind, "view");
  assert.equal(index.findObject("INFORMATION_SCHEMA", "TABLES")?.kind, "view");
  assert.equal(index.findObject("INFORMATION_SCHEMA", "COLUMNS")?.kind, "view");
  for (const required of ["tables", "columns", "objects", "schemas"] as const)
    assert.ok(DEVELOPER_SYS_VIEWS.includes(required));
  assert.equal(DEVELOPER_SYS_VIEWS.includes("internal_tables" as never), false);
  assert.match(METADATA_QUERY, /sys\.all_objects/);
  assert.doesNotMatch(
    METADATA_QUERY,
    /o\.is_ms_shipped\s*=\s*0\s+OR\s+o\.is_ms_shipped\s*=\s*1/,
  );
});

test("column writability flags are retained from catalog metadata", async () => {
  const rows = [
    row("O", "7", "dbo", "Orders", "table"),
    row(
      "C",
      "7",
      "dbo",
      "Orders",
      undefined,
      "Id",
      "sys",
      "bigint",
      "8",
      "19",
      "0",
      "False",
      undefined,
      "1",
      undefined,
      "True",
      "False",
      "0",
      "False",
    ),
    row(
      "C",
      "7",
      "dbo",
      "Orders",
      undefined,
      "Gross",
      "sys",
      "decimal",
      "9",
      "18",
      "2",
      "True",
      undefined,
      "2",
      undefined,
      "False",
      "True",
      "0",
      "False",
    ),
    row(
      "C",
      "7",
      "dbo",
      "Orders",
      undefined,
      "PeriodStart",
      "sys",
      "datetime2",
      "8",
      "27",
      "3",
      "False",
      undefined,
      "3",
      undefined,
      "False",
      "False",
      "1",
      "True",
    ),
  ];
  const connections = metadataConnection(async () => ({
    rowCount: rows.length,
    rows,
  }));
  const object = (
    await new MetadataLoader(connections).load({
      backendId: "fake",
      connectionIdentity: "c",
      database: "db",
    })
  ).findObject("dbo", "Orders");
  assert.ok(object);
  assert.equal(object.columns[0]?.identity, true);
  assert.equal(object.columns[1]?.computed, true);
  assert.equal(object.columns[2]?.generatedAlways, true);
  assert.equal(object.columns[2].hidden, true);
});

test("keys and foreign keys are assembled set-wise without duplicate constraint indexes", async () => {
  const catalog = [
    row("O", "1", "reltest", "OrderHeaders", "table"),
    row("O", "2", "reltest", "OrderLines", "table"),
  ];
  const relationships = [
    row(
      "K",
      "1",
      "PK_OrderHeaders",
      "primaryKey",
      "1",
      "reltest",
      "OrderHeaders",
      "1",
      "CompanyId",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "1",
    ),
    row(
      "K",
      "1",
      "PK_OrderHeaders",
      "primaryKey",
      "1",
      "reltest",
      "OrderHeaders",
      "2",
      "OrderId",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "2",
    ),
    row(
      "K",
      "2",
      "UX_OrderHeaders_Number",
      "uniqueIndex",
      "1",
      "reltest",
      "OrderHeaders",
      "3",
      "OrderNumber",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "1",
      undefined,
      undefined,
      undefined,
      undefined,
      "[OrderNumber] IS NOT NULL",
    ),
    row(
      "F",
      "20",
      "FK_OrderLines_OrderHeaders",
      undefined,
      "2",
      "reltest",
      "OrderLines",
      "1",
      "CompanyId",
      "1",
      "reltest",
      "OrderHeaders",
      "1",
      "CompanyId",
      "1",
      "CASCADE",
      "NO_ACTION",
      "1",
      "1",
    ),
    row(
      "F",
      "20",
      "FK_OrderLines_OrderHeaders",
      undefined,
      "2",
      "reltest",
      "OrderLines",
      "2",
      "OrderId",
      "1",
      "reltest",
      "OrderHeaders",
      "2",
      "OrderId",
      "2",
      "CASCADE",
      "NO_ACTION",
      "1",
      "1",
    ),
  ];
  let queryCount = 0;
  const connections = metadataConnection(
    async (_connection: unknown, sql: string) => {
      queryCount++;
      const rows = sql.includes("FROM sys.foreign_keys")
        ? relationships
        : catalog;
      return { rowCount: rows.length, rows };
    },
  );
  const index = await new MetadataLoader(connections).load({
    backendId: "fake",
    connectionIdentity: "c",
    database: "IntelliSenseLab",
  });
  assert.equal(queryCount, 2);
  const keys = index.metadata.keys;
  const foreignKeys = index.metadata.foreignKeys;
  assert.ok(keys);
  assert.ok(foreignKeys);
  assert.equal(keys.length, 2);
  assert.deepEqual(
    keys[0]?.columns.map((item) => item.columnName),
    ["CompanyId", "OrderId"],
  );
  assert.equal(keys[1]?.filtered, true);
  assert.equal(foreignKeys.length, 1);
  assert.equal(foreignKeys[0]?.columns.length, 2);
  assert.equal(foreignKeys[0].disabled, true);
  assert.equal(foreignKeys[0].notTrusted, true);
  assert.match(
    RELATIONSHIP_QUERY,
    /ic\.key_ordinal > 0 AND ic\.is_included_column=0/,
  );
  assert.match(RELATIONSHIP_QUERY, /LEFT JOIN sys\.key_constraints/);
});

test("contract: Schema Intelligence runtime initialization is catalog-read-only", async () => {
  const statements: string[] = [];
  let metadataOperations = 0;
  const connections = {
    executeMetadataQueries: async (
      _connection: unknown,
      sqlStatements: readonly string[],
    ) => {
      metadataOperations++;
      return sqlStatements.map((sql) => {
        statements.push(sql);
        return { rowCount: 0, rows: [] };
      });
    },
  } as unknown as MetadataBackend;
  await new MetadataLoader(connections).load({
    backendId: "fake",
    connectionIdentity: "restricted-metadata-login",
    database: "IntelliSenseLab",
  });
  assert.equal(metadataOperations, 1);
  assert.equal(statements.length, 2);
  for (const sql of statements) {
    assert.match(
      sql,
      /^USE \[IntelliSenseLab\];\n\s*SET NOCOUNT ON;\s*SELECT/i,
    );
    assert.doesNotMatch(
      sql,
      /\b(?:CREATE|ALTER|DROP|INSERT|UPDATE|DELETE|MERGE|TRUNCATE)\b/i,
      "runtime metadata loading must never contain DDL or DML",
    );
  }
});

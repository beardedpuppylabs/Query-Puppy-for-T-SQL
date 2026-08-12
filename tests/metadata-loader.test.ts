import assert from "node:assert/strict";
import test from "node:test";
import {
  DEVELOPER_SYS_VIEWS,
  METADATA_QUERY,
  MetadataLoader,
} from "../src/mssql/MetadataLoader.js";
import type { ConnectionService } from "../src/mssql/ConnectionService.js";
import type { DbCellValue } from "../src/mssql/SimpleExecuteResult.js";

const cell = (displayValue?: string): DbCellValue => ({
  displayValue: displayValue ?? "",
  isNull: displayValue === undefined,
});
const row = (...values: (string | undefined)[]): DbCellValue[] =>
  values.map(cell);

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
  const connections = {
    query: async (_connection: unknown, sql: string) => {
      executedSql = sql;
      return { rowCount: rows.length, rows };
    },
  } as unknown as ConnectionService;
  const index = await new MetadataLoader(connections).load({
    connectionId: "c",
    database: "IntelliSenseLab",
  });
  assert.match(executedSql, /^USE \[IntelliSenseLab\];/);
  assert.equal(
    index.findObject("dbo", "Customers")?.columns[0]?.name,
    "AddressId",
  );
  assert.equal(index.findObject("dbo", "GetName")?.parameters[0]?.name, "@Id");
});

test("scalar return metadata supports the unnamed return parameter", async () => {
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
  const connections = {
    query: async () => ({ rowCount: rows.length, rows }),
  } as unknown as ConnectionService;
  const index = await new MetadataLoader(connections).load({
    connectionId: "c",
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
  const connections = {
    query: async () => ({ rowCount: rows.length, rows }),
  } as unknown as ConnectionService;
  const index = await new MetadataLoader(connections).load({
    connectionId: "c",
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

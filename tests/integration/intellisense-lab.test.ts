import assert from "node:assert/strict";
import test from "node:test";
import * as sql from "mssql";
import { createCandidates } from "../../src/completion/CandidateFactory.js";
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
    const serverValue = process.env["MSSQL_TEST_SERVER"] ?? "";
    const comma = serverValue.lastIndexOf(",");
    const portText = comma >= 0 ? serverValue.slice(comma + 1) : undefined;
    const port =
      portText && /^\d+$/.test(portText) ? Number(portText) : undefined;
    const pool = new sql.ConnectionPool({
      server: port ? serverValue.slice(0, comma) : serverValue,
      database: process.env["MSSQL_TEST_DATABASE"] ?? "",
      user: process.env["MSSQL_TEST_USER"] ?? "",
      password: process.env["MSSQL_TEST_PASSWORD"] ?? "",
      ...(port ? { port } : {}),
      options: { encrypt: false, trustServerCertificate: true },
    });
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

    const connections = {
      query: async (_connection: unknown, query: string) => {
        const result = await pool
          .request()
          .query<Record<string, unknown>>(query);
        const records = result.recordset;
        const rows: DbCellValue[][] = records.map((record) =>
          Object.values(record).map((raw) => ({
            isNull: raw === null || raw === undefined,
            displayValue: toDisplayValue(raw),
          })),
        );
        return { rowCount: rows.length, rows };
      },
    } as unknown as ConnectionService;
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
  },
);

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

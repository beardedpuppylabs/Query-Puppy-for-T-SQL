/**
 * Disposable feasibility harness for a direct, metadata-only node-mssql/Tedious
 * transport. This file is deliberately outside src/ and the extension activation
 * path. It never persists or prints credentials, tokens, or connection strings.
 */
import { performance } from "node:perf_hooks";

import * as sql from "mssql";

import type {
  ActiveConnectionContext,
  MetadataBackend,
  MetadataCellValue,
  MetadataQueryResult,
} from "../../src/backend/MetadataBackend.js";
import { MetadataLoader } from "../../src/metadata/MetadataLoader.js";

const DATABASE_ENUMERATION_QUERY = String.raw`
SET NOCOUNT ON;
SELECT name
FROM sys.databases
WHERE state_desc = N'ONLINE'
  AND HAS_DBACCESS(name) = 1
ORDER BY name;`;

interface SpikeConfiguration {
  readonly server: string;
  readonly port?: number;
  readonly database: string;
  readonly secondaryDatabase?: string;
  readonly user: string;
  readonly password: string;
  readonly encrypt: boolean;
  readonly trustServerCertificate: boolean;
}

interface ProbeResult {
  readonly outcome: "expected-error" | "unexpected-success";
  readonly code?: string;
  readonly elapsedMs: number;
}

interface RequestWithTimeoutConstructor {
  new (
    pool: sql.ConnectionPool,
    options: { readonly requestTimeout: number },
  ): sql.Request;
}

class NodeMssqlSpikeBackend implements MetadataBackend {
  readonly queryMeasurements: { rows: number; elapsedMs: number }[] = [];

  constructor(private readonly pool: sql.ConnectionPool) {}

  async executeMetadataQueries(
    connection: ActiveConnectionContext,
    sqlStatements: readonly string[],
  ): Promise<readonly MetadataQueryResult[]> {
    void connection;
    const results: MetadataQueryResult[] = [];
    for (const statement of sqlStatements) {
      const started = performance.now();
      const result = await executeArrayQuery(this.pool, statement);
      results.push(result);
      this.queryMeasurements.push({
        rows: result.rows.length,
        elapsedMs: elapsed(started),
      });
    }
    return results;
  }

  async listDatabases(
    connection: ActiveConnectionContext,
  ): Promise<readonly string[]> {
    void connection;
    const result = await executeArrayQuery(
      this.pool,
      DATABASE_ENUMERATION_QUERY,
    );
    return result.rows.flatMap((row) => {
      const first = row[0];
      return first && !first.isNull ? [first.displayValue] : [];
    });
  }
}

async function executeArrayQuery(
  pool: sql.ConnectionPool,
  statement: string,
): Promise<MetadataQueryResult> {
  const request = pool.request();
  request.arrayRowMode = true;
  const result = await request.query(statement);
  const rawRows: unknown = result.recordset;
  if (!Array.isArray(rawRows))
    throw new Error("node-mssql did not return the requested array-row shape.");
  const rowArrays = rawRows as unknown[];
  if (rowArrays.some((row) => !Array.isArray(row)))
    throw new Error("node-mssql did not return the requested array-row shape.");
  const rows = (rowArrays as unknown[][]).map((row) => row.map(toMetadataCell));
  return { rowCount: rows.length, rows };
}

function toMetadataCell(raw: unknown): MetadataCellValue {
  if (raw === null || raw === undefined)
    return { isNull: true, displayValue: "" };
  if (typeof raw === "string") return { isNull: false, displayValue: raw };
  if (
    typeof raw === "number" ||
    typeof raw === "bigint" ||
    typeof raw === "boolean"
  )
    return { isNull: false, displayValue: String(raw) };
  if (raw instanceof Date)
    return { isNull: false, displayValue: raw.toISOString() };
  if (Buffer.isBuffer(raw))
    return { isNull: false, displayValue: raw.toString("base64") };
  throw new Error("The metadata query returned an unsupported cell type.");
}

async function cancellationProbe(
  pool: sql.ConnectionPool,
): Promise<ProbeResult> {
  const request = pool.request();
  const started = performance.now();
  const pending = request.query(
    "WAITFOR DELAY '00:00:05'; SELECT DB_NAME() AS database_name;",
  );
  const timer = setTimeout(() => request.cancel(), 100);
  try {
    await pending;
    return { outcome: "unexpected-success", elapsedMs: elapsed(started) };
  } catch (error) {
    return {
      outcome: "expected-error",
      code: safeErrorCode(error),
      elapsedMs: elapsed(started),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function timeoutProbe(pool: sql.ConnectionPool): Promise<ProbeResult> {
  const RequestWithTimeout =
    sql.Request as unknown as RequestWithTimeoutConstructor;
  const request = new RequestWithTimeout(pool, { requestTimeout: 200 });
  const started = performance.now();
  try {
    await request.query(
      "WAITFOR DELAY '00:00:05'; SELECT DB_NAME() AS database_name;",
    );
    return { outcome: "unexpected-success", elapsedMs: elapsed(started) };
  } catch (error) {
    return {
      outcome: "expected-error",
      code: safeErrorCode(error),
      elapsedMs: elapsed(started),
    };
  }
}

async function ordinaryErrorProbe(
  pool: sql.ConnectionPool,
): Promise<ProbeResult> {
  const started = performance.now();
  try {
    await pool.request().query("SELECT CAST(N'not-an-integer' AS int);");
    return { outcome: "unexpected-success", elapsedMs: elapsed(started) };
  } catch (error) {
    return {
      outcome: "expected-error",
      code: safeErrorCode(error),
      elapsedMs: elapsed(started),
    };
  }
}

function safeErrorCode(error: unknown): string {
  if (typeof error !== "object" || error === null) return "unknown";
  const code = (error as { readonly code?: unknown }).code;
  return typeof code === "string" ? code : "unknown";
}

function readConfiguration(): SpikeConfiguration {
  const serverValue = requiredEnvironment("MSSQL_TEST_SERVER");
  const secondaryDatabase = process.env["MSSQL_TEST_SECONDARY_DATABASE"];
  const comma = serverValue.lastIndexOf(",");
  const portText = comma >= 0 ? serverValue.slice(comma + 1) : undefined;
  const port =
    portText && /^\d+$/.test(portText) ? Number(portText) : undefined;
  return {
    server: port ? serverValue.slice(0, comma) : serverValue,
    ...(port ? { port } : {}),
    database: requiredEnvironment("MSSQL_TEST_DATABASE"),
    ...(secondaryDatabase ? { secondaryDatabase } : {}),
    user: requiredEnvironment("MSSQL_TEST_USER"),
    password: requiredEnvironment("MSSQL_TEST_PASSWORD"),
    encrypt: environmentBoolean("MSSQL_SPIKE_ENCRYPT", true),
    trustServerCertificate: environmentBoolean(
      "MSSQL_SPIKE_TRUST_SERVER_CERTIFICATE",
      false,
    ),
  };
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value)
    throw new Error(`Required environment variable ${name} is unset.`);
  return value;
}

function environmentBoolean(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  throw new Error(`${name} must be true, false, 1, or 0.`);
}

function elapsed(started: number): number {
  return Math.round((performance.now() - started) * 10) / 10;
}

async function main(): Promise<void> {
  const configuration = readConfiguration();
  const pool = new sql.ConnectionPool({
    server: configuration.server,
    database: configuration.database,
    user: configuration.user,
    password: configuration.password,
    ...(configuration.port ? { port: configuration.port } : {}),
    connectionTimeout: 15_000,
    requestTimeout: 60_000,
    pool: { max: 1, min: 0, idleTimeoutMillis: 5_000 },
    options: {
      encrypt: configuration.encrypt,
      trustServerCertificate: configuration.trustServerCertificate,
    },
  });
  const active: ActiveConnectionContext = {
    connectionIdentity: "direct-metadata-spike",
    database: configuration.database,
  };
  const heapBefore = process.memoryUsage().heapUsed;
  let cleanup = "not-started";
  try {
    const connectionStarted = performance.now();
    await pool.connect();
    const connectionMs = elapsed(connectionStarted);
    const backend = new NodeMssqlSpikeBackend(pool);
    const loader = new MetadataLoader(backend);

    const enumerationStarted = performance.now();
    const databases = await backend.listDatabases(active);
    const enumerationMs = elapsed(enumerationStarted);

    const firstStarted = performance.now();
    const first = await loader.load(active);
    const firstLoadMs = elapsed(firstStarted);
    const heapAfterFirst = process.memoryUsage().heapUsed;
    const activeMappingValidated =
      first
        .findObject("dbo", "Customers")
        ?.columns.some((column) => column.name === "CustomerId") ?? false;
    if (!activeMappingValidated)
      throw new Error(
        "The positional metadata result did not map to the expected fixture shape.",
      );

    const repeatStarted = performance.now();
    const repeat = await loader.load(active);
    const repeatLoadMs = elapsed(repeatStarted);

    let crossDatabase:
      | { available: false }
      | {
          available: true;
          elapsedMs: number;
          objects: number;
          mappingValidated: boolean;
        } = {
      available: false,
    };
    if (
      configuration.secondaryDatabase &&
      databases.some(
        (database) =>
          database.toLowerCase() ===
          configuration.secondaryDatabase?.toLowerCase(),
      )
    ) {
      const secondaryStarted = performance.now();
      const secondary = await loader.load({
        ...active,
        database: configuration.secondaryDatabase,
      });
      const secondaryMappingValidated =
        (secondary.findObject("reporting", "CustomerAddressReport")?.columns
          .length ?? 0) > 0;
      if (!secondaryMappingValidated)
        throw new Error(
          "The secondary positional result did not map to the expected fixture shape.",
        );
      crossDatabase = {
        available: true,
        elapsedMs: elapsed(secondaryStarted),
        objects: secondary.objects.length,
        mappingValidated: secondaryMappingValidated,
      };
    }

    const ordinaryError = await ordinaryErrorProbe(pool);
    const cancellation = await cancellationProbe(pool);
    const timeout = await timeoutProbe(pool);
    const recovery = await backend.listDatabases(active);

    console.log(
      JSON.stringify(
        {
          runtime: {
            node: process.version,
            platform: process.platform,
            architecture: process.arch,
          },
          transport: {
            driver: "node-mssql/Tedious",
            authentication: "SQL authentication",
            encrypted: configuration.encrypt,
            trustedServerCertificate: configuration.trustServerCertificate,
          },
          connectionMs,
          enumeration: {
            elapsedMs: enumerationMs,
            accessibleDatabaseCount: databases.length,
            activeDatabasePresent: databases.some(
              (database) =>
                database.toLowerCase() === configuration.database.toLowerCase(),
            ),
            secondaryDatabasePresent: configuration.secondaryDatabase
              ? databases.some(
                  (database) =>
                    database.toLowerCase() ===
                    configuration.secondaryDatabase?.toLowerCase(),
                )
              : null,
          },
          firstMetadataLoad: {
            elapsedMs: firstLoadMs,
            objects: first.objects.length,
            mappingValidated: activeMappingValidated,
            queryMeasurements: backend.queryMeasurements.slice(0, 2),
            heapDeltaBytes: heapAfterFirst - heapBefore,
          },
          repeatMetadataLoad: {
            elapsedMs: repeatLoadMs,
            objects: repeat.objects.length,
            queryMeasurements: backend.queryMeasurements.slice(2, 4),
          },
          crossDatabase,
          probes: {
            ordinaryError,
            cancellation,
            timeout,
            poolRecoveredAfterProbes: recovery.length > 0,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await pool.close();
    cleanup = "pool-closed";
    console.error(JSON.stringify({ cleanup }));
  }
}

void main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      fatal: {
        code: safeErrorCode(error),
        type: error instanceof Error ? error.name : "unknown",
      },
    }),
  );
  process.exitCode = 1;
});

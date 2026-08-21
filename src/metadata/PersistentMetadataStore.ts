import { createHash, randomUUID } from "node:crypto";
import { open, mkdir, readFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseIndex } from "./DatabaseIndex.js";
import type {
  ColumnMetadata,
  DatabaseMetadata,
  DatabaseObject,
  ForeignKeyMetadata,
  KeyMetadata,
  ParameterMetadata,
  SqlType,
} from "./MetadataModels.js";

export const METADATA_CACHE_FORMAT_VERSION = 1;

export interface PersistedDatabaseSnapshot {
  readonly index: DatabaseIndex;
  readonly createdAt: number;
  readonly lastSuccessfulRefreshAt: number;
  readonly objectCount: number;
  readonly columnCount: number;
  readonly relationshipCount: number;
}

export interface MetadataSnapshotStore {
  load(
    connectionId: string,
    database: string,
  ): Promise<PersistedDatabaseSnapshot | undefined>;
  save(
    connectionId: string,
    database: string,
    index: DatabaseIndex,
    lastSuccessfulRefreshAt: number,
  ): Promise<void>;
  delete(connectionId: string, database: string): Promise<void>;
}

interface PersistentMetadataEnvelope {
  readonly cacheFormatVersion: number;
  readonly connectionIdentityHash: string;
  readonly databaseName: string;
  readonly createdAt: number;
  readonly lastSuccessfulRefreshAt: number;
  readonly objectCount: number;
  readonly columnCount: number;
  readonly relationshipCount: number;
  readonly metadata: DatabaseMetadata;
}

const persistedKinds = new Set<DatabaseObject["kind"]>([
  "table",
  "view",
  "procedure",
  "scalarFunction",
  "tableValuedFunction",
  "synonym",
  "sequence",
  "userType",
]);
const keyKinds = new Set<KeyMetadata["kind"]>([
  "primaryKey",
  "uniqueConstraint",
  "uniqueIndex",
]);
const normalize = (value: string): string => value.toLocaleLowerCase("en-US");
const hash = (value: string): string =>
  createHash("sha256").update(value).digest("hex");
const connectionIdentityHash = (connectionId: string): string =>
  hash(connectionId);
const snapshotIdentityHash = (connectionId: string, database: string): string =>
  hash(`${connectionId}\u0000${normalize(database)}`);

export class FileMetadataSnapshotStore implements MetadataSnapshotStore {
  constructor(
    private readonly storagePath: string,
    private readonly diagnostic: (message: string) => void = () => undefined,
  ) {}

  async load(
    connectionId: string,
    database: string,
  ): Promise<PersistedDatabaseSnapshot | undefined> {
    const path = this.path(connectionId, database);
    let text: string;
    try {
      text = await readFile(path, "utf8");
    } catch (error) {
      if (isNodeError(error, "ENOENT")) return undefined;
      this.diagnostic(
        `Persistent metadata cache could not be read for ${database}: ${errorMessage(error)}.`,
      );
      return undefined;
    }
    try {
      const parsed: unknown = JSON.parse(text);
      if (!isPersistentEnvelope(parsed, connectionId, database)) {
        this.diagnostic(
          `Discarding incompatible or invalid persistent metadata cache for ${database}.`,
        );
        await this.discard(connectionId, database);
        return undefined;
      }
      const metadata = canonicalMetadata(parsed.metadata);
      return {
        index: new DatabaseIndex(metadata),
        createdAt: parsed.createdAt,
        lastSuccessfulRefreshAt: parsed.lastSuccessfulRefreshAt,
        objectCount: parsed.objectCount,
        columnCount: parsed.columnCount,
        relationshipCount: parsed.relationshipCount,
      };
    } catch (error) {
      this.diagnostic(
        `Discarding corrupt persistent metadata cache for ${database}: ${errorMessage(error)}.`,
      );
      await this.discard(connectionId, database);
      return undefined;
    }
  }

  async save(
    connectionId: string,
    database: string,
    index: DatabaseIndex,
    lastSuccessfulRefreshAt: number,
  ): Promise<void> {
    await mkdir(this.storagePath, { recursive: true });
    const metadata = canonicalMetadata(index.metadata);
    const objectCount = index.count;
    const columnCount = index.columnCount;
    const relationshipCount = index.metadata.foreignKeys?.length ?? 0;
    const envelope: PersistentMetadataEnvelope = {
      cacheFormatVersion: METADATA_CACHE_FORMAT_VERSION,
      connectionIdentityHash: connectionIdentityHash(connectionId),
      databaseName: database,
      createdAt: Date.now(),
      lastSuccessfulRefreshAt,
      objectCount,
      columnCount,
      relationshipCount,
      metadata,
    };
    const path = this.path(connectionId, database);
    const temporaryPath = `${path}.${String(process.pid)}.${randomUUID()}.tmp`;
    const handle = await open(temporaryPath, "wx");
    let complete = false;
    try {
      await handle.writeFile(JSON.stringify(envelope), "utf8");
      await handle.sync();
      complete = true;
    } finally {
      await handle.close();
      if (!complete) await unlink(temporaryPath).catch(() => undefined);
    }
    try {
      await rename(temporaryPath, path);
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      throw error;
    }
  }

  async delete(connectionId: string, database: string): Promise<void> {
    try {
      await unlink(this.path(connectionId, database));
    } catch (error) {
      if (!isNodeError(error, "ENOENT")) throw error;
    }
  }

  private path(connectionId: string, database: string): string {
    return join(
      this.storagePath,
      `metadata-${snapshotIdentityHash(connectionId, database)}.json`,
    );
  }

  private async discard(connectionId: string, database: string): Promise<void> {
    try {
      await this.delete(connectionId, database);
    } catch (error) {
      this.diagnostic(
        `Invalid persistent metadata cache for ${database} could not be removed: ${errorMessage(error)}.`,
      );
    }
  }
}

function canonicalMetadata(metadata: DatabaseMetadata): DatabaseMetadata {
  return {
    database: metadata.database,
    schemas: [...metadata.schemas],
    objects: metadata.objects.map(canonicalObject),
    ...(metadata.keys ? { keys: metadata.keys.map(canonicalKey) } : {}),
    ...(metadata.foreignKeys
      ? { foreignKeys: metadata.foreignKeys.map(canonicalForeignKey) }
      : {}),
    loadedAt: metadata.loadedAt,
  };
}

function canonicalObject(object: DatabaseObject): DatabaseObject {
  return {
    ...(object.id === undefined ? {} : { id: object.id }),
    schema: object.schema,
    name: object.name,
    normalizedName: object.normalizedName,
    kind: object.kind,
    columns: object.columns.map(canonicalColumn),
    parameters: object.parameters.map(canonicalParameter),
    ...(object.returnType
      ? { returnType: canonicalType(object.returnType) }
      : {}),
    ...(object.resultSetKnown === undefined
      ? {}
      : { resultSetKnown: object.resultSetKnown }),
    ...(object.baseObjectName ? { baseObjectName: object.baseObjectName } : {}),
  };
}

function canonicalColumn(column: ColumnMetadata): ColumnMetadata {
  return {
    name: column.name,
    normalizedName: column.normalizedName,
    type: canonicalType(column.type),
    nullable: column.nullable,
    ordinal: column.ordinal,
    ...(column.identity ? { identity: true } : {}),
    ...(column.computed ? { computed: true } : {}),
    ...(column.generatedAlways ? { generatedAlways: true } : {}),
    ...(column.hidden ? { hidden: true } : {}),
  };
}

function canonicalParameter(parameter: ParameterMetadata): ParameterMetadata {
  return {
    name: parameter.name,
    type: canonicalType(parameter.type),
    output: parameter.output,
    ordinal: parameter.ordinal,
  };
}

function canonicalType(type: SqlType): SqlType {
  return {
    name: type.name,
    ...(type.schema ? { schema: type.schema } : {}),
    ...(type.maxLength === undefined ? {} : { maxLength: type.maxLength }),
    ...(type.precision === undefined ? {} : { precision: type.precision }),
    ...(type.scale === undefined ? {} : { scale: type.scale }),
    ...(type.userDefined === undefined
      ? {}
      : { userDefined: type.userDefined }),
    ...(type.underlyingSystemType
      ? { underlyingSystemType: type.underlyingSystemType }
      : {}),
  };
}

function canonicalKey(key: KeyMetadata): KeyMetadata {
  return {
    database: key.database,
    objectId: key.objectId,
    schema: key.schema,
    objectName: key.objectName,
    name: key.name,
    kind: key.kind,
    columns: key.columns.map((column) => ({
      columnId: column.columnId,
      columnName: column.columnName,
      ordinal: column.ordinal,
    })),
    filtered: key.filtered,
    ...(key.filterDefinition ? { filterDefinition: key.filterDefinition } : {}),
  };
}

function canonicalForeignKey(key: ForeignKeyMetadata): ForeignKeyMetadata {
  return {
    database: key.database,
    id: key.id,
    name: key.name,
    parentObjectId: key.parentObjectId,
    parentSchema: key.parentSchema,
    parentObjectName: key.parentObjectName,
    referencedObjectId: key.referencedObjectId,
    referencedSchema: key.referencedSchema,
    referencedObjectName: key.referencedObjectName,
    columns: key.columns.map((column) => ({
      parentColumnId: column.parentColumnId,
      parentColumnName: column.parentColumnName,
      referencedColumnId: column.referencedColumnId,
      referencedColumnName: column.referencedColumnName,
      ordinal: column.ordinal,
    })),
    deleteAction: key.deleteAction,
    updateAction: key.updateAction,
    disabled: key.disabled,
    notTrusted: key.notTrusted,
  };
}

function isPersistentEnvelope(
  value: unknown,
  connectionId: string,
  database: string,
): value is PersistentMetadataEnvelope {
  if (!isRecord(value)) return false;
  if (value["cacheFormatVersion"] !== METADATA_CACHE_FORMAT_VERSION)
    return false;
  if (value["connectionIdentityHash"] !== connectionIdentityHash(connectionId))
    return false;
  if (
    typeof value["databaseName"] !== "string" ||
    normalize(value["databaseName"]) !== normalize(database)
  )
    return false;
  if (
    !isFiniteNumber(value["createdAt"]) ||
    !isFiniteNumber(value["lastSuccessfulRefreshAt"]) ||
    !isNonnegativeInteger(value["objectCount"]) ||
    !isNonnegativeInteger(value["columnCount"]) ||
    !isNonnegativeInteger(value["relationshipCount"]) ||
    !isDatabaseMetadata(value["metadata"])
  )
    return false;
  const metadata = value["metadata"];
  return (
    normalize(metadata.database) === normalize(database) &&
    value["objectCount"] === metadata.objects.length &&
    value["columnCount"] ===
      metadata.objects.reduce(
        (count, object) => count + object.columns.length,
        0,
      ) &&
    value["relationshipCount"] === (metadata.foreignKeys?.length ?? 0)
  );
}

function isDatabaseMetadata(value: unknown): value is DatabaseMetadata {
  if (!isRecord(value)) return false;
  return (
    typeof value["database"] === "string" &&
    isStringArray(value["schemas"]) &&
    Array.isArray(value["objects"]) &&
    value["objects"].every(isDatabaseObject) &&
    isOptionalArray(value["keys"], isKey) &&
    isOptionalArray(value["foreignKeys"], isForeignKey) &&
    isFiniteNumber(value["loadedAt"])
  );
}

function isDatabaseObject(value: unknown): value is DatabaseObject {
  if (!isRecord(value)) return false;
  return (
    isOptionalNumber(value["id"]) &&
    typeof value["schema"] === "string" &&
    typeof value["name"] === "string" &&
    typeof value["normalizedName"] === "string" &&
    typeof value["kind"] === "string" &&
    persistedKinds.has(value["kind"] as DatabaseObject["kind"]) &&
    Array.isArray(value["columns"]) &&
    value["columns"].every(isColumn) &&
    Array.isArray(value["parameters"]) &&
    value["parameters"].every(isParameter) &&
    (value["returnType"] === undefined || isSqlType(value["returnType"])) &&
    isOptionalBoolean(value["resultSetKnown"]) &&
    isOptionalString(value["baseObjectName"])
  );
}

function isColumn(value: unknown): value is ColumnMetadata {
  if (!isRecord(value)) return false;
  return (
    typeof value["name"] === "string" &&
    typeof value["normalizedName"] === "string" &&
    isSqlType(value["type"]) &&
    typeof value["nullable"] === "boolean" &&
    isFiniteNumber(value["ordinal"]) &&
    isOptionalBoolean(value["identity"]) &&
    isOptionalBoolean(value["computed"]) &&
    isOptionalBoolean(value["generatedAlways"]) &&
    isOptionalBoolean(value["hidden"])
  );
}

function isParameter(value: unknown): value is ParameterMetadata {
  return (
    isRecord(value) &&
    typeof value["name"] === "string" &&
    isSqlType(value["type"]) &&
    typeof value["output"] === "boolean" &&
    isFiniteNumber(value["ordinal"])
  );
}

function isSqlType(value: unknown): value is SqlType {
  return (
    isRecord(value) &&
    typeof value["name"] === "string" &&
    isOptionalString(value["schema"]) &&
    isOptionalNumber(value["maxLength"]) &&
    isOptionalNumber(value["precision"]) &&
    isOptionalNumber(value["scale"]) &&
    isOptionalBoolean(value["userDefined"]) &&
    isOptionalString(value["underlyingSystemType"])
  );
}

function isKey(value: unknown): value is KeyMetadata {
  return (
    isRecord(value) &&
    typeof value["database"] === "string" &&
    isFiniteNumber(value["objectId"]) &&
    typeof value["schema"] === "string" &&
    typeof value["objectName"] === "string" &&
    typeof value["name"] === "string" &&
    typeof value["kind"] === "string" &&
    keyKinds.has(value["kind"] as KeyMetadata["kind"]) &&
    Array.isArray(value["columns"]) &&
    value["columns"].every(
      (column) =>
        isRecord(column) &&
        isFiniteNumber(column["columnId"]) &&
        typeof column["columnName"] === "string" &&
        isFiniteNumber(column["ordinal"]),
    ) &&
    typeof value["filtered"] === "boolean" &&
    isOptionalString(value["filterDefinition"])
  );
}

function isForeignKey(value: unknown): value is ForeignKeyMetadata {
  return (
    isRecord(value) &&
    typeof value["database"] === "string" &&
    isFiniteNumber(value["id"]) &&
    typeof value["name"] === "string" &&
    isFiniteNumber(value["parentObjectId"]) &&
    typeof value["parentSchema"] === "string" &&
    typeof value["parentObjectName"] === "string" &&
    isFiniteNumber(value["referencedObjectId"]) &&
    typeof value["referencedSchema"] === "string" &&
    typeof value["referencedObjectName"] === "string" &&
    Array.isArray(value["columns"]) &&
    value["columns"].every(
      (column) =>
        isRecord(column) &&
        isFiniteNumber(column["parentColumnId"]) &&
        typeof column["parentColumnName"] === "string" &&
        isFiniteNumber(column["referencedColumnId"]) &&
        typeof column["referencedColumnName"] === "string" &&
        isFiniteNumber(column["ordinal"]),
    ) &&
    typeof value["deleteAction"] === "string" &&
    typeof value["updateAction"] === "string" &&
    typeof value["disabled"] === "boolean" &&
    typeof value["notTrusted"] === "boolean"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const isNonnegativeInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;
const isOptionalNumber = (value: unknown): value is number | undefined =>
  value === undefined || isFiniteNumber(value);
const isOptionalString = (value: unknown): value is string | undefined =>
  value === undefined || typeof value === "string";
const isOptionalBoolean = (value: unknown): value is boolean | undefined =>
  value === undefined || typeof value === "boolean";
const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");
const isOptionalArray = <T>(
  value: unknown,
  predicate: (item: unknown) => item is T,
): value is T[] | undefined =>
  value === undefined ||
  (Array.isArray(value) && value.every((item) => predicate(item)));
const isNodeError = (error: unknown, code: string): boolean =>
  error instanceof Error &&
  "code" in error &&
  (error as NodeJS.ErrnoException).code === code;
const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

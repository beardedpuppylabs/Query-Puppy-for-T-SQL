import { DatabaseIndex } from "../metadata/DatabaseIndex.js";
import type {
  ColumnMetadata,
  DatabaseObject,
  ParameterMetadata,
  SqlType,
} from "../metadata/MetadataModels.js";
import { normalizeName } from "../metadata/MetadataModels.js";
import { quoteDatabaseIdentifier } from "../metadata/SqlTypeFormatter.js";
import type {
  ActiveConnection,
  ConnectionService,
} from "./ConnectionService.js";
import type { DbCellValue } from "./SimpleExecuteResult.js";

/** Deliberately narrow developer-facing sys views; never index all shipped objects. */
export const DEVELOPER_SYS_VIEWS = [
  "all_columns",
  "all_objects",
  "columns",
  "computed_columns",
  "databases",
  "foreign_key_columns",
  "foreign_keys",
  "identity_columns",
  "indexes",
  "index_columns",
  "key_constraints",
  "objects",
  "parameters",
  "procedures",
  "schemas",
  "sequences",
  "synonyms",
  "system_columns",
  "system_objects",
  "tables",
  "table_types",
  "types",
  "views",
] as const;

const systemViewNamesSql = DEVELOPER_SYS_VIEWS.map((name) => `N'${name}'`).join(
  ",",
);
const developerSystemViewPredicate = `(o.type = 'V' AND ((SCHEMA_NAME(o.schema_id) = N'INFORMATION_SCHEMA') OR (SCHEMA_NAME(o.schema_id) = N'sys' AND o.name IN (${systemViewNamesSql}))))`;

export const METADATA_QUERY = String.raw`
SET NOCOUNT ON;
SELECT record_kind, object_id, schema_name, object_name, object_kind, member_name,
       type_schema, type_name, max_length, precision_value, scale_value,
       is_nullable, is_output, ordinal, base_object_name
FROM (
 SELECT 'D' record_kind, COUNT_BIG(*) object_id, DB_NAME() schema_name, NULL object_name, NULL object_kind,
        NULL member_name, NULL type_schema, NULL type_name, NULL max_length, NULL precision_value,
        NULL scale_value, NULL is_nullable, NULL is_output, NULL ordinal, NULL base_object_name
 FROM sys.objects WHERE is_ms_shipped = 0
 UNION ALL
 SELECT 'S' record_kind, NULL object_id, s.name schema_name, NULL object_name, NULL object_kind,
        NULL member_name, NULL type_schema, NULL type_name, NULL max_length, NULL precision_value,
        NULL scale_value, NULL is_nullable, NULL is_output, NULL ordinal, NULL base_object_name
 FROM sys.schemas s WHERE s.schema_id < 16384
 UNION ALL
 SELECT 'O', o.object_id, SCHEMA_NAME(o.schema_id), o.name,
        CASE o.type WHEN 'U' THEN 'table' WHEN 'V' THEN 'view' WHEN 'P' THEN 'procedure'
          WHEN 'FN' THEN 'scalarFunction' WHEN 'FS' THEN 'scalarFunction'
          WHEN 'IF' THEN 'tableValuedFunction' WHEN 'TF' THEN 'tableValuedFunction' WHEN 'FT' THEN 'tableValuedFunction' END,
        NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
 FROM sys.all_objects o
 WHERE (o.is_ms_shipped = 0 AND o.type IN ('U','V','P','FN','FS','IF','TF','FT'))
    OR ${developerSystemViewPredicate}
 UNION ALL
 SELECT 'O', sy.object_id, SCHEMA_NAME(sy.schema_id), sy.name, 'synonym', NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,sy.base_object_name
 FROM sys.synonyms sy
 UNION ALL
 SELECT 'O', seq.object_id, SCHEMA_NAME(seq.schema_id), seq.name, 'sequence', NULL,
        SCHEMA_NAME(t.schema_id), t.name, t.max_length, t.precision, t.scale, NULL,NULL,NULL,NULL
 FROM sys.sequences seq JOIN sys.types t ON seq.user_type_id=t.user_type_id
 UNION ALL
 SELECT 'O', t.user_type_id, SCHEMA_NAME(t.schema_id), t.name, 'userType', NULL,
        SCHEMA_NAME(t.schema_id), t.name, t.max_length, t.precision, t.scale, NULL,NULL,NULL,NULL
 FROM sys.types t WHERE t.is_user_defined=1 AND t.is_table_type=0
 UNION ALL
 SELECT 'C', c.object_id, SCHEMA_NAME(o.schema_id), o.name, NULL, c.name,
        SCHEMA_NAME(t.schema_id), t.name, c.max_length, c.precision, c.scale, c.is_nullable,NULL,c.column_id,NULL
 FROM sys.all_columns c JOIN sys.all_objects o ON c.object_id=o.object_id JOIN sys.types t ON c.user_type_id=t.user_type_id
 WHERE (o.is_ms_shipped=0 AND o.type IN ('U','V','IF','TF','FT'))
    OR ${developerSystemViewPredicate}
 UNION ALL
 SELECT 'P', p.object_id, SCHEMA_NAME(o.schema_id), o.name, NULL, p.name,
        SCHEMA_NAME(t.schema_id), t.name, p.max_length, p.precision, p.scale, NULL,p.is_output,p.parameter_id,NULL
 FROM sys.parameters p JOIN sys.objects o ON p.object_id=o.object_id JOIN sys.types t ON p.user_type_id=t.user_type_id
 WHERE o.is_ms_shipped=0 AND o.type IN ('P','FN','FS','IF','TF','FT')
) metadata ORDER BY record_kind, schema_name, object_name, ordinal;`;

const value = (
  row: readonly DbCellValue[],
  index: number,
): string | undefined => {
  const cell = row[index];
  return !cell || cell.isNull ? undefined : cell.displayValue;
};
const number = (
  row: readonly DbCellValue[],
  index: number,
): number | undefined => {
  const text = value(row, index);
  return text === undefined ? undefined : Number(text);
};
const bool = (row: readonly DbCellValue[], index: number): boolean => {
  const text = value(row, index)?.toLowerCase();
  return text === "true" || text === "1";
};
const sqlType = (row: readonly DbCellValue[]): SqlType | undefined => {
  const name = value(row, 7);
  if (!name) return undefined;
  const schema = value(row, 6);
  const builtIn = schema === "sys";
  const maxLength = number(row, 8);
  const precision = number(row, 9);
  const scale = number(row, 10);
  return {
    name,
    ...(schema && !builtIn ? { schema, userDefined: true } : {}),
    ...(maxLength !== undefined ? { maxLength } : {}),
    ...(precision !== undefined ? { precision } : {}),
    ...(scale !== undefined ? { scale } : {}),
  };
};

export class MetadataLoader {
  constructor(
    private readonly connections: ConnectionService,
    private readonly log: (message: string) => void = () => undefined,
  ) {}
  async load(connection: ActiveConnection): Promise<DatabaseIndex> {
    const result = await this.connections.query(
      connection,
      `USE ${quoteDatabaseIdentifier(connection.database)};\n${METADATA_QUERY}`,
    );
    this.log(
      `Metadata query returned ${String(result.rows.length)} mapped rows (reported rowCount ${String(result.rowCount)}).`,
    );
    const schemas: string[] = [];
    let catalogObjectCount: number | undefined;
    let actualDatabase: string | undefined;
    const mutable = new Map<
      string,
      {
        object: DatabaseObject;
        columns: ColumnMetadata[];
        parameters: ParameterMetadata[];
      }
    >();
    // The service preserves SQL row order, but catalog assembly must not depend on it.
    // Build all object shells first, then attach columns and parameters.
    for (const row of result.rows) {
      const record = value(row, 0);
      const schema = value(row, 2);
      const name = value(row, 3);
      if (record === "D") {
        catalogObjectCount = number(row, 1);
        actualDatabase = schema;
        continue;
      }
      if (record === "S" && schema) {
        schemas.push(schema);
        continue;
      }
      const id = number(row, 1);
      if (record === "O" && id !== undefined && schema && name) {
        const kind = value(row, 4) as DatabaseObject["kind"] | undefined;
        if (!kind) continue;
        const type = sqlType(row);
        const baseObjectName = value(row, 14);
        const key = `${kind === "userType" ? "T" : "O"}:${String(id)}`;
        mutable.set(key, {
          object: {
            id,
            schema,
            name,
            normalizedName: normalizeName(name),
            kind,
            columns: [],
            parameters: [],
            ...(kind === "scalarFunction" && type ? { returnType: type } : {}),
            ...(baseObjectName ? { baseObjectName } : {}),
          },
          columns: [],
          parameters: [],
        });
      }
    }
    for (const row of result.rows) {
      const record = value(row, 0);
      if (record !== "C" && record !== "P") continue;
      const id = number(row, 1);
      if (id === undefined) continue;
      const target = mutable.get(`O:${String(id)}`);
      if (!target) continue;
      const member = value(row, 5);
      const type = sqlType(row);
      if (!type) continue;
      const ordinal = number(row, 13) ?? 0;
      if (
        record === "P" &&
        ordinal === 0 &&
        target.object.kind === "scalarFunction"
      ) {
        target.object = { ...target.object, returnType: type };
        continue;
      }
      if (!member) continue;
      if (record === "C")
        target.columns.push({
          name: member,
          normalizedName: normalizeName(member),
          type,
          nullable: bool(row, 11),
          ordinal,
        });
      if (record === "P") {
        target.parameters.push({
          name: member,
          type,
          output: bool(row, 12),
          ordinal,
        });
      }
    }
    const objects = [...mutable.values()].map((item) => ({
      ...item.object,
      columns: item.columns,
      parameters: item.parameters,
    }));
    this.log(
      `Metadata context: expected database ${connection.database}; actual database ${actualDatabase ?? "unknown"}; sys.objects count ${catalogObjectCount === undefined ? "unknown" : String(catalogObjectCount)}; indexed objects ${String(objects.length)}.`,
    );
    if (
      actualDatabase &&
      actualDatabase.toLowerCase() !== connection.database.toLowerCase()
    )
      throw new Error(
        `Metadata query used database ${actualDatabase} instead of active database ${connection.database}.`,
      );
    if ((catalogObjectCount ?? 0) > 0 && objects.length === 0)
      this.log(
        "WARNING: SQL Server reported catalog objects, but the metadata mapper produced zero indexed objects.",
      );
    return new DatabaseIndex({
      database: connection.database,
      schemas,
      objects,
      loadedAt: Date.now(),
    });
  }
}

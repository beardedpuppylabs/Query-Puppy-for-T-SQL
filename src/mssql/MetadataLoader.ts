import { DatabaseIndex } from "../metadata/DatabaseIndex.js";
import type {
  ColumnMetadata,
  DatabaseObject,
  ForeignKeyMetadata,
  KeyMetadata,
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
       is_nullable, is_output, ordinal, base_object_name, is_identity, is_computed, generated_always_type, is_hidden
FROM (
 SELECT 'D' record_kind, COUNT_BIG(*) object_id, DB_NAME() schema_name, NULL object_name, NULL object_kind,
        NULL member_name, NULL type_schema, NULL type_name, NULL max_length, NULL precision_value,
        NULL scale_value, NULL is_nullable, NULL is_output, NULL ordinal, NULL base_object_name,
        NULL is_identity, NULL is_computed, NULL generated_always_type, NULL is_hidden
 FROM sys.objects WHERE is_ms_shipped = 0
 UNION ALL
 SELECT 'S' record_kind, NULL object_id, s.name schema_name, NULL object_name, NULL object_kind,
        NULL member_name, NULL type_schema, NULL type_name, NULL max_length, NULL precision_value,
        NULL scale_value, NULL is_nullable, NULL is_output, NULL ordinal, NULL base_object_name, NULL,NULL,NULL,NULL
 FROM sys.schemas s WHERE s.schema_id < 16384
 UNION ALL
 SELECT 'O', o.object_id, SCHEMA_NAME(o.schema_id), o.name,
        CASE o.type WHEN 'U' THEN 'table' WHEN 'V' THEN 'view' WHEN 'P' THEN 'procedure'
          WHEN 'FN' THEN 'scalarFunction' WHEN 'FS' THEN 'scalarFunction'
          WHEN 'IF' THEN 'tableValuedFunction' WHEN 'TF' THEN 'tableValuedFunction' WHEN 'FT' THEN 'tableValuedFunction' END,
        NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,NULL,NULL,NULL
 FROM sys.all_objects o
 WHERE (o.is_ms_shipped = 0 AND o.type IN ('U','V','P','FN','FS','IF','TF','FT'))
    OR ${developerSystemViewPredicate}
 UNION ALL
 SELECT 'O', sy.object_id, SCHEMA_NAME(sy.schema_id), sy.name, 'synonym', NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,sy.base_object_name,NULL,NULL,NULL,NULL
 FROM sys.synonyms sy
 UNION ALL
 SELECT 'O', seq.object_id, SCHEMA_NAME(seq.schema_id), seq.name, 'sequence', NULL,
        SCHEMA_NAME(t.schema_id), t.name, t.max_length, t.precision, t.scale, NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL
 FROM sys.sequences seq JOIN sys.types t ON seq.user_type_id=t.user_type_id
 UNION ALL
 SELECT 'O', t.user_type_id, SCHEMA_NAME(t.schema_id), t.name, 'userType', NULL,
        SCHEMA_NAME(t.schema_id), t.name, t.max_length, t.precision, t.scale, NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL
 FROM sys.types t WHERE t.is_user_defined=1 AND t.is_table_type=0
 UNION ALL
 SELECT 'C', c.object_id, SCHEMA_NAME(o.schema_id), o.name, NULL, c.name,
        SCHEMA_NAME(t.schema_id), t.name, c.max_length, c.precision, c.scale, c.is_nullable,NULL,c.column_id,NULL,
        COALESCE(uc.is_identity,0),COALESCE(uc.is_computed,0),COALESCE(uc.generated_always_type,0),COALESCE(uc.is_hidden,0)
 FROM sys.all_columns c JOIN sys.all_objects o ON c.object_id=o.object_id JOIN sys.types t ON c.user_type_id=t.user_type_id
 LEFT JOIN sys.columns uc ON uc.object_id=c.object_id AND uc.column_id=c.column_id
 WHERE (o.is_ms_shipped=0 AND o.type IN ('U','V','IF','TF','FT'))
    OR ${developerSystemViewPredicate}
 UNION ALL
 SELECT 'P', p.object_id, SCHEMA_NAME(o.schema_id), o.name, NULL, p.name,
        SCHEMA_NAME(t.schema_id), t.name, p.max_length, p.precision, p.scale, NULL,p.is_output,p.parameter_id,NULL,NULL,NULL,NULL,NULL
 FROM sys.parameters p JOIN sys.objects o ON p.object_id=o.object_id JOIN sys.types t ON p.user_type_id=t.user_type_id
 WHERE o.is_ms_shipped=0 AND o.type IN ('P','FN','FS','IF','TF','FT')
) metadata ORDER BY record_kind, schema_name, object_name, ordinal;`;

/** One set-based relationship query per database; row count never affects query count. */
export const RELATIONSHIP_QUERY = String.raw`
SET NOCOUNT ON;
SELECT record_kind, relationship_id, relationship_name, relationship_kind,
       parent_object_id, parent_schema, parent_object, parent_column_id, parent_column,
       referenced_object_id, referenced_schema, referenced_object, referenced_column_id, referenced_column,
       ordinal, delete_action, update_action, is_disabled, is_not_trusted, filter_definition
FROM (
 SELECT 'K' record_kind, i.index_id relationship_id, i.name relationship_name,
        CASE kc.type WHEN 'PK' THEN 'primaryKey' WHEN 'UQ' THEN 'uniqueConstraint' ELSE 'uniqueIndex' END relationship_kind,
        o.object_id parent_object_id, s.name parent_schema, o.name parent_object,
        c.column_id parent_column_id, c.name parent_column,
        NULL referenced_object_id,NULL referenced_schema,NULL referenced_object,NULL referenced_column_id,NULL referenced_column,
        ic.key_ordinal ordinal,NULL delete_action,NULL update_action,NULL is_disabled,NULL is_not_trusted,i.filter_definition
 FROM sys.indexes i
 JOIN sys.tables o ON o.object_id=i.object_id
 JOIN sys.schemas s ON s.schema_id=o.schema_id
 JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id AND ic.key_ordinal > 0 AND ic.is_included_column=0
 JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
 LEFT JOIN sys.key_constraints kc ON kc.parent_object_id=i.object_id AND kc.unique_index_id=i.index_id
 WHERE i.is_unique=1 AND i.is_hypothetical=0
 UNION ALL
 SELECT 'F',fk.object_id,fk.name,NULL,po.object_id,ps.name,po.name,pc.column_id,pc.name,
        ro.object_id,rs.name,ro.name,rc.column_id,rc.name,fkc.constraint_column_id,
        fk.delete_referential_action_desc,fk.update_referential_action_desc,fk.is_disabled,fk.is_not_trusted,NULL
 FROM sys.foreign_keys fk
 JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id=fk.object_id
 JOIN sys.tables po ON po.object_id=fk.parent_object_id
 JOIN sys.schemas ps ON ps.schema_id=po.schema_id
 JOIN sys.columns pc ON pc.object_id=po.object_id AND pc.column_id=fkc.parent_column_id
 JOIN sys.tables ro ON ro.object_id=fk.referenced_object_id
 JOIN sys.schemas rs ON rs.schema_id=ro.schema_id
 JOIN sys.columns rc ON rc.object_id=ro.object_id AND rc.column_id=fkc.referenced_column_id
) relationships ORDER BY record_kind,parent_schema,parent_object,relationship_name,ordinal;`;

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
    const results = await this.connections.queryMany(connection, [
      `USE ${quoteDatabaseIdentifier(connection.database)};\n${METADATA_QUERY}`,
      `USE ${quoteDatabaseIdentifier(connection.database)};\n${RELATIONSHIP_QUERY}`,
    ]);
    const result = results[0];
    const relationshipResult = results[1];
    if (!result || !relationshipResult)
      throw new Error("Metadata loading did not return both catalog results.");
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
          ...(bool(row, 15) ? { identity: true } : {}),
          ...(bool(row, 16) ? { computed: true } : {}),
          ...((number(row, 17) ?? 0) > 0 ? { generatedAlways: true } : {}),
          ...(bool(row, 18) ? { hidden: true } : {}),
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
    const keys = assembleKeys(connection.database, relationshipResult.rows);
    const foreignKeys = assembleForeignKeys(
      connection.database,
      relationshipResult.rows,
    );
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
      keys,
      foreignKeys,
      loadedAt: Date.now(),
    });
  }
}

function assembleKeys(
  database: string,
  rows: readonly (readonly DbCellValue[])[],
): KeyMetadata[] {
  const groups = new Map<
    string,
    KeyMetadata & {
      columns: KeyMetadata["columns"] extends readonly (infer C)[]
        ? C[]
        : never;
    }
  >();
  for (const row of rows) {
    if (value(row, 0) !== "K") continue;
    const objectId = number(row, 4);
    const schema = value(row, 5);
    const objectName = value(row, 6);
    const columnId = number(row, 7);
    const columnName = value(row, 8);
    const name = value(row, 2);
    const kind = value(row, 3) as KeyMetadata["kind"] | undefined;
    if (
      objectId === undefined ||
      columnId === undefined ||
      !schema ||
      !objectName ||
      !columnName ||
      !name ||
      !kind
    )
      continue;
    const id = `${String(objectId)}:${value(row, 1) ?? name}`;
    let key = groups.get(id);
    if (!key) {
      const filterDefinition = value(row, 19);
      key = {
        database,
        objectId,
        schema,
        objectName,
        name,
        kind,
        columns: [],
        filtered: filterDefinition !== undefined,
        ...(filterDefinition ? { filterDefinition } : {}),
      };
      groups.set(id, key);
    }
    key.columns.push({ columnId, columnName, ordinal: number(row, 14) ?? 0 });
  }
  return [...groups.values()];
}

function assembleForeignKeys(
  database: string,
  rows: readonly (readonly DbCellValue[])[],
): ForeignKeyMetadata[] {
  const groups = new Map<
    number,
    ForeignKeyMetadata & {
      columns: ForeignKeyMetadata["columns"] extends readonly (infer C)[]
        ? C[]
        : never;
    }
  >();
  for (const row of rows) {
    if (value(row, 0) !== "F") continue;
    const id = number(row, 1),
      parentObjectId = number(row, 4),
      parentColumnId = number(row, 7),
      referencedObjectId = number(row, 9),
      referencedColumnId = number(row, 12);
    const name = value(row, 2),
      parentSchema = value(row, 5),
      parentObjectName = value(row, 6),
      parentColumnName = value(row, 8),
      referencedSchema = value(row, 10),
      referencedObjectName = value(row, 11),
      referencedColumnName = value(row, 13);
    if (
      id === undefined ||
      parentObjectId === undefined ||
      parentColumnId === undefined ||
      referencedObjectId === undefined ||
      referencedColumnId === undefined ||
      !name ||
      !parentSchema ||
      !parentObjectName ||
      !parentColumnName ||
      !referencedSchema ||
      !referencedObjectName ||
      !referencedColumnName
    )
      continue;
    let foreignKey = groups.get(id);
    if (!foreignKey) {
      foreignKey = {
        database,
        id,
        name,
        parentObjectId,
        parentSchema,
        parentObjectName,
        referencedObjectId,
        referencedSchema,
        referencedObjectName,
        columns: [],
        deleteAction: value(row, 15) ?? "NO_ACTION",
        updateAction: value(row, 16) ?? "NO_ACTION",
        disabled: bool(row, 17),
        notTrusted: bool(row, 18),
      };
      groups.set(id, foreignKey);
    }
    foreignKey.columns.push({
      parentColumnId,
      parentColumnName,
      referencedColumnId,
      referencedColumnName,
      ordinal: number(row, 14) ?? 0,
    });
  }
  return [...groups.values()];
}

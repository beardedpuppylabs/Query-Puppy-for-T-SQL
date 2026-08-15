export type SqlObjectKind =
  | "database"
  | "schema"
  | "table"
  | "view"
  | "procedure"
  | "scalarFunction"
  | "tableValuedFunction"
  | "synonym"
  | "sequence"
  | "userType"
  | "column"
  | "joinPredicate"
  | "rowSourceAlias"
  | "procedureParameter"
  | "cte"
  | "variable"
  | "tableVariable"
  | "tempTable"
  | "derivedTable"
  | "values"
  | "inserted"
  | "deleted"
  | "keyword";

export interface SqlType {
  readonly name: string;
  readonly schema?: string;
  readonly maxLength?: number;
  readonly precision?: number;
  readonly scale?: number;
  readonly userDefined?: boolean;
  readonly underlyingSystemType?: string;
}

export interface ColumnMetadata {
  readonly name: string;
  readonly normalizedName: string;
  readonly type: SqlType;
  readonly nullable: boolean;
  readonly ordinal: number;
  readonly identity?: boolean;
  readonly computed?: boolean;
  readonly generatedAlways?: boolean;
  readonly hidden?: boolean;
}

export const isWritableColumn = (column: ColumnMetadata): boolean =>
  !column.identity &&
  !column.computed &&
  !column.generatedAlways &&
  !column.hidden &&
  !["timestamp", "rowversion"].includes(column.type.name.toLowerCase());

export interface ParameterMetadata {
  readonly name: string;
  readonly type: SqlType;
  readonly output: boolean;
  readonly ordinal: number;
}

export type KeyKind = "primaryKey" | "uniqueConstraint" | "uniqueIndex";
export interface KeyColumnMetadata {
  readonly columnId: number;
  readonly columnName: string;
  readonly ordinal: number;
}
export interface KeyMetadata {
  readonly database: string;
  readonly objectId: number;
  readonly schema: string;
  readonly objectName: string;
  readonly name: string;
  readonly kind: KeyKind;
  readonly columns: readonly KeyColumnMetadata[];
  readonly filtered: boolean;
  readonly filterDefinition?: string;
}
export interface ForeignKeyColumnMetadata {
  readonly parentColumnId: number;
  readonly parentColumnName: string;
  readonly referencedColumnId: number;
  readonly referencedColumnName: string;
  readonly ordinal: number;
}
export interface ForeignKeyMetadata {
  readonly database: string;
  readonly id: number;
  readonly name: string;
  readonly parentObjectId: number;
  readonly parentSchema: string;
  readonly parentObjectName: string;
  readonly referencedObjectId: number;
  readonly referencedSchema: string;
  readonly referencedObjectName: string;
  readonly columns: readonly ForeignKeyColumnMetadata[];
  readonly deleteAction: string;
  readonly updateAction: string;
  readonly disabled: boolean;
  readonly notTrusted: boolean;
}

export interface DatabaseObject {
  readonly id?: number;
  readonly schema: string;
  readonly name: string;
  readonly normalizedName: string;
  readonly kind: Exclude<
    SqlObjectKind,
    | "database"
    | "schema"
    | "column"
    | "joinPredicate"
    | "rowSourceAlias"
    | "procedureParameter"
    | "cte"
    | "variable"
    | "tableVariable"
    | "tempTable"
    | "derivedTable"
    | "values"
    | "inserted"
    | "deleted"
    | "keyword"
  >;
  readonly columns: readonly ColumnMetadata[];
  readonly parameters: readonly ParameterMetadata[];
  readonly returnType?: SqlType;
  readonly resultSetKnown?: boolean;
  readonly baseObjectName?: string;
}

export interface DatabaseMetadata {
  readonly database: string;
  readonly schemas: readonly string[];
  readonly objects: readonly DatabaseObject[];
  readonly keys?: readonly KeyMetadata[];
  readonly foreignKeys?: readonly ForeignKeyMetadata[];
  readonly loadedAt: number;
}

export const normalizeName = (name: string): string =>
  name.toLocaleLowerCase("en-US");

export const friendlyKind = (kind: SqlObjectKind): string =>
  ({
    database: "database",
    schema: "schema",
    table: "table",
    view: "view",
    procedure: "stored procedure",
    scalarFunction: "scalar function",
    tableValuedFunction: "table-valued function",
    synonym: "synonym",
    sequence: "sequence",
    userType: "user-defined type",
    column: "column",
    joinPredicate: "FK JOIN",
    rowSourceAlias: "row-source alias",
    procedureParameter: "parameter",
    cte: "CTE",
    variable: "variable",
    tableVariable: "table variable",
    tempTable: "temp table",
    derivedTable: "derived table",
    values: "VALUES row source",
    inserted: "inserted row",
    deleted: "deleted row",
    keyword: "keyword",
  })[kind];

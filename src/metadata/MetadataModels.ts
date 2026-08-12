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
  | "cte"
  | "variable"
  | "tableVariable"
  | "tempTable"
  | "keyword";

export interface SqlType {
  readonly name: string;
  readonly schema?: string;
  readonly maxLength?: number;
  readonly precision?: number;
  readonly scale?: number;
  readonly userDefined?: boolean;
}

export interface ColumnMetadata {
  readonly name: string;
  readonly normalizedName: string;
  readonly type: SqlType;
  readonly nullable: boolean;
  readonly ordinal: number;
}

export interface ParameterMetadata {
  readonly name: string;
  readonly type: SqlType;
  readonly output: boolean;
  readonly ordinal: number;
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
    | "cte"
    | "variable"
    | "tableVariable"
    | "tempTable"
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
    cte: "CTE",
    variable: "variable",
    tableVariable: "table variable",
    tempTable: "temp table",
    keyword: "keyword",
  })[kind];

export interface ActiveConnectionContext {
  readonly backendId: string;
  readonly connectionIdentity: string;
  readonly database: string;
  readonly serverIdentity?: string;
}

export interface ConnectionContextResolver {
  active(): Promise<ActiveConnectionContext | undefined>;
  available(): Promise<boolean>;
}

export interface MetadataCellValue {
  readonly isNull: boolean;
  readonly displayValue: string;
}

export interface MetadataQueryResult {
  readonly rowCount: number;
  readonly rows: readonly (readonly MetadataCellValue[])[];
}

export interface MetadataBackend {
  readonly id: string;
  executeMetadataQuery(
    connection: ActiveConnectionContext,
    sql: string,
  ): Promise<MetadataQueryResult>;
  executeMetadataQueries(
    connection: ActiveConnectionContext,
    sqlStatements: readonly string[],
  ): Promise<readonly MetadataQueryResult[]>;
  listDatabases(
    connection: ActiveConnectionContext,
  ): Promise<readonly string[]>;
}

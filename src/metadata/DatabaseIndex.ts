import type {
  DatabaseMetadata,
  DatabaseObject,
  ForeignKeyMetadata,
  KeyMetadata,
} from "./MetadataModels.js";

const objectKey = (schema: string, name: string): string =>
  `${schema}.${name}`.toLowerCase();
const columnKey = (objectId: number, column: string): string =>
  `${String(objectId)}:${column.toLowerCase()}`;
const append = <T>(
  map: Map<string | number, T[]>,
  key: string | number,
  item: T,
): void => {
  const values = map.get(key);
  if (values) values.push(item);
  else map.set(key, [item]);
};

export class DatabaseIndex {
  readonly metadata: DatabaseMetadata;
  readonly columnCount: number;
  private readonly qualified = new Map<string, DatabaseObject>();
  private readonly byId = new Map<number, DatabaseObject>();
  private readonly schemas = new Set<string>();
  private readonly keysByObject = new Map<number, KeyMetadata[]>();
  private readonly keysByColumn = new Map<string, KeyMetadata[]>();
  private readonly outgoing = new Map<number, ForeignKeyMetadata[]>();
  private readonly incoming = new Map<number, ForeignKeyMetadata[]>();
  private readonly foreignKeysByColumn = new Map<
    string,
    ForeignKeyMetadata[]
  >();
  private readonly outgoingForeignKeysByColumn = new Map<
    string,
    ForeignKeyMetadata[]
  >();

  constructor(metadata: DatabaseMetadata) {
    this.metadata = metadata;
    let columnCount = 0;
    for (const schema of metadata.schemas)
      this.schemas.add(schema.toLowerCase());
    for (const object of metadata.objects) {
      this.qualified.set(objectKey(object.schema, object.name), object);
      if (object.id !== undefined) this.byId.set(object.id, object);
      columnCount += object.columns.length;
    }
    this.columnCount = columnCount;
    for (const key of metadata.keys ?? []) {
      append(this.keysByObject, key.objectId, key);
      for (const column of key.columns)
        append(
          this.keysByColumn,
          columnKey(key.objectId, column.columnName),
          key,
        );
    }
    for (const foreignKey of metadata.foreignKeys ?? []) {
      append(this.outgoing, foreignKey.parentObjectId, foreignKey);
      append(this.incoming, foreignKey.referencedObjectId, foreignKey);
      for (const column of foreignKey.columns) {
        append(
          this.foreignKeysByColumn,
          columnKey(foreignKey.parentObjectId, column.parentColumnName),
          foreignKey,
        );
        append(
          this.outgoingForeignKeysByColumn,
          columnKey(foreignKey.parentObjectId, column.parentColumnName),
          foreignKey,
        );
        append(
          this.foreignKeysByColumn,
          columnKey(foreignKey.referencedObjectId, column.referencedColumnName),
          foreignKey,
        );
      }
    }
  }
  get objects(): readonly DatabaseObject[] {
    return this.metadata.objects;
  }
  findObject(schema: string, name: string): DatabaseObject | undefined {
    return this.qualified.get(objectKey(schema, name));
  }
  findObjectById(id: number): DatabaseObject | undefined {
    return this.byId.get(id);
  }
  hasSchema(schema: string): boolean {
    return this.schemas.has(schema.toLowerCase());
  }
  keysForObject(object: DatabaseObject | number): readonly KeyMetadata[] {
    const id = typeof object === "number" ? object : object.id;
    return id === undefined ? [] : (this.keysByObject.get(id) ?? []);
  }
  keysForColumn(
    object: DatabaseObject | number,
    column: string,
  ): readonly KeyMetadata[] {
    const id = typeof object === "number" ? object : object.id;
    return id === undefined
      ? []
      : (this.keysByColumn.get(columnKey(id, column)) ?? []);
  }
  outgoingForeignKeys(
    object: DatabaseObject | number,
  ): readonly ForeignKeyMetadata[] {
    const id = typeof object === "number" ? object : object.id;
    return id === undefined ? [] : (this.outgoing.get(id) ?? []);
  }
  incomingForeignKeys(
    object: DatabaseObject | number,
  ): readonly ForeignKeyMetadata[] {
    const id = typeof object === "number" ? object : object.id;
    return id === undefined ? [] : (this.incoming.get(id) ?? []);
  }
  foreignKeysForColumn(
    object: DatabaseObject | number,
    column: string,
  ): readonly ForeignKeyMetadata[] {
    const id = typeof object === "number" ? object : object.id;
    return id === undefined
      ? []
      : (this.foreignKeysByColumn.get(columnKey(id, column)) ?? []);
  }
  outgoingForeignKeysForColumn(
    object: DatabaseObject | number,
    column: string,
  ): readonly ForeignKeyMetadata[] {
    const id = typeof object === "number" ? object : object.id;
    return id === undefined
      ? []
      : (this.outgoingForeignKeysByColumn.get(columnKey(id, column)) ?? []);
  }
  relationshipsBetween(
    left: DatabaseObject | number,
    right: DatabaseObject | number,
  ): readonly ForeignKeyMetadata[] {
    const leftId = typeof left === "number" ? left : left.id;
    const rightId = typeof right === "number" ? right : right.id;
    if (leftId === undefined || rightId === undefined) return [];
    return [
      ...(this.outgoing.get(leftId) ?? []).filter(
        (fk) => fk.referencedObjectId === rightId,
      ),
      ...(this.outgoing.get(rightId) ?? []).filter(
        (fk) => fk.referencedObjectId === leftId,
      ),
    ];
  }
  relatedObjects(object: DatabaseObject | number): readonly DatabaseObject[] {
    const id = typeof object === "number" ? object : object.id;
    if (id === undefined) return [];
    const ids = new Set([
      ...(this.outgoing.get(id) ?? []).map((fk) => fk.referencedObjectId),
      ...(this.incoming.get(id) ?? []).map((fk) => fk.parentObjectId),
    ]);
    return [...ids].flatMap((relatedId) => {
      const related = this.byId.get(relatedId);
      return related ? [related] : [];
    });
  }
  get count(): number {
    return this.metadata.objects.length;
  }
}

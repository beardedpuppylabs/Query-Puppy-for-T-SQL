import type {
  DatabaseMetadata,
  DatabaseObject,
  KeyMetadata,
} from "./MetadataModels.js";
import {
  compareRelationships,
  deduplicateRelationships,
  relationshipFromForeignKey,
  type Relationship,
} from "../relationships/RelationshipModels.js";

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
  readonly relationships: readonly Relationship[];
  private readonly qualified = new Map<string, DatabaseObject>();
  private readonly byId = new Map<number, DatabaseObject>();
  private readonly schemas = new Set<string>();
  private readonly keysByObject = new Map<number, KeyMetadata[]>();
  private readonly keysByColumn = new Map<string, KeyMetadata[]>();
  private readonly outgoing = new Map<number, Relationship[]>();
  private readonly incoming = new Map<number, Relationship[]>();
  private readonly relationshipsByColumn = new Map<string, Relationship[]>();
  private readonly outgoingRelationshipsByColumn = new Map<
    string,
    Relationship[]
  >();

  constructor(
    metadata: DatabaseMetadata,
    additionalRelationships: readonly Relationship[] = [],
  ) {
    this.metadata = metadata;
    this.relationships = deduplicateRelationships([
      ...(metadata.foreignKeys ?? []).map(relationshipFromForeignKey),
      ...additionalRelationships,
    ]).sort(compareRelationships);
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
    for (const relationship of this.relationships) {
      const sourceId = relationship.source.objectId;
      const targetId = relationship.target.objectId;
      if (sourceId !== undefined) append(this.outgoing, sourceId, relationship);
      if (targetId !== undefined) append(this.incoming, targetId, relationship);
      for (const mapping of relationship.mappings) {
        if (sourceId !== undefined) {
          append(
            this.relationshipsByColumn,
            columnKey(sourceId, mapping.sourceColumnName),
            relationship,
          );
          append(
            this.outgoingRelationshipsByColumn,
            columnKey(sourceId, mapping.sourceColumnName),
            relationship,
          );
        }
        if (targetId !== undefined)
          append(
            this.relationshipsByColumn,
            columnKey(targetId, mapping.targetColumnName),
            relationship,
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
  outgoingRelationships(
    object: DatabaseObject | number,
  ): readonly Relationship[] {
    const id = typeof object === "number" ? object : object.id;
    return id === undefined ? [] : (this.outgoing.get(id) ?? []);
  }
  incomingRelationships(
    object: DatabaseObject | number,
  ): readonly Relationship[] {
    const id = typeof object === "number" ? object : object.id;
    return id === undefined ? [] : (this.incoming.get(id) ?? []);
  }
  relationshipsForColumn(
    object: DatabaseObject | number,
    column: string,
  ): readonly Relationship[] {
    const id = typeof object === "number" ? object : object.id;
    return id === undefined
      ? []
      : (this.relationshipsByColumn.get(columnKey(id, column)) ?? []);
  }
  outgoingRelationshipsForColumn(
    object: DatabaseObject | number,
    column: string,
  ): readonly Relationship[] {
    const id = typeof object === "number" ? object : object.id;
    return id === undefined
      ? []
      : (this.outgoingRelationshipsByColumn.get(columnKey(id, column)) ?? []);
  }
  relationshipsBetween(
    left: DatabaseObject | number,
    right: DatabaseObject | number,
  ): readonly Relationship[] {
    const leftId = typeof left === "number" ? left : left.id;
    const rightId = typeof right === "number" ? right : right.id;
    if (leftId === undefined || rightId === undefined) return [];
    return [
      ...(this.outgoing.get(leftId) ?? []).filter(
        (relationship) => relationship.target.objectId === rightId,
      ),
      ...(this.outgoing.get(rightId) ?? []).filter(
        (relationship) => relationship.target.objectId === leftId,
      ),
    ];
  }
  relatedObjects(object: DatabaseObject | number): readonly DatabaseObject[] {
    const id = typeof object === "number" ? object : object.id;
    if (id === undefined) return [];
    const ids = new Set([
      ...(this.outgoing.get(id) ?? []).flatMap((relationship) =>
        relationship.target.objectId === undefined
          ? []
          : [relationship.target.objectId],
      ),
      ...(this.incoming.get(id) ?? []).flatMap((relationship) =>
        relationship.source.objectId === undefined
          ? []
          : [relationship.source.objectId],
      ),
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

import type { DatabaseMetadata, DatabaseObject } from "./MetadataModels.js";

export class DatabaseIndex {
  readonly metadata: DatabaseMetadata;
  private readonly qualified = new Map<string, DatabaseObject>();
  private readonly schemas = new Set<string>();

  constructor(metadata: DatabaseMetadata) {
    this.metadata = metadata;
    for (const schema of metadata.schemas)
      this.schemas.add(schema.toLowerCase());
    for (const object of metadata.objects)
      this.qualified.set(
        `${object.schema}.${object.name}`.toLowerCase(),
        object,
      );
  }
  get objects(): readonly DatabaseObject[] {
    return this.metadata.objects;
  }
  findObject(schema: string, name: string): DatabaseObject | undefined {
    return this.qualified.get(`${schema}.${name}`.toLowerCase());
  }
  hasSchema(schema: string): boolean {
    return this.schemas.has(schema.toLowerCase());
  }
  get count(): number {
    return this.metadata.objects.length;
  }
}

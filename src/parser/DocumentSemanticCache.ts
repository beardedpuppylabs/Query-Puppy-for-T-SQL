import type {
  SemanticCatalog,
  DocumentSemanticModel,
} from "./DocumentSemanticAnalyzer.js";
import { analyzeDocumentSemantics } from "./DocumentSemanticAnalyzer.js";

interface Entry {
  readonly version: number;
  readonly cursor: number;
  readonly catalogIdentity: string;
  readonly model: DocumentSemanticModel;
}

export class DocumentSemanticCache {
  private readonly entries = new Map<string, Entry>();

  get(
    uri: string,
    version: number,
    sql: string,
    cursor: number,
    catalog?: SemanticCatalog,
  ): DocumentSemanticModel {
    const catalogIdentity = catalog
      ? `${catalog.activeDatabase}:${[...catalog.indexes.entries()]
          .map(
            ([name, index]) =>
              `${name}:${String(index.metadata.loadedAt)}:${String(index.count)}`,
          )
          .join(",")}`
      : "disconnected";
    const existing = this.entries.get(uri);
    if (
      existing?.version === version &&
      existing.cursor === cursor &&
      existing.catalogIdentity === catalogIdentity
    )
      return existing.model;
    const model = analyzeDocumentSemantics(sql, cursor, catalog);
    this.entries.set(uri, { version, cursor, catalogIdentity, model });
    return model;
  }

  delete(uri: string): void {
    this.entries.delete(uri);
  }
}

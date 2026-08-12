import { DatabaseIndex } from "./DatabaseIndex.js";

export type MetadataCacheState =
  "loading" | "loaded" | "unexpectedEmpty" | "failed";
interface CacheEntry {
  readonly connectionId: string;
  readonly database: string;
  state: MetadataCacheState;
  promise: Promise<DatabaseIndex>;
  value?: DatabaseIndex;
  error?: string;
}
export interface MetadataCacheSnapshot {
  readonly database: string;
  readonly state: MetadataCacheState;
  readonly objectCount?: number;
  readonly error?: string;
}

export class MetadataCache {
  private readonly entries = new Map<string, CacheEntry>();

  get(connectionId: string, database: string): DatabaseIndex | undefined {
    return this.entries.get(this.key(connectionId, database))?.value;
  }
  status(
    connectionId: string,
    database: string,
  ): MetadataCacheState | "notLoaded" {
    return (
      this.entries.get(this.key(connectionId, database))?.state ?? "notLoaded"
    );
  }
  error(connectionId: string, database: string): string | undefined {
    return this.entries.get(this.key(connectionId, database))?.error;
  }
  ensureLoaded(
    connectionId: string,
    database: string,
    loader: () => Promise<DatabaseIndex>,
  ): Promise<DatabaseIndex> {
    const key = this.key(connectionId, database);
    const existing = this.entries.get(key);
    if (existing) return existing.promise;
    const entry: CacheEntry = {
      connectionId,
      database,
      state: "loading",
      promise: Promise.resolve(undefined as never),
    };
    entry.promise = loader().then(
      (value) => {
        entry.state = value.count === 0 ? "unexpectedEmpty" : "loaded";
        entry.value = value;
        return value;
      },
      (reason: unknown) => {
        entry.state = "failed";
        entry.error = reason instanceof Error ? reason.message : String(reason);
        throw reason;
      },
    );
    this.entries.set(key, entry);
    return entry.promise;
  }
  invalidate(connectionId: string, database: string): void {
    this.entries.delete(this.key(connectionId, database));
  }
  invalidateConnection(connectionId: string): void {
    for (const [key, entry] of this.entries)
      if (entry.connectionId === connectionId) this.entries.delete(key);
  }
  snapshots(connectionId: string): MetadataCacheSnapshot[] {
    return [...this.entries.values()]
      .filter((entry) => entry.connectionId === connectionId)
      .map((entry) => ({
        database: entry.database,
        state: entry.state,
        ...(entry.value ? { objectCount: entry.value.count } : {}),
        ...(entry.error ? { error: entry.error } : {}),
      }))
      .sort((left, right) =>
        left.database.localeCompare(right.database, undefined, {
          sensitivity: "base",
        }),
      );
  }
  clear(): void {
    this.entries.clear();
  }
  private key(connectionId: string, database: string): string {
    return `${connectionId}\u0000${database.toLocaleLowerCase("en-US")}`;
  }
}

import { DatabaseIndex } from "./DatabaseIndex.js";

interface CacheEntry {
  state: "loading" | "loaded" | "unexpectedEmpty" | "failed";
  promise: Promise<DatabaseIndex>;
  value?: DatabaseIndex;
  error?: string;
}

export class MetadataCache {
  private readonly entries = new Map<string, CacheEntry>();
  static key(connectionId: string, database: string): string {
    return `${connectionId}\u0000${database.toLowerCase()}`;
  }
  peek(key: string): DatabaseIndex | undefined {
    return this.entries.get(key)?.value;
  }
  status(key: string): CacheEntry["state"] | "notLoaded" {
    return this.entries.get(key)?.state ?? "notLoaded";
  }
  error(key: string): string | undefined {
    return this.entries.get(key)?.error;
  }
  load(
    key: string,
    loader: () => Promise<DatabaseIndex>,
  ): Promise<DatabaseIndex> {
    const existing = this.entries.get(key);
    if (existing) return existing.promise;
    const entry: CacheEntry = {
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
  invalidate(key: string): void {
    this.entries.delete(key);
  }
  clear(): void {
    this.entries.clear();
  }
}

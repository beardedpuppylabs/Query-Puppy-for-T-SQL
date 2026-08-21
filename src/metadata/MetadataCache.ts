import { DatabaseIndex } from "./DatabaseIndex.js";
import type { MetadataSnapshotStore } from "./PersistentMetadataStore.js";

export const DEFAULT_SCHEMA_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

export type MetadataCacheState =
  "loading" | "loaded" | "unexpectedEmpty" | "refreshing" | "failed";
export type MetadataRefreshReason = "session" | "stale" | "manual";

export interface MetadataLifecycleEvent {
  readonly kind:
    | "persistentCacheHit"
    | "persistentCacheMiss"
    | "persistentCacheFailed"
    | "coldLoadStarted"
    | "coldLoadCompleted"
    | "coldLoadFailed"
    | "refreshStarted"
    | "refreshCompleted"
    | "refreshFailed"
    | "snapshotPersisted"
    | "snapshotPersistFailed"
    | "cacheCleared";
  readonly connectionId: string;
  readonly database: string;
  readonly reason?: MetadataRefreshReason;
  readonly durationMs?: number;
  readonly objectCount?: number;
  readonly columnCount?: number;
  readonly error?: string;
}

interface CacheEntry {
  readonly connectionId: string;
  readonly database: string;
  state: MetadataCacheState;
  value: DatabaseIndex | undefined;
  initialization: Promise<DatabaseIndex> | undefined;
  refresh: Promise<DatabaseIndex> | undefined;
  persistentChecked: boolean;
  sessionRefreshAttempted: boolean;
  lastSuccessfulRefreshAt: number | undefined;
  nextRefreshEligibleAt: number | undefined;
  error: string | undefined;
}

export interface MetadataCacheSnapshot {
  readonly database: string;
  readonly state: MetadataCacheState;
  readonly objectCount?: number;
  readonly lastSuccessfulRefreshAt?: number;
  readonly error?: string;
}

export interface MetadataCacheOptions {
  readonly store?: MetadataSnapshotStore;
  readonly now?: () => number;
  readonly onEvent?: (event: MetadataLifecycleEvent) => void;
}

export class MetadataCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly store: MetadataSnapshotStore | undefined;
  private readonly now: () => number;
  private readonly onEvent: (event: MetadataLifecycleEvent) => void;

  constructor(options: MetadataCacheOptions = {}) {
    this.store = options.store;
    this.now = options.now ?? Date.now;
    this.onEvent = options.onEvent ?? (() => undefined);
  }

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

  async ensureLoaded(
    connectionId: string,
    database: string,
    loader: () => Promise<DatabaseIndex>,
  ): Promise<DatabaseIndex> {
    const entry = this.entry(connectionId, database);
    if (entry.value) {
      this.scheduleRefreshIfNeeded(entry, loader);
      return entry.value;
    }
    if (entry.initialization) return entry.initialization;
    const pending = this.initialize(entry, loader);
    entry.initialization = pending;
    try {
      return await pending;
    } finally {
      if (entry.initialization === pending) entry.initialization = undefined;
    }
  }

  async refresh(
    connectionId: string,
    database: string,
    loader: () => Promise<DatabaseIndex>,
  ): Promise<DatabaseIndex> {
    const entry = this.entry(connectionId, database);
    if (!entry.value) {
      const initialized = await this.ensureLoaded(
        connectionId,
        database,
        loader,
      );
      return entry.refresh ?? entry.value ?? initialized;
    }
    return this.startRefresh(entry, loader, "manual");
  }

  invalidate(connectionId: string, database: string): void {
    this.entries.delete(this.key(connectionId, database));
  }

  async clearDatabase(connectionId: string, database: string): Promise<void> {
    const key = this.key(connectionId, database);
    const entry = this.entries.get(key);
    await Promise.allSettled(
      [entry?.initialization, entry?.refresh].filter(
        (pending): pending is Promise<DatabaseIndex> => pending !== undefined,
      ),
    );
    this.entries.delete(key);
    await this.store?.delete(connectionId, database);
    this.emit({ kind: "cacheCleared", connectionId, database });
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
        ...(entry.lastSuccessfulRefreshAt === undefined
          ? {}
          : { lastSuccessfulRefreshAt: entry.lastSuccessfulRefreshAt }),
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

  private async initialize(
    entry: CacheEntry,
    loader: () => Promise<DatabaseIndex>,
  ): Promise<DatabaseIndex> {
    entry.state = "loading";
    entry.error = undefined;
    if (!entry.persistentChecked && this.store) {
      entry.persistentChecked = true;
      const started = this.now();
      try {
        const persisted = await this.store.load(
          entry.connectionId,
          entry.database,
        );
        const durationMs = this.now() - started;
        if (persisted) {
          entry.value = persisted.index;
          entry.lastSuccessfulRefreshAt = persisted.lastSuccessfulRefreshAt;
          entry.state = stateFor(persisted.index);
          this.emit({
            kind: "persistentCacheHit",
            connectionId: entry.connectionId,
            database: entry.database,
            durationMs,
            objectCount: persisted.objectCount,
            columnCount: persisted.columnCount,
          });
          this.scheduleRefreshIfNeeded(entry, loader);
          return persisted.index;
        }
        this.emit({
          kind: "persistentCacheMiss",
          connectionId: entry.connectionId,
          database: entry.database,
          durationMs,
        });
      } catch (error) {
        this.emit({
          kind: "persistentCacheFailed",
          connectionId: entry.connectionId,
          database: entry.database,
          durationMs: this.now() - started,
          error: errorMessage(error),
        });
      }
    }
    return this.coldLoad(entry, loader);
  }

  private async coldLoad(
    entry: CacheEntry,
    loader: () => Promise<DatabaseIndex>,
  ): Promise<DatabaseIndex> {
    const started = this.now();
    entry.sessionRefreshAttempted = true;
    entry.nextRefreshEligibleAt = started + DEFAULT_SCHEMA_REFRESH_INTERVAL_MS;
    this.emit({
      kind: "coldLoadStarted",
      connectionId: entry.connectionId,
      database: entry.database,
    });
    try {
      const index = await loader();
      const completedAt = this.now();
      try {
        await this.persist(entry, index, completedAt);
      } catch {
        // A valid first SQL snapshot is still useful in memory when local
        // extension storage is temporarily unavailable.
      }
      entry.value = index;
      entry.lastSuccessfulRefreshAt = completedAt;
      entry.nextRefreshEligibleAt =
        completedAt + DEFAULT_SCHEMA_REFRESH_INTERVAL_MS;
      entry.state = stateFor(index);
      entry.error = undefined;
      this.emit({
        kind: "coldLoadCompleted",
        connectionId: entry.connectionId,
        database: entry.database,
        durationMs: completedAt - started,
        objectCount: index.count,
        columnCount: index.columnCount,
      });
      return index;
    } catch (error) {
      entry.state = "failed";
      entry.error = errorMessage(error);
      this.emit({
        kind: "coldLoadFailed",
        connectionId: entry.connectionId,
        database: entry.database,
        durationMs: this.now() - started,
        error: entry.error,
      });
      throw error;
    }
  }

  private scheduleRefreshIfNeeded(
    entry: CacheEntry,
    loader: () => Promise<DatabaseIndex>,
  ): void {
    if (!entry.value || entry.refresh) return;
    const reason: MetadataRefreshReason | undefined =
      !entry.sessionRefreshAttempted
        ? "session"
        : this.now() >=
            (entry.nextRefreshEligibleAt ?? Number.POSITIVE_INFINITY)
          ? "stale"
          : undefined;
    if (!reason) return;
    void this.startRefresh(entry, loader, reason).catch(() => undefined);
  }

  private startRefresh(
    entry: CacheEntry,
    loader: () => Promise<DatabaseIndex>,
    reason: MetadataRefreshReason,
  ): Promise<DatabaseIndex> {
    if (entry.refresh) return entry.refresh;
    const started = this.now();
    entry.sessionRefreshAttempted = true;
    entry.nextRefreshEligibleAt = started + DEFAULT_SCHEMA_REFRESH_INTERVAL_MS;
    entry.state = "refreshing";
    entry.error = undefined;
    this.emit({
      kind: "refreshStarted",
      connectionId: entry.connectionId,
      database: entry.database,
      reason,
    });
    const pending = (async (): Promise<DatabaseIndex> => {
      try {
        const index = await loader();
        const completedAt = this.now();
        await this.persist(entry, index, completedAt);
        entry.value = index;
        entry.lastSuccessfulRefreshAt = completedAt;
        entry.nextRefreshEligibleAt =
          completedAt + DEFAULT_SCHEMA_REFRESH_INTERVAL_MS;
        entry.state = stateFor(index);
        entry.error = undefined;
        this.emit({
          kind: "refreshCompleted",
          connectionId: entry.connectionId,
          database: entry.database,
          reason,
          durationMs: completedAt - started,
          objectCount: index.count,
          columnCount: index.columnCount,
        });
        return index;
      } catch (error) {
        entry.state = entry.value ? stateFor(entry.value) : "failed";
        entry.error = errorMessage(error);
        this.emit({
          kind: "refreshFailed",
          connectionId: entry.connectionId,
          database: entry.database,
          reason,
          durationMs: this.now() - started,
          error: entry.error,
        });
        throw error;
      }
    })();
    entry.refresh = pending;
    void pending.then(
      () => {
        if (entry.refresh === pending) entry.refresh = undefined;
      },
      () => {
        if (entry.refresh === pending) entry.refresh = undefined;
      },
    );
    return pending;
  }

  private async persist(
    entry: CacheEntry,
    index: DatabaseIndex,
    lastSuccessfulRefreshAt: number,
  ): Promise<void> {
    if (!this.store) return;
    const started = this.now();
    try {
      await this.store.save(
        entry.connectionId,
        entry.database,
        index,
        lastSuccessfulRefreshAt,
      );
      this.emit({
        kind: "snapshotPersisted",
        connectionId: entry.connectionId,
        database: entry.database,
        durationMs: this.now() - started,
        objectCount: index.count,
        columnCount: index.columnCount,
      });
    } catch (error) {
      this.emit({
        kind: "snapshotPersistFailed",
        connectionId: entry.connectionId,
        database: entry.database,
        durationMs: this.now() - started,
        error: errorMessage(error),
      });
      throw error;
    }
  }

  private entry(connectionId: string, database: string): CacheEntry {
    const key = this.key(connectionId, database);
    let entry = this.entries.get(key);
    if (!entry) {
      entry = {
        connectionId,
        database,
        state: "loading",
        value: undefined,
        initialization: undefined,
        refresh: undefined,
        persistentChecked: false,
        sessionRefreshAttempted: false,
        lastSuccessfulRefreshAt: undefined,
        nextRefreshEligibleAt: undefined,
        error: undefined,
      };
      this.entries.set(key, entry);
    }
    return entry;
  }

  private emit(event: MetadataLifecycleEvent): void {
    this.onEvent(event);
  }

  private key(connectionId: string, database: string): string {
    return `${connectionId}\u0000${database.toLocaleLowerCase("en-US")}`;
  }
}

const stateFor = (index: DatabaseIndex): MetadataCacheState =>
  index.count === 0 ? "unexpectedEmpty" : "loaded";
const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

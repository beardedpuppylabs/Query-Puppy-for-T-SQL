import type { DatabaseIndex } from "../metadata/DatabaseIndex.js";
import { MetadataCache } from "../metadata/MetadataCache.js";
import type {
  ActiveConnectionContext,
  MetadataBackend,
} from "../backend/MetadataBackend.js";
import type { MetadataLoader } from "../metadata/MetadataLoader.js";
import type { SqlCompletionContext } from "../parser/SqlContextResolver.js";
import type { CompletionScope } from "./CandidateFactory.js";
import { documentDatabaseReferences } from "../parser/DocumentSemanticAnalyzer.js";

const normalize = (name: string): string => name.toLocaleLowerCase("en-US");

export class CompletionScopeResolver {
  private readonly databaseLists = new Map<
    string,
    Promise<readonly string[]>
  >();
  constructor(
    private readonly backend: MetadataBackend,
    private readonly loader: MetadataLoader,
    private readonly cache: MetadataCache,
    private readonly onError: (key: string, error: unknown) => void,
  ) {}
  async resolve(
    active: ActiveConnectionContext,
    context: SqlCompletionContext,
  ): Promise<CompletionScope> {
    const indexes = new Map<string, DatabaseIndex>();
    const activeIndex = await this.ensureDatabase(active, active.database);
    indexes.set(normalize(active.database), activeIndex);
    const databaseNames =
      context.kind === "rowSource"
        ? await this.discoverDatabases(active)
        : undefined;
    const requested = await this.requestedDatabase(
      active,
      activeIndex,
      context,
    );
    const documentReferences = documentDatabaseReferences(
      context.sql,
      context.cursor,
    );
    const requestedDatabases = new Map<string, string>();
    if (requested) requestedDatabases.set(normalize(requested), requested);
    for (const database of documentReferences)
      requestedDatabases.set(normalize(database), database);
    requestedDatabases.delete(normalize(active.database));
    if (requestedDatabases.size) {
      const available = await this.discoverDatabases(active);
      await Promise.all(
        [...requestedDatabases].map(async ([key]) => {
          const actual = available.find(
            (candidate) => normalize(candidate) === key,
          );
          if (!actual) return;
          indexes.set(key, await this.ensureDatabase(active, actual));
        }),
      );
    }
    return {
      activeDatabase: active.database,
      indexes,
      ...(databaseNames ? { databaseNames } : {}),
    };
  }
  private async requestedDatabase(
    active: ActiveConnectionContext,
    activeIndex: DatabaseIndex,
    context: SqlCompletionContext,
  ): Promise<string | undefined> {
    if (context.kind === "member") return context.aliasSource?.database;
    if (context.kind !== "qualified") return undefined;
    const parts = context.qualifier?.parts ?? [];
    if (parts.length === 3) return parts[0];
    if (parts.length !== 2) return undefined;
    const first = parts[0] ?? "";
    if (!first || activeIndex.hasSchema(first)) return undefined;
    const databases = await this.discoverDatabases(active);
    return databases.find(
      (database) => normalize(database) === normalize(first),
    );
  }
  private ensureDatabase(
    active: ActiveConnectionContext,
    database: string,
  ): Promise<DatabaseIndex> {
    return this.cache.ensureLoaded(active.connectionIdentity, database, () =>
      this.loader.load({ ...active, database }),
    );
  }
  private discoverDatabases(
    active: ActiveConnectionContext,
  ): Promise<readonly string[]> {
    const existing = this.databaseLists.get(active.connectionIdentity);
    if (existing) return existing;
    const promise = this.backend
      .listDatabases(active)
      .catch((error: unknown) => {
        this.databaseLists.delete(active.connectionIdentity);
        this.onError(`database-list:${active.connectionIdentity}`, error);
        return [];
      });
    this.databaseLists.set(active.connectionIdentity, promise);
    return promise;
  }
}

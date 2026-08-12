import type { DatabaseIndex } from "../metadata/DatabaseIndex.js";
import { MetadataCache } from "../metadata/MetadataCache.js";
import type {
  ActiveConnection,
  ConnectionService,
} from "../mssql/ConnectionService.js";
import type { MetadataLoader } from "../mssql/MetadataLoader.js";
import type { SqlCompletionContext } from "../parser/SqlContextResolver.js";
import type { CompletionScope } from "./CandidateFactory.js";

const normalize = (name: string): string => name.toLocaleLowerCase("en-US");

export class CompletionScopeResolver {
  private readonly databaseLists = new Map<
    string,
    Promise<readonly string[]>
  >();
  constructor(
    private readonly connections: ConnectionService,
    private readonly loader: MetadataLoader,
    private readonly cache: MetadataCache,
    private readonly onError: (key: string, error: unknown) => void,
  ) {}
  async resolve(
    active: ActiveConnection,
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
    if (requested && normalize(requested) !== normalize(active.database)) {
      const secondary = await this.ensureDatabase(active, requested);
      indexes.set(normalize(requested), secondary);
    }
    return {
      activeDatabase: active.database,
      indexes,
      ...(databaseNames ? { databaseNames } : {}),
    };
  }
  private async requestedDatabase(
    active: ActiveConnection,
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
    active: ActiveConnection,
    database: string,
  ): Promise<DatabaseIndex> {
    return this.cache.ensureLoaded(active.connectionId, database, () =>
      this.loader.load({ connectionId: active.connectionId, database }),
    );
  }
  private discoverDatabases(
    active: ActiveConnection,
  ): Promise<readonly string[]> {
    const existing = this.databaseLists.get(active.connectionId);
    if (existing) return existing;
    const promise = this.connections
      .listDatabases(active)
      .catch((error: unknown) => {
        this.databaseLists.delete(active.connectionId);
        this.onError(`database-list:${active.connectionId}`, error);
        return [];
      });
    this.databaseLists.set(active.connectionId, promise);
    return promise;
  }
}

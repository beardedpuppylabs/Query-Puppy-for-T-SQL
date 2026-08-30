# Architecture

## Purpose

This document describes the high-level architecture and semantic boundaries of
Query Puppy for T-SQL.

It documents intended architecture, not incidental implementation details.

When implementation differs from this document, determine whether the code has
drifted or the documentation is stale before changing either.

## High-level system

Conceptually:

    Editor / User Context
              |
              v
    Connection Context Resolver
              |
              v
    Metadata / Connectivity Backend
              |
              +-- Mssql Connection Sharing Adapter
              |      +-- current Microsoft mssql connection-sharing API
              |
              +-- future backend(s)
              |
              v
    Canonical Catalog Metadata Loader
              |
              v
       Complete Refresh Snapshot
              |
              +---------------------------+
              |                           |
              v                           v
    Persistent Canonical Snapshot   Session DatabaseIndex
       (globalStorageUri)           (catalog + relationships)
              |                           |
              +------ warm hydrate -------+
                         |
            +------------+------------+
            |                         |
            v                         v
    Document Semantic Model      SQL Type Model
            |
            v
        QueryScopes
            |
            v
         RowSources
            |
            +---------------------------+
            |                           |
            v                           v
    Completion Context           Signature Context
            |                           |
            v                           v
    Semantic Candidates         Signature Help
            |
            v
    Ranking / Grouping
            |
            v
    CompletionItem Materialization
            |
            v
      VS Code / VSCodium

## Callable architecture

Function consumers share one editor-independent semantic boundary:

    SQL text / tokens
        -> ParsedCallSite
        -> callable resolution
        -> CallableSignature
        -> Signature Help / ExpectedType / return inference

`ParsedCallSite` owns callable name parts, qualification, the opening parenthesis,
depth-aware argument ranges, and the active argument. Catalog scalar UDFs and TVFs
are adapted from canonical `DatabaseObject` metadata into `CallableSignature` at
the resolver boundary. Static SQL Server built-in language metadata enters at the
same boundary. Downstream consumers do not require a `DatabaseObject`.

The built-in catalog is immutable, case-insensitively indexed, and independent of
connection/database metadata. It carries availability, parameter-family, special
syntax, callable-kind, documentation, and return-rule metadata. Resolving a
built-in performs no SQL query and does not initialize or refresh schema metadata.

Scalar, aggregate, window, and expression-like definitions enter through this
same callable boundary. Aggregate/window return rules and `OVER` requirements are
language metadata rather than catalog objects. `COALESCE` is identified as an
expression-like callable so it can reuse depth-aware argument ownership without
being mislabeled as a catalog scalar function. `CASE` branch inference stays in
the shared expression layer. Window `PARTITION BY`/`ORDER BY` member completion
uses the active QueryScope; datepart tokens come from one immutable grammar-value
list. None of these language domains is serialized into persistent schema cache.

The editor's automatic Signature Help fallback remains UI coordination. It may
restrict which edits are eligible, but semantic call interpretation comes from the
shared call-site parser and callable resolver.

## Connectivity boundary

The semantic engine is backend-independent.

Production activation currently composes one backend-neutral boundary with the
temporary Microsoft mssql adapter:

    ConnectionContextResolver
        -> active editor connection context

    MetadataBackend
        -> read-only catalog SQL execution
        -> same-server database enumeration

These are independent capabilities. Each consumer receives only the capability it
uses; a consumer that needs both accepts them through separate dependency slots.
The current `MssqlConnectionSharingAdapter` implements both interfaces, and the
composition root passes that same instance where both are needed, but semantic and
metadata consumers do not require the interfaces to share an implementation or
object identity. A context resolver and metadata backend from unrelated concrete
implementations can therefore be composed without changing those consumers.

The active context exposes only an opaque stable connection identity and the active
database. Semantic consumers use that identity for catalog/cache isolation; they do
not interpret it as a Microsoft mssql connection ID. A separate backend identifier
is not part of the neutral context because current production behavior does not use
one.

The metadata backend is deliberately narrow. It is not a general query-execution
SDK and must remain scoped to Query Puppy metadata/connectivity needs. Neutral
contracts contain only data and operations required by current production behavior;
speculative methods or identity fields are added only when a concrete responsibility
needs them.

Provider lifecycle, driver handles, raw provider result shapes, credential
mechanisms, provider-specific identifiers, and provider-specific errors stay inside
the concrete adapter. A future context resolver and metadata backend may be replaced
together or independently without changing completion, parser, QueryScopes, type
inference, callables, relationships, canonical metadata loading, or metadata-cache
consumers.

## Microsoft SQL Server extension integration

Query Puppy for T-SQL provides its own completion semantics.

It does not consume Microsoft's completion list.

The Microsoft SQL Server extension remains responsible for the SQL connection.

Query Puppy for T-SQL reuses the active connection through the existing
connection-sharing integration.

Do not introduce independent connection ownership unless explicitly redesigned.

The current mssql connection-sharing implementation is isolated in the mssql
adapter. The acquired mssql API/capability object is session-scoped. Concurrent
acquisition and active-context lookups are coalesced, successful API acquisition
is reused, and failed acquisition remains retryable. Active connection and
database values are not memoized as session constants; they remain dynamic so
editor, server, and database switches are observed.

The composition root constructs only the concrete adapter. Lazy mssql extension
lookup, activation, capability validation, and API acquisition are owned by the
mssql layer; they do not cross into activation, completion, Signature Help,
canonical metadata loading, or other neutral consumers. The adapter retains an
injectable acquisition seam solely so headless contract tests can exercise its
lifecycle without loading the VS Code runtime.

The mssql 1.45 public connection-sharing surface does not expose a standalone
permission-initialization method or permission token. Its extension-ID methods
validate stored permission internally on every call. The adapter must not bypass
that validation through private mssql internals or by treating an editor URI as an
ungranted connection capability. Connection Sharing has not been removed yet; it
is contained behind the adapter so a later backend can replace it without changing
completion, scopes, callable analysis, type inference, relationship consumers, or
metadata-cache consumers.

The minimum future supported mssql integration surface Query Puppy needs is:

- active SQL editor connection context
- stable opaque connection identity and active database
- change notifications or a reliable public polling/query mechanism
- authenticated read-only metadata/catalog execution
- same-server database enumeration
- no raw password exposure

## Metadata loading

Catalog metadata is loaded in set-based operations and cached by the appropriate
backend connection/database identity.

The cache represents database objects such as where supported:

- schemas
- tables
- views
- physical columns
- scalar functions
- table-valued functions
- stored procedures
- parameters
- types
- synonyms
- sequences
- keys
- unique indexes
- foreign keys
- relationship mappings

The metadata cache owns one canonical lifecycle for cold loads, automatic refresh,
and manual refresh:

    no persistent snapshot
        -> visible coalesced cold SQL load
        -> persist complete canonical snapshot
        -> install session DatabaseIndex

    persistent snapshot
        -> deserialize canonical metadata
        -> rebuild and install session DatabaseIndex immediately
        -> start one coalesced first-session refresh in the background

    usable session snapshot
        -> return it immediately
        -> when refresh-eligible, build a complete replacement in the background
        -> persist the replacement atomically
        -> swap the active DatabaseIndex reference

Persistent files live under the supported extension-owned
`ExtensionContext.globalStorageUri`. Each file is isolated by a one-way hash of
the backend-neutral connection identity plus database name. The current mssql
adapter preserves the previous identity string to avoid invalidating existing
snapshots. The versioned envelope contains only allow-listed canonical catalog
metadata and safe diagnostic timestamps/counts; it never contains credentials,
secret-bearing connection strings, CompletionItems, built-in language
definitions, editor state, QueryScopes, or document-local RowSources. Runtime
`DatabaseIndex` maps and relationship adjacency indexes are rebuilt from
canonical metadata after deserialization rather than serialized as implementation
details.

Snapshot persistence writes a complete temporary file, flushes it, and renames it
over the database's cache entry. An incompatible, invalid, or corrupt snapshot is
discarded and treated as a cache miss. A refresh never mutates or removes the
active snapshot while the replacement is loading or being persisted. Refresh
failure therefore leaves both the active and last persisted usable snapshot in
place.

The first completion that needs an uncached database may initiate one coalesced
cold load. Twenty consumers of the same cache identity share that load. Once a
snapshot is installed, completion uses the in-memory catalog and relationship
indexes; subsequent keystrokes do not issue catalog queries or deserialize the
persistent file.

The first use of a persisted database in each extension-host session schedules one
non-blocking background refresh even if the snapshot is recent. After that attempt,
freshness is demand-driven: a real use schedules another refresh only when the last
successful refresh (or bounded failed-attempt retry point) is at least 15 minutes
old. There is no global timer or refresh-all-databases poller. A first-session or
background refresh failure keeps stale metadata usable and is not retried on every
keystroke.

**Refresh Schema Metadata** bypasses the freshness threshold but enters the same
per-database refresh path and joins an already running refresh. **Clear Schema Cache
for Active Database** is the intentionally destructive diagnostic/development
operation; it removes only that active connection/database's memory and persistent
entry after confirmation.

Explicitly qualified secondary databases remain lazy and independently cached. No
connection causes all discoverable databases to be hydrated or refreshed.

A database metadata load asks the active metadata backend to execute one
read-only catalog operation for its catalog and relationship queries. The current
mssql adapter uses one transient shared connection for that operation, then
disconnects it. The shared database connection is not retained as permanent
extension state.

## Database identity

Database metadata is isolated per database.

Objects from one database must not leak into another database's cache.

Object identity must include enough context to distinguish:

    database
    schema
    object

as required.

Same-named objects in different schemas are distinct.

## Cross-database completion

Same-server cross-database completion is supported where implemented.

Typical forms include:

    Database.
    Database.Schema.
    Database.Schema.Object
    Database..Object

The extension may provide IntelliSense conveniences beyond strictly complete SQL
syntax while ensuring accepted items insert legal SQL.

FK relationship inference does not cross database boundaries.

Linked Servers and arbitrary cross-server four-part-name intelligence are outside
the current architectural scope.

## Document semantic model

Catalog metadata describes persistent SQL Server objects.

The document semantic model describes objects and projections created by the SQL
text being edited.

Examples include:

- CTEs
- temp tables
- table variables
- derived tables
- SELECT INTO results
- VALUES sources
- APPLY results
- projection aliases
- set-operation results
- batch-scoped scalar variables

Document-local metadata should preserve known:

- names
- datatypes
- nullability

where they can be inferred reliably.

## QueryScopes

Nested SQL scopes are represented explicitly.

A QueryScope owns its local aliases/RowSources.

Resolution order is conceptually:

    local scope
        ->
    legal correlated parent
        ->
    legal correlated ancestors

Sibling scopes are isolated.

Local alias shadowing is respected.

Independent top-level SELECT, INSERT, UPDATE, DELETE, and EXEC/EXECUTE statements
have separate semantic statement ranges even when the preceding statement omits its
optional semicolon. INSERT ... SELECT, the consuming query after a CTE, SELECTs
nested in parentheses, and UNION/INTERSECT/EXCEPT branches remain within their
owning statement. Statement-local aliases, RowSources, projection aliases, and
clause state never cross an independent-statement boundary.

Client batches are a separate ownership level. The tokenizer emits a batch
separator only for a standalone, non-delimited `GO` line. `[go]`, `"go"`, and bare
identifiers named `go` inside SQL remain identifiers. Declared scalar variables and
table variables are visible to later statements in the same batch and disappear
after a real `GO`; query-local aliases do not acquire batch lifetime.

Do not replace this model with a flat document-wide alias dictionary.

## Correlation

Ordinary subqueries may correlate where SQL semantics allow.

Ordinary derived tables are not automatically correlated.

CROSS APPLY and OUTER APPLY may resolve legally visible left-side RowSources.

Set-operation branches are sibling scopes and do not inherit each other's local
aliases.

## RowSources

A RowSource represents something that exposes named members to SQL expressions.

Examples:

- table
- view
- CTE
- temp table
- table variable
- derived table
- TVF result
- APPLY projection
- set-operation result
- inserted/deleted pseudo source where applicable

RowSource member resolution should use one semantic abstraction rather than
hard-coding physical tables everywhere.

Scalar local variables are typed document symbols rather than RowSources. Their
declarations are indexed once per semantic document analysis for the current batch,
and expression completion consumes that canonical list. Table variables keep their
existing RowSource representation and are excluded from scalar-variable candidates.

## Schema Intelligence

Persistent catalog columns may contain schema-role information.

The canonical metadata model preserves roles such as:

- PK
- UQ
- FK

Relationship information is stored separately from superficial column-name
similarity.

Composite constraints retain ordinal mapping.

Filtered unique indexes remain distinguishable from ordinary unique constraints.

INCLUDE columns are not key members.

## Relationship Intelligence

SQL Server foreign-key catalog metadata, project relationship configuration, and
canonical semantic relationships are separate layers:

    SQL Server ForeignKeyMetadata
        -> declared-FK conversion boundary
    workspace .query-puppy/relationships.json
        -> project definition validation/resolution
    extension-managed learned evidence
        -> fixed threshold + current-metadata candidate resolution
    current JOIN physical endpoint pair
        -> conservative transient heuristic candidate policy
    all qualifying sources
        -> canonical Relationship
        -> one DatabaseIndex relationship graph or bounded JOIN consumer

Every canonical relationship contains:

- structured provenance
- structured confidence
- a source object reference
- a target object reference
- ordered source/target column mappings
- declared-FK-specific details only when it represents a physical SQL Server FK

The model can distinguish declared foreign keys, project-defined relationships,
user-confirmed relationships, learned query evidence, and heuristic candidates.
Confidence distinguishes authoritative, confirmed, strong-evidence, and candidate
states. The provenance/confidence combination is a discriminated semantic contract,
not a display label or ranking score.

Declared SQL Server FKs map to `DeclaredForeignKey` provenance and `Authoritative`
confidence. Their constraint ID/name, referential actions, disabled/trust state,
object identities, and composite ordinals remain available through explicit physical
FK details. Logical relationships do not require or fabricate those details.

Production completion admits enabled authoritative declared FKs, explicitly saved
UserConfirmed/Confirmed relationships, and explicitly authored
ProjectDefined/Confirmed relationships. It also admits local
LearnedFromQuery/StrongEvidence candidates only after the Phase E2 policy resolves at
least three independently deduplicated observations against current canonical
metadata. Logical relationships never receive physical FK details and are presented
as relationships rather than constraints. A contextual HeuristicCandidate/Candidate
may enter only JOIN predicate completion under the Phase E3 policy below. Never infer
or label a foreign key from matching names or datatypes.

Persistent snapshots continue storing canonical SQL Server catalog metadata,
including physical FK records. Project relationships live separately in the owning
workspace's human-readable `.query-puppy/relationships.json`. Hydration or refresh
first rebuilds the physical index, then the workspace overlay validates definitions
against that current index and creates a runtime `DatabaseIndex` containing both
relationship sources. Project definitions and graph indexes are never serialized into
the physical SQL metadata snapshot.

The version 1 project format requires database/schema/object identities and ordered
column mappings. It currently resolves same-database table relationships only. The
backend-neutral active context exposes no stable source-control-safe server identity,
so applicability is the owning workspace folder plus database name; projects that use
the same database name on different servers must keep separate workspace relationship
files. Cross-database definitions are structurally representable by endpoint identity
but rejected by version 1 until the graph can resolve them safely.

In version 1, an entry with no `provenance` remains backward-compatible
ProjectDefined/Confirmed project knowledge. The optional persisted provenance is
limited to `projectDefined` and `userConfirmed`; confidence remains derived as
Confirmed. The native **Save JOIN as Query Puppy relationship** Code Action writes
`userConfirmed` through this same workspace file, parser/cache, validation, and
canonical-graph boundary.

The action consumes a reusable resolved-JOIN semantic candidate containing two
canonical physical table endpoints and deterministic canonical column mappings. The
initial workflow accepts only direct `alias.column = alias.column` terms joined by
`AND`. It rejects partial expressions, literals, variables, functions, arithmetic,
`OR`, inequalities, unresolved members, transient RowSources, cross-database edges,
duplicate mappings, and predicates spanning more than two logical endpoints. Composite
terms become one relationship. Textual operand order and `AND` order do not define
identity. An unfiltered PK/UQ endpoint can determine principal direction; otherwise a
minimal native Quick Pick asks the user to choose source/dependent and target/principal.
Writing a JOIN alone never changes project relationship truth. Explicit invocation is
still required before `.query-puppy/relationships.json` or the production graph can
change.

Each file-backed SQL document uses only the relationship file in its owning workspace
folder. Multi-root workspaces therefore remain deterministic. Untitled/outside-
workspace documents and sessions with no workspace receive declared-FK behavior only.
Native file watchers invalidate the parsed definition and runtime overlay; the next
completion re-reads and revalidates it. Invalid relationships are ignored individually
and reported once per load/index lifecycle in the Query Puppy output channel.

## Local learned relationship evidence and candidate overlay

Phase E1 adds a separate uncertain-evidence acquisition pipeline:

    saved active workspace SQL document
        -> existing resolved-JOIN semantic candidate
        -> deterministic directed evidence definition
        -> persisted document/relationship/ordinal occurrence identity
        -> bounded extension-managed workspace storage

The evidence acquisition consumer is separate from `DocumentSemanticAnalyzer`,
completion, and the canonical relationship graph. It reuses the same equality-only
resolved-JOIN model as UserConfirmed persistence; it does not contain another JOIN
parser. Only two persistent physical same-database tables, direct column equalities,
`AND`, compatible known types, and a direction determined unambiguously by the existing
PK/UQ rule are eligible. Passive acquisition skips ambiguous direction because it must
never display a Quick Pick or interrupt typing.

The lifecycle is save-driven. Deduplication is part of the serialized store mutation,
not an editor-lifetime cache. A document identity is SHA-256 of its normalized
workspace-relative path. Within that document, each occurrence is the SHA-256 of its
canonical direction-independent relationship identity plus its zero-based source-order
ordinal among equivalent relationships. The persisted tuple is therefore document
hash, relationship hash, and ordinal; raw paths and SQL are not retained.

This policy is stable across close/reopen, extension/editor restart, formatting,
identifier quoting, alias renames, reordered `AND` terms, and unrelated edits that move
source offsets. Two equivalent JOINs in one document have ordinals zero and one and
contribute independently. A saved absence removes that document occurrence marker but
does not decrement historical evidence. Reintroducing it after the saved absence may
contribute once. Completion calls never enter this lifecycle.

Learning is enabled by default and can be disabled with
`queryPuppyForTSql.relationshipLearning.enabled`. Production acquisition requires the
saved document to be the active SQL editor in an owning workspace folder and the active
database index to be already loaded. It reads `MetadataCache.get`; it never invokes
catalog loading, database enumeration, metadata refresh, query execution, Query Store,
plan cache, or mssql query-history APIs.

Evidence is stored under `ExtensionContext.storageUri` in the
`learned-relationship-evidence` directory. A multi-root workspace uses one file per
owning folder, named by a SHA-256 hash of that folder URI. The folder URI itself,
plaintext filenames or paths, SQL text, aliases, comments, literals, parameters, source
ranges, credentials, connection strings, provider IDs, and raw or unbounded
observation history are not serialized. Format version 2 stores canonical database/schema/object endpoints,
canonical ordered column mappings, `observationCount`, and bounded occurrence records:

    {
      "document": "<sha256(workspace-relative path)>",
      "relationship": "<sha256(canonical relationship identity)>",
      "ordinal": 0,
      "order": 1
    }

`order` is stable insertion order used only for eviction; it is not recency or
relationship confidence. Valid format-version-1 stores are accepted, their evidence
and counts are preserved, and their absent occurrence set initializes empty. The next
store mutation rewrites version 2. Consequently, the first eligible occurrence saved
after a version-1 upgrade may contribute once because version 1 retained no identity
with which to deduplicate it.

Writes are serialized per workspace folder, coalesce all mutations from one save, and
replace the complete file through a flushed temporary file plus atomic rename. Invalid
JSON and unsupported versions are ignored and never overwritten automatically;
persistence failures are non-fatal to completion and logged once per distinct failure.
The store is capped at 4,096 unique mapping identities. It keeps higher observation
counts first and breaks equal-count eviction ties by canonical alphabetical identity,
then serializes retained identities alphabetically. No recency or confidence score is
stored. Seen occurrences are independently capped at 16,384. The lowest insertion
orders are evicted first with canonical tuple tie-breaking; retained tuples serialize
canonically. An evicted occurrence can count again if later encountered, which is the
explicit bounded-storage tradeoff.

Before mutation, current declared FKs, UserConfirmed relationships, and
ProjectDefined relationships are compared by the shared direction-independent semantic
identity. Matching observations are skipped and matching stale evidence is removed.
Different mappings between the same table pair remain distinct.

The **Clear Learned Relationship Evidence** command clears both relationship evidence
and seen-occurrence state for the active workspace folder after native modal
confirmation. This removes the learned runtime overlay on the next completion and
permits the next eligible save to learn again. It does not modify physical metadata or
`.query-puppy/relationships.json`. Disabling learning stops acquisition and performs no
evidence or occurrence mutation; qualifying stored candidates remain visible.

Phase E2 adds one pure candidate-policy boundary. An evidence record qualifies at the
fixed product-owned threshold `observationCount >= 3`. The policy re-resolves both
physical table endpoints, every ordered column mapping, same-database scope, and known
type compatibility against the current `DatabaseIndex`. Stale, missing, incompatible,
cross-database, or otherwise invalid evidence fails closed. Valid output is one
canonical `LearnedFromQuery`/`StrongEvidence` relationship carrying the aggregate
observation count. Exact declared-FK, UserConfirmed, or ProjectDefined semantic
identities suppress the learned duplicate; distinct mappings between the same objects
remain independent.

The workspace adapter overlays those candidates after the physical and project
relationship indexes have been built. It caches by owning workspace, evidence-array
identity, and base `DatabaseIndex` identity. Store mutations/clear replace the evidence
identity; project-file changes and catalog refreshes replace the base index. These are
the invalidation boundaries, so the steady completion path performs neither catalog
access nor repeated disk parsing. No-workspace documents receive no learned overlay.
Learned relationships use the same canonical graph and existing consumers; there is no
parallel learned graph.

Accepting a learned completion changes only SQL text. Explicit invocation of **Save
JOIN as Query Puppy relationship** is still required to create UserConfirmed project
truth. That stronger exact edge suppresses the learned candidate immediately.

## Conservative heuristic relationship candidates

Phase E3 adds a pure, runtime-only policy for one pair of physical tables already
resolved by the active JOIN scope:

    current right physical RowSource + one visible left physical RowSource
        -> complete eligible target-key evaluation in either direction
        -> zero or one HeuristicCandidate/Candidate Relationship
        -> existing ordered JOIN predicate renderer

The policy does not parse SQL, query the catalog, read or write files, inspect learned
evidence, or iterate database objects. It receives the exact pair from existing
QueryScope/RowSource resolution. It considers canonical primary keys, unfiltered unique
constraints, and unfiltered unique indexes. A proposal requires the complete target key,
known non-incompatible normalized SQL types for every component, and at least one exact
target-aware source name formed as target object name plus target key-column name. A
single conservative trailing `s` form supports `CustomerId -> Customers.Id`; there is
no general singularization, fuzzy matching, stemming, or synonym inference.

Same-name mappings such as `CompanyId -> CompanyId` are context only: they may complete
a composite target key when another component supplies target-aware evidence, but they
never create a relationship alone. Multiple qualifying target keys, multiple
target-aware source assignments, both qualifying directions, missing/unknown metadata,
incomplete composite keys, filtered uniqueness, and self-table pairs all fail closed.
If any declared-FK, UserConfirmed, ProjectDefined, or LearnedFromQuery relationship
already connects the pair, no heuristic fallback is produced.

The result carries structured evidence for the complete key, known type compatibility,
target-aware mapping, and any composite context mappings. It is passed directly to the
same canonical JOIN predicate consumer and is never installed in `DatabaseIndex`.
Consequently it cannot affect FROM/JOIN object discovery, related-object ranking,
comparison ranking, navigation, diagnostics, or unrelated documents. It is not written
to SQL snapshots, `.query-puppy/relationships.json`, or learned evidence. Completion
acceptance inserts text only; the existing explicit save-JOIN action can later persist
the concrete resolved predicate as UserConfirmed project knowledge.

## Relationship graph and indexes

There is one canonical runtime relationship graph. A relationship is stored once;
directional indexes reference that same object for source-to-target and
target-to-source traversal.

Conceptually maintain indexed access for:

    dependent -> principal
    principal -> dependents
    object -> related objects

Relationship-aware completion must avoid full-database scans per keystroke.

## JOIN Intelligence

JOIN predicate suggestions are generated from enabled authoritative declared FKs,
confirmed UserConfirmed relationships, confirmed ProjectDefined relationships, and
qualifying LearnedFromQuery/StrongEvidence relationships in the canonical runtime
graph. When none of those sources connects the already-selected physical pair, the
bounded Phase E3 policy may add one HeuristicCandidate/Candidate to this same predicate
consumer. Explicit trust order is declared FK, UserConfirmed, ProjectDefined,
LearnedFromQuery, then HeuristicCandidate. Exact logical duplicates collapse, and any
stronger pair relationship suppresses heuristic fallback.

A relationship may generate a complete expression such as:

    o.CustomerId = c.CustomerId

Composite relationships may generate:

    ol.CompanyId = oh.CompanyId
    AND ol.OrderId = oh.OrderId

Multiple declared FKs between the same objects remain separate candidates.

JOIN source ranking may boost related objects but must preserve Contains filtering.
Heuristic candidates never participate in JOIN source ranking.

## Positional SQL visibility

SQL visibility is position-sensitive.

Example:

    FROM A AS a
    JOIN B AS b
        ON ...
    JOIN C AS c
        ON ...

The first ON clause must not see future alias `c`.

The semantic model must be resolved relative to cursor position.

## DML

DML uses the same semantic infrastructure rather than a disconnected subsystem.

Supported contexts may include:

- INSERT target columns
- INSERT expression positions
- UPDATE SET LHS
- UPDATE RHS expected type
- DELETE scope
- OUTPUT
- inserted/deleted
- EXEC procedure parameters

Incomplete statements must remain usable for IntelliSense.

## Type system

The normalized SQL type architecture is documented in
[SQL Type System](TYPE_SYSTEM.md).

Catalog and document columns should expose normalized type information through one
shared representation.

## Completion pipeline

Candidate construction, matching, sorting, grouping, and CompletionItem
materialization are documented in the
[Completion Pipeline](COMPLETION_PIPELINE.md).

That document defines canonical physical-column behavior.

## Performance invariants

The following are architectural invariants:

- after a database's coalesced load/hydration, the memory `DatabaseIndex` is the
  completion hot path: zero catalog queries and zero disk deserializations per
  keystroke
- cache canonical persistent metadata by backend connection/database without
  persisting credentials
- coalesce cold loads and refreshes independently for each cache identity
- serve a valid old snapshot while a complete replacement is built and persisted
- evaluate the fixed 15-minute refresh threshold only when a database is used; do
  not poll idle databases
- reuse parsed/semantic document state where practical
- prefer indexed lookup to catalog scans
- avoid reparsing unrelated statements unnecessarily
- acquire learned JOIN evidence only on document save and never write it per keystroke
- never load or query catalog metadata solely for learned-evidence acquisition
- resolve and cache learned candidate overlays outside the per-keystroke catalog/disk path
- bound local learned evidence to 4,096 unique mappings per workspace folder
- bound persisted learned occurrence identities to 16,384 per workspace folder
- preserve deterministic completion order

## Security invariants

Runtime metadata access is read-only.

The runtime must not:

- provision schemas
- create integration fixtures
- mutate application data
- require administrator credentials
- store independent SQL credentials
- persist raw SQL, literals, filenames, or connection strings as learned evidence
- transmit learned evidence or SQL text to a remote service

Test fixture provisioning is separate development infrastructure.

## Supported editor architecture

The extension targets native VS Code/VSCodium extension APIs.

Avoid reliance on private editor internals.

When the native Suggest Widget has presentation limitations, keep semantic behavior
correct and place complete information in CompletionItem documentation rather than
building an independent editor UI.

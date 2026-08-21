# Architecture

## Purpose

This document describes the high-level architecture and semantic boundaries of
Query Puppy for T-SQL.

It documents intended architecture, not incidental implementation details.

When implementation differs from this document, determine whether the code has
drifted or the documentation is stale before changing either.

## High-level system

Conceptually:

    Microsoft mssql extension
              |
              | connection sharing
              v
    Connection Context
              |
              v
    Catalog Metadata Loader
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

The editor's automatic Signature Help fallback remains UI coordination. It may
restrict which edits are eligible, but semantic call interpretation comes from the
shared call-site parser and callable resolver.

## Microsoft SQL Server extension integration

Query Puppy for T-SQL provides its own completion semantics.

It does not consume Microsoft's completion list.

The Microsoft SQL Server extension remains responsible for the SQL connection.

Query Puppy for T-SQL reuses the active connection through the existing
connection-sharing integration.

Do not introduce independent connection ownership unless explicitly redesigned.

The acquired mssql API/capability object is session-scoped. Concurrent acquisition
and active-context lookups are coalesced, successful API acquisition is reused, and
failed acquisition remains retryable. Active connection and database values are
not memoized as session constants; they remain dynamic so editor, server, and
database switches are observed.

The mssql 1.45 public connection-sharing surface does not expose a standalone
permission-initialization method or permission token. Its extension-ID methods
validate stored permission internally on every call. The adapter must not bypass
that validation through private mssql internals or by treating an editor URI as an
ungranted connection capability.

## Metadata loading

Catalog metadata is loaded in set-based operations and cached by the appropriate
connection/database identity.

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
`ExtensionContext.globalStorageUri`. Each file is isolated by a one-way hash of the
existing connection identity plus database name. The versioned envelope contains
only allow-listed canonical catalog metadata and safe diagnostic timestamps/counts;
it never contains credentials, secret-bearing connection strings, CompletionItems,
built-in language definitions, editor state, QueryScopes, or document-local
RowSources. Runtime `DatabaseIndex` maps and relationship adjacency indexes are
rebuilt from canonical metadata after deserialization rather than serialized as
implementation details.

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

A database metadata load uses one transient shared connection for its catalog and
relationship queries, then disconnects it. The shared database connection is not
retained as permanent extension state.

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

## Relationship indexes

Foreign-key metadata should support efficient navigation in both directions.

Conceptually maintain indexed access for:

    dependent -> principal
    principal -> dependents
    object -> related objects

Relationship-aware completion must avoid full-database scans per keystroke.

## JOIN Intelligence

JOIN predicate suggestions are generated from actual cached FK relationships.

A relationship may generate a complete expression such as:

    o.CustomerId = c.CustomerId

Composite relationships may generate:

    ol.CompanyId = oh.CompanyId
    AND ol.OrderId = oh.OrderId

Multiple FKs between the same objects remain separate candidates.

JOIN source ranking may boost related objects but must preserve Contains filtering.

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
- cache canonical persistent metadata by connection/database without persisting
  credentials
- coalesce cold loads and refreshes independently for each cache identity
- serve a valid old snapshot while a complete replacement is built and persisted
- evaluate the fixed 15-minute refresh threshold only when a database is used; do
  not poll idle databases
- reuse parsed/semantic document state where practical
- prefer indexed lookup to catalog scans
- avoid reparsing unrelated statements unnecessarily
- preserve deterministic completion order

## Security invariants

Runtime metadata access is read-only.

The runtime must not:

- provision schemas
- create integration fixtures
- mutate application data
- require administrator credentials
- store independent SQL credentials

Test fixture provisioning is separate development infrastructure.

## Supported editor architecture

The extension targets native VS Code/VSCodium extension APIs.

Avoid reliance on private editor internals.

When the native Suggest Widget has presentation limitations, keep semantic behavior
correct and place complete information in CompletionItem documentation rather than
building an independent editor UI.

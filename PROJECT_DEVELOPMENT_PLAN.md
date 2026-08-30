# Query Puppy for T-SQL — Central Development Plan

**Status:** 2026-08-30  
**Current repository/package version:** 0.12.6  
**Project:** Bearded Puppy Labs / Query Puppy for T-SQL  
**Current repository/release-target license:** GPL-3.0-only from 0.12.6  
**Historical published license:** officially published releases through 0.12.5 retain MIT  
**Relicensing status:** repository transition complete; the official 0.12.6 release is pending

---

## 1. Purpose of this document

This document is the central development directive for Query Puppy for T-SQL.

All project chats, roadmap discussions, implementation plans, Codex prompts, acceptance criteria, release work, documentation, product decisions, architecture decisions, and strategic evaluations should use this document as the current baseline.

The repository and its current implementation remain the technical source of truth.

If this plan conflicts with the actual repository:

1. inspect the repository first;
2. determine whether the plan or implementation is outdated;
3. do not force the code to match an obsolete assumption;
4. bring the discrepancy back to the strategy chat;
5. update this document deliberately.

This document supersedes older roadmap assumptions wherever they conflict with the current implementation or with architectural decisions recorded here.

When another project chat is asked to plan or implement work, it should:

1. Read this development plan.
2. Inspect the current repository before proposing code changes.
3. Treat already implemented functionality as implemented even if older project notes still describe it as planned.
4. Avoid reintroducing architectural coupling that this plan explicitly removes.
5. Keep the product boundaries in this document intact unless this document is deliberately revised.
6. Distinguish strategic decisions from implementation decisions.
7. Return new strategic discoveries to the strategy chat rather than silently modifying project direction.

The strategy chat owns this document.

Development chats and Codex work toward it.

---

## 2. Mission

Make native T-SQL development in Visual Studio Code and VSCodium intelligent, productive, and reliable enough that commercial SQL coding-assistance tools become unnecessary for many SQL Server developers.

Query Puppy should become a semantic T-SQL development layer, not a second database workbench.

---

## 3. Product position

Query Puppy for T-SQL is a free and open-source semantic T-SQL development extension for Visual Studio Code and VSCodium.

Its primary differentiator is not generic autocomplete.

It is deep, deterministic understanding of:

- SQL Server schema metadata
- active query scopes
- aliases and local row sources
- SQL types and expected types
- callable signatures
- physical key metadata
- logical relationships between database objects
- DML semantics
- SQL Server-specific language behavior

The long-term product category is:

> Semantic T-SQL developer intelligence for Visual Studio Code and VSCodium.

The target audience is especially:

- professional T-SQL developers
- ERP developers
- developers working with hundreds or thousands of SQL Server tables
- users of large, old, unfamiliar, or organically grown schemas
- users of databases where relational intent is incompletely represented by declared constraints
- VSCodium users looking for strong open-source SQL tooling
- developers for whom ordinary alphabetical IntelliSense is insufficient
- users looking for a FLOSS alternative to commercial SQL coding-assistance tools

A primary real-world use case is an ERP database whose schema may contain thousands of objects, inconsistent naming conventions, incomplete documentation, and logical relationships that are not always represented by declared foreign keys.

Query Puppy should become particularly useful in exactly these environments.

---

## 4. Current baseline

As of repository/package version 0.12.6, Query Puppy already has a substantial semantic engine.

Do not describe the following as merely future roadmap items unless repository inspection shows otherwise.

Existing capabilities include, among other things:

- own CompletionItemProvider
- case-insensitive contiguous Contains matching
- deterministic ordering
- cached SQL Server metadata
- persistent per-database metadata
- lazy metadata loading
- same-server cross-database resolution
- CTEs and chained CTEs
- temp tables and table variables
- derived tables
- VALUES row sources
- SELECT INTO
- APPLY
- projection aliases
- nested QueryScopes
- correlated subqueries
- scope shadowing and sibling isolation
- set operations
- clause-aware completion
- INSERT, UPDATE, DELETE and OUTPUT intelligence
- DML target-object completion
- canonical physical-column metadata
- primary-key, unique-key and foreign-key metadata
- composite keys and composite foreign keys
- bidirectional declared-FK relationship graph
- declared-FK JOIN generation
- one provenance-aware canonical relationship model and runtime graph
- ProjectDefined and explicit UserConfirmed relationships
- native **Save JOIN as Query Puppy relationship** promotion
- local save-driven learned JOIN evidence with bounded persistence and cross-session occurrence deduplication
- metadata-revalidated `LearnedFromQuery` / `StrongEvidence` JOIN candidates at the fixed threshold `observationCount >= 3`
- conservative pair-bounded `HeuristicCandidate` / `Candidate` JOIN fallback outside persistence and the canonical database relationship graph
- automatic semantic completion after JOIN ... ON whitespace
- relationship-aware ranking across admitted relationship provenance
- normalized SQL type descriptors
- ExpectedType inference
- type-aware ranking
- expression type inference
- scalar UDF and TVF support
- shared callable/signature architecture
- SQL Server built-in function intelligence
- aggregate and window-function intelligence
- native Signature Help
- Smart Alias
- explicit JOIN continuation phases
- Tab-only wildcard expansion

The architecture remains conceptually:

```text
SQL Server Metadata
    +
Document Semantic Model
    +
QueryScope Engine
    +
Relationship Intelligence
    +
SQL Type System
    +
Callable Model
    =
Context-aware T-SQL Developer Intelligence
```

Relationship Intelligence now extends beyond declared SQL Server foreign keys while
preserving provenance, confidence, and strict source-specific boundaries.

Completion is only one consumer of the semantic engine.

Future features should increasingly be implemented as additional consumers of the same semantic information rather than by creating parallel analyzers.

---

# PART I — FOUNDATION RESILIENCE

## 5. Connection resilience and mssql integration risk

### 5.1 Why this remains a priority

Query Puppy currently uses Microsoft mssql's Connection Sharing capability for key integration functions including:

- determining active editor connection context;
- determining the active database;
- resolving current mssql connection context;
- executing read-only metadata queries;
- enumerating same-server databases.

Microsoft has marked the Connection Sharing API for retirement.

There is currently no stable documented drop-in successor that provides Query Puppy with the complete capability set it needs.

Query Puppy therefore tracks:

> microsoft/vscode-mssql#22819  
> Supported extension API for active SQL editor connection context and read-only metadata access

as an external architectural dependency.

Microsoft's eventual response may influence the preferred integration backend, but Query Puppy development must not block on Microsoft providing a replacement.

---

## 5.2 Connection Resilience Stage 1 is complete

The initial architectural decoupling is implemented in the current repository.

The completed foundation includes:

- backend-neutral active connection and metadata contracts;
- separate `ConnectionContextResolver` and `MetadataBackend` capabilities;
- independent injection of connection context and metadata transport;
- a deliberately small neutral active-connection context;
- isolation of Microsoft mssql Connection Sharing behind `MssqlConnectionSharingAdapter`;
- metadata loading through the neutral backend instead of mssql-specific result types;
- contract/source tests protecting the boundary;
- preservation of current production mssql behavior.

Therefore:

> Connection Sharing remains a runtime implementation dependency, but it is no longer a semantic-engine architectural dependency.

Do not repeatedly re-plan this completed Stage 1 as unfinished work.

Remaining P0 risk reduction is:

- preserve the boundary;
- monitor the mssql retirement and successor-API situation;
- keep the current adapter operational while supported;
- perform a contained direct metadata-connectivity feasibility spike if needed.

---

## 5.3 Important clarification about the current integration

Query Puppy does not simply borrow the already-open physical SQL connection used by the editor.

The current Connection Sharing implementation delegates connection context, authentication ownership, credentials, connection lifecycle, and SQL Server transport to mssql.

The main value mssql currently provides Query Puppy is therefore:

- active-editor connection context
- connection-profile ownership
- credential handling
- authentication
- SQL Server connectivity infrastructure
- database context
- metadata-query transport

This makes future direct metadata connectivity technically plausible.

The difficult part is not catalog SQL.

The difficult part is reliable and secure connection context and authentication.

---

## 5.4 Required architectural boundary

The semantic engine must not know or care whether metadata came through:

- current mssql Connection Sharing
- a future official mssql replacement API
- a hybrid mssql/direct implementation
- a Query Puppy direct SQL Server metadata backend
- another future supported provider

The desired conceptual architecture is:

```text
Editor / User Context
        |
        v
Connection Context Capability
        |
        v
Metadata Capability
        |
        +-- MSSQL integration
        |
        +-- Direct SQL Server backend
        |
        +-- Future supported provider
        |
        v
Canonical Metadata Layer
        |
        v
Semantic Engine
        |
        +-- Completion
        +-- Signature Help
        +-- Navigation
        +-- Diagnostics
        +-- Code Actions
        +-- Refactoring
        +-- Relationship Intelligence
```

No parser, scope analyzer, type resolver, callable analyzer, relationship consumer, completion provider, diagnostic provider, or navigation provider should depend directly on an mssql-specific API.

---

# 6. Capability-oriented backend dependencies

## 6.1 Core principle

Query Puppy must keep backend-neutral dependencies capability-oriented and minimal.

Semantic and metadata consumers should depend only on the smallest neutral capability interfaces they actually require.

In particular:

> Connection-context discovery and metadata transport are separate responsibilities.

A concrete backend may implement both responsibilities in one class when the underlying technology naturally provides both.

For example:

```text
MssqlConnectionSharingAdapter
    implements ConnectionContextResolver
    implements MetadataBackend
```

is valid.

But consumers must receive:

```text
ConnectionContextResolver
```

and:

```text
MetadataBackend
```

as independent dependencies wherever both are needed.

Consumers must not require:

```text
ConnectionContextResolver & MetadataBackend
```

and must not depend on a generic combined backend merely because the current implementation happens to provide both capabilities from one object.

---

## 6.2 Why the separation matters

Microsoft may eventually provide only part of the capability that Query Puppy currently receives from Connection Sharing.

A future valid composition may therefore be:

```text
OfficialMssqlConnectionContextResolver
    +
DirectSqlServerMetadataBackend
```

or:

```text
QueryPuppyConnectionContextResolver
    +
DirectSqlServerMetadataBackend
```

or:

```text
OfficialMssqlConnectionContextResolver
    +
OfficialMssqlMetadataBackend
```

None of these combinations should require changes to:

- Completion
- QueryScopes
- type inference
- callable analysis
- relationship intelligence
- canonical metadata
- diagnostics
- navigation
- refactoring consumers

---

## 6.3 Consumer rule

Every consumer receives only the capability it genuinely needs.

A component that only needs metadata-query transport must not receive connection-context discovery.

A component that only needs active connection identity must not receive metadata execution.

A component that needs both may receive both interfaces independently.

Composition may reuse one concrete object for multiple interfaces.

Consumers must not rely on concrete object identity.

---

## 6.4 No speculative neutral API

Backend-neutral contracts must contain only:

- capabilities
- fields
- states
- errors
- lifecycle concepts

that are required by current production behavior.

Do not add methods or data merely because a hypothetical future backend might need them.

Do not attempt to design a universal SQL connectivity abstraction in advance.

Abstraction follows demonstrated requirements.

---

## 6.5 Provider-specific details stay behind the boundary

The following belong inside concrete providers unless a real cross-provider requirement proves otherwise:

- connection-sharing IDs
- mssql profile IDs
- driver-specific handles
- raw connection strings
- pooling/session handles
- connect/disconnect implementation mechanics
- driver-specific raw query-result types
- credentials
- authentication tokens
- authentication workflow state
- provider-specific cancellation primitives
- transport-specific errors
- retry implementation
- provider-specific connection lifecycle

Do not leak these concepts through neutral interfaces for convenience.

---

## 6.6 Neutral connection identity

Neutral connection context must not accidentally encode mssql-specific identity.

If the semantic or metadata layer needs a connection identity, model only the stable concepts it actually requires.

Possible examples may include:

- server identity
- database identity
- logical connection identity
- user-visible connection label

but only when production behavior actually requires them.

An mssql connection profile ID is not automatically a neutral connection identity.

A future database-driver connection ID would not be either.

---

## 6.7 Neutral errors

Provider-specific errors remain inside providers.

If consumers genuinely need to distinguish cross-provider states, define only the smallest neutral error concepts needed.

Examples may include:

```text
NoActiveConnection
MetadataUnavailable
OperationCancelled
```

if real production consumers require these distinctions.

Do not expose provider-specific transport errors through neutral contracts.

Do not pre-design an extensive backend-independent error hierarchy.

---

## 6.8 Architecture rules

Backend architecture follows these rules:

1. Depend on capabilities, not concrete backends.
2. Give each consumer only the capabilities it actually needs.
3. Composition may reuse one object for multiple interfaces.
4. Consumers must not rely on that object identity.
5. Keep neutral contracts deliberately small.
6. Do not generalize for hypothetical backends before a real requirement exists.
7. Provider-specific lifecycle and transport mechanics stay behind adapters.
8. Provider-specific authentication stays behind adapters.
9. Provider-specific identifiers stay behind adapters.
10. A future backend replacement or combination must not require semantic-consumer changes.

---

## 6.9 Acceptance test

A useful architectural acceptance test is:

```text
ConnectionContextResolver implementation A
    +
MetadataBackend implementation B
```

must be usable together even when A and B are completely unrelated concrete objects.

If the architecture cannot support this composition without changing semantic consumers, the boundary is not sufficiently decoupled.

---

# 7. Connection strategy

## 7.1 Preferred product direction

Microsoft mssql should remain the recommended SQL Server workbench integration because it already provides:

- connection UI
- credentials and authentication
- query execution
- query results
- execution plans
- Object Explorer
- database-management features
- schema tooling
- SQL projects
- profiling
- backup/restore
- data editing

Query Puppy should not rebuild those capabilities.

However:

> mssql must not be a hard architectural dependency of the semantic engine.

That semantic boundary is now established.

The intended positioning is:

> Microsoft mssql is the preferred SQL Server workbench integration, while Query Puppy's semantic engine and metadata model remain backend-independent.

Whether `ms-mssql.mssql` remains an installation-level extension dependency must be decided later.

Do not remove the dependency before an alternative path is proven.

---

## 7.2 Microsoft successor-API request

The focused feature request has been filed:

> microsoft/vscode-mssql#22819

The request asks for a small supported extension-integration surface rather than restoration of the complete retiring API.

The required capabilities are approximately:

- identify active SQL editor connection context
- identify active server/database
- detect or query connection/database changes reliably
- execute read-only catalog/metadata queries using mssql-managed authentication
- avoid exposing passwords or long-lived raw credentials
- ideally enumerate available databases where needed

The strategy chat should monitor:

- Microsoft maintainer responses
- responses from other extension authors
- proposed replacement APIs
- retirement timelines
- implementation PRs
- documentation changes
- mssql releases affecting extensibility

Do not block development on the issue outcome.

---

## 7.3 Public-claim consistency

Public architectural claims about Query Puppy must match the repository.

The repository now supports the claim that the retiring Connection Sharing API is isolated behind an mssql-specific adapter implementing small backend-neutral capability interfaces, with connection-context resolution and metadata transport represented separately.

Do not claim that Connection Sharing itself has been removed while the production adapter still uses it.

Do not describe planned future backend work as implemented.

This rule applies especially to communications with upstream maintainers.

---

## 7.4 Direct backend research

Perform a contained technical spike for direct SQL Server metadata connectivity only as justified by the Connection Sharing retirement risk.

The spike must evaluate at least:

- SQL authentication
- Windows / Integrated authentication
- Microsoft Entra authentication
- MFA
- token refresh
- Windows
- Linux
- macOS
- Visual Studio Code
- VSCodium
- secure credential storage
- connection-string handling
- TLS and certificate behavior
- timeouts
- cancellation
- pooling versus short-lived metadata connections
- large-schema metadata performance
- same-server cross-database access
- offline/error behavior
- licensing and redistribution implications of candidate libraries

Potential candidate technologies may include:

- `mssql` / Tedious
- `msnodesqlv8`
- SQL Tools Service
- another mature SQL Server connectivity technology

No driver should be selected without comparative evidence.

---

## 7.5 Direct backend scope

A direct backend is initially for metadata only.

It must not grow by accident into:

- query execution
- a results grid
- Object Explorer
- execution-plan UI
- database administration
- schema management
- backup/restore
- a second SQL workbench

A direct metadata connection does not change Query Puppy's fundamental product boundary.

---

## 7.6 Credential rule

Query Puppy must never casually become a credential store.

If direct authentication is implemented:

- prefer VS Code SecretStorage or OS-backed secure storage
- never store passwords/tokens in `settings.json`
- never store them in logs
- never store them in telemetry
- never store them in metadata caches
- never store them in query history
- never expose them to semantic consumers
- separate logical connection identity from secret material
- support session-only credentials where appropriate
- document exactly what is persisted and where
- preserve local-first/privacy-conscious behavior

---

# PART II — RELATIONSHIP INTELLIGENCE

## 8. Strategic change: relationships are broader than declared foreign keys

### 8.1 Why the old model is insufficient

Many real-world ERP and legacy databases use primary keys but do not declare foreign keys consistently or at all.

In these databases, an architecture where:

```text
Relationship = Declared SQL Server Foreign Key
```

makes relationship-aware functionality ineffective precisely where Query Puppy is intended to provide high value.

Therefore:

> Query Puppy has evolved from declared-FK-only intelligence into provenance-aware Relationship Intelligence.

Declared foreign keys remain the strongest source of relationship truth.

They are no longer the only possible source of relationship evidence.

---

## 8.2 Relationship evidence model

The canonical relationship model distinguishes relationship provenance explicitly.

Current sources are:

```text
DeclaredForeignKey
ProjectDefined
UserConfirmed
LearnedFromQuery
HeuristicCandidate
```

Provenance and confidence remain explicit structured semantics rather than presentation-only labels.

---

## 8.3 Confidence model

Relationship confidence currently distinguishes:

```text
Authoritative
Confirmed
StrongEvidence
Candidate
```

Confidence must never be inferred solely from presentation ranking.

It should be available as structured semantic information where consumers need it.

---

## 8.4 Declared foreign keys

Declared SQL Server foreign keys remain:

```text
Authoritative
```

Existing behavior must be preserved.

Declared FKs:

- remain preferred over inferred relationships
- retain constraint metadata
- retain composite-key semantics
- retain disabled/trusted state where relevant
- retain direction information
- remain the strongest evidence for JOIN generation and relationship discovery

No heuristic may silently override a declared FK.

---

## 8.5 Project-defined / user-confirmed relationships

Query Puppy supports explicit logical relationships that are not declared in SQL Server.

Example:

```text
Preislisten
    Mandant
    ID

PreislistenArtikel
    Mandant
    ID
    ListeID
```

The logical relationship may be:

```text
PreislistenArtikel.Mandant = Preislisten.Mandant
PreislistenArtikel.ListeID = Preislisten.ID
```

even though:

- both tables have their own `(Mandant, ID)` primary keys
- no FK constraint exists
- naïve identical-PK matching would produce the wrong JOIN

A developer can author `ProjectDefined` relationships or explicitly save a safely
resolved JOIN as `UserConfirmed` project knowledge. Both are persisted in the
source-controlled workspace file `.query-puppy/relationships.json`, validated against
canonical same-database metadata, and loaded into the canonical runtime graph without
being represented as physical SQL Server foreign keys.

---

## 8.6 User confirmation as promotion

A safely resolved JOIN may be promoted by explicit user action through the native
**Save JOIN as Query Puppy relationship** Code Action.

Conceptually:

```text
Candidate
    ↓
User confirms
    ↓
Confirmed project relationship
```

Confirmation must be explicit.

Do not silently convert uncertain inference into permanent truth.

Accepting a learned or heuristic completion inserts SQL only. Completion acceptance
is not confirmation and never persists relationship knowledge. The explicit save-JOIN
action remains the promotion path to `UserConfirmed` project truth.

---

## 8.7 Learned relationships from SQL

Existing SQL written by the developer is a current local evidence source.

For example, repeated observations of:

```sql
JOIN PreislistenArtikel pa
  ON pa.Mandant = p.Mandant
 AND pa.ListeID = p.ID
```

between the same resolved physical objects provide evidence of a logical relationship.

On save, Query Puppy reuses the conservative resolved-JOIN model to acquire physical,
same-database equality evidence from active workspace SQL documents. It canonicalizes
aliases, operand orientation, identifier spelling, composite term order, endpoints,
and mappings; aggregates bounded local observation counts; and persists bounded
occurrence identities so unchanged occurrences remain deduplicated across editor and
extension-host sessions.

At the fixed product threshold `observationCount >= 3`, qualifying evidence is
revalidated against current canonical objects, columns, mappings, database scope, and
known type compatibility. Valid evidence becomes a `LearnedFromQuery` /
`StrongEvidence` relationship in the canonical runtime graph. Exact declared-FK,
`UserConfirmed`, or `ProjectDefined` knowledge suppresses the learned duplicate.

Repeated use increases evidence. It never makes a relationship authoritative or
confirmed by itself.

---

## 8.8 Learning constraints

Learning from queries must be:

- local unless explicitly designed otherwise
- privacy-conscious
- deterministic
- explainable
- bounded in storage
- based on resolved semantic identities rather than raw string similarity where possible
- resilient to aliases
- resilient to column ordering in predicates
- capable of composite relationships

Do not upload user SQL to a remote service merely to infer relationships.

Do not require AI.

---

## 8.9 Heuristic candidates

Heuristics are implemented only as conservative candidate generation for one
already-selected pair of physical tables.

A heuristic relationship must never masquerade as:

- a declared FK
- a confirmed project relationship
- an authoritative fact

The current E3 policy requires:

- exactly one complete qualifying unfiltered target primary key, unique constraint, or unique index mapping
- known compatible normalized types for every mapping
- at least one exact target-object-plus-key-column source name, with only a narrow trailing-`s` target-name variant
- deterministic full-key mapping
- same-name tenant/context columns only to complete a composite target key beside target-aware evidence

Incomplete keys, unknown or incompatible types, filtered keys, multiple qualifying
keys, multiple source assignments, both qualifying directions, self-pairs, and other
ambiguity fail closed. Any relationship from a stronger source suppresses the
heuristic fallback.

The result is at most one transient `HeuristicCandidate` / `Candidate`. It is not an
FK, is not persisted, does not enter the canonical database relationship graph, and
does not participate in global relationship discovery, table discovery/ranking,
comparison ranking, navigation, diagnostics, or multi-hop paths.

Possible evidence inputs for a deliberately broader future heuristic policy may include:

- target primary-key structure
- unique-key structure
- source column types
- target column types
- composite type compatibility
- naming patterns
- table-name relationships
- common suffixes such as `Id`
- prefixes or semantic fragments
- whether candidate source columns are themselves part of the local PK
- previously observed JOIN predicates
- previously confirmed relationships
- schema context
- source/target cardinality metadata where reliable
- compatible nullable/non-nullable patterns

No single heuristic is sufficient by itself unless explicitly proven otherwise.

---

## 8.10 Name matching is not relationship truth

The following are unsafe as standalone inference:

```text
same column name
same data type
same primary-key names
similar table names
```

Example:

```text
Preislisten PK:
Mandant + ID

PreislistenArtikel PK:
Mandant + ID
```

The correct logical relationship may still be:

```text
PreislistenArtikel.Mandant -> Preislisten.Mandant
PreislistenArtikel.ListeID -> Preislisten.ID
```

rather than:

```text
PreislistenArtikel.Mandant -> Preislisten.Mandant
PreislistenArtikel.ID      -> Preislisten.ID
```

Therefore:

> Matching primary-key names alone is insufficient evidence.

> Matching column names alone is insufficient evidence.

---

## 8.11 Composite relationships are first-class

Relationship inference, learning, persistence, ranking, and presentation must treat composite relationships as one semantic relationship.

Do not decompose:

```text
Mandant -> Mandant
ListeID -> ID
```

into two unrelated relationships if they jointly express one logical key relationship.

Column-pair ordering should remain deterministic.

---

## 8.12 Provenance must be visible to consumers

Relationship consumers must be able to distinguish:

```text
Declared FK
Confirmed relationship
Learned relationship
Heuristic candidate
```

Completion and future UI must not visually imply equal certainty.

Current native completion presentation distinguishes:

```text
Relationship JOIN
User-confirmed relationship JOIN
Project relationship JOIN
Learned relationship JOIN
Heuristic relationship JOIN
```

The underlying semantic distinction is mandatory.

---

## 8.13 Explanation requirement

Every non-authoritative relationship suggestion must be explainable.

For example:

```text
Suggested relationship

PreislistenArtikel.Mandant → Preislisten.Mandant
PreislistenArtikel.ListeID → Preislisten.ID

Evidence:
- compatible composite types
- Preislisten target columns form primary key
- ListeID matches target table semantic naming
- observed in 14 previous JOIN predicates
```

The actual evidence displayed depends on implementation.

Opaque scoring without provenance is not acceptable.

---

## 8.14 Query Store and plan cache

SQL Server Query Store, plan cache, stored procedures, views, and other server-side SQL definitions may contain useful historical relationship evidence.

These are possible future research sources.

They are not part of the first implementation.

Reasons include:

- permissions
- availability
- privacy
- potentially high query volume
- performance
- stale SQL
- generated SQL
- dynamic SQL
- incomplete semantic resolution
- Query Store configuration differences

Any future server-side mining must be optional, bounded, and evidence-driven.

---

## 8.15 Relationship source architecture

Relationship Intelligence uses one canonical relationship model and one graph infrastructure.

Do not create:

```text
ForeignKeyGraph
+
LearnedRelationshipGraph
+
HeuristicGraph
+
ProjectRelationshipGraph
```

as unrelated competing sources of truth.

Prefer conceptually:

```text
Relationship Evidence Sources
        |
        +-- Declared FK source
        +-- Project-defined source
        +-- User-confirmed source
        +-- Learned-query source
        +-- Heuristic source
        |
        v
Canonical Relationship Model
        |
        +-- Canonical Relationship Graph
        |       +-- Completion
        |       +-- Ranking
        |       +-- Discovery
        |       +-- JOIN generation
        |       +-- Diagnostics
        |       +-- Navigation
        |
        +-- Bounded heuristic JOIN-predicate consumer
```

Evidence sources may be pluggable. The graph remains canonical for declared,
project-defined, user-confirmed, and qualifying learned relationships. The current
pair-bounded heuristic is deliberately transient at the JOIN-predicate consumer and
does not create a competing or global heuristic graph.

---

## 8.16 Relationship ranking

Relationship ranking considers provenance before secondary heuristics.

The current deterministic trust order is:

```text
DeclaredForeignKey
    >
UserConfirmed
    >
ProjectDefined
    >
LearnedFromQuery
    >
HeuristicCandidate
```

Do not allow a high heuristic score to silently outrank contradictory authoritative metadata.

Within equivalent confidence levels:

- remain deterministic
- prefer explainable ranking
- retain stable alphabetical or canonical fallback ordering

---

## 8.17 Relationship persistence

Current persistent state is deliberately separated by ownership:

- `ProjectDefined` and `UserConfirmed` project relationships persist in `.query-puppy/relationships.json`.
- bounded learned endpoint/mapping evidence, observation counts, and cross-session occurrence-deduplication state persist in extension-managed workspace storage.
- `LearnedFromQuery` candidates are rebuilt after canonical metadata revalidation; they are not written into physical metadata snapshots or project relationship files.
- `HeuristicCandidate` relationships are transient and non-persistent.

Possible future persistent data includes explicit rejection/suppression decisions. Do
not build an oversized generic relationship database before a concrete use case
requires it.

---

## 8.18 Relationship rejection

Future inference UX should consider explicit rejection or suppression.

If Query Puppy repeatedly suggests an incorrect logical relationship, the user should eventually be able to suppress or reject it.

A rejection may itself be useful evidence.

Candidate generation now exists, but rejection/suppression state remains future work.
Design it without replacing the canonical model or current persistence boundaries.

---

## 8.19 Strategic product opportunity

Relationship Intelligence beyond declared FKs is not merely a fallback.

It can become a major product differentiator.

Many ERP and legacy schemas encode real business relationships conventionally rather than declaratively.

A local, explainable, developer-confirmed Relationship Map can allow Query Puppy to understand those schemas better over time.

This aligns directly with the target audience.

Long-term product thesis:

> Query Puppy should become especially valuable on databases whose logical relationships are poorly represented by declared foreign keys.

---

# PART III — IMMEDIATE PRIORITIES

## 9. P0 — Connection resilience continuation

**Status:** Stage 1 architectural decoupling is complete.

Completed:

1. backend-neutral connection and metadata contracts;
2. separate connection-context resolution and metadata transport;
3. mssql Connection Sharing isolated behind its concrete adapter;
4. metadata loading moved behind the neutral backend;
5. semantic consumers decoupled from mssql-specific APIs;
6. focused contract/source tests protecting the boundary.

Remaining:

1. track mssql issue #22819;
2. preserve the neutral boundary;
3. keep the existing mssql implementation operational while supported;
4. perform a direct metadata-connectivity feasibility spike if required;
5. do not introduce a direct production backend before the spike proves it viable.

Non-goals:

- no new connection dialog yet
- no query-execution UI
- no results grid
- no Object Explorer
- no credential migration unless a direct backend actually requires it
- no premature removal of mssql dependency
- no speculative direct backend
- no unrelated semantic refactor

Success criterion remains:

> Replacing the connection-context resolver or metadata backend must not require changes to Completion, QueryScopes, type inference, callables, relationship intelligence, or canonical metadata consumers.

Additional acceptance criterion:

```text
ConnectionContextResolver A
+
MetadataBackend B
```

must remain composable even when they are unrelated concrete objects.

---

## 10. P0 — Release, repository, and FLOSS hygiene

Finish push-driven release automation as a parallel operational workstream.

Desired steady state:

- every push to `main` runs CI
- unchanged package version means CI only
- intentional package-version bump plus changelog is the release switch
- every publishable product change uses a package version that has never been officially released before
- production-behavior changes update `package.json`, `package-lock.json`, and `CHANGELOG.md` in the same coherent change
- release builds and verifies one VSIX
- the same VSIX is published and attached to GitHub Release
- Git tag is automatic
- GitHub Release is automatic
- Marketplace publication is automatic
- publishing credentials are never committed
- third-party licensing and attribution are verified
- `THIRD_PARTY_NOTICES.md` is maintained
- required third-party notices are included in distributed artifacts

Important distinction:

> Normal Codex/development work must not publish ad hoc. An established release workflow may publish automatically only when the deliberate release condition is met.

Local development builds and temporary test VSIX files do not reserve or consume a version number. A version becomes immutable when it is used for an official release.

The current repository guidance in `AGENTS.md` and `docs/PUBLISHING.md` still describes a primarily manual explicit-publication workflow.

When release automation is implemented, update those documents in the same coherent change so repository instructions match the actual supported process.

Temporary bridge:

- stable PAT-based `vsce` publication is acceptable if needed

Target end state:

- migrate to stable secretless OIDC/Trusted Publishing when officially available in stable tooling
- do not permanently depend on a global Azure DevOps PAT

Release infrastructure changes should remain isolated from semantic work.

---

## 10.1 P0 — GPL-3.0-only relicensing and sustainable FLOSS governance

**Strategic decision:** Query Puppy version 0.12.6 and subsequent versions use `GPL-3.0-only`.

Officially published releases through 0.12.5 retain their original MIT license terms. Previously granted MIT rights remain attached to those historical releases. Do not rewrite historical release licensing.

Version 0.12.6 was already the current unreleased repository version when the coherent relicensing/compliance slice began, so the transition keeps that never-published version rather than creating an unnecessary additional version.

The 0.12.6 relicensing/compliance slice:

1. confirms project ownership/provenance for code, logo, assets, and other copyrightable project material;
2. inventories the production bundle using build evidence such as the esbuild metafile;
3. inspects `dist/extension.js` for actually bundled third-party code;
4. inspects the final VSIX for third-party code, binaries, assets, and notice obligations;
5. verifies that development-only tooling is not accidentally redistributed;
6. excludes `spike/**` and other research-only material from the VSIX where appropriate;
7. creates and verifies `THIRD_PARTY_NOTICES.md`;
8. replaces the root `LICENSE` with the unmodified official GNU GPL version 3 license text;
9. changes package metadata to the exact SPDX identifier `GPL-3.0-only`;
10. synchronizes README, CHANGELOG, CONTRIBUTING, Marketplace-facing text, `AGENTS.md`, release/publishing documentation, and project sources;
11. requires the distributed artifact and the exact source revision/tag to be traceable to one another;
12. requires the Corresponding Source for the distributed GPL artifact to be available for the exact released version.

The repository-side transition is complete. Publication remains blocked until the final committed source, immutable `v0.12.6` tag, GitHub Release source, and exact verified VSIX are mapped to one another.

The relicensing goal is strong copyleft, not a non-commercial restriction. Public communication must not describe GPL as prohibiting commercial use, sale, forks, modification, or private/internal modification. GPL obligations must be described accurately in terms of the applicable license conditions, especially when covered work is conveyed or distributed.

---

# PART IV — PRODUCT ROADMAP

## 11. P1 — Semantic correctness and T-SQL language coverage

Close important semantic blind spots that would make higher-level features unreliable.

Focus on gaps that materially affect existing or near-term consumers.

Candidate areas include, after current repository inspection:

- MERGE
- PIVOT / UNPIVOT
- OPENJSON and relevant JSON row-source behavior
- richer window frames
- additional built-in semantics
- more precise expression/type reconciliation where needed
- additional expressions affecting type inference
- SQL Server syntax affecting scope or projections
- SQL Server version/compatibility-sensitive behavior where semantically relevant

Principle:

> Do not chase complete grammar coverage for its own sake.

Prioritize syntax that unlocks reliable semantic consumers.

---

## 12. P1 — Relationship Intelligence foundation

**Status:** complete in the current 0.12.6 repository.

The provenance-aware canonical relationship architecture is established and remains the required foundation for all relationship consumers.

The completed foundation:

1. defines the provenance-aware canonical relationship model;
2. preserves declared-FK behavior and physical constraint identity;
3. represents additional provenance and confidence without parallel relationship graphs;
4. supplies focused model, graph, consumer, and regression contracts;
5. keeps source-specific persistence boundaries explicit.

Repository-level architecture instructions preserve the rule:

> Never invent a foreign key.

while also allowing explicitly non-FK relationship sources with provenance and confidence.

---

## 13. P1 — Project-defined relationships

**Status:** complete in the current 0.12.6 repository, including ProjectDefined and explicit UserConfirmed project relationships.

Explicit logical relationships are supported without being represented as physical SQL Server foreign keys.

The implemented scope favors reliability over automation.

Current behavior:

- define a logical relationship explicitly
- persist it
- load it into canonical relationship intelligence
- treat it as confirmed but not as a physical SQL Server FK
- support composite relationships
- preserve source provenance
- allow normal JOIN consumers to use it according to confidence rules

This provides immediate value on ERP databases without requiring heuristic inference.

---

## 14. P1 — Learned relationships from queries

**Status:** Phase E1/E2 complete in the current 0.12.6 repository.

Query Puppy locally observes safely resolved JOIN evidence on save, aggregates bounded privacy-conscious evidence, and promotes qualifying evidence at the fixed product threshold to `LearnedFromQuery` / `StrongEvidence` candidates after revalidation against canonical metadata.

Implemented stages:

1. reuse already-resolved physical equality JOIN predicates on document save;
2. normalize aliases and syntax to canonical table/column identities;
3. aggregate bounded evidence with persisted cross-session occurrence deduplication;
4. revalidate qualifying evidence against current canonical metadata;
5. offer `LearnedFromQuery` / `StrongEvidence` candidates at `observationCount >= 3`;
6. keep completion acceptance non-confirming and use the explicit save-JOIN action for promotion.

Do not automatically convert observation frequency into authoritative truth.

---

## 15. P1 — Heuristic relationship candidates

**Status:** Phase E3 complete in the current 0.12.6 repository.

A deliberately narrow pair-bounded heuristic fallback is implemented only for an already-selected physical table pair when no stronger declared, confirmed, project-defined, or learned relationship exists. It remains a `HeuristicCandidate` / `Candidate`, never an FK, and does not participate in global table discovery, persistence, or the canonical database relationship graph.

Any future heuristic expansion must remain conservative and evidence-driven.

Requirements:

- one already-selected physical table pair only
- one complete qualifying target key and an unambiguous full mapping
- known compatible types and target-aware deterministic naming
- explainable evidence
- explicit Candidate status
- no name-only inference
- no PK-name-only inference
- composite-key awareness
- type compatibility
- deterministic ranking
- suppression when stronger contradictory evidence exists
- no invented FK metadata
- no persistence, canonical-graph overlay, global discovery, or related-table ranking

False confidence is worse than a missing suggestion.

---

## 16. P1 — Semantic navigation and code understanding

Navigation remains a major near-term semantic consumer.

Target native APIs:

- Go to Definition
- Peek Definition
- Find References
- Document Highlights
- Document Symbols / Outline
- navigation to CTE definitions
- navigation to aliases
- navigation to variables
- navigation to local SQL objects
- navigation among projection aliases where semantically valid

Start with document-local constructs.

They require less external integration and already exist in the semantic model.

Avoid custom navigation windows.

Relationship-foundation work and navigation may proceed in an order or partial parallelism justified by actual implementation dependencies.

Do not let an older milestone document override this central strategic plan.

---

## 17. P1 — Diagnostics and Quick Fixes

Diagnostics should focus on information Query Puppy uniquely understands.

Do not duplicate ordinary mssql syntax diagnostics.

Candidate diagnostics:

- unresolved aliases
- alias visibility violations
- ambiguous unqualified columns
- unresolved columns after semantic row-source resolution
- callable argument-count errors
- high-confidence type incompatibilities
- impossible assignments
- unused CTEs
- unused aliases
- unused variables
- unused parameters
- JOIN without meaningful predicate
- accidental Cartesian product
- UPDATE without WHERE
- DELETE without WHERE
- shadowing mistakes
- correlation mistakes

Relationship-aware diagnostics may later distinguish:

- declared relationship
- confirmed relationship
- learned relationship
- candidate relationship

Every diagnostic must have:

- explicit confidence criteria
- deterministic behavior
- focused tests
- conservative no-diagnostic fallback where certainty is insufficient

Safe fixes should use native Quick Fixes.

---

## 18. P1 — Relationship Discovery and Join Paths

Relationship Intelligence now supports multiple evidence sources. A future dedicated
workflow may expose that knowledge as Relationship Discovery and bounded Join Paths.

Potential features:

- show related tables
- show incoming/outgoing relationships
- show provenance
- show multiple alternative relationships
- show composite relationships
- bounded multi-hop paths
- deterministic path ranking
- generate JOIN chain from selected path

Example:

```text
SalesOrderLine
    -> SalesOrderHeader
    -> Customer
    -> BillingAddress
```

Potential commands:

```text
Find related tables
Find join path to...
Add JOIN path
```

Use native Quick Pick, Tree View, or Code Action UI where practical.

Avoid unnecessary webviews.

---

## 19. P2 — Safe semantic code actions and refactoring

Build on existing wildcard expansion.

Candidates include:

- rename alias
- rename CTE
- rename variable
- rename projection alias
- qualify ambiguous column
- qualify all visible columns
- generate JOIN from relationship
- generate SELECT projection
- generate INSERT column list
- generate UPDATE SET list
- generate EXEC call
- add/remove identifier brackets
- add missing semicolon where safe
- extract query as CTE

Requirements:

- respect nested QueryScopes
- respect shadowing
- use canonical identities
- be previewable and reversible
- use native WorkspaceEdit / CodeAction
- no database-wide schema refactoring initially

---

## 20. P2 — Hover and Quick Info

Implement only where Query Puppy adds material value beyond mssql.

Useful information may include:

- resolved local source
- inferred type
- nullability
- PK/UQ/FK role
- logical relationship role
- relationship provenance
- callable signature
- CTE/derived-column source
- confidence or unknown state where useful

Do not build redundant generic hover merely for feature parity.

---

## 21. P2 — Query-aware object discovery

Improve object discovery using explainable semantic ranking.

Possible ranking inputs:

- Contains match
- current database/schema
- objects already used in query
- authoritative relationship to visible row source
- confirmed relationship
- learned relationship evidence
- bounded relationship distance
- deterministic alphabetical fallback

The current pair-bounded heuristic candidate does not participate in object discovery
or related-object ranking. Any future expansion into that consumer must remain clearly
weaker than confirmed or declared relationships.

Do not introduce hidden AI/fuzzy ranking.

Users should be able to understand why an object is suggested.

---

# PART V — LOWER-PRIORITY OR CONDITIONAL AREAS

## 22. Formatting

mssql provides an increasingly capable SQL formatter.

Therefore:

1. evaluate it on realistic ERP queries;
2. test keyword casing;
3. test CTEs;
4. test CASE;
5. test APPLY;
6. test window functions;
7. test comments;
8. test selection formatting;
9. test idempotence.

Implement or integrate Query Puppy formatting only if meaningful gaps remain.

Formatting is useful.

It is not a core differentiator.

---

## 23. Persistent query history

mssql already has restart-persistent query history.

Do not build Query Puppy history until:

1. a reliable supported capture path exists for all user-executed queries; and
2. Query Puppy can add substantially more value.

Potential differentiators:

- large/unlimited retention
- age/count/storage policies
- full-text search
- favorites
- permanent saved queries
- server/database filters
- export/import
- semantic metadata
- relationship-learning evidence

Relationship learning alone is not sufficient reason to hook private execution internals.

---

## 24. Production safety

mssql already supports connection groups and connection-color UI.

Do not duplicate basic coloring.

Potential semantic safety value:

- protected connection classification
- warnings on destructive statements
- diagnostics / CodeLens for UPDATE/DELETE/DROP/TRUNCATE
- prominent native status indication

Prefer reliable warnings over brittle interception of mssql commands.

---

## 25. Snippets

Do not build a custom snippet engine.

Static templates belong to VS Code/VSCodium snippets.

Dynamic SQL based on:

- schema
- query scope
- relationships
- metadata

belongs to Query Puppy through completion or Code Actions.

---

## 26. AI

Do not build a first-party AI assistant into Query Puppy.

External AI assistants already exist.

Query Puppy's durable advantage is:

- deterministic semantics
- structured metadata
- explainable relationships
- scope understanding
- types
- canonical identities

A future standard interface exposing Query Puppy semantic context to external AI tools may be considered if a concrete interoperable use case emerges.

Do not build an AI chat product.

---

## 27. Debugging

T-SQL debugging remains outside the practical roadmap.

Reconsider only after higher-value semantic tooling is mature and only if a viable supported debugging architecture exists.

---

# PART VI — EXPLICIT NON-GOALS

## 28. Product boundaries

Query Puppy is not intended to become:

- a full SQL Server client
- a replacement query-execution engine
- a custom results grid
- an Object Explorer replacement
- a database administration suite
- a deployment system
- a schema-compare tool
- a monitoring platform
- a SQL Server Agent manager
- a universal multi-dialect SQL LSP
- a universal SQL parser
- a custom completion popup
- a second IDE inside VS Code
- a custom snippet engine
- a built-in AI chat product

A direct metadata backend does not change these boundaries.

Relationship learning does not turn Query Puppy into a query-monitoring platform.

Future additional dialect products do not turn Query Puppy for T-SQL itself into a multi-dialect extension.

---

# PART VII — DIALECT STRATEGY

## 29. T-SQL remains dialect-specific

Query Puppy for T-SQL remains focused on Microsoft SQL Server and T-SQL.

Do not convert this extension into a generic multi-dialect SQL extension.

Future dialect products should be separate visible extensions, potentially including:

- Query Puppy for PostgreSQL
- Query Puppy for MySQL

Each extension owns the implementation of its dialect.

The purpose of shared architecture is code reuse and maintainability, not creation of one universal SQL product.

---

## 29.1 Fork-ready dialect architecture

Query Puppy's T-SQL implementation does not need to become fully dialect-neutral.

The architectural objective is instead:

> Keep dialect-specific behavior sufficiently localized that a new dialect-specific Query Puppy extension can reuse the established codebase and replace dialect-owned components without first requiring a fundamental architectural refactor.

A developer starting a future PostgreSQL or MySQL product should be able to take the existing Query Puppy codebase and incrementally replace the parts that are genuinely dialect-specific.

The first step of such a port must not be untangling T-SQL assumptions from unrelated infrastructure.

---

## 29.2 Dialect-owned implementation

The following areas should generally remain owned by the individual dialect:

- tokenization where syntax differs
- syntax interpretation
- document semantic analysis rules
- identifier quoting and normalization
- catalog/name resolution
- metadata acquisition
- database-specific object kinds
- type rules
- type coercion
- type precedence
- built-in callable catalogs
- dialect-specific callable resolution
- DML semantics
- dialect-specific row sources
- dialect-specific SQL generation

Examples of valid T-SQL-specific behavior include:

- bracketed identifiers
- `TOP`
- `OUTPUT`
- `APPLY`
- `inserted` / `deleted`
- `EXEC`
- `GO`
- `rowversion`
- SQL Server type precedence
- SQL Server built-in functions
- SQL Server catalog queries
- SQL Server multi-part name resolution

These concepts do not need to be generalized merely because another dialect may eventually exist.

---

## 29.3 Reusable infrastructure

The following areas are likely candidates for reuse across future dialect-specific products where real implementations prove the commonality:

- editor integration
- completion infrastructure
- deterministic sorting
- Contains matching
- candidate presentation infrastructure
- caching infrastructure
- persistence infrastructure
- logging
- configuration infrastructure
- relationship evidence/provenance concepts
- relationship graph mechanics
- generic symbol/reference concepts
- QueryScope concepts
- RowSource concepts
- callable/signature concepts
- diagnostics infrastructure
- navigation infrastructure
- code-action infrastructure
- test infrastructure

Reuse does not require these areas to become perfectly dialect-neutral in advance.

---

## 29.4 Shared outputs over shared parsing

Future dialect implementations may produce compatible semantic outputs without sharing the same tokenizer, parser, or syntax-rule implementation.

Prefer:

```text
T-SQL analyzer
        ↓
Semantic concepts

PostgreSQL analyzer
        ↓
Semantic concepts

MySQL analyzer
        ↓
Semantic concepts
```

over forcing all dialects through a universal parser.

Shared semantic outputs are more important than a shared parser.

Do not create a universal SQL AST merely to prepare for hypothetical ports.

---

## 29.5 Avoid unnecessary dialect leakage

When adding or changing code, ask:

> Is this implementation T-SQL-specific because the underlying language rule genuinely is T-SQL-specific?

If yes, keeping it T-SQL-specific is correct.

Otherwise ask:

> Is this component only T-SQL-specific because an unrelated consumer has accidentally absorbed a T-SQL assumption?

If yes, improve the boundary.

Examples of unwanted dialect leakage include:

- generic completion infrastructure knowing SQL Server catalog syntax
- cache infrastructure knowing T-SQL identifier quoting
- relationship graph mechanics knowing SQL Server system-table names
- diagnostics infrastructure assuming `database.schema.object`
- editor integration directly interpreting T-SQL DML semantics

---

## 29.6 No premature multi-dialect abstraction

Do not introduce merely in anticipation of future dialects:

- a generic `Dialect` god-interface
- a `SqlDialect` runtime switch
- a universal parser
- a universal SQL AST
- generic dialect registries
- empty PostgreSQL/MySQL modules
- speculative type-system abstractions
- speculative metadata dialect interfaces
- shared packages that have only one real consumer
- monorepo restructuring solely for hypothetical future ports

Shared infrastructure should be extracted from proven commonality between real dialect implementations.

---

## 29.7 Portability acceptance test

A practical architecture test is:

> A developer starting a second Query Puppy dialect should be able to identify dialect-owned implementation areas from the repository structure and replace them incrementally while retaining reusable editor infrastructure and semantic machinery.

The architecture has accumulated excessive dialect leakage if starting a second dialect first requires substantial untangling of T-SQL-specific rules from:

- Completion infrastructure
- caching
- persistence
- relationship infrastructure
- diagnostics infrastructure
- navigation infrastructure
- editor integration

This is a maintainability signal, not a requirement for perfect abstraction.

---

## 29.8 Shared implementation extraction

Shared code may later be extracted into build-time/source packages when a real second dialect proves that the abstraction is useful.

Do not create shared packages only because code appears theoretically reusable.

Each dialect-specific extension should remain independently installable and should own its own shipped dialect implementation.

---

# PART VIII — UX RULES

## 30. Native editor UX

Prefer public VS Code/VSCodium APIs:

- CompletionItemProvider
- Signature Help
- Hover
- Definition
- References
- Document Highlights
- Document Symbols
- Diagnostics
- Quick Fixes
- Code Actions
- Rename Provider
- Formatting Provider
- Status Bar
- Tree Views
- Quick Picks
- WorkspaceEdit

Avoid:

- private VS Code APIs
- Suggest Widget manipulation
- custom completion dialogs
- unnecessary webviews
- private mssql command interception
- hidden behavior users cannot understand

---

# PART IX — ARCHITECTURE AND QUALITY RULES

## 31. Repository first

Inspect the current repository before planning or changing code.

Older project notes are not technical truth.

The repository is the implementation source of truth.

The strategy plan is the strategic source of truth.

Discrepancies should be resolved deliberately.

---

## 32. Capability-oriented dependencies

Prefer small capability-oriented interfaces over generic services or backend objects.

Consumers receive only the capabilities they actually need.

Do not make unrelated capabilities inseparable merely because the current implementation happens to use one provider for both.

This principle applies especially to connection context and metadata transport.

---

## 33. No speculative abstraction

Do not generalize purely for hypothetical future needs.

A neutral abstraction must correspond to a demonstrated current or imminent requirement.

Provider-specific or dialect-specific concepts remain specific until multiple real implementations demonstrate useful commonality.

---

## 34. Reuse semantic models

Do not create parallel:

- parsers
- scope engines
- type systems
- callable models
- metadata models
- relationship models
- relationship graphs
- resolution pipelines

without a concrete architectural reason.

New editor consumers should reuse semantic outputs.

Separate dialect implementations may own different analyzers when language rules genuinely require it.

---

## 35. Canonical metadata

Physical database objects and columns retain one canonical semantic representation across:

- completion
- DML
- navigation
- diagnostics
- relationships
- refactoring
- future consumers

Do not create reduced duplicate models for convenience.

Canonical does not mean lowest-common-denominator across every possible future database dialect.

Dialect-specific metadata may exist where semantically necessary.

---

## 36. Canonical relationships

Relationship provenance may come from multiple evidence sources.

There must still be one canonical relationship representation. Persisted and learned
production relationships are consumed by the canonical graph; the current transient
pair-bounded heuristic uses the same structured model only at its bounded predicate
consumer and does not create a global heuristic graph.

Do not allow declared, learned, project-defined, and heuristic relationships to become unrelated competing graph implementations.

---

## 37. Conservative semantics

Unknown is better than confidently incorrect.

Do not infer authoritative relationships from similar names.

Do not claim a heuristic relationship is a real FK.

Do not hide legal completion candidates merely because type information is incomplete.

Do not convert weak evidence into permanent relationship truth without explicit policy.

---

## 38. Determinism

Equivalent results must have stable ordering.

Semantic ranking must be explainable.

Relationship ranking must preserve provenance.

Avoid opaque AI or fuzzy scoring in core language features.

---

## 39. Performance

Performance on schemas with hundreds or thousands of tables is a product feature.

Do not query catalogs per keystroke.

Preserve:

- lazy loading
- caching
- coalescing
- bounded analysis

Relationship learning must not turn every keystroke into global-history analysis.

Navigation and diagnostics must not multiply full-document or full-catalog analysis unnecessarily.

---

## 40. Privacy

Query Puppy should remain local-first.

Do not transmit:

- query text
- schema metadata
- credentials
- learned relationships
- project relationship maps

to remote services without an explicit future product decision and user consent.

Relationship learning should default to local processing.

---

## 40.1 License transition and FLOSS responsibility

Query Puppy is FLOSS and benefits from the work of other open-source projects.

Query Puppy version 0.12.6 and subsequent versions are licensed under:

```text
GPL-3.0-only
```

Use that exact SPDX identifier. Do not substitute `GPL-3.0-or-later`, deprecated ambiguous shorthand, or language that grants a later-version option.

Officially published releases through 0.12.5 retain their original MIT license terms.

The GPL decision does not prohibit commercial use, sale, modification, or forks. Do not describe Query Puppy as non-commercial software. Do not claim that every modification must always be published or that private/internal modification is prohibited.

The purpose of strong copyleft is to preserve the applicable software freedoms and source-availability obligations when GPL-covered versions are conveyed or distributed under the license terms.

Third-party attribution is both:

- a compliance responsibility; and
- a matter of proper open-source credit.

Third-party material included in a distributed Query Puppy artifact must retain all copyright, attribution, license, NOTICE, source, and other redistribution obligations required by the applicable licenses.

Use authoritative upstream license information and SPDX identifiers where available.

---

## 40.2 THIRD_PARTY_NOTICES.md

Maintain the repository-level file:

```text
THIRD_PARTY_NOTICES.md
```

as Query Puppy's central human-readable third-party attribution and license inventory.

All deliberately used direct third-party libraries should be identified there, separated where useful into:

### Runtime / distributed dependencies

Third-party software shipped as part of the Query Puppy VSIX or otherwise redistributed with the product.

These entries require particular attention because redistribution obligations apply directly to released artifacts.

### Development / build dependencies

Directly used third-party development and build libraries should also be acknowledged so the projects Query Puppy deliberately depends on receive visible credit.

Do not manually reproduce a huge transitive development dependency tree merely as a courtesy list.

---

## 40.3 Distributed transitive dependencies and artifact boundary

License responsibility is not limited to dependencies explicitly imported by Query Puppy.

If a dependency bundles or introduces other third-party material into the distributed VSIX, those components may also require attribution, source availability, or other treatment.

Therefore:

> Identify third-party material actually redistributed as part of the extension, not merely direct entries in `package.json`.

Dependency-tree structure alone does not determine redistribution obligations.

The final packaged artifact is the relevant technical inspection boundary.

---

## 40.4 Standard libraries and platform APIs

Do not create individual project acknowledgements for ordinary standard/platform functionality such as:

- JavaScript language built-ins;
- Node.js built-in modules;
- TypeScript language constructs;
- normal VS Code/VSCodium public API usage;
- comparable standard runtime facilities.

Third-party packages, embedded runtimes, drivers, parser libraries, bundled binaries, copied source, and external assets must be evaluated separately.

---

## 40.5 External extension integrations

An external extension that Query Puppy depends on or integrates with is not automatically a redistributed third-party component.

Microsoft mssql is currently a separately installed extension dependency and integration dependency. Do not represent its code as bundled with Query Puppy unless artifact inspection proves that Query Puppy actually redistributes Microsoft material.

Such integrations may still be acknowledged appropriately in README and integration documentation.

---

## 40.6 Mandatory third-party adoption gate

The GPL compatibility check is a pre-adoption engineering gate, not a release-day cleanup task.

Before Codex or a developer adds, vendors, copies, replaces, or materially upgrades third-party software or other redistributable material, verify from authoritative upstream sources:

1. what the material is and where it came from;
2. the exact license and version/exception terms that apply;
3. whether the intended use and combination are compatible with Query Puppy's approved `GPL-3.0-only` distribution model;
4. whether the material will be bundled, copied, linked, generated into, or otherwise redistributed with the VSIX;
5. applicable copyright, attribution, NOTICE, source, relinking, offer, or other redistribution obligations;
6. whether `THIRD_PARTY_NOTICES.md` or other license files must change.

This gate applies to every change so new work does not introduce material that blocks the active GPL distribution model.

Do not rely solely on a package-manager `license` field when compatibility or redistribution is material. Inspect upstream LICENSE/NOTICE files and authoritative project licensing information where needed.

If compatibility is unknown, ambiguous, unusual, or depends on unresolved legal interpretation:

> Do not adopt the material. Return it for explicit review.

Do not defer compatibility review until after implementation.

---

## 40.7 License review triggers

Dependencies with familiar permissive licenses may be straightforward, subject to their actual terms and notice requirements.

The following require explicit review rather than automatic acceptance:

- unknown or missing license;
- custom/non-standard license;
- GPL-family licenses with version-specific compatibility questions;
- AGPL;
- LGPL;
- MPL or other file-level copyleft where combination/redistribution details matter;
- SSPL;
- source-available licenses;
- non-commercial restrictions;
- field-of-use restrictions;
- unusual attribution obligations;
- dependencies bundling native or proprietary binaries;
- dependencies with unclear transitive licensing;
- copied/adapted source or assets whose provenance is unclear.

This list is a review trigger, not an assertion that every listed license is automatically incompatible.

---

## 40.8 Mandatory GPL release compliance gate

Every GPL release must inspect the actual release artifact and not merely the manifest.

Before publishing a GPL release:

1. build from the intended clean release source revision;
2. inspect the production bundler inputs/outputs;
3. inspect `dist/extension.js` and other generated runtime artifacts for bundled third-party material;
4. inspect the final VSIX file list and contents;
5. verify `THIRD_PARTY_NOTICES.md` and all required license/NOTICE material;
6. verify the root license and package metadata consistently identify `GPL-3.0-only`;
7. verify development-only/research material that should not ship is excluded;
8. verify all included third-party material remains compatible with the GPL release model;
9. verify the exact source revision/tag corresponding to the distributed artifact;
10. verify that the Corresponding Source required for the distributed artifact is available for that exact release.

A dependency audit from an earlier release does not replace inspection of the current release artifact.

---

## 40.9 Corresponding Source and release traceability

For GPL releases, preserve a clear immutable mapping:

```text
release version
    =
Git tag / exact source revision
    =
GitHub Release source milestone
    =
distributed VSIX build
```

The source made available for a distributed GPL artifact must correspond to the actual released version rather than an older or newer moving branch state.

Release documentation must make the corresponding source location clear enough for recipients to obtain the source associated with that release.

Do not delete or rewrite historical release tags merely because later versions exist.

---

## 40.10 Automated license verification

Automate license inventory and compliance checks where they reduce repeatable error, but do not let automation replace explicit review of ambiguous licensing.

A future CI/release check may implement:

```text
third-party change
        ↓
license / provenance inventory
        ↓
GPL-3.0-only compatible and obligations known?
        |
        +-- yes → continue
        |
        +-- no / unclear → stop for explicit review
```

Artifact inspection remains required because package manifests alone do not prove what is redistributed.

---

## 40.11 Sustainability principle

Query Puppy does not monetize access to software features.

The project may accept voluntary sponsorship from individuals and organizations to support independent development, project costs, infrastructure, and development tools.

Sponsorship does not create entitlement to:

- features;
- support or SLA obligations;
- roadmap priority;
- sponsor-exclusive functionality;
- proprietary license rights;
- governance rights;
- technical decision-making authority.

The strategic model is:

> Free software + strong copyleft + commercial use allowed + no paid feature gates + voluntary individual and organizational sponsorship.

The objective is sustainable independent development, not revenue maximization or conversion into a commercial licensing product.

---

## 40.12 Contributor governance

Before substantial external contribution volume develops, deliberately choose and document the contributor-rights model.

The current strategic preference is:

```text
GPL-3.0-only + DCO + inbound = outbound
```

but this preference is not yet a repository contribution requirement until the project deliberately adopts and documents it.

A DCO-style model is preferred if Query Puppy prioritizes low-friction provenance and community contributions without granting Bearded Puppy Labs extra relicensing rights.

A CLA or copyright-assignment model should be adopted only if the project deliberately decides that future unilateral relicensing or additional licensing rights justify the added contributor burden.

Do not silently introduce a CLA, copyright assignment, or DCO requirement as an implementation detail.

---

## 40.13 FLOSS credit principle

Where Query Puppy materially benefits from another open-source project, credit should be easy to find rather than hidden only in machine-generated dependency metadata.

The project should give visible recognition to upstream work where appropriate without overstating affiliation, endorsement, or ownership.

## 41. Tests

Every semantic bug fix should add focused regression coverage.

Use realistic ERP-style SQL.

Important features should have positive and negative tests.

Connection capabilities require contract tests.

Relationship evidence sources require provenance tests.

Heuristic inference requires false-positive tests, not just positive examples.

Composite relationships require dedicated tests.

Architecture boundaries that protect backend or dialect portability should use focused source/contract checks where worthwhile.

---

## 42. Refactoring discipline

Fix root causes rather than symptoms.

Avoid unrelated cleanup during feature work.

Large architectural changes should be divided into coherent stages with behavior preserved between stages.

Do not perform broad rewrites merely because a file is large.

Do not refactor existing T-SQL code merely to make hypothetical future dialects aesthetically cleaner.

---

# PART X — SPECIAL ARCHITECTURAL RISKS

## 43. DocumentSemanticAnalyzer growth

The semantic analyzer is a central asset and a potential monolith risk.

Do not allow it to become a class that directly implements:

- completion
- navigation
- diagnostics
- refactoring
- relationship learning
- all symbol tracking

New features should consume semantic output.

If decomposition becomes necessary, separate by semantic responsibility.

Do not split files arbitrarily by size.

Every structural change must preserve behavior with regression tests.

T-SQL-specific semantic analysis may remain dialect-specific.

Portability is achieved by keeping consumers dependent on useful semantic outputs, not by removing legitimate T-SQL behavior from the analyzer.

---

## 44. Relationship intelligence complexity

Relationship Intelligence can become dangerous if inference logic, persistence, graph logic, ranking, and UI are mixed together.

Keep responsibilities conceptually separate:

```text
Evidence acquisition
    ↓
Normalization
    ↓
Canonical relationship model
    ↓
Relationship graph
    ↓
Ranking / consumers
```

Persistence is an infrastructure concern.

Heuristic generation is an evidence-source concern.

JOIN completion is a consumer.

Do not collapse them into one relationship service.

---

# PART XI — RELEASE POLICY

## 45. Semantic versioning

Use semantic versioning pragmatically.

Every publishable product change must use a package version that has never been officially released before.

Released version numbers identify immutable product states.

Never reuse an already officially released version for different code or behavior.

Local development builds and temporary test VSIX files do not reserve or consume a version number.

### Patch releases

Appropriate for:

- bugs
- patch-level behavior corrections
- small non-breaking refinements
- hygiene
- infrastructure
- small semantic corrections
- license/notice corrections where no product behavior changes

Examples:

```text
0.12.2 + bug fix
-> 0.12.3

0.12.3 + another bug fix
-> 0.12.4
```

### Minor releases

Appropriate for:

- meaningful new user-facing capability
- new native editor consumer
- substantial language coverage
- major backend capability
- major Relationship Intelligence milestone

Example:

```text
0.12.x + ProjectDefined Relationships
-> 0.13.0
```

### Major releases

Reserve for genuinely incompatible:

- configuration changes
- product-boundary changes
- public API changes
- migration requirements

Do not inflate versions merely for marketing.

Production-behavior changes must update:

- `package.json`
- `package-lock.json`
- `CHANGELOG.md`

as part of the same coherent change.

A version bump is normally not required for:

- documentation-only changes
- test-only changes
- internal behavior-preserving refactoring
- research-only work
- non-publishable experimental work

If a task changes publishable product behavior, the appropriate next version must be determined and applied as part of that task rather than deferred to a later release-preparation pass.

The MIT-to-`GPL-3.0-only` transition was deliberately applied to unreleased version 0.12.6. Do not create another version solely to repeat the completed license transition.

---

## 46. Release quality

Every release should have:

- a package version that has never been officially released before
- matching package/lockfile version
- changelog entry
- complete verification
- reproducible VSIX
- release notes
- Marketplace publication
- Git tag
- GitHub Release
- the exact published VSIX attached as a GitHub Release asset once automation is complete
- current `THIRD_PARTY_NOTICES.md`
- verified dependency licensing for redistributed third-party material
- for GPL releases, exact `GPL-3.0-only` package/license metadata
- for GPL releases, artifact-level third-party inspection
- for GPL releases, an immutable source revision/tag corresponding to the distributed VSIX
- for GPL releases, availability of the required Corresponding Source for the exact released artifact

Do not market planned functionality as implemented.

---

## 46.1 Third-party notice packaging

Release verification should confirm that required third-party notices survive packaging.

A notice that exists only in the repository but is legally required in the distributed artifact is insufficient.

Inspect the final VSIX contents where needed.

The same release artifact published to the Marketplace and attached to GitHub should carry the same required notices.

---

# PART XII — CURRENT EXECUTION SEQUENCE

## 47. Phase A — Hygiene and risk containment

### Completed connection foundation

1. backend-neutral connection/context contracts — complete;
2. independent connection-context and metadata capabilities — complete;
3. mssql Connection Sharing isolated behind concrete adapter — complete;
4. metadata consumers moved behind neutral contracts — complete;
5. focused boundary tests — complete.

### Completed hygiene and compliance work

1. completed the repository-side GPL-3.0-only relicensing/compliance slice for 0.12.6;
2. confirmed code/asset ownership and provenance needed for relicensing;
3. established and verified `THIRD_PARTY_NOTICES.md`;
4. inventoried direct third-party libraries and material actually redistributed in the VSIX;
5. inspected production bundle inputs/output and the final VSIX for third-party material and notice/source obligations;
6. excluded research-only `spike/**` material from the VSIX;
7. synchronized `AGENTS.md`, `docs/PUBLISHING.md`, public documentation, and project source documents.

### Remaining release operations

1. commit the final reviewed source, create immutable tag `v0.12.6`, and establish the exact source/tag/VSIX/Corresponding Source mapping;
2. finish push-driven release automation;
3. continue tracking mssql issue #22819.

GPL compatibility review is now mandatory before adoption of new third-party material. CI automation may assist that review later, but ambiguous cases must still stop for explicit review.

---

## 48. Phase B — Direct-connect feasibility

1. Research candidate SQL Server connectivity technologies.
2. Prototype metadata-only direct connectivity outside the production path.
3. Test authentication matrix.
4. Test target platforms.
5. Evaluate SecretStorage.
6. Evaluate connection-profile UX.
7. Evaluate TLS/certificates.
8. Evaluate cancellation/timeouts.
9. Evaluate large-schema performance.
10. Evaluate dependency licensing and redistribution requirements.
11. Decide based on evidence whether `DirectSqlServerMetadataBackend` is viable.

Do not productionize the prototype merely because work was invested in it.

A technically strong connectivity technology may still be unsuitable if packaging, binary distribution, licensing, authentication, or maintenance burden is unacceptable.

---

## 49. Phase C — Relationship model foundation

**Status:** complete.

The completed Phase C foundation provides one provenance-aware canonical relationship
model and graph, structured confidence, source/target references, ordered mappings,
declared-FK-specific physical details, preserved FK/JOIN behavior, source-specific
persistence boundaries, and focused provenance regressions. Repository guidance keeps
the rule that real FKs must never be fabricated.

---

## 50. Phase D — Explicit relationship intelligence

**Status:** complete.

Phase D implements `ProjectDefined` and explicitly saved `UserConfirmed` relationships,
including composite mappings, workspace project persistence, canonical metadata
validation, canonical graph loading, provenance-aware presentation, and the native
save-JOIN promotion workflow.

This phase should produce immediate value on databases without declared FKs.

---

## 51. Phase E — Learned and inferred relationship intelligence

**Status:** complete through E3 in 0.12.6.

E1/E2 locally acquires, normalizes, bounds, persists, and cross-session-deduplicates
save-driven resolved-JOIN evidence. It revalidates qualifying evidence and presents
`LearnedFromQuery` / `StrongEvidence` candidates at `observationCount >= 3` without
automatic confirmation. E3 adds the conservative transient pair-bounded
`HeuristicCandidate` / `Candidate` fallback with structured explanation and no
persistence or global graph/discovery role. The existing save-JOIN action is the sole
explicit promotion path to `UserConfirmed` project knowledge.

Rejection/suppression, broader heuristics, and server-side evidence mining remain
future work.

Query Store / plan cache research comes only after this local pipeline is proven.

---

## 52. Phase F — Semantic foundation completion

1. Close high-value language gaps.
2. Harden reusable symbol/reference information.
3. Improve semantic output needed by navigation.
4. Improve semantic output needed by diagnostics.
5. Guard performance.
6. Prevent analyzer monolith growth.
7. Avoid unnecessary dialect leakage while preserving legitimate T-SQL specialization.

Some Phase F work may run in parallel with Relationship Intelligence where dependencies do not conflict.

---

## 53. Phase G — New semantic consumers

1. Document-local Go to Definition / Peek.
2. References.
3. Highlights.
4. Symbols.
5. High-confidence diagnostics.
6. Quick Fixes.
7. Relationship discovery.
8. Join-path workflows.

---

## 54. Phase H — Transformations

1. Semantic rename.
2. Qualify-column actions.
3. JOIN generation from any sufficiently trusted relationship.
4. Projection generation.
5. DML generation.
6. Extract/refactor actions.
7. Additional safe code actions.

---

## 55. Phase I — Conditional conveniences

Only after evaluating existing native/mssql functionality:

- formatter
- advanced history
- production-safety enhancements
- richer schema UI
- semantic integration with external tools

---

## 55.1 Future dialect work is not currently a roadmap phase

PostgreSQL and MySQL products remain future possibilities rather than active implementation workstreams.

Current development should preserve reasonable fork-readiness without diverting resources into premature multi-dialect infrastructure.

When the first real second-dialect project begins:

1. start from the proven Query Puppy codebase;
2. identify dialect-owned components;
3. replace them incrementally;
4. observe which supposedly reusable components actually remain reusable;
5. extract shared packages only where real duplication proves the common boundary;
6. update strategy based on evidence from the real port.

The second dialect itself is the primary validation of shared architecture.

---

# PART XIII — CHATGPT AND CODEX WORKFLOW

## 56. Strategy chat

The strategy chat owns:

- this development plan
- product strategy
- architecture principles
- prioritization
- external dependency decisions
- mssql integration strategy
- Relationship Intelligence strategy
- dialect strategy
- FLOSS/dependency policy
- product boundaries
- roadmap changes
- competitive positioning
- new feature evaluation

Potential is implicit in strategy.

New findings that materially change project direction return here.

---

## 57. Development chat

Development chats own:

- translating strategy into implementation slices
- repository inspection
- detailed implementation architecture
- acceptance criteria
- test-case design
- generating Codex prompts
- reviewing Codex results
- ensuring implementation matches strategy

Development chats must not silently rewrite strategy.

If implementation discoveries suggest a strategic change, return the issue to the strategy chat.

Dependency additions must include license/notice considerations.

---

## 58. Codex

Codex works directly in the repository and owns:

- implementation
- refactoring
- tests
- builds
- packaging when explicitly part of the task
- technical verification
- repository inspection

Codex does not own product strategy.

Codex must not introduce new third-party dependencies casually where existing dependencies or standard/platform capabilities already solve the problem adequately.

Codex must not publish ad hoc unless the task explicitly concerns the established release process.

---

## 59. Rules for Codex prompts

When generating a Codex prompt:

1. Start from this plan.
2. Require inspection of current repository code.
3. Define one coherent objective.
4. Explain roadmap motivation.
5. State explicit scope.
6. State explicit non-goals.
7. Preserve existing behavior unless change is intentional.
8. Require focused tests.
9. Require realistic SQL cases where relevant.
10. Require the repository's canonical verification.
11. Require `git diff --check`.
12. Do not publish or push unless explicitly requested by the task or established release workflow.
13. Require a final report.
14. Do not create parallel semantic infrastructure.
15. For backend work, enforce capability-oriented interfaces.
16. For backend work, prevent provider-specific leakage.
17. For relationship work, enforce provenance.
18. For relationship inference, require negative/false-positive tests.
19. Prefer native editor APIs.
20. Avoid unrelated refactors.
21. Do not introduce speculative multi-dialect abstractions.
22. If a third-party dependency is added, removed, replaced, or materially upgraded, require license verification.
23. Update `THIRD_PARTY_NOTICES.md` in the same coherent change.
24. Verify redistribution notices when the VSIX contents change.
25. Prefer standard/platform capabilities over unnecessary external dependencies where they adequately solve the problem.
26. For publishable production-behavior changes, determine and apply the appropriate next SemVer version.
27. Update `package.json`, `package-lock.json`, and `CHANGELOG.md` together for publishable production-behavior changes.
28. Never reuse a version that has already been officially released for different code or behavior.
29. Do not bump the package version for documentation-only, test-only, internal behavior-preserving refactoring, research-only, or non-publishable experimental work unless another explicit release requirement applies.
30. Before adding, copying, vendoring, replacing, or materially upgrading third-party software/assets, verify provenance, exact license, `GPL-3.0-only` compatibility for the intended use, redistribution status, and required notices from authoritative upstream sources.
31. If third-party compatibility is unknown, ambiguous, unusual, or legally unresolved, do not adopt the material; return it for explicit review.
32. Update `THIRD_PARTY_NOTICES.md` and other required license/NOTICE material in the same coherent change when third-party material changes.
33. Do not rely only on package-manager license metadata when redistribution or compatibility is material.
34. For GPL release work, inspect the actual bundle and VSIX contents and verify the exact Corresponding Source/release-tag mapping.
35. Preserve the active `GPL-3.0-only` metadata and the historical MIT boundary; do not rewrite historical release licensing.

Final reports should normally include:

- files changed
- architecture changes
- tests run
- verification result
- known limitations
- remaining coupling
- follow-up risks
- third-party dependencies added or changed
- applicable license/notice actions where relevant
- third-party provenance and `GPL-3.0-only` compatibility decision for any added/changed external material
- redistribution/artifact impact and unresolved compliance questions
- versioning decision, including old/new version for publishable changes or the reason no version bump was required

---

# PART XIV — FEATURE DECISION FRAMEWORK

## 60. User value

Does the feature solve a frequent or painful SQL development problem for the target Query Puppy product?

---

## 61. Differentiation

Does Query Puppy add meaningful value beyond the existing editor and database-workbench stack?

For Query Puppy for T-SQL this currently means principally:

```text
VS Code/VSCodium
+
Microsoft mssql
```

?

---

## 62. Semantic leverage

Can the feature reuse:

- QueryScopes
- canonical metadata
- SQL types
- callables
- relationship intelligence
- document semantic model

?

High reuse is preferred.

---

## 63. Reliability

Can the feature be implemented:

- deterministically
- with public APIs
- with bounded uncertainty
- without fragile hooks

?

---

## 64. Performance

Will it remain practical on very large ERP schemas?

---

## 65. Maintenance cost

Does it introduce:

- a large subsystem
- native binaries
- complex authentication
- persistent storage
- external APIs
- high compatibility burden
- substantial dependency trees

?

If so, the user value must justify it.

---

## 65.1 Dependency and licensing cost

When a feature requires a new third-party dependency, consider:

- technical value
- maintenance status
- project health
- dependency-tree size
- security exposure
- binary/platform complexity
- license
- notice obligations
- redistribution implications
- compatibility with Query Puppy's approved `GPL-3.0-only` distribution model

A dependency is not free merely because `npm install` is easy.

Prefer mature, appropriately licensed software with clear provenance.

---

## 66. Product boundary

Does the feature improve semantic SQL development?

Or does it drift toward rebuilding the database workbench?

The former is preferred.

---

## 67. Explainability

For semantic ranking, diagnostics, and relationship inference:

Can Query Puppy explain why it produced the result?

If not, reconsider the feature design.

---

## 67.1 Portability impact

For new foundational architecture, consider:

> Does this change introduce an unnecessary T-SQL assumption into infrastructure that could reasonably remain reusable?

If yes, improve the boundary.

Do not use this question to force genuinely T-SQL-specific behavior into artificial abstractions.

---

# PART XV — TIME-SENSITIVE EXTERNAL FACTS

## 68. Facts that must be periodically reverified

Do not assume these facts forever:

- current repository/package version
- current Marketplace-published version
- current mssql version
- Connection Sharing retirement timeline
- official successor API
- status of microsoft/vscode-mssql#22819
- stable `@vscode/vsce` OIDC support
- Marketplace publishing requirements
- mssql formatter capabilities
- mssql query-history capabilities
- mssql connection-group behavior
- mssql public extension APIs
- VS Code/VSCodium public language APIs
- SQL Server authentication behavior
- relevant SQL Server version/compatibility behavior
- licensing of third-party dependencies when upgraded
- redistribution requirements of bundled runtimes/drivers
- Marketplace/Open VSX requirements relevant to future separate dialect products
- current project license-transition state
- licensing and redistribution obligations of third-party dependencies and bundled artifacts
- availability of exact Corresponding Source for each GPL release

Verify them when they materially affect a decision.

---

## 69. Important external sources

Primary technical sources include:

```text
https://github.com/microsoft/vscode-mssql
https://github.com/microsoft/vscode-mssql/issues/22819
https://marketplace.visualstudio.com/items?itemName=ms-mssql.mssql
https://github.com/microsoft/vscode-vsce
https://code.visualstudio.com/api
https://github.com/beardedpuppylabs/Query-Puppy-for-T-SQL
https://marketplace.visualstudio.com/items?itemName=BeardedPuppyLabs.query-puppy-for-t-sql
```

For dependency licensing, prefer:

- the upstream project's repository
- the distributed package's declared license metadata
- included LICENSE / NOTICE files
- SPDX identifiers where available

Prefer authoritative upstream information over third-party summaries.

---

# PART XVI — CURRENT STRATEGIC SUMMARY

## 70. Where Query Puppy stands

Query Puppy has moved beyond being an autocomplete experiment.

Its most valuable asset is the reusable semantic T-SQL engine underneath completion.

The project should now evolve in four complementary directions.

### 1. Protect the foundation

Connection Resilience Stage 1 is complete.

Preserve the capability-oriented backend boundary and independently replaceable connection-context and metadata capabilities while reducing remaining risk from mssql Connection Sharing retirement.

---

### 2. Expand the semantic model

Move beyond:

```text
Relationship = declared foreign key
```

toward:

```text
Relationship Intelligence
=
declared metadata
+
developer-confirmed knowledge
+
learned query evidence
+
conservative heuristic candidates
```

with explicit provenance and confidence.

---

### 3. Exploit the semantic foundation

Use the existing engine for:

- navigation
- diagnostics
- Quick Fixes
- relationship discovery
- join paths
- safe refactoring
- explainable SQL generation

rather than continually concentrating value only in completion.

---

### 4. Preserve fork-ready dialect potential

Query Puppy for T-SQL remains a T-SQL product.

Do not turn it into a generic multi-dialect extension.

At the same time, avoid unnecessary coupling that would force a future Query Puppy for PostgreSQL or Query Puppy for MySQL to dismantle T-SQL-specific assumptions from otherwise reusable infrastructure before a port can begin.

The target model is:

> A family of separate dialect-specific Query Puppy products sharing only infrastructure proven reusable by real implementations.

Not:

> One universal SQL product with dialect switches.

---

### 5. Preserve software freedom and sustainable independence

The active release license from version 0.12.6 is `GPL-3.0-only`.

Keep commercial use permitted while using strong copyleft to preserve the GPL freedoms and source obligations that apply when covered versions are conveyed or distributed.

Fund development, where useful, through voluntary sponsorship rather than paid feature gates, proprietary editions, seat licensing, or sponsor-controlled roadmap commitments.

---

## 71. Strategic restraint

Do not respond to Connection Sharing retirement by building an entire SQL client.

Do not respond to missing foreign keys by blindly guessing relationships.

Do not respond to future dialect ideas by building a universal SQL framework prematurely.

Do not respond to feature competition by copying every checkbox from commercial tools.

Do not generalize architecture for hypothetical futures.

Do not introduce third-party dependencies or copied external material before verifying provenance, license, `GPL-3.0-only` compatibility, redistribution obligations, and required notices.

Do not describe GPL as non-commercial or as prohibiting sale, forks, or private/internal modification.

Do not let sponsorship buy features, support obligations, roadmap priority, proprietary rights, governance, or technical control.

Build where Query Puppy has structural advantage:

- deep T-SQL semantics
- real database metadata
- query-aware understanding
- relationship intelligence
- type awareness
- deterministic behavior
- explainability
- native editor integration
- strong performance on enormous schemas
- local-first behavior
- responsible FLOSS reuse
- open-source availability

---

## 72. Long-term product thesis

Query Puppy already understands bounded, provenance-aware knowledge from developers
and real local SQL usage in addition to what SQL Server explicitly declares. It should
deepen that understanding conservatively.

It should distinguish those sources rather than pretending they are equally certain.

For well-designed databases, declared metadata should produce excellent intelligence immediately.

For imperfect ERP and legacy databases, Query Puppy should progressively build an explainable local semantic model that makes the schema easier to understand and use.

The architecture should also be strong enough that the proven Query Puppy approach can later be applied to additional database dialects without requiring a foundational rewrite.

Shared architecture should emerge from real reuse.

Dialect-specific behavior should remain honest and explicit.

Open-source dependencies that help make Query Puppy possible should receive the attribution and license treatment their authors and licenses deserve.

The project should remain freely available for personal and commercial use while sustaining independent development through voluntary support rather than paid feature access.

---

## 73. FLOSS and copyleft principle

Query Puppy is free and open-source software.

Query Puppy version 0.12.6 and subsequent versions use `GPL-3.0-only`. Officially published releases through 0.12.5 remain available under their original MIT terms.

The project benefits from the open-source ecosystem and should participate in that ecosystem responsibly.

Therefore:

- respect upstream licenses;
- preserve required notices and source obligations;
- credit deliberately used third-party libraries;
- verify GPL-3.0-only compatibility before adopting new external material;
- keep attribution discoverable;
- avoid disguising upstream work as Query Puppy's own;
- keep redistributed software legally and technically understandable;
- preserve an exact source-to-release-artifact mapping for GPL releases;
- describe GPL permissions and obligations accurately.

Strong copyleft is intended to preserve software freedoms for redistributed covered versions, not to prohibit commercial use.

FLOSS is not merely a distribution label for Query Puppy. It is a responsibility toward users, contributors, and the projects on which Query Puppy builds.

---

## 74. Sustainability principle

Query Puppy does not sell access to software features.

The project may receive voluntary individual or organizational sponsorship to support development time, infrastructure, project costs, and development tools.

Sponsorship does not buy features, support/SLA commitments, roadmap priority, sponsor-exclusive functionality, proprietary license rights, governance rights, or influence over technical decisions.

The goal is sustainable independent development rather than revenue maximization.

---

## 75. Mission

> Make native T-SQL development in Visual Studio Code and VSCodium intelligent, productive, and reliable enough that commercial SQL coding-assistance tools become unnecessary for many SQL Server developers.

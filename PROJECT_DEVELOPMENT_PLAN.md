# Query Puppy for T-SQL — Central Development Plan

**Status:** 2026-08-28  
**Current repository/package version:** 0.12.2  
**Project:** Bearded Puppy Labs / Query Puppy for T-SQL  
**License:** MIT

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

As of repository/package version 0.12.2, Query Puppy already has a substantial semantic engine.

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
- automatic semantic completion after JOIN ... ON whitespace
- relationship-aware ranking based on declared FKs
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

Historically, Relationship Intelligence has primarily meant declared SQL Server foreign keys.

That is no longer sufficient as the long-term model.

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

> Query Puppy must evolve from declared-FK intelligence into provenance-aware Relationship Intelligence.

Declared foreign keys remain the strongest source of relationship truth.

They are no longer the only possible source of relationship evidence.

---

## 8.2 Relationship evidence model

The long-term relationship model must distinguish relationship provenance explicitly.

At minimum, it should be capable of representing conceptual sources such as:

```text
DeclaredForeignKey
ProjectDefined
UserConfirmed
LearnedFromQuery
HeuristicCandidate
```

Exact type names are an implementation decision.

The important requirement is that provenance and confidence remain explicit.

---

## 8.3 Confidence model

Relationship confidence should conceptually distinguish levels such as:

```text
Authoritative
Confirmed
StrongEvidence
Candidate
```

The exact representation is an implementation decision.

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

Query Puppy should eventually support explicit logical relationships that are not declared in SQL Server.

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

A developer should eventually be able to confirm such a relationship once.

After confirmation it becomes a persistent logical relationship for an appropriate scope such as:

- project
- workspace
- server/database identity
- another future configuration boundary justified by real requirements

The exact persistence scope must be designed deliberately.

---

## 8.6 User confirmation as promotion

A relationship candidate may be promoted by explicit user action.

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

Users should be able to inspect why Query Puppy proposed a relationship before confirming it.

---

## 8.7 Learned relationships from SQL

Existing SQL written by the developer is an important future evidence source.

For example, repeated observations of:

```sql
JOIN PreislistenArtikel pa
  ON pa.Mandant = p.Mandant
 AND pa.ListeID = p.ID
```

between the same resolved physical objects provide evidence of a logical relationship.

Query Puppy may eventually observe and aggregate such usage.

Possible evidence may include:

- resolved source table
- resolved target table
- column-pair mapping
- composite predicate structure
- direction
- observation count
- recency
- source provenance
- user confirmation state

Repeated use increases evidence.

Repeated use does not automatically make a relationship authoritative.

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

Heuristics are permitted only as conservative candidate generation.

A heuristic relationship must never masquerade as:

- a declared FK
- a confirmed project relationship
- an authoritative fact

Possible evidence inputs may eventually include:

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

Completion and future UI should not visually imply equal certainty.

Potential presentation might eventually use labels such as:

```text
FK
Confirmed
Learned
Suggested
```

Exact wording is a UX decision.

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

Relationship Intelligence should use one canonical relationship model and one graph infrastructure.

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
        +-- Learned-query source
        +-- Heuristic source
        |
        v
Canonical Relationship Model
        |
        v
Relationship Graph
        |
        +-- Completion
        +-- Ranking
        +-- Discovery
        +-- JOIN generation
        +-- Diagnostics
        +-- Navigation
```

Evidence sources may be pluggable.

The graph remains canonical.

---

## 8.16 Relationship ranking

Relationship ranking must consider provenance before secondary heuristics.

Conceptually:

```text
Declared FK
    >
User-confirmed
    >
Strong learned evidence
    >
Heuristic candidate
```

Exact ordering may evolve.

Do not allow a high heuristic score to silently outrank contradictory authoritative metadata.

Within equivalent confidence levels:

- remain deterministic
- prefer explainable ranking
- retain stable alphabetical or canonical fallback ordering

---

## 8.17 Relationship persistence

Persistence should be introduced only when a real first persistent relationship source requires it.

Likely first persistent data:

- user-confirmed relationships
- project-defined relationships

Possible later persistent data:

- learned observations
- evidence counts
- rejection/suppression decisions

Do not build an oversized generic relationship database before the first use case requires it.

---

## 8.18 Relationship rejection

Future inference UX should consider explicit rejection.

If Query Puppy repeatedly suggests an incorrect logical relationship, the user should eventually be able to suppress or reject it.

A rejection may itself be useful evidence.

Do not implement this before candidate generation exists.

Design persistence so this can be added without replacing the entire model.

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

Before aggressive heuristic JOIN suggestions, generalize the relationship architecture.

Execution order:

1. define provenance-aware canonical relationship model;
2. preserve current declared-FK behavior;
3. ensure the existing relationship graph can represent additional relationship provenance;
4. add confidence/provenance contracts;
5. add focused migration/regression tests;
6. introduce persistence boundary only where needed;
7. avoid actual heuristic suggestion changes until the model is stable.

The first implementation slice should preferably change architecture without changing user-visible declared-FK behavior.

When this phase begins, synchronize repository-level FK-only architecture instructions such as `AGENTS.md` and relevant architecture documentation so they preserve the rule:

> Never invent a foreign key.

while also allowing explicitly non-FK relationship sources with provenance and confidence.

---

## 13. P1 — Project-defined relationships

After the canonical model is stable, implement explicit logical relationships.

Initial scope should favor reliability over automation.

Goals:

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

After explicit relationships are stable, investigate local learning from real SQL JOIN predicates.

Start conservatively.

Potential stages:

1. parse already-resolved JOIN predicates;
2. normalize aliases to canonical table/column identities;
3. detect repeated table-pair/column-pair patterns;
4. aggregate evidence locally;
5. offer learned candidates;
6. require confirmation before promotion where appropriate.

Do not automatically convert observation frequency into authoritative truth.

---

## 15. P1 — Heuristic relationship candidates

Only after provenance and confirmation infrastructure exist should schema heuristics become user-visible.

Heuristic inference may combine multiple signals.

Requirements:

- conservative candidate generation
- explainable evidence
- explicit Candidate status
- no name-only inference
- no PK-name-only inference
- composite-key awareness
- type compatibility
- deterministic ranking
- suppression when stronger contradictory evidence exists
- no invented FK metadata

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

Once Relationship Intelligence supports multiple evidence sources, expose it as a user workflow.

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

Heuristic relationship candidates should be clearly weaker than confirmed or declared relationships.

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

There must still be one canonical relationship representation consumed by the relationship graph.

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

## 40.1 Third-party attribution and license hygiene

Query Puppy is FLOSS and benefits from the work of other open-source projects.

The project should explicitly acknowledge third-party libraries it deliberately uses.

Third-party attribution is both:

- a compliance responsibility; and
- a matter of proper open-source credit.

Third-party material included in a distributed Query Puppy artifact must retain all:

- copyright notices
- attribution notices
- license notices
- required license texts
- other redistribution notices

required by the applicable license.

Use SPDX license identifiers where available.

Examples include:

```text
MIT
Apache-2.0
BSD-2-Clause
BSD-3-Clause
ISC
```

Do not silently introduce a dependency whose license status is unknown.

---

## 40.2 THIRD_PARTY_NOTICES.md

Maintain the repository-level file:

```text
THIRD_PARTY_NOTICES.md
```

as Query Puppy's central human-readable third-party attribution and license inventory.

All deliberately used direct third-party libraries should be identified there.

Distinguish at least where applicable:

### Runtime / distributed dependencies

Third-party software shipped as part of the Query Puppy VSIX or otherwise redistributed with the product.

These entries require particular attention because redistribution obligations apply directly to released artifacts.

### Development / build dependencies

Directly used third-party development and build libraries should also be acknowledged so the projects Query Puppy deliberately depends on receive visible credit.

Do not manually reproduce a huge transitive development dependency tree merely as a courtesy list.

---

## 40.3 Distributed transitive dependencies

License responsibility is not limited to dependencies explicitly imported by Query Puppy.

If a dependency bundles or introduces other third-party material into the distributed VSIX, those components may also require attribution.

Therefore:

> Identify third-party material actually redistributed as part of the extension, not merely direct entries in `package.json`.

Dependency-tree structure alone does not determine notice requirements.

The packaged artifact is the relevant redistribution boundary.

---

## 40.4 Standard libraries and platform APIs

Do not create individual project acknowledgements for ordinary standard/platform functionality such as:

- JavaScript language built-ins
- Node.js built-in modules
- TypeScript language constructs
- normal VS Code/VSCodium public API usage
- comparable standard runtime libraries

Third-party packages, embedded runtimes, drivers, parser libraries, bundled binaries, and similar external components must be evaluated separately.

---

## 40.5 External extension integrations

An external extension that Query Puppy depends on or integrates with is not automatically a redistributed third-party component.

For example, Microsoft mssql may be:

- an extension dependency
- an integration dependency
- a separately installed product

without its source code being bundled into Query Puppy's VSIX.

Such integrations should still be acknowledged appropriately in:

- README
- documentation
- integration descriptions
- acknowledgements where useful

but must not be represented as bundled third-party software unless Query Puppy actually redistributes its code or assets.

---

## 40.6 Dependency changes are compliance changes

When adding, removing, replacing, or materially upgrading a third-party dependency:

1. verify the dependency's license;
2. identify whether it or relevant transitive components are redistributed;
3. determine required copyright/notice obligations;
4. update `THIRD_PARTY_NOTICES.md`;
5. verify compatibility with Query Puppy's distribution model and MIT licensing;
6. include the dependency and notice changes in the same coherent change.

Do not defer license review until release day.

---

## 40.7 License review triggers

Dependencies with familiar permissive licenses may normally be straightforward, subject to their notice requirements.

The following require explicit review rather than automatic acceptance:

- unknown or missing license
- custom/non-standard license
- GPL-family licenses
- AGPL
- LGPL
- SSPL
- source-available licenses
- non-commercial restrictions
- field-of-use restrictions
- unusual attribution obligations
- dependencies bundling native or proprietary binaries
- dependencies with unclear transitive licensing

This does not mean every such dependency is automatically prohibited.

It means the implications must be understood before adoption.

---

## 40.8 Automated license verification

As the dependency footprint grows, automate as much license inventory and compliance verification as practical.

A future CI/release check may:

```text
dependency change
        ↓
license inventory
        ↓
known / approved?
        |
        +-- yes → continue
        |
        +-- no / unusual → explicit review
```

Automation should assist human review rather than blindly declaring legal compatibility.

Do not introduce heavy compliance infrastructure before the dependency footprint justifies it.

---

## 40.9 FLOSS credit principle

Where Query Puppy materially benefits from another open-source project, credit should be easy to find rather than hidden only in machine-generated dependency metadata.

The project should give visible recognition to upstream work where appropriate.

This principle applies without overstating relationships, endorsement, or ownership.

---

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

### Remaining Phase A work

1. finish push-driven release automation;
2. synchronize `AGENTS.md` and `docs/PUBLISHING.md` when the automated release process is implemented;
3. continue tracking mssql issue #22819;
4. establish `THIRD_PARTY_NOTICES.md`;
5. inventory current direct third-party libraries;
6. inventory third-party material redistributed in the VSIX;
7. verify applicable licenses and required notices;
8. ensure release packaging retains required notices.

License automation may be added later when the dependency footprint justifies it.

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

1. Inspect current FK relationship representation.
2. Define provenance-aware canonical relationship model.
3. Preserve existing FK semantics unchanged.
4. Integrate confidence/provenance into the graph.
5. Ensure existing JOIN generation remains stable.
6. Add relationship provenance regression tests.
7. Establish persistence boundary without premature storage infrastructure.
8. Synchronize FK-only repository guidelines and architecture docs with the new provenance-aware model without weakening the rule that real FKs must never be fabricated.

---

## 50. Phase D — Explicit relationship intelligence

1. Project-defined relationships.
2. User-confirmed relationships.
3. Composite virtual relationships.
4. Persistence.
5. Loading into canonical graph.
6. Presentation of provenance.

This phase should produce immediate value on databases without declared FKs.

---

## 51. Phase E — Learned and inferred relationship intelligence

1. Learn resolved JOIN predicates locally.
2. Normalize observed relationships.
3. Aggregate evidence.
4. Present learned candidates.
5. Add confirmation workflow.
6. Add conservative heuristics.
7. Add explanation.
8. Add rejection/suppression later as needed.

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
- compatibility with Query Puppy's FLOSS distribution model

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

## 71. Strategic restraint

Do not respond to Connection Sharing retirement by building an entire SQL client.

Do not respond to missing foreign keys by blindly guessing relationships.

Do not respond to future dialect ideas by building a universal SQL framework prematurely.

Do not respond to feature competition by copying every checkbox from commercial tools.

Do not generalize architecture for hypothetical futures.

Do not introduce third-party dependencies without understanding their maintenance and licensing implications.

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

Query Puppy should eventually understand not only what SQL Server explicitly declares, but also what developers and real SQL usage reveal about the schema.

It should distinguish those sources rather than pretending they are equally certain.

For well-designed databases, declared metadata should produce excellent intelligence immediately.

For imperfect ERP and legacy databases, Query Puppy should progressively build an explainable local semantic model that makes the schema easier to understand and use.

The architecture should also be strong enough that the proven Query Puppy approach can later be applied to additional database dialects without requiring a foundational rewrite.

Shared architecture should emerge from real reuse.

Dialect-specific behavior should remain honest and explicit.

Open-source dependencies that help make Query Puppy possible should receive the attribution and license treatment their authors and licenses deserve.

---

## 73. FLOSS principle

Query Puppy is free and open-source software under the MIT license.

The project benefits from the open-source ecosystem and should participate in that ecosystem responsibly.

Therefore:

- respect upstream licenses;
- preserve required notices;
- credit deliberately used third-party libraries;
- keep attribution discoverable;
- avoid disguising upstream work as Query Puppy's own;
- prefer transparent dependency choices;
- keep redistributed software legally and technically understandable.

FLOSS is not merely a distribution license for Query Puppy.

It is also a responsibility toward the projects on which Query Puppy builds.

---

## 74. Mission

> Make native T-SQL development in Visual Studio Code and VSCodium intelligent, productive, and reliable enough that commercial SQL coding-assistance tools become unnecessary for many SQL Server developers.

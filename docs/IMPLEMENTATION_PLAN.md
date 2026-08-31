# Implementation plan

## Purpose and authority

This document records milestone planning, implementation history, completed work,
release-specific verification state, and deliberately deferred work.

The repository-root `PROJECT_DEVELOPMENT_PLAN.md` owns product strategy, roadmap
direction, versioning policy, and cross-cutting engineering principles. This document
must not replace or redefine that strategic authority.

It is useful for understanding how the project evolved.

It is not the authoritative source for current architecture.

For current design contracts, use:

- [Architecture](ARCHITECTURE.md)
- [Completion Pipeline](COMPLETION_PIPELINE.md)
- [SQL Type System](TYPE_SYSTEM.md)
- [Testing Strategy](TESTING.md)

Historical milestone notes may describe implementation details that were accurate at
that milestone and later superseded.

When historical text conflicts with the current architecture documents, the current
architecture documents describe the intended present-day design.

## Current milestone status

- 0.10 initial built-in function intelligence — complete
- 0.11 persistent schema metadata cache and stabilization — complete
- 0.12 broader T-SQL language intelligence — complete; manual acceptance passed
- 0.12.1 repository, contributor, security, CI, and release hygiene — complete
- 0.12.2 daily-workflow stabilization — complete; manual acceptance pending
- P0 connection-resilience stage 1 — complete; backend-neutral boundary in place
- Relationship Intelligence Phase C foundation — complete; declared-FK production
  behavior preserved
- P1 statement-scope and alias-qualified insertion stabilization — complete
- P1 semantic ownership, wildcard, and local-variable stabilization — complete
- Relationship Intelligence Phase D ProjectDefined relationships — complete
- Relationship Intelligence Phase D UserConfirmed save workflow — complete
- Relationship Intelligence Phase E1 local learned JOIN evidence acquisition —
  complete
- Relationship Intelligence Phase E1 persisted occurrence-dedupe hardening —
  complete; counts survive editor/extension lifecycle noise
- Relationship Intelligence Phase E2 learned relationship candidate policy —
  complete; qualifying local evidence enters the canonical runtime graph
- Relationship Intelligence Phase E3 conservative heuristic JOIN candidates —
  complete; bounded fallback applies only to already-selected physical pairs
- Phase F1 document-local semantic symbol/reference foundation — complete; native
  navigation, symbols, highlights, rename, and diagnostics remain future consumers
- 0.12.6 GPL-3.0-only repository compliance — complete

0.12.6 completes Phase E3 by adding zero-or-one conservative
HeuristicCandidate/Candidate predicate for an already-selected physical table pair.
The pure policy requires one complete unfiltered target PK/UQ, known compatible types,
an exact target-aware object-plus-key name, a complete unambiguous mapping, and no
stronger relationship for the pair. It reuses the canonical Relationship and JOIN
renderer without entering the global graph, persistence, table discovery, or ranking.
Completion acceptance remains non-confirming; the existing explicit save-JOIN action
is the only promotion path to UserConfirmed project truth. Navigation & Code
Understanding remains a larger forward-roadmap area.

The 0.12.6 compliance slice established the official GPLv3 license text, package
metadata, third-party inventory, bundle/VSIX audit, public documentation, and the
release requirement for immutable source/tag/artifact traceability.

## Phase F1 — document-local semantic symbol/reference foundation

- [x] Add declaration-derived identities, exact offset ranges, kinds, and controlling
      scopes for CTEs, written RowSource aliases, scalar local variables, table
      variables, and deterministic temporary-table uses.
- [x] Bind CTE and alias references through the existing RowSource and QueryScope
      model, including chained CTEs, shadowing, legal correlation, APPLY visibility,
      and sibling isolation.
- [x] Preserve standalone `GO` batch ownership for scalar/table variables and leave
      unresolved or ambiguous occurrences unbound.
- [x] Keep the index editor-neutral, local-only, non-persistent, and free of catalog,
      filesystem, backend, relationship, and VS Code provider dependencies.
- [x] Add focused positive and negative semantic identity/reference contracts.

Projection aliases remain deferred because their current completion representation
does not retain reliable declaration/reference identity.

## Phase G1 — document-local Go to Definition / Peek Definition

- [x] Register a native Definition Provider for Query Puppy's SQL document selector.
- [x] Resolve CTE, explicit row-source alias, scalar local-variable, table-variable,
      and deterministic temporary-table occurrences through the existing
      `DocumentSemanticSymbolIndex`.
- [x] Return same-document declaration-token ranges without catalog, filesystem,
      backend, relationship, or persistence I/O.
- [x] Return no definition for unresolved, ambiguous, unsupported, physical-database,
      cross-document, or projection-alias occurrences.
- [x] Add semantic helper, provider-registration, and Extension Host coverage.

## Phase G2 — document-local Find References

- [x] Register a native Reference Provider for Query Puppy's SQL document selector.
- [x] Resolve declaration and reference invocation through the existing
      `DocumentSemanticSymbolIndex` identity and reference APIs.
- [x] Honor `ReferenceContext.includeDeclaration`, preserve document-offset order,
      and return only same-document locations.
- [x] Keep unresolved, ambiguous, unsupported, physical-database, cross-document,
      and projection-alias occurrences outside reference results.
- [x] Add semantic, provider-contract, direct-provider, and activated Extension Host
      coverage without a live SQL Server dependency.

## Phase G3 — document-local Document Highlights

- [x] Register a native Document Highlight Provider for Query Puppy's SQL document
      selector.
- [x] Reuse supported navigation target resolution and semantic symbol occurrence
      assembly for declaration/reference invocation.
- [x] Return declaration and bound references once each in document-offset order
      using `DocumentHighlightKind.Text` without inventing read/write analysis.
- [x] Keep unresolved, ambiguous, unsupported, physical-database, cross-document,
      and projection-alias occurrences outside highlight results.
- [x] Add semantic, provider-contract, direct-provider, and activated Extension Host
      coverage without a live SQL Server dependency.

Document Symbols/Outline, semantic Rename, and Diagnostics remain future Phase G
consumers.

## Relationship Intelligence Phase D — ProjectDefined

- [x] Add one source-controlled, versioned workspace relationship file at
      `.query-puppy/relationships.json` with native JSON schema support.
- [x] Validate endpoint identity, ordered mappings, duplicates, known incompatible
      types, and current same-database applicability against canonical metadata.
- [x] Resolve valid definitions as ProjectDefined/Confirmed canonical relationships
      without fabricating physical FK details.
- [x] Overlay project relationships after SQL snapshot hydration/refresh and keep
      them out of physical metadata persistence.
- [x] Deduplicate exact logical edges with authoritative declared-FK precedence while
      retaining distinct mappings between the same object pair.
- [x] Admit ProjectDefined relationships to existing JOIN predicates, comparison
      tie-breaking, and related RowSource ranking below declared FKs.
- [x] Add project-scoped caching, native file-watcher invalidation, multi-root
      isolation, safe no-workspace behavior, and an open/create command.
- [x] Add model/config/graph/ranking/JOIN/cache/provider/Extension Host contracts and
      user/developer documentation.

## Relationship Intelligence Phase D — UserConfirmed JOIN save

- [x] Add a reusable resolved-JOIN candidate with two canonical physical endpoints
      and deterministic ordered mappings.
- [x] Add the native **Save JOIN as Query Puppy relationship** Code Action for strict
      equality-only `AND` predicates, including meaningful self-joins.
- [x] Determine direction from an unfiltered PK/UQ only when unique; otherwise use a
      minimal native direction Quick Pick.
- [x] Extend version 1 with optional `projectDefined`/`userConfirmed` provenance while
      preserving absent provenance as ProjectDefined.
- [x] Reuse the existing workspace store, watcher, validation, overlay, canonical graph,
      JOIN generation, deduplication, and multi-root ownership boundaries.
- [x] Admit UserConfirmed/Confirmed with explicit trust order below declared FKs and
      above ProjectDefined, without fabricating FK metadata.
- [x] Add unit/provider/contract/activated Extension Host coverage for eligibility,
      persistence, cache reload, reuse, duplicates, safety, and presentation.

No automatic learning, heuristics, query/plan mining, rejection, multi-hop discovery,
relationship editor, or release automation is part of this slice.

## Relationship Intelligence Phase E1 — local learned JOIN evidence

- [x] Reuse the UserConfirmed resolved-JOIN semantic candidate for document-wide,
      equality-only physical JOIN acquisition; do not add another JOIN parser.
- [x] Normalize aliases, operand orientation, identifier casing/quoting, composite
      term order, canonical endpoints, and mappings into one stable evidence identity.
- [x] Skip passive observations with ambiguous direction instead of interrupting the
      editor or guessing.
- [x] Observe only active workspace SQL documents on save and only from already-loaded
      metadata; never write per keystroke or initiate catalog access for learning.
- [x] Count each distinct occurrence-count increase once while preventing completion,
      repeated-save, and unrelated-edit inflation.
- [x] Persist format-version-1 evidence under extension-managed workspace storage with
      atomic serialized writes, multi-root isolation, corruption refusal, and a 4,096
      unique-mapping bound.
- [x] Store only canonical endpoints, ordered mappings, and observation counts; retain
      no SQL text, literals, aliases, filenames, source positions, credentials,
      connection strings, timestamps, confidence scores, or histories.
- [x] Skip and remove exact evidence already represented by a declared FK,
      UserConfirmed relationship, or ProjectDefined relationship.
- [x] Add a default-enabled opt-out setting and a confirmed native clear command scoped
      to the active workspace folder.
- [x] Keep learned evidence outside `Relationship`, `DatabaseIndex`, completion,
      relationship-aware ranking, diagnostics, navigation, and all UI presentation.
- [x] Add focused model/store/privacy/count/bounds tests plus an activated disposable
      multi-root save/reuse/exclusion workflow.

Phase E1 defines no observation threshold, LearnedFromQuery candidate, confirmation
prompt, heuristic, rejection state, Query Store/plan-cache mining, or remote service.

### 0.12.4 Phase E1 occurrence-dedupe hardening

- [x] Move unchanged-occurrence deduplication from an editor-lifetime snapshot into the
      serialized workspace-store transaction.
- [x] Identify a document by SHA-256 of its normalized workspace-relative identity and
      a relationship by SHA-256 of its canonical semantic identity.
- [x] Distinguish multiple equivalent JOINs by zero-based source-order ordinal while
      ignoring formatting, aliases, quoting, term order, and absolute offsets.
- [x] Preserve dedupe across close/reopen and recreated store/extension state; keep
      saved-absence/reintroduction behavior historical and deterministic.
- [x] Upgrade valid format-version-1 stores to version 2 without losing observation
      counts; fail safely for malformed or future formats.
- [x] Bound seen occurrences at 16,384 using oldest-insertion eviction with canonical
      tie-breaking, independently of the 4,096 relationship-evidence bound.
- [x] Serialize concurrent saves so the same racing occurrence counts once and distinct
      document occurrences remain independent.
- [x] Make clear reset both evidence and dedupe state; disabling learning mutates
      neither collection.
- [x] Preserve local-only privacy and the complete separation from production
      relationships, completion, ranking, diagnostics, and navigation.

Eviction can allow a very old occurrence to count again if later encountered. A
version-1 store can also count the first eligible saved occurrence once because that
format had no persisted occurrence identity. These are explicit bounded/backward-
compatibility tradeoffs, not candidate confidence policy.

## Relationship Intelligence Phase E2 — learned candidate policy

- [x] Add one pure product-owned candidate threshold at `observationCount >= 3` with no
      user setting, score model, decay, recency, or rejection state.
- [x] Re-resolve qualifying endpoint objects, ordered columns, same-database scope, and
      known type compatibility against current canonical metadata; fail closed for
      stale or invalid evidence.
- [x] Materialize valid evidence as LearnedFromQuery/StrongEvidence canonical
      relationships carrying the aggregate observation count and no FK details.
- [x] Overlay learned candidates into the existing `DatabaseIndex` graph after physical
      and project relationships; do not create a parallel graph or persist candidates
      in physical snapshots/project files.
- [x] Apply deterministic trust order: declared FK, UserConfirmed, ProjectDefined,
      LearnedFromQuery. Suppress exact learned duplicates represented by a stronger
      source while retaining distinct mappings between the same objects.
- [x] Reuse existing JOIN predicate, comparison tie-break, and related-RowSource ranking
      consumers for single, composite, reverse, and meaningful self relationships.
- [x] Present **Learned relationship JOIN** with endpoint/mapping documentation,
      repeated-JOIN provenance, observation count, StrongEvidence confidence, and an
      explicit non-FK statement.
- [x] Keep completion acceptance non-confirming and reuse the explicit save-JOIN Code
      Action to promote a resolved edge to UserConfirmed project knowledge.
- [x] Cache overlays by workspace, evidence identity, and base-index identity; invalidate
      on evidence/clear, project relationship, or metadata changes with no catalog or
      disk parse in CandidateFactory.
- [x] Define disabling learning as acquisition-only: existing qualifying candidates
      remain visible; clear removes learned candidates on the next completion.
- [x] Add policy, graph, provider-contract, presentation, cache, multi-root, clear,
      promotion, and activated Extension Host regressions at counts 2, 3, and 8.

Phase E2 does not add heuristics, guessed name/type relationships, remote services,
Query Store/plan-cache/query-history mining, confidence scoring, rejection learning,
automatic confirmation, a relationship editor, or navigation.

## Relationship Intelligence Phase E3 — conservative heuristic JOIN candidates

- [x] Add one pure pair-bounded policy receiving two already-resolved physical tables;
      never parse SQL, scan all object pairs, query metadata, or access persistence.
- [x] Require exactly one complete primary key, unfiltered unique constraint, or
      unfiltered unique-index mapping on the target side.
- [x] Require known compatible normalized SQL types for every mapping and at least one
      exact target-object-plus-key-column source name, with only a narrow trailing-`s`
      target variant.
- [x] Allow same-name ERP tenant/context columns only to complete a composite target key
      beside target-aware evidence; never infer from same names/types/keys alone.
- [x] Fail closed for incomplete/stale/unknown/filtered metadata, multiple qualifying
      keys, multiple target-aware assignments, both qualifying directions, self pairs,
      and multiple heuristic relationships for a pair.
- [x] Suppress heuristic fallback whenever any declared FK, UserConfirmed,
      ProjectDefined, or LearnedFromQuery relationship already connects the pair.
- [x] Materialize HeuristicCandidate/Candidate with structured evaluated evidence and
      no physical FK details, then reuse the existing predicate renderer.
- [x] Present **Heuristic relationship JOIN**, Candidate confidence, mappings, evidence,
      non-FK status, and insertion-only/non-persistent acceptance.
- [x] Keep heuristics outside DatabaseIndex overlays, metadata/project/evidence storage,
      object discovery/ranking, comparison ranking, navigation, diagnostics, and
      multi-hop paths.
- [x] Reuse **Save JOIN as Query Puppy relationship** for explicit promotion to
      UserConfirmed; add no automatic confirmation or second workflow.
- [x] Add positive PK/UQ/composite, mandatory false-positive, ambiguity, stronger-source,
      no-persistence, source-boundary, provider, presentation, and activated Extension
      Host promotion coverage.

Phase E3 does not add global relationship/table discovery, heuristic source ranking,
fuzzy or AI matching, settings/scores, rejection persistence, Query Store/plan-cache
mining, cross-database inference, self-relationship heuristics, navigation, diagnostics,
or multi-hop paths.

## P0 Connection Resilience Stage 1

- [x] Define backend-neutral active connection and metadata contracts for the
      current Query Puppy metadata needs.
- [x] Keep connection-context discovery and metadata transport independently
      injectable so semantic consumers do not require one combined implementation.
- [x] Keep the active connection context limited to current cache/routing needs;
      do not retain speculative backend, provider, or server identity fields.
- [x] Isolate the current Microsoft mssql Connection Sharing API behind
      `MssqlConnectionSharingAdapter`.
- [x] Keep mssql extension lookup/API acquisition inside the adapter layer so the
      composition root constructs the concrete backend without handling mssql
      capabilities.
- [x] Move canonical catalog loading to the metadata layer so it consumes
      `MetadataBackend` rather than mssql-specific APIs or result types.
- [x] Keep Microsoft mssql responsible for connection profiles and
      authentication; no direct SQL Server backend, SecretStorage credentials, or
      connection UI is implemented.
- [x] Preserve existing persistent cache identity for the mssql adapter so
      existing 0.12.1 snapshots are not invalidated merely by the boundary
      refactor.
- [x] Add fake-backend boundary tests and focused mssql adapter tests for active
      context mapping, database enumeration, metadata query execution, retryable
      failures, and coalescing.
- [x] Add a deterministic source sentinel that rejects mssql implementation types,
      imports, and error terminology above the adapter boundary.

The direct SQL Server backend feasibility spike concluded that Tedious is viable only
as a limited fallback. No production direct backend exists, and current Connection
Sharing has not been removed.

## Relationship Intelligence Phase C foundation

- [x] Separate physical SQL Server `ForeignKeyMetadata` from the canonical semantic
      relationship model.
- [x] Add structured provenance for declared, project-defined, user-confirmed,
      learned-query, and heuristic-candidate relationships.
- [x] Add structured confidence with a discriminated model that makes declared FKs
      authoritative and prevents heuristic candidates from masquerading as physical
      FKs.
- [x] Convert every declared FK into one canonical relationship with ordered mappings
      and retained constraint ID/name, actions, disabled state, and trust state.
- [x] Rebuild one deterministic bidirectional relationship graph in `DatabaseIndex`
      and preserve one relationship instance across incoming/outgoing traversal.
- [x] Migrate JOIN predicates, relationship-aware source/member ranking, physical FK
      roles, and completion documentation to canonical relationship semantics.
- [x] Keep production suggestions restricted to enabled authoritative declared FKs;
      synthetic future provenances remain unit-model inputs only.
- [x] Preserve physical FK snapshot persistence and defer project relationship
      storage, evidence history, heuristics, learning, UI, and multi-hop paths to later
      phases.

## 0.12.2 daily-workflow stabilization

- [x] Make Smart Alias automatic completion resilient on the first legal
      whitespace and insert `AS <alias>` after a resolved RowSource or only the
      alias after an explicit `AS`.
- [x] Add automatic native Suggest activation after whitespace following
      `JOIN ... ON` when Query Puppy semantic expression candidates are available.
- [x] Preserve FK-only predicate generation: real relationships can produce ON
      predicates; unrelated tables still expose legal aliases and columns without
      fabricated predicates.
- [x] Add target-object completion for `UPDATE`, `INSERT INTO`, and `DELETE FROM`
      with Contains matching plus schema/database qualification.
- [x] Replace timing retries with one version/cursor-bound automatic completion
      lifecycle and verify the actual registered provider's post-edit domain.
- [x] Offer the `ON` continuation keyword after completed predicate-bearing JOIN
      sources while excluding CROSS JOIN and APPLY; keep Smart Alias first and ON
      second when the JOIN object is still unaliased.
- [x] Stop forcing native Suggest at blank DML target whitespace while preserving
      the Query Puppy target domain for Ctrl+Space and typed fragments.
- [x] Keep DML target-object completion separate from UPDATE SET target columns,
      assignment RHS expression completion, OUTPUT pseudo sources, DELETE alias
      behavior, and EXEC parameters.
- [x] Preserve the backend-neutral metadata boundary introduced by the P0
      connection-resilience stage.
- [x] Add parser/provider/Extension Host sentinels plus a focused manual
      acceptance suite for the repaired daily workflows.

This patch adds no navigation/code-understanding surface, custom UI, inferred
relationships, direct SQL backend, or new credential path.

The subsequent P1 semantic-correctness repair adds tokenizer-backed implicit
top-level SELECT boundaries so statement-local QueryScopes cannot leak when optional
semicolons are omitted. It also preserves explicit RowSource alias ownership through
column candidate insertion: unqualified expression completion inserts
`alias.column`, explicit member input does not duplicate the alias, and
syntax-restricted DML targets remain bare. No completion provider is scraped or
filtered.

The follow-up semantic stabilization generalizes implicit statement ownership to
the currently supported top-level SELECT/DML/EXEC forms, distinguishes standalone
GO batches from identifiers, restores wildcard expansion to the shared current
statement range, and adds typed batch-local scalar-variable completion through the
native `@` trigger. Table variables remain RowSources, INSERT ... SELECT and nested
query forms retain statement ownership, and Tab remains the only wildcard expansion
keybinding.

INSERT required/all-writable column-list generation remains a focused follow-up.
It must distinguish required writable columns from nullable/defaulted columns and
exclude identity, computed, generated, and rowversion columns; it is not part of
the trigger stabilization patch.

## 0.9.2 prefix-collision completion repair

- [x] Prevent smart-alias takeover from hiding longer legal Contains matches when
      the typed fragment is also an exact RowSource name.
- [x] Preserve complete identifier replacement, canonical RowSource binding,
      alias/member completion, FK JOIN intelligence, and secondary-database
      identity for prefix-related object families.
- [x] Add synthetic, provider, Extension Host, and read-only live-fixture
      regressions without changing matching or catalog loading.

## 0.10.0 SQL Server Built-in Function Intelligence

- [x] Add one immutable, indexed, version-aware static language catalog for the
      seven initial SQL Server built-ins.
- [x] Resolve built-ins through the shared ParsedCallSite and CallableSignature
      boundary used by catalog UDFs and TVFs.
- [x] Add expression completion, native Signature Help, family ExpectedType, and
      fixed/argument-derived/datatype-dependent scalar return rules.
- [x] Keep built-in resolution connection-independent and free of database I/O.
- [x] Cover catalog structure, provider ordering, qualification, nested calls,
      type inference, and native Extension Host behavior.

## 0.11.0 Persistent Schema Metadata Cache / Refresh Lifecycle

- [x] Persist versioned, secret-free canonical database snapshots in extension
      global storage and rebuild runtime `DatabaseIndex` structures on hydration.
- [x] Make cold loads visible and coalesce concurrent cold consumers.
- [x] Serve warm snapshots immediately while one first-session background refresh
      runs, then use a fixed 15-minute freshness-on-use threshold.
- [x] Preserve stale snapshots through full background refresh and atomically
      persist/swap only complete replacements.
- [x] Route manual refresh through the same per-database pipeline and retain a
      separately confirmed active-database cache-clear command.
- [x] Preserve lazy secondary-database scope, server/database isolation, read-only
      metadata access, static built-ins, and document-local semantic boundaries.
- [x] Cover round trips, warm/cold behavior, coalescing, failure, retry, freshness,
      corruption, format mismatch, secret exclusion, and hot-path behavior.

True incremental/delta synchronization, a configurable refresh interval, broader
Configurability work, and unrelated parser/tokenization optimization remain
deferred.

## 0.12.0 Broader T-SQL Language Intelligence

- [x] Expand the immutable language catalog across common null/value, string,
      date/time, numeric, aggregate, and window functions while preserving the
      initial 0.10 definitions.
- [x] Add aggregate/window callable kinds, SQL Server 2022 return rules, native
      Signature Help metadata, and required/optional `OVER` contracts.
- [x] Reuse QueryScopes for `PARTITION BY` and window `ORDER BY` members and offer
      bounded native window-clause grammar completion.
- [x] Add one shared SQL Server type-precedence facility for CASE and COALESCE,
      while retaining the distinct ISNULL/NULLIF rules and conservative Unknown.
- [x] Add context-only datepart grammar completion from one static canonical value
      list, with no database/cache participation.
- [x] Protect all new families with permanent provider/type/callable contracts and
      a focused 15-case installed-editor acceptance suite.
- [x] Complete installed VSCodium acceptance against the active IntelliSenseLab
      fixture, including built-ins, conditional typing, aggregates, windows,
      datepart grammar, and existing callable/member regressions.

Advanced window frames, a complete built-in catalog, MERGE/PIVOT/OPENJSON and
deeper general grammar remain deferred.

## Forward roadmap

The current major product area is **Navigation & Code Understanding**.
Document-local Go to Definition / Peek Definition, Find References, and Document
Highlights are implemented. Remaining navigation and code-understanding slices
should continue to be scoped explicitly rather than grouped into a speculative
version.

Later product areas remain:

- diagnostics and Quick Fixes
- refactoring and Code Actions
- broader grammar coverage
- Configurability and a Query Puppy Control Center
- formatting improvements
- production-safety assistance
- advanced persistent query history

## Future configurability / Query Puppy Control Center

Future control work may combine normal contributed VS Code settings and
`settings.json` with native Query Puppy status/control views for higher-level
workflows. Candidate areas include Smart Alias style, metadata refresh interval,
diagnostic and production-safety rules, formatting preferences, cache/status
controls, and history retention. None is implemented by 0.12.0.

Advanced persistent query history remains deferred until a stable public mechanism
for observing executed queries is verified. It must not depend on private mssql
internals. A future Query Puppy Control Center may provide history browsing,
favorites, saved queries, filters, retention controls, and export/import if that
public observation boundary becomes available.

## 0.9.0 Type-aware Expression Intelligence

- [x] Normalize structured SQL types into cached descriptors with explicit families and preserved facets.
- [x] Classify exact, same-base, compatible-family, unknown, and incompatible type relationships.
- [x] Infer physical/query-local columns, literals, CAST/CONVERT, scalar UDF returns, arithmetic, and conservative CASE results.
- [x] Explain known expected-type ranking with non-empty native-widget display groups and no-op decorative headers.
- [x] Resolve UPDATE ownership with positional, depth-aware assignment ranges before binding the target alias and column type.
- [x] Bypass compatibility sorting and headers completely when no expected type exists.
- [x] Cap visible physical-column identifiers at 32 characters and wrap documentation near 40 while preserving complete semantic fields.
- [x] Rebind canonical physical table identity before deriving PK/UQ/FK metadata, regardless of expected-type grouping.
- [x] Compose physical CompletionItem labels through one factory as fixed 32/8/20 name/role/type slots plus nullability.
- [x] Migrate current package, runtime, tests, documentation, and Marketplace identity to `BeardedPuppyLabs`.
- [x] Rebind identity-less forward aliases from complete-statement symbols before multi-group physical candidate materialization.
- [x] Order group headers/candidates before one final canonical CompletionItem construction pass.
- [x] Infer expected types for comparisons, catalog function arguments, UPDATE assignments, INSERT values/projections, LIKE, and arithmetic.
- [x] Rank by compatibility without filtering incompatible visible expressions or broadening explicit qualifiers.
- [x] Preserve FK predicate priority, Contains matching, scope isolation, and cached steady-state completion behavior.
- [x] Cover helpers, candidate ordering, the registered CompletionItemProvider, and live fixture integration.

## 0.9.1 architectural preparation

- [x] Extract one editor-independent parsed call-site model with qualification,
      depth-aware argument ranges, and active-argument ownership.
- [x] Adapt catalog scalar UDFs and TVFs into one source-neutral callable signature
      consumed by Signature Help and ExpectedType.
- [x] Route completed scalar-UDF return inference through the same callable
      resolver while retaining TVFs as non-scalar RowSources.
- [x] Reuse shared call-site parsing for cross-database discovery and automatic
      Signature Help fallback eligibility.

This preparation became the common boundary used by the 0.10.0 built-in catalog.

## Verified contracts

- VS Code 1.105 completion providers support structured labels, explicit replacement ranges, `filterText`, lazy resolution, and incomplete lists.
- mssql 1.45 exports the connection-sharing surface currently consumed by the
  mssql adapter for active connection/database lookup and metadata query
  execution.
- External mssql integration is isolated in `MssqlApi` and
  `MssqlConnectionSharingAdapter` behind the backend-neutral
  `ConnectionContextResolver`/`MetadataBackend` contracts, so changes to the
  external connection-sharing contract can be adapted without changing the
  semantic completion engine.
- `mssql.intelliSense.enableSuggestions` remains the independently configurable Microsoft suggestion switch.

## Execution state

- [x] Initialize strict TypeScript extension and development configuration.
- [x] Build typed metadata model, formatter, index, cache, and catalog queries.
- [x] Add tokenizer, aliases, CTE/local-variable/temp-table symbols, and context resolution.
- [x] Add Contains matching, deterministic context sorting, presentation, and completion provider.
- [x] Add refresh/status/explicit settings command and diagnostics.
- [x] Add critical unit and acceptance-scenario coverage.
- [x] Run formatter, lint, compile, tests, build, package, and final review.

## Current design summary

Persistent SQL Server metadata is loaded lazily using set-based metadata
operations and cached by backend connection identity plus database.

Concurrent requests for the same unloaded catalog use the project's coalesced
loading path.

The exact number and shape of catalog queries may evolve as metadata domains are
added. The authoritative current architecture is documented in
`docs/ARCHITECTURE.md`.

After the relevant metadata has been loaded, steady-state completion operates from
cached metadata and does not perform repeated SQL catalog access for every
keystroke.

Procedure result-set discovery remains deliberately deferred rather than risking
failure of the base catalog or fabricating schema.

Semantic Contains matching determines the candidate domain.

Physical columns retain their exact identifier as `filterText`; other candidate
kinds may use typed-fragment compatibility behavior where required by the native
widget without changing insertion or semantic ranking contracts.

## Historical verification notes

The 0.1.1 repair explicitly selected the active database with a safely delimited
`USE`, validated the public `SimpleExecuteResult` shape, reported expected/actual
database and row/object counts, distinguished empty and failed cache states, and
included an opt-in IntelliSenseLab integration suite.

Local unit, lint, compile, build, and packaging verification was completed.

The real IntelliSenseLab integration suite also passed: it proved the active
database and non-empty catalog, loaded the required objects and typed columns,
verified middle-of-name `addr` row-source matches, and restricted alias-member
results to `dbo.Customers` columns.

## 0.2.0 same-server cross-database execution

- [x] Re-verify current mssql `listDatabases(connectionUri)` public contract.
- [x] Refactor cache APIs around explicit connection/database identity.
- [x] Parse one-, two-, three-part and double-dot identifiers; reject four-part names.
- [x] Retain database identity in aliases and completion candidates.
- [x] Add lazy secondary-database discovery/loading and multi-database status.
- [x] Extend unit and real integration coverage. Both the primary IntelliSenseLab and secondary IntelliSenseLabReporting suites pass.
- [x] Update documentation, verify, and package 0.2.0.

The admin fixture is `tests/fixtures/create-cross-database-fixture.sql`. Unit coverage proves lazy loading, coalescing, per-database isolation, active-database default scope, schema/object qualifier positions, double-dot normalization, cross-database aliases, and four-part rejection.

Final verification: formatting, ESLint, strict compilation, 29 unit tests, both real database integration tests, esbuild, and VSIX packaging pass. IntelliSenseLabReporting proves independent catalog loading, fully qualified tables/views, Contains search, cross-database aliases, and cache isolation.

## 0.2.1 database discovery and row-source repair

- [x] Add database as a semantic completion kind in unqualified `FROM`/`JOIN` contexts.
- [x] Reuse lightweight `listDatabases` discovery without loading suggested databases.
- [x] Preserve active-database-only object completion.
- [x] Prove loader/index/candidate flow retains tables, views, and TVFs.
- [x] Add unit and real two-database assertions for database Contains matching and mixed row-source types.
- [x] Complete final verification and package the 0.2.1 VSIX.

Final 0.2.1 verification: 33 unit tests and both live database integration tests pass. Live discovery proves `FROM Intelli` returns both fixture databases without secondary metadata loading; the secondary `reporting.Customer` and `reporting.addr` domains retain tables, views, TVFs, and synonyms in semantic group order.

## 0.3.0 database-wide shortcut and developer metadata

- [x] Keep empty `Database.` navigation schemas-only.
- [x] Combine schema matches with schema-qualified cross-schema row sources after a typed fragment.
- [x] Give schemas semantic priority while retaining exact/type/alphabetical object ordering.
- [x] Insert `Schema.Object` over the fragment to produce valid three-part SQL.
- [x] Preserve strict `Database.Schema.fragment`, ambiguity safety, and per-database isolation.
- [x] Add catalog-discovered `INFORMATION_SCHEMA` views and an explicit allowlist of developer-facing `sys` views and columns.
- [x] Add unit coverage for shortcut domains, insertion, views/TVFs, ambiguity, system schemas, and internal-noise exclusion.
- [x] Complete both live integration suites and final 0.3.0 package verification.

The system metadata policy deliberately leaves `is_ms_shipped = 0` filtering in place for normal objects. Only `INFORMATION_SCHEMA` views and names in `DEVELOPER_SYS_VIEWS` cross that boundary.

Final 0.3.0 verification: 39 unit tests and both live integration suites pass. IntelliSenseLab proves empty schema navigation, database-wide multi-schema Contains search, strict crm search, views/TVFs, curated sys views, common INFORMATION_SCHEMA views, and internal-noise exclusion. IntelliSenseLabReporting proves database isolation and existing cross-database alias behavior.

## 0.3.1 active-database schema completion

- [x] Include active-database schemas in ordinary unqualified `FROM`/`JOIN` completion.
- [x] Apply contiguous case-insensitive Contains matching to schema names.
- [x] Sort schemas before matching row-source object types.
- [x] Insert a trailing dot and retrigger completion after schema selection.
- [x] Cover `INFORMATION_SCHEMA`, `sys`, schema priority, and retained table/view/TVF results in unit tests.
- [x] Complete final format, lint, strict compilation, unit, build, and package verification.

Final verification: formatting, ESLint, strict compilation, 40 unit tests, bundling, and VSIX packaging pass. Live integration tests were not run because their SQL Server environment is opt-in.

## 0.3.1 Marketplace release readiness

- [x] Add professional Marketplace metadata, Preview status, official icon, and mssql dependency.
- [x] Replace automatic-setting behavior with a one-time, consent-based global prompt.
- [x] Produce user-facing README, changelog, support, development, and publishing documentation.
- [x] Restrict the bundled VSIX to runtime and Marketplace presentation files.
- [x] Complete final format, lint, strict compilation, tests, build, security review, and VSIX inspection.

Final release-readiness verification: formatting, ESLint, strict compilation, 40 unit tests, production bundling, package-content inspection, VSIX generation, and archive-level metadata/security review pass. The two live SQL Server integration tests were discovered and skipped because their opt-in environment was not configured. The final 0.3.1 VSIX contains nine files and no runtime `node_modules`; publisher ownership remains the developer's required external pre-publication check.

## 0.3.1 open-source licensing audit

- [x] Confirm the canonical project license and current developer copyright identity.
- [x] Use the repository SPDX license identifier consistently in the manifest and lockfile.
- [x] Document the license in the README, changelog, and publishing checklist.
- [x] Audit the production bundle and VSIX for third-party runtime code and notice obligations.
- [x] Rebuild, repackage, and inspect the final licensed VSIX.

The bundle metafile contains only project-owned `src` inputs; `vscode` is external.
No npm runtime dependency or mssql source/binary is bundled, so no third-party
notices file is required. The nine-file VSIX contains the canonical root license
and no development dependency tree.

## 0.4.0 release

- [x] Advance the extension and lockfile version to 0.4.0.
- [x] Update package filenames, publishing instructions, and changelog release heading.
- [x] Run the full verification flow and inspect the 0.4.0 VSIX.

Final 0.4.0 verification: formatting, ESLint, strict compilation, 40 unit tests, production bundling, VSIX packaging, manifest inspection, and archive security checks pass. Both opt-in live SQL Server tests were discovered and skipped because their environment was not configured. The final package contains nine files and no runtime dependency tree.

## 0.4.1 publisher identity update

- [x] Change the maintained developer, author, copyright, and Marketplace publisher identity to Bearded Puppy Labs / `BeardedPuppyLabs`.
- [x] Update the maintained extension identifier and publishing documentation.
- [x] Advance the manifest and lockfile version to 0.4.1.
- [x] Run release verification and inspect the 0.4.1 VSIX.

Final verification at that milestone covered formatting, ESLint, strict compilation, unit tests, production bundling, VSIX packaging, identity inspection, and archive security checks. Both opt-in SQL Server integration tests were discovered and skipped because their environment was not configured.

The maintained extension identifier is now:

    BeardedPuppyLabs.query-puppy-for-t-sql

## 0.4.2 public-release UX cleanup

- [x] Restrict the one-time Microsoft suggestion prompt to SQL use with mssql available and require explicit consent.
- [x] Resolve effective global, workspace, and workspace-folder suggestion settings.
- [x] Make the permanent disable command target the effective enabling scope safely.
- [x] Add Microsoft suggestion-provider state to status and non-spammy output diagnostics.
- [x] Rewrite the Marketplace README and collapse the changelog to user-relevant public releases.
- [x] Add configuration-resolution tests and preserve all completion behavior.
- [x] Run both real database integration suites and the complete release verification flow.

Final 0.4.2 verification: formatting, ESLint, strict compilation, 45 unit tests,
both live SQL Server integration tests, production bundling, VSIX packaging, and
archive inspection pass. The package contains the public README, changelog, root
license, support guide, extension manifest, bundle, and icon; no runtime dependency
tree or credentials are included.

## 0.5.0 document-local SQL semantics

- [x] Add a common document-local `RowSource` model with columns, kind, alias, scope origin, and source position.
- [x] Add reusable SELECT projection analysis with direct-column metadata propagation, aliases, computed names, and star expansion.
- [x] Add statement-scoped CTEs, declaration-order references, explicit column lists, and conservative recursive behavior.
- [x] Add typed local/global temporary tables, table variables, SELECT INTO, and straightforward ALTER TABLE ADD.
- [x] Add derived tables, VALUES alias lists, and CROSS/OUTER APPLY sources.
- [x] Add ORDER BY projection aliases and statement-bounded alias resolution.
- [x] Cache document semantics by URI/version/cursor and keep catalog metadata independent.
- [x] Preserve comments/string exclusion, Contains semantics, and all catalog/cross-database behavior.

Remaining advanced work includes complete recursive/UNION type reconciliation, unnamed expression outputs, full correlated subquery visibility, PIVOT/UNPIVOT, OPENJSON/OPENXML/OPENROWSET, and a complete T-SQL grammar.

Final 0.5.0 verification: formatting, ESLint, strict compilation, 58 unit tests, both live IntelliSenseLab integration suites, production bundling, VSIX packaging, and archive security/content inspection pass. Live catalog-backed cases prove projection-only CTE Contains completion and SELECT INTO type propagation from `dbo.Customers`; all prior cross-database behavior remains covered.

## 0.5.1 CTE projection isolation repair

- [x] Restrict star expansion to row sources actually present in the current SELECT scope.
- [x] Separate ordered star sources from alias/name lookup bindings so one source is expanded once.
- [x] Give every local row source a stable internal identity and immutable, independently owned projection.
- [x] Load metadata for databases explicitly referenced inside document-local row-source definitions.
- [x] Keep final-query aliases independent from aliases internal to CTE definitions.
- [x] Prove strict member candidates and identify editor word-based suggestions as an independent fallback.
- [x] Reproduce the exact two-database query in unit and live integration tests.

Final 0.5.1 verification: formatting, ESLint, strict compilation, 62 unit tests, both live SQL integration suites, production bundling, VSIX packaging, and archive inspection pass. The exact real query resolves `x` to 2 `BillingAddress_0001` projection columns and `y` to 6 `CustomerAddressArchive` projection columns without leakage; the package contains no credentials or Proposed API dependency.

## 0.6.0 DML and callable-object intelligence

- [x] Retain SQL Server writability flags and apply a conservative writable-column policy.
- [x] Add target-aware INSERT and UPDATE completion with used-column exclusion.
- [x] Add DELETE target resolution and DML-correct `inserted`/`deleted` OUTPUT scopes.
- [x] Add ordered EXEC/EXECUTE named-parameter completion with OUTPUT presentation.
- [x] Add scalar/TVF signature help with nested-comma tracking.
- [x] Preserve lazy, connection-and-database-specific metadata loading for qualified targets.
- [x] Add unit and real fixture coverage for DML, procedures, functions, and OUTPUT.

All DML and callable analysis is performed over the cached typed catalog and defensive token stream. It does not open an independent connection or perform repeated steady-state catalog access on each keystroke. Explicit secondary-database qualification uses the existing lazy metadata-cache path.

MERGE, trigger-body pseudo tables, OUTPUT INTO mapping, positional EXEC assistance, built-in function signatures, Linked Servers, and full T-SQL grammar remain outside this milestone.

## 0.6.1 DML and Signature Help correctness repair

- [x] Resolve DML targets and synthetic OUTPUT sources from only the statement containing the cursor.
- [x] Preserve full target-table metadata for valid `inserted` and `deleted` sources while retaining writable filtering only for assignment targets.
- [x] Repair exact-cursor three-part function database discovery and explicitly register call/argument Signature Help triggers.
- [x] Cover direct qualified UPDATE targets, nested signature arguments, invalid pseudo sources, sequential-statement isolation, and both cross-database aliases.

Statement boundaries are derived from tokenizer-visible semicolons and `GO` separators. The repair deliberately adds no last-known-target fallback: incomplete statements either resolve their own target or return no DML-specific candidates.

## 0.6.2 Signature Help host verification

- [x] Share one SQL document selector between completion and Signature Help registration.
- [x] Register `(` and `,` call triggers with explicit comma retrigger metadata.
- [x] Report the effective editor parameter-hints setting without changing it.
- [x] Add non-spammy debug diagnostics for Signature Help resolution.
- [x] Execute the actually registered provider through `vscode.executeSignatureHelpProvider` in a VS Code Extension Host.
- [x] Cover scalar, TVF, nested-argument, second-parameter, explicit invocation, and three-part database-qualified calls.

Extension Host tests run against VS Code 1.105.1, matching the minimum declared engine. A test-only catalog hook is registered exclusively in `ExtensionMode.Test`; production calls continue to use the shared mssql connection and existing metadata cache.

## 0.6.3 interactive Signature Help activation

- [x] Prove explicit Signature Help for both `file:` and `untitled:` SQL documents.
- [x] Prove native automatic `(` and comma retrigger invocation through an active untitled editor.
- [x] Prove `editor.action.triggerParameterHints` reaches the registered provider.
- [x] Verify the same automatic path in VSCodium with the real mssql extension loaded.
- [x] Add scoped parameter-hints diagnostics without mutating editor configuration.
- [x] Add a narrowly scoped delayed UI fallback for qualified SQL function calls when native triggering does not invoke the provider.

The fallback observes only single SQL edits ending in `(` or comma, requires a schema- or database-qualified call shape, waits for native registration first, and does nothing if the provider has already run for that document version. It therefore avoids arbitrary parentheses, duplicate invocations, and catalog queries of its own.

## 0.6.4 installed-editor Signature Help repair

- [x] Separate native provider invocation from successful SignatureHelp construction.
- [x] Derive fallback cursor state from the document edit rather than potentially stale editor selection.
- [x] Preserve native/manual TVF behavior and test scalar and TVF kinds independently.
- [x] Give file and untitled SQL providers a higher selector score than competing generic SQL providers.
- [x] Add an installed-runtime diagnostic command reporting parsed call, catalog kind, parameters, return semantics, and provider result.
- [x] Keep fallback activation restricted to qualified SQL function-call edits and native parameter-hint UI commands.

The corrected fallback waits 200 ms for a successful native result and invokes `editor.action.triggerParameterHints` only if none was constructed for the current document version. It creates no SQL query, does not observe arbitrary typing, and cannot loop because parameter-hint commands do not edit the document.

## 0.6.5 automatic Signature Help synchronization

- [x] Synchronize qualified function-call edit triggers with the matching post-edit selection event.
- [x] Derive the exact expected cursor from `(`, `()`, and comma content changes.
- [x] Suppress fallback only after valid Signature Help succeeds at the same URI, version, and cursor.
- [x] Cancel stale requests after later edits, selection changes, editor switches, version changes, and document closure.
- [x] Keep one validated, one-shot bounded fallback for hosts that omit the matching selection event.
- [x] Resolve fallback candidates exclusively from cached scalar-function and TVF metadata.

Native `(` and comma registration remains primary. A single pending trigger now follows the edit to its exact post-edit selection; a 75 ms backup uses the same URI, version, cursor, generation, configuration, and cached-resolution checks and is cancelled once handled.

## 0.6.6 editing productivity

- [x] Add semantic projection-only wildcard detection for `*` and strict `alias.*`.
- [x] Bind expansion exclusively to Tab through a narrow context key and retain a Command Palette action.
- [x] Expand ordered cached columns in one edit without catalog queries on Tab.
- [x] Add deterministic editable `AS` alias snippets with visible-scope collision handling.
- [x] Retrigger alias completion after row-source acceptance and narrowly after manual trailing whitespace.
- [x] Cover invalid stars, multiple sources, collisions, naming, and a 200-column source.

Wildcard expansion and alias generation reuse cached catalog/document semantics. This milestone deliberately adds no snippet manager, query UI/history, nested scope work, MERGE, OPENJSON, or PIVOT support.

## 0.7.0 nested query scopes and correlated subqueries

- [x] Represent SELECT scopes as an explicit hierarchy with cursor ranges, parents, local row sources, and correlation policy.
- [x] Resolve aliases locally first, then through eligible parent scopes with lexical shadowing and semantic-distance ordering.
- [x] Isolate closed inner scopes, siblings, statements, CTE definitions, and ordinary derived tables.
- [x] Support multi-level correlation in EXISTS, IN, and scalar expression subqueries.
- [x] Allow APPLY right-side queries to correlate only to row sources available on their left.
- [x] Preserve database identity for correlated catalog sources and tolerate unfinished nested SQL.
- [x] Add provider-level, parser, cache-versioning, catalog-fixture, and 0.6.x regression coverage.

The QueryScope model is built from the defensive tokenizer, so strings and comments cannot create scopes. Scope construction performs no catalog I/O: catalog-backed bindings use only indexes supplied by the connection-and-database metadata cache. Set-operation projection reconciliation remains deferred.

## 0.7.1 SELECT modifier projection repair

- [x] Locate the first real projection expression after `ALL`, `DISTINCT`, and nesting-aware `TOP` syntax.
- [x] Preserve semantic projection order for numeric, parenthesized, expression, PERCENT, and WITH TIES variants.
- [x] Verify complete TOP projections through CTEs, ordinary derived tables, CROSS APPLY, and OUTER APPLY.
- [x] Cover expression aliases, three-column projections, star inference, the registered provider, and the live fixture.

The repair is confined to the shared projection parser. It does not alter QueryScope correlation policy or introduce set-operation projection reconciliation.

## 0.7.2 correlated member resolution repair

- [x] Resolve explicit members directly from the ordered QueryScope visibility chain rather than a flattened statement symbol fallback.
- [x] Rebind a visible source's stored database/schema/object identity from already-cached metadata when its inferred column list is empty.
- [x] Preserve local shadowing, sibling/outward isolation, derived-table non-correlation, and APPLY left-side eligibility.
- [x] Add exact mid-document provider and live-fixture regressions for EXISTS, APPLY, three-level, cross-database, and negative scope cases.

The fallback is deliberately constrained to a binding proven visible by QueryScope. It performs no metadata I/O and cannot make a statement-wide or illegal derived-table alias visible.

## 0.7.3 nested provider correctness and diagnostics

- [x] Test the provider directly with clean SQL documents and explicit provider provenance instead of aggregate editor labels.
- [x] Assert semantic column kind and datatype/nullability presentation for nested local and correlated completions.
- [x] Validate the three-level QueryScope tree independently from CompletionItem production.
- [x] Add a Query Scope diagnostic command backed by the same cursor-specific semantic model and cached metadata scope.
- [x] Retain registered-pipeline, live-fixture, negative isolation, TOP/APPLY projection, and 0.6.x regression coverage.

Direct provider tests now prove that successful labels originate from Query Puppy for T-SQL rather than editor word-based suggestions. The internal provenance marker is not displayed in the completion UI.

## 0.7.4 set operation intelligence

- [x] Parse `UNION`, `UNION ALL`, `INTERSECT`, and `EXCEPT` as semantic set expressions with SQL Server precedence and left associativity.
- [x] Reconcile result columns by ordinal from the first branch while conservatively merging compatible type and nullability information.
- [x] Isolate aliases between branches and retain only correlation explicitly allowed by the enclosing QueryScope.
- [x] Flow set results through CTEs, derived tables, APPLY sources, member completion, and SELECT wildcard expansion.
- [x] Preserve connection/database source identity without loading metadata during document analysis.
- [x] Add tokenizer, incomplete SQL, branch visibility, provider provenance, cache invalidation, cross-database, and live-fixture regressions.

The implementation uses only tokenized document structure and metadata indexes already supplied by the connection-and-database cache. Comments and strings cannot create set boundaries, and editing a set query performs no SQL query or eager secondary-database load.

## 0.7.5 set-operation projection and member repair

- [x] Expand semantic `*` and `alias.*` projections into ordered RowSource columns before set ordinal reconciliation.
- [x] Preserve duplicate projection positions and assign ordinals from the expanded result sequence.
- [x] Cover fully qualified first, second, third, incomplete, parenthesized, correlated, isolated, and cross-database set branches.
- [x] Assert direct provider provenance, column kind, and datatype/nullability presentation in clean documents.
- [x] Verify the exact 15-column Customers star result and 9-column BillingAddresses member result against the live fixture.

Set branches remain sibling QueryScopes: each resolves its own local RowSources and may walk only the common eligible correlation parent. The provider uses the existing cursor-to-scope-to-visible-source pipeline; no statement-wide alias fallback or document edit is involved.

## 0.7.6 Clause & Expression Intelligence

- [x] Add one tokenizer- and QueryScope-backed clause classifier for SELECT, WHERE, JOIN ON, GROUP BY, HAVING, ORDER BY, and function arguments.
- [x] Add a reusable completion-domain policy that separates expression candidates from RowSource, schema, database, and procedure domains before matching.
- [x] Represent JOIN-condition participants as the current right RowSource, eligible left RowSources, and correlated outer RowSources.
- [x] Keep peer SELECT, GROUP BY, and HAVING aliases hidden while prioritizing projection aliases in ORDER BY.
- [x] Use the composed set result for final ORDER BY and reject branch-local explicit members there.
- [x] Reuse expression completion for UPDATE right-hand sides while preserving writable SET targets and other DML behavior.
- [x] Cover incomplete/nested clauses, provider provenance, live metadata, and the complete 0.6.x/0.7.x regression suite.

Clause classification performs no metadata access. Candidate policies select semantic domains before Contains matching and deterministic sorting; scalar functions remain expression values while TVFs and procedures do not.

## 0.7.7 positional JOIN visibility and scoped smart aliases

- [x] Make strict member completion inside ON consume the positional JoinConditionContext instead of the whole QueryScope.
- [x] Expose current-right, previously visible, outer, combined cursor-visible sources, and the active JOIN range for future FK intelligence.
- [x] Preserve left-to-right visibility through multiple JOINs and APPLY while rejecting every future RowSource.
- [x] Restrict smart-alias collision state to cursor-visible semantics and current-statement symbols.
- [x] Preserve deterministic same-scope collision suffixes and provider provenance for smart-alias snippets.
- [x] Add direct-provider, unit, and live-fixture regressions for both repairs.

No foreign completion items are inspected or modified. The fixes affect only Query Puppy for T-SQL semantic candidates and retain incomplete RowSource Contains completion before smart-alias takeover.

## 0.8.0 Schema Intelligence

- [x] Model primary, unique-constraint, standalone/filtered unique-index, and foreign-key metadata as first-class composite objects.
- [x] Build bidirectional object/column relationship indexes plus `relationshipsBetween` and `relatedObjects` APIs.
- [x] Add cached PK/UQ/FK completion roles and full key/FK documentation without changing matching or sorting.
- [x] Align physical-column completion details with bounded per-candidate-set widths while preserving every behavioral completion field.
- [x] Add idempotent persistent `reltest`/`relref` fixture and unit/provider/integration coverage.
- [x] Run final live Schema Intelligence acceptance using only the restricted metadata login after administrator-owned fixture provisioning.

At this milestone the loader used two constant, set-based metadata queries per database refresh: the existing object/member catalog query and one relationship query. Completion itself performed no repeated catalog query after the relevant metadata had been loaded.

Security boundary: production initialization and completion are catalog-read-only and are regression-tested to contain no DDL/DML statements. The persistent fixture SQL is administrator-owned integration infrastructure; missing objects cause a clear integration-test prerequisite failure and are never provisioned by the extension.

Final live acceptance: the restricted login loads 8 PKs, 7 unique constraints/indexes, and 8 FKs across `reltest`/`relref`. It proves INCLUDE-column exclusion, filtered-index preservation, composite ordinals/mappings, three independent Customers-to-Addresses relationships, cross-schema direction, CASCADE, disabled/untrusted state, reverse graph lookup, and database isolation. Live fixture discovery and completion perform no writes.

## 0.8.1 Relationship-aware JOIN Intelligence

- [x] Generate current-right-first predicates from indexed, enabled FK metadata in positional JOIN scope.
- [x] Preserve multiple relationships and composite mapping ordinals; support reverse query order and cross-schema relationships.
- [x] Exclude disabled, unrelated, future, and cross-database relationships without suppressing normal expression completion.
- [x] Rank enabled directly related physical tables at JOIN source positions after Contains filtering, without duplicates.
- [x] Retain bounded native physical-column alignment and behavioral field invariants.
- [x] Add pure, provider, Extension Host, and live fixture coverage.

JOIN completion reads only per-database cache indexes. Relationship lookup is proportional to the participating objects' adjacency lists, and no repeated catalog query occurs during steady-state completion after metadata is loaded. There is no heuristic name/type matching, automatic mutation, custom UI, hover provider, or runtime fixture provisioning.

## 0.8.2 JOIN insertion and compact role visibility

- [x] Use a context-aware predicate TextEdit to add one separator only when `ON` directly touches the cursor.
- [x] Preserve existing whitespace, indentation, partial predicate replacement, and semantic insert/filter text.
- [x] Replace name-first padding with compact roles-first physical-column details and complete documentation.
- [x] Cover actual provider TextEdits and CompletionItem label/filter/insert/sort fields.

## 0.8.3 Completion Metadata Layout Fix

- [x] Keep the exact physical-column identifier in semantic identity, filter/insert text, and documentation; allow only the visible label to be capped.
- [x] Render roles, datatype, and nullability as one coherent `detail` string, preceded by bounded name compensation.
- [x] Replace candidate-derived widths with canonical 32/8/20 name/role/type slots.
- [x] Preserve exact filter/insert text, semantic sorting, Contains matching, rich documentation, and the 0.8.2 JOIN insertion repair.
- [x] Leave mixed completion domains on their existing unpadded presentation path.

The 0.8.2 field allocation aligned roles and types inside each detail string but let native label widths move the start of that string independently on every row. The current canonical row formatter uses fixed 32/8/20 slots; complete values remain in all behavioral fields and wrapped documentation.

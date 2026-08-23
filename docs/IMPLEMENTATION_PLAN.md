# Implementation plan

## Purpose and authority

This document records milestone planning, implementation history, completed work,
release-specific verification state, and deliberately deferred work.

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

The next major planned product area is **Navigation & Code Understanding**.
Detailed scope will be defined when that milestone begins rather than assigning a
speculative version now.

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
- mssql 1.45 exports the connection-sharing surface currently consumed by the project for active connection/database lookup and query execution.
- External mssql integration is isolated in `MssqlApi`/`ConnectionService` so changes to the external connection-sharing contract can be adapted without changing the semantic completion engine.
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

Persistent SQL Server metadata is loaded lazily using set-based metadata operations
and cached by connection ID plus database.

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

- [x] Confirm the canonical MIT License and current developer copyright identity.
- [x] Use the `MIT` SPDX identifier consistently in the manifest and lockfile.
- [x] Document the license in the README, changelog, and publishing checklist.
- [x] Audit the production bundle and VSIX for third-party runtime code and notice obligations.
- [x] Rebuild, repackage, and inspect the final licensed VSIX.

The bundle metafile contains only project-owned `src` inputs; `vscode` is external. No npm runtime dependency or mssql source/binary is bundled, so no third-party notices file is required. The nine-file VSIX contains the byte-identical canonical root MIT License and no development dependency tree.

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

Final 0.4.2 verification: formatting, ESLint, strict compilation, 45 unit tests, both live SQL Server integration tests, production bundling, VSIX packaging, and archive inspection pass. The package contains the public README, changelog, MIT License, support guide, extension manifest, bundle, and icon; no runtime dependency tree or credentials are included.

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

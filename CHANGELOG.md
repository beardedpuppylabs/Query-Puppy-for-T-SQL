# Changelog

## 0.17.4

- Simplified scalar local-variable Hover to a plain initializer-only contribution,
  avoiding a syntax-highlighted duplicate description while preserving safe
  declaration initializer previews.

## 0.17.3

- Reissued scalar local-variable initializer Hover with exact combined-document,
  individual native-provider, and packaged-runtime regression coverage, with the
  documented editor restart/reload required after installation.

## 0.17.2

- Fixed scalar-variable initializer previews so canonical declaration information
  appears in the existing editor hover presentation as well as Document Symbols.

## 0.17.1

- Show directly declared scalar-variable literal initializers in local semantic
  information, with bounded previews for long values and no expression evaluation.

## 0.17.0

- Added native high-confidence document diagnostics for scalar and table-variable
  references that cross a validated `GO` batch boundary without a declaration in
  the current batch.
- Added immediate diagnostic updates for SQL document activation, opening, editing,
  correction, and closure without catalog or database access.

## 0.16.1

- Fixed document-local Definition resolution when invoked directly on supported
  declaration identifiers, aligning declaration and reference target resolution
  across Definition, References, and Document Highlights.
- Removed the empty `Unreleased` heading from the packaged release changelog.

## 0.16.0

- Added native document-local Document Symbols / Outline for canonical CTE,
  explicit row-source alias, scalar local-variable, table-variable, and temporary-
  table declarations.
- Added disconnected whole-document declaration collection across statements and
  `GO` batches with canonical identity deduplication, source ordering, exact
  identifier ranges, and a document-version cache.

## 0.15.2

- Disambiguated same-named physical objects across schemas in unqualified completion,
  including schema-qualified insertion, while preserving concise unique and already-
  qualified candidates.
- Made unqualified catalog resolution explicitly unique-or-unresolved and added
  non-repeating native status feedback when an alias refers to an ambiguous object.
- Restored repeated relationship predicates after `AND`/`OR` in a JOIN `ON` clause,
  suppressing completed direct or reversed mappings and inserting only missing
  composite mappings.
- Hardened automatic JOIN `ON` suggestion timing and added relationship-aware
  continuation triggers after logical separators.
- Expanded native Signature Help coverage for unqualified catalog functions and valid
  `EXEC`/`EXECUTE` stored-procedure calls, including named/positional active parameters
  and `OUTPUT` metadata.

## 0.15.1

- Reused one document-semantic cache across Definition, References, and Document
  Highlights to avoid repeated analysis of the same document version and cursor.
- Added a separate headless CI job for canonical Extension Host and production-build
  verification.
- Excluded temporary project-source exports from the VSIX and revalidated the
  third-party inventory against the locked dependencies, production bundle, and
  packaged artifact.

## 0.15.0

- Added native document-local Document Highlights for supported CTEs, explicit
  row-source aliases, scalar local variables, table variables, and deterministic
  temporary tables.
- Reused exact `DocumentSemanticSymbolIndex` identities to highlight each declaration
  and bound reference once in document order. Highlights remain same-document,
  fail closed for unknown or unsupported occurrences, and use the neutral Text kind
  because the semantic index does not classify reliable read/write data flow.

## 0.14.0

- Added document-local Find References through the native VS Code/VSCodium
  Reference Provider for the same CTE, explicit row-source alias, scalar local
  variable, table variable, and deterministic temporary-table symbols supported by
  document-local definition navigation.
- Reused `DocumentSemanticSymbolIndex` identities and exact ranges, honored native
  include-declaration behavior, and kept results same-document, deterministic, and
  free of textual, catalog, workspace, and physical-database fallbacks.

## 0.13.0

- Added document-local Go to Definition / Peek Definition for supported semantic
  symbols: CTEs, explicit row-source aliases, scalar local variables, table
  variables, and deterministic temporary tables.
- Kept definition resolution local to the existing `DocumentSemanticSymbolIndex`.
  Unresolved, ambiguous, unsupported, physical-database, cross-document, and
  projection-alias occurrences return no definition.

## 0.12.6

- Query Puppy for T-SQL is licensed under the GNU General Public License version 3
  only (`GPL-3.0-only`).
- Added an evidence-based third-party notices inventory and synchronized repository,
  contributor, release, and Marketplace-facing license documentation.
- Added the Phase E3 conservative heuristic JOIN fallback for an already-selected
  persistent physical table pair. Any declared FK, UserConfirmed, ProjectDefined, or
  qualifying LearnedFromQuery relationship connecting the pair suppresses it; it
  never performs global table discovery or database-wide relationship inference.
- Kept heuristic inference bounded and fail-closed: a candidate requires exactly one
  qualifying direction, one complete unfiltered target PK/UQ, known compatible SQL
  types, exact target-aware object-name-plus-key-column evidence, and a complete
  unambiguous mapping. Same-name context columns can complete a composite key only
  beside that stronger signal; uncertain and ambiguous shapes produce no candidate.
- Reused the canonical Relationship shape and JOIN renderer with explicit
  `HeuristicCandidate`/`Candidate` trust below declared FKs, UserConfirmed,
  ProjectDefined, and LearnedFromQuery. Native **Heuristic relationship JOIN**
  presentation exposes complete mappings, evaluated evidence, Candidate confidence,
  and explicit non-FK and non-persistence semantics.
- Kept heuristic results transient and JOIN-predicate-only, outside the canonical
  database relationship graph, persistence, global discovery, and related-source
  ranking. Acceptance inserts SQL without confirming or persisting knowledge; the
  existing **Save JOIN as Query Puppy relationship** action remains the only promotion
  path to UserConfirmed project knowledge.
- Added positive single/composite/UQ tests, mandatory false-positive and ambiguity
  regressions, bounded-source contracts, and activated Extension Host coverage for
  presentation, stronger-source suppression, and explicit promotion.

## 0.12.5

- Added the Phase E2 learned-relationship candidate policy. Local evidence becomes a
  `LearnedFromQuery`/`StrongEvidence` canonical relationship after three independently
  deduplicated resolved JOIN observations.
- Reused the canonical relationship graph and existing JOIN predicate, comparison,
  and related-RowSource consumers with deterministic trust order: declared FK,
  UserConfirmed, ProjectDefined, then LearnedFromQuery.
- Revalidated learned endpoints, columns, ordered mappings, type compatibility, and
  database scope against current catalog metadata. Stale or invalid evidence fails
  closed, and exact stronger relationships suppress learned duplicates without
  suppressing distinct mappings.
- Added **Learned relationship JOIN** completion presentation with endpoints, mappings,
  observation count, StrongEvidence confidence, and an explicit statement that the
  candidate is not a SQL Server foreign key.
- Kept learning local and explicit: completion acceptance never confirms or writes a
  relationship, while the existing **Save JOIN as Query Puppy relationship** action
  promotes the resolved edge to UserConfirmed project knowledge.
- Added cached workspace overlays with evidence, project-file, metadata, clear, and
  multi-root invalidation. Disabling learning stops acquisition but retains existing
  qualifying candidates; clearing evidence removes learned candidates immediately.
- Added unit, provider-contract, graph, policy, presentation, and activated Extension
  Host coverage for threshold boundaries, false positives, composite/reverse/self
  relationships, trust, promotion, cache invalidation, and workspace isolation.

## 0.12.4

- Fixed learned-evidence count inflation across document close/reopen, extension-host
  restart, editor restart, repeated unchanged saves, formatting-only edits, alias
  renames, and unrelated edits above a JOIN.
- Upgraded the local learned-evidence store to format version 2 with
  privacy-preserving SHA-256 document and relationship fingerprints plus a stable
  ordinal for each equivalent JOIN occurrence. Existing version-1 observation counts
  are preserved during deterministic upgrade.
- Added a 16,384-entry bound for persisted seen-occurrence identities. Oldest recorded
  identities are evicted first with deterministic tie-breaking; eviction never
  decrements relationship evidence.
- Preserved independent evidence semantics: another real JOIN occurrence increments
  once, a saved removal does not decrement history, and later reintroduction may
  increment once. Concurrent duplicate observations are serialized and counted once.
- Extended **Clear Learned Relationship Evidence** to clear both accumulated evidence
  and persisted occurrence-deduplication state. Disabling learning mutates neither.
- Kept format-v2 state local and minimal: no raw SQL, aliases, source text, plaintext
  paths, credentials, connection strings, telemetry, or remote transmission are
  stored. Learned evidence remains outside completion and the production relationship
  graph.

## 0.12.3

- Added local, save-driven acquisition of safely resolved equality-only JOIN evidence.
  Equivalent aliases, operand orientation, casing, quoting, and composite term order
  aggregate by canonical physical endpoint and mapping identity.
- Added a bounded format-version-1 evidence store under extension-managed workspace
  storage. It persists only canonical endpoints, ordered mappings, and observation
  counts; writes are atomic and serialized, workspace roots are isolated, and malformed
  or unsupported files are not overwritten.
- Prevented false count inflation from completion calls, repeated unchanged saves, and
  unrelated edits. Separate genuine JOIN occurrences count independently, ambiguous
  direction is skipped, and known FK/ProjectDefined/UserConfirmed mappings are excluded.
- Added the default-enabled `queryPuppyForTSql.relationshipLearning.enabled` setting and
  **Clear Learned Relationship Evidence** command. No raw SQL, literals, filenames,
  credentials, connection strings, telemetry, or remote transmission are involved.
- Kept learned evidence completely outside the canonical production relationship graph,
  completion, JOIN generation, related-table ranking, diagnostics, and presentation.
  Version 0.12.3 does not provide LearnedFromQuery suggestions or candidate thresholds.

- Added a native **Save JOIN as Query Puppy relationship** Code Action for explicitly
  persisting safely resolved equality-only JOINs as UserConfirmed/Confirmed project
  knowledge. Composite mappings are saved as one relationship; ambiguous direction is
  selected through a minimal native Quick Pick.
- Extended relationship format version 1 with backward-compatible optional
  `projectDefined`/`userConfirmed` provenance. Exact FK/project/user duplicates are not
  persisted, unsafe or transient JOIN shapes are ineligible, and no SQL Server DDL is
  executed.
- Reused the existing workspace watcher, canonical graph, and JOIN completion path for
  saved relationships, with distinct **User-confirmed relationship JOIN** presentation
  and explicit FK → user-confirmed → project-defined trust ordering.

- Added source-controlled ProjectDefined relationships through
  `.query-puppy/relationships.json`, including native JSON schema validation,
  composite ordered mappings, workspace isolation, and live file invalidation.
- Integrated validated ProjectDefined/Confirmed relationships into the existing
  canonical graph, JOIN predicates, comparison tie-breaking, and related-table
  ranking without fabricating SQL Server FK metadata.
- Kept declared FKs authoritative for deduplication and ranking, kept project
  relationships out of physical SQL metadata snapshots, and added a native command
  to create or open the workspace relationship file.

## 0.12.2

- Fixed Smart Alias phase resolution so the first legal whitespace after a
  resolved row source replaces object discovery with `AS <alias>`; after an
  explicit `AS`, only the alias itself is offered.
- Added automatic semantic completion after typing whitespace following `JOIN ...
ON`; real FK predicates appear when relationships exist, while unrelated joins
  still expose legal aliases and columns without fabricated predicates.
- Added target-object completion for `UPDATE`, `INSERT INTO`, and `DELETE FROM`
  positions with normal Contains matching and schema/database qualification.
  Blank target whitespace no longer forces the multi-provider Suggest Widget;
  Ctrl+Space and typed target fragments retain the Query Puppy target domain.
- Added explicit JOIN continuation phases. A completed unaliased INNER, LEFT,
  RIGHT, or FULL JOIN source offers Smart Alias first and `ON` second; after a
  completed alias only `ON` remains. Explicit `AS` requires an alias, and CROSS
  JOIN/APPLY never receive `ON`.
- Bound automatic completion to the current document version and cursor, with
  automatic/manual semantic-domain parity covered in Extension Host tests.
- Preserved the backend-neutral connection boundary, Microsoft mssql connection
  sharing, relationship metadata safety, and existing DML expression behavior.

## 0.12.1

- Added concise contribution and security-reporting guidance for the public
  repository.
- Added structured GitHub bug and feature forms plus a lightweight pull request
  template.
- Added a deterministic public CI quality gate and documented a repeatable source,
  tag, GitHub Release, and Marketplace release sequence.

## 0.12.0

- Expanded static SQL Server 2022 language intelligence across common null/value,
  string, date/time, numeric, aggregate, and window functions.
- Added aggregate/window callable semantics, documented return inference, native
  Signature Help metadata, and scoped `OVER`, `PARTITION BY`, and window
  `ORDER BY` completion.
- Added distinct `ISNULL`/`NULLIF` rules plus shared SQL type-precedence inference
  for variadic `COALESCE` and searched/simple `CASE` expressions.
- Added context-only datepart grammar completion for `DATEADD`, `DATEDIFF`,
  `DATEPART`, and `DATENAME` without database queries or persistent-cache data.
- Added permanent provider/type/callable contracts and a focused 15-case manual
  acceptance suite while preserving explicit qualifier, Contains, DML, wildcard,
  QueryScope, and persistent-cache behavior.

## 0.11.1

- Added canonical public GitHub source and issue-tracker links to extension metadata
  and Marketplace-facing documentation.
- Made the project's free and open-source status visible near the start of the
  Marketplace overview and added direct development/support links.

## 0.11.0

- Added versioned, secret-free persistent schema snapshots in extension-owned
  storage, with runtime catalog and relationship indexes rebuilt on warm start.
- Added immediate warm-cache completion plus one coalesced first-session background
  refresh and a demand-driven 15-minute freshness threshold.
- Added stale-while-revalidate refresh behavior: complete replacements are persisted
  and swapped atomically, while failures preserve the last usable snapshot.
- Added visible cold/background metadata status, a canonical manual refresh path,
  and a confirmed active-database cache-clear command.
- Refined Smart Alias completion so object names remain discoverable until a legal
  alias position, then present an alias-only suggestion without forcing `AS`.
- Added real-FK comparison tie-breaking so a relationship-mapped column can lead
  otherwise equivalent exact-type candidates without hiding legal alternatives.
- Hardened cross-feature regression coverage for qualified members, callable
  arguments, UPDATE assignments, wildcard expansion, and persistent warm starts.
- Preserved lazy cross-database loading, read-only mssql connection sharing, static
  built-in metadata, and memory-only document semantics.

## 0.10.0

- Added static SQL Server built-in completion and native Signature Help for
  `CHARINDEX`, `DATEADD`, `DATEDIFF`, `DATEFROMPARTS`, `ROUND`, `STRING_AGG`, and
  `SUBSTRING`.
- Added shared type-family parameter expectations and fixed, argument-derived,
  and datatype-dependent built-in return inference without database queries.
- Preserved catalog UDF/TVF resolution, Contains matching, qualification, and
  SQL Server 2022 semantics, including pre-preview `DATEADD` integer behavior.

## 0.9.2

- Updated the Query Puppy for T-SQL extension and Marketplace logo.
- Fixed exact RowSource names suppressing longer valid Contains matches when one
  complete SQL object name is a prefix of another.

## 0.9.1

- Renamed the extension to Query Puppy for T-SQL with package identity `BeardedPuppyLabs.query-puppy-for-t-sql`.
- Renamed extension-owned commands, settings, context keys, and diagnostic provenance to the `queryPuppyForTSql` / `query-puppy-for-t-sql` identity while preserving Microsoft mssql integration identifiers.

## 0.9.0

- Added expected-type-aware expression completion and conservative compatibility ranking for comparisons, function arguments, UPDATE assignments, INSERT expressions, LIKE, and arithmetic operands.
- Added a reusable normalized SQL type model and expression inference for catalog/query-local columns, literals, CAST/CONVERT, scalar UDF returns, arithmetic, and CASE.
- Preserved Contains matching, explicit qualifier scope, and incompatible visible candidates instead of turning type intelligence into a hard filter.
- Added visible `Type match`, compatible-family, and other-column groups when a known expected type changes completion order.
- Fixed UPDATE RHS inference through target aliases with a depth-aware positional assignment model, including incomplete and later SET right-hand sides.
- Restored exact alphabetical member ordering when no expected type is available.
- Stabilized physical-column presentation with a fixed 32-character visible identifier cap and wrapped complete documentation while preserving filtering, insertion, identity, and ordering.
- Rebound inferred physical RowSources to canonical catalog objects before type grouping so PK/UQ/FK roles and constraint documentation are retained.
- Rendered physical columns through one canonical factory as a deterministic 32/8/20-slot visible row and migrated the public publisher identity to `BeardedPuppyLabs`.
- Fixed identity-less forward member aliases in multi-group UPDATE completion by rebinding them to cached canonical table metadata before materialization.
- Ordered type groups before CompletionItem construction so every group member uses the ordinary physical-column factory exactly once.

## 0.8.5

- Reworked the Marketplace overview around context-aware completion for large SQL Server schemas.
- Documented Schema Intelligence, FK-aware JOIN predicates, query-local scope handling, connection reuse, caching, and read-only metadata access.
- Replaced outdated limitations and refreshed commands, settings, installation, privacy, and public package metadata.

## 0.8.3

- Reworked physical-column completion presentation into one bounded, table-like metadata layout with stable name, role, datatype, and nullability columns.
- Preserved complete PK/UQ/FK, datatype, and nullability information without altering filtering, sorting, or inserted identifiers.

## 0.8.2

- Fixed missing whitespace when accepting an FK JOIN predicate directly after `ON` while preserving existing spaces, newlines, indentation, and partial-predicate replacement.
- Moved compact PK/UQ/FK roles ahead of datatype and nullability so Schema Intelligence metadata remains visible in native completion lists.

## 0.8.1

- Added FK-aware JOIN predicate completion using real cached SQL Server relationships, including reverse query order, composite keys, cross-schema targets, and multiple relationships between the same tables.
- Added relationship-aware JOIN table ranking in both FK directions while excluding disabled relationships and preserving Contains filtering.
- Improved bounded visual alignment of physical-column datatype, nullability, and PK/UQ/FK metadata in native completion lists.

## 0.8.0

- Load primary keys, unique constraints/indexes, filtered unique indexes, and foreign keys with a constant number of set-based catalog queries.
- Preserve composite key/FK order, relationship direction, cross-schema targets, referential actions, and disabled/untrusted state in bidirectional indexes.
- Annotate physical table-column completions with compact `PK`, `UQ`, and `FK` roles while retaining SQL type/nullability and rich relationship documentation.
- Keep incoming references available to the graph/documentation without incorrectly tagging principal columns as foreign-key columns, and retain same-named objects from different schemas in database-wide completion.
- Align physical-column datatype, nullability, and PK/UQ/FK role fields within each native completion set using bounded candidate-derived widths; insertion, matching, sorting, and replacement behavior are unchanged.
- Add the persistent idempotent `reltest`/`relref` Schema Intelligence fixture. JOIN predicate generation and relationship-based ranking remain intentionally out of scope.

## 0.7.7

- Fixed JOIN-condition completion leaking aliases from later JOIN clauses.
- Fixed smart-alias collision detection across unrelated SQL statements.

## 0.7.6

- Added clause-aware expression completion for SELECT, WHERE, JOIN ON, GROUP BY, HAVING, and ORDER BY.
- Added SELECT projection-alias completion in ORDER BY.
- Improved function-argument completion and filtering of irrelevant catalog objects.
- Added set-result-aware final ORDER BY completion.

## 0.7.5

- Fixed column inference for wildcard projections in `UNION`, `INTERSECT`, and `EXCEPT` queries.
- Fixed and strengthened local and correlated member completion inside set-operation branches.

## 0.7.4

- Added semantic projection reconciliation for `UNION`, `UNION ALL`, `INTERSECT`, and `EXCEPT`, including SQL Server operator precedence and first-branch result names.
- Isolated set-operation branch aliases while preserving valid outer correlation and same-server cross-database metadata identity.
- Added set-result completion and wildcard expansion for CTEs, derived tables, and APPLY row sources.

## 0.7.3

- Fixed semantic member completion inside nested and correlated query scopes.
- Added Query Scope diagnostics and reliable provider-origin verification for nested completions.

## 0.7.2

- Fixed correlated outer-alias completion in nested subqueries and APPLY expressions.

## 0.7.1

- Fixed incomplete column inference for `TOP`, `DISTINCT`, and `ALL` queries used in CTEs, derived tables, and APPLY expressions.

## 0.7.0

- Added nested query scope awareness and correlated subquery completion for outer aliases.
- Added local-first alias resolution, lexical shadowing, and isolation between inner, outer, sibling, CTE, and statement scopes.
- Added APPLY-aware left-side correlation while keeping ordinary derived tables non-correlated.
- Added scope-aware column ordering and concise outer-scope origin details.

## 0.6.6

- Added explicit Tab-only expansion of semantic `SELECT *` and `alias.*` projections using cached row-source columns.
- Added smart, editable `AS` alias suggestions after tables, views, CTEs, local row sources, and TVFs.

## 0.6.5

- Fixed automatic Signature Help when typing function-call parentheses and argument commas.
- Improved Signature Help reliability with auto-closing parentheses in VS Code and VSCodium.

## 0.6.4

- Fixed automatic Signature Help activation for user-defined functions.
- Fixed scalar-function Signature Help resolution in interactive SQL editors.

## 0.6.3

- Fixed automatic Signature Help activation for scalar and table-valued functions in SQL editors.
- Improved diagnostics for disabled parameter hints.

## 0.6.2

- Fixed Signature Help for user-defined scalar and table-valued functions.
- Fixed active-parameter tracking for nested function arguments.

## 0.6.1

- Fixed UPDATE SET completion for directly qualified table targets.
- Fixed Signature Help triggering and active-parameter tracking for scalar and table-valued functions.
- Fixed `deleted` completion in DELETE and UPDATE OUTPUT clauses.
- Fixed incomplete `inserted`/`deleted` column matching.
- Fixed DML target metadata leaking between statements.

## 0.6.0

- Added writable-column completion for INSERT target lists and UPDATE SET targets, excluding identity, computed, generated, hidden, and rowversion columns.
- Added named stored-procedure parameter completion for EXEC/EXECUTE, including used-parameter exclusion and OUTPUT details.
- Added scalar and table-valued function signature help with nested-call-aware active parameter tracking.
- Added INSERT/UPDATE/DELETE OUTPUT completion for the synthetic `inserted` and `deleted` row sources.
- Extended same-server cross-database metadata resolution to DML targets, procedures, and callable signatures.

## 0.5.1

- Fixed column-scope leakage between multiple CTEs.
- Fixed `SELECT *` column inference for CTEs and local row sources.
- Fixed alias-member completion for CTEs backed by cross-database sources.

## 0.5.0

- Added column-aware completion for CTEs, including projection aliases and explicit column lists.
- Added typed completion for local and global temporary tables and table variables.
- Added SELECT INTO column inference, including aliases and resolvable star projections.
- Added derived-table and VALUES row-source completion.
- Added CROSS APPLY and OUTER APPLY row-source support.
- Added SELECT projection aliases in ORDER BY completion.

## 0.4.2

- Improved setup handling for overlapping Microsoft mssql suggestions.
- Added effective workspace and workspace-folder override handling.
- Added clearer diagnostics when Microsoft suggestions remain enabled.
- Improved Marketplace documentation and first-run guidance.

## 0.4.1

First public preview release.

- Added true case-insensitive Contains completion for SQL Server objects.
- Added context-aware completion for schemas, tables, views, functions, procedures, aliases, columns, and local row sources.
- Added datatype, nullability, function-signature, and procedure-signature information.
- Added schema-qualified and same-server cross-database completion.
- Added database-wide object search across schemas.
- Added useful `sys` and `INFORMATION_SCHEMA` completion.
- Added per-database metadata caching, refresh, and diagnostics.
- Reused the active Microsoft mssql connection without separate credentials.

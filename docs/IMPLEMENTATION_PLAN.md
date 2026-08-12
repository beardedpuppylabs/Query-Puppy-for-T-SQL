# Implementation plan

## Verified contracts

- VS Code 1.105 completion providers support structured labels, explicit replacement ranges, `filterText`, lazy resolution, and incomplete lists.
- mssql 1.45 exports `connectionSharing` with active connection/database lookup, `connect`, `isConnected`, and `executeSimpleQuery`. `SimpleExecuteResult.rows` contains cell objects. The API is public but marked for future retirement, so all use is isolated in `MssqlApi`/`ConnectionService`.
- `mssql.intelliSense.enableSuggestions` remains the independently configurable Microsoft suggestion switch.

## Execution state

- [x] Initialize strict TypeScript extension and development configuration.
- [x] Build typed metadata model, formatter, index, cache, and catalog queries.
- [x] Add tokenizer, aliases, CTE/local-variable/temp-table symbols, and context resolution.
- [x] Add contains matching, deterministic context sorting, presentation and completion provider.
- [x] Add refresh/status/explicit settings command and diagnostics.
- [x] Add critical unit and acceptance-scenario coverage.
- [x] Run formatter, lint, compile, tests, build, package, and final review.

## Design decisions

One combined catalog query minimizes round trips and is cached by connection ID plus database. Procedure result-set discovery is deliberately deferred rather than risking failure of the base catalog; no schema is fabricated. Completion items use the typed fragment as both their replacement range and `filterText`; because the filter text begins with that fragment, VS Code retains every item already accepted by contains matching while `insertText` remains the real identifier.

## Final verification

The 0.1.1 repair explicitly selects the active database with a safely delimited `USE`, validates the public `SimpleExecuteResult` shape, reports expected/actual database and row/object counts, distinguishes empty and failed cache states, and includes an opt-in IntelliSenseLab integration suite. Final verification state is updated after the repair loop.

Local unit, lint, compile, build, and packaging verification is complete. The real IntelliSenseLab integration suite also passes: it proves the active database and non-empty catalog, loads the required objects and typed columns, verifies middle-of-name `addr` row-source matches, and restricts alias-member results to `dbo.Customers` columns.

## 0.2.0 same-server cross-database execution

- [x] Re-verify current mssql `listDatabases(connectionUri)` public contract.
- [x] Refactor cache APIs around explicit connection/database identity.
- [x] Parse one-, two-, three-part and double-dot identifiers; reject four-part names.
- [x] Retain database identity in aliases and completion candidates.
- [x] Add lazy secondary-database discovery/loading and multi-database status.
- [x] Extend unit and real integration coverage. Both the primary IntelliSenseLab and secondary IntelliSenseLabReporting suites pass.
- [x] Update documentation, verify, and package 0.2.0.

The admin fixture is `tests/fixtures/create-cross-database-fixture.sql`. Unit coverage proves lazy loading, coalescing, per-database isolation, active-database default scope, schema/object qualifier positions, double-dot normalization, cross-database aliases, and four-part rejection.

Final verification: formatting, ESLint, strict compilation, 29 unit tests, both real database integration tests, esbuild, and VSIX packaging pass. IntelliSenseLabReporting proves independent catalog loading, fully qualified tables/views, contains search, cross-database aliases, and cache isolation.

## 0.2.1 database discovery and row-source repair

- [x] Add database as a semantic completion kind in unqualified `FROM`/`JOIN` contexts.
- [x] Reuse lightweight `listDatabases` discovery without loading suggested databases.
- [x] Preserve active-database-only object completion.
- [x] Prove loader/index/candidate flow retains tables, views, and TVFs.
- [x] Add unit and real two-database assertions for database Contains matching and mixed row-source types.
- [x] Complete final verification and package `improved-sql-intellisense-0.2.1.vsix`.

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

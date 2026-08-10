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

# Development

## Prerequisites

- Node.js and npm
- VS Code 1.105 or later
- Microsoft SQL Server (`ms-mssql.mssql`) for Extension Development Host testing

Install dependencies and run the release checks:

```bash
npm install
npm run verify
```

`verify` runs formatting, ESLint, strict TypeScript compilation, unit tests, and the production bundle. Press F5 in VS Code to build and launch an Extension Development Host.

## Integration tests

The live suite is opt-in and skips when its environment is absent:

```bash
npm run test:integration
```

It uses `MSSQL_TEST_SERVER`, `MSSQL_TEST_DATABASE`, `MSSQL_TEST_USER`, and `MSSQL_TEST_PASSWORD`. Cross-database coverage also uses `MSSQL_TEST_SECONDARY_DATABASE`. Keep credentials in the local environment; never commit them. The disposable secondary-database fixture is in `tests/fixtures/create-cross-database-fixture.sql`.

## Architecture

The mssql adapter is the only connection boundary. One catalog batch populates a cache keyed by connection ID and database, so completion never queries on each keystroke. Metadata, parsing, matching, sorting, and candidates remain independent of VS Code; provider and presentation layers own editor types.

The current public mssql connection-sharing API is marked for future retirement. Its use is isolated in `MssqlApi` and `ConnectionService` so a future public replacement can be adopted without changing the completion engine.

Database catalog metadata and document-local semantics are separate layers. `MetadataCache` retains connection/database catalog indexes; `DocumentSemanticAnalyzer` creates scoped row sources and SELECT projections from tokens without querying SQL Server. `DocumentSemanticCache` keys this analysis by document URI, version, cursor, and available catalog identity and discards entries when documents close.

Alias-member completion from this extension is columns-only. If a semantic alias resolves to an empty projection, debug logging records that condition once; generic `abc` document words shown alongside an empty provider result come from the editor's independent word-based suggestions, not from this extension. The extension does not modify `editor.wordBasedSuggestions`.

Build and package independently with:

```bash
npm run build
npm run package
```

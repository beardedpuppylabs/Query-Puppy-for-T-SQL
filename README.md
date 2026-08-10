# Improved SQL IntelliSense

A replacement SQL Server completion provider optimized for very large databases. It uses Microsoft mssql's active editor connection to build its own in-memory catalog and keeps completion in VS Code's normal suggestion UI. It never asks for or stores credentials and never consumes Microsoft's completion list.

The core difference is contiguous, case-insensitive **contains** search. Typing `addr` can find `CustomerAddress`, `BillingAddress`, and `ShippingAddress`; starts-with and substring position receive no ranking bonus.

## Requirements and setup

- VS Code 1.105 or compatible editor
- [Microsoft SQL Server (`ms-mssql.mssql`)](https://marketplace.visualstudio.com/items?itemName=ms-mssql.mssql)
- An active mssql connection on the SQL editor

Disable Microsoft's overlapping completion provider with the command **Disable Microsoft SQL Suggestions Globally**, or set the global setting:

```json
"mssql.intelliSense.enableSuggestions": false
```

The extension only changes this setting after that explicit command/action. Leave `mssql.intelliSense.enableQuickInfo` and `mssql.intelliSense.enableErrorChecking` enabled.

Metadata is loaded once per mssql connection identity/database and retained in memory. Every catalog batch explicitly selects the active editor database. Use **Refresh IntelliSense Metadata** after schema changes. **Show Improved SQL IntelliSense Status** distinguishes disconnected, not loaded, loading, loaded, unexpectedly empty, and failed states. Detailed database-context and row/object counts are written to the **Improved SQL IntelliSense** output channel without connection secrets.

## Development

```bash
npm install
npm run format:check
npm run lint
npm run compile
npm test
npm run test:integration # requires MSSQL_TEST_SERVER/DATABASE/USER/PASSWORD
npm run build
```

Open the repository in VS Code and press F5 to build and launch an Extension Development Host. The checked-in launch configuration runs the build task first.

Package and install:

```bash
npm run package
code --install-extension improved-sql-intellisense-0.1.1.vsix
```

## Architecture

The mssql adapter is the only connection boundary. A catalog loader queries SQL Server `sys.*` views in one round trip, then a per-connection/database cache serves completion without keystroke queries. Pure metadata, parser, matching, sorting, and candidate layers are independent of VS Code; only the provider/presenter use editor types. Explicit replacement ranges and fragment-prefixed `filterText` prevent VS Code's secondary prefix filtering from removing contains matches.

## Prototype limitations

- The lightweight tokenizer is intentionally not a complete T-SQL parser. It handles ordinary/bracketed identifiers, comments, strings, common aliases, CTE names, variables and temp-table names, but deeply nested queries and unusual grammar can reduce context quality.
- CTE/table-variable/temp-table column inference is not yet implemented; their names are available as row sources.
- Stored procedure first-result-set discovery is not performed in this version because SQL Server can reject it for permissions, dynamic SQL, or control flow. No result schema is fabricated.
- Explicitly schema-qualified aliases resolve that schema. An unqualified source resolves only when its name is unique; ambiguous names intentionally produce no member completion.
- Metadata reload is explicit after DDL. Switching databases creates a different cache key and cannot serve the prior database's index.
- mssql 1.45 still publishes connection sharing but marks it for future retirement. The adapter is deliberately small so a replacement public contract can be adopted cleanly.

The next milestone should add incremental document parsing and reliable local/CTE column inference, followed by permission-tolerant procedure result-set discovery.

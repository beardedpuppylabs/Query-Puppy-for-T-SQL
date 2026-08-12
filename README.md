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

## Same-server cross-database completion

Version 0.2 supports normal SQL Server object qualification:

```sql
Customers
dbo.Customers
ReportingDb.reporting.CustomerAddressReport
ReportingDb..Customers -- implicit dbo
```

The active editor database remains the default object scope. In `FROM`/`JOIN`, lightweight database-name candidates also participate using Contains matching, so `FROM Intelli` can suggest `IntelliSenseLab` and `IntelliSenseLabReporting` without loading either secondary catalog. An unqualified object search such as `FROM cust` never searches objects from other cached databases. A secondary database's metadata is loaded only after an explicit reference such as `ReportingDb.` or `ReportingDb.reporting.addr`. Loads are cached and concurrent requests for the same connection/database are coalesced.

Row-source completion includes CTEs, temp tables, table variables, tables, views, inline and multi-statement table-valued functions, and synonyms. Mixed results are grouped by semantic type and sorted alphabetically within each type.

The active database's schemas also participate directly in unqualified `FROM`/`JOIN` completion with the same Contains matching. For example, `FROM schem` can find `INFORMATION_SCHEMA`, and schema results sort before matching row-source objects. Accepting a schema inserts its trailing dot and immediately opens object completion, so `FROM inf` can continue naturally to `INFORMATION_SCHEMA.TABLES`; `sys.tables` works the same way without an active-database prefix.

### Database-wide editing shortcut

Normal SQL remains `Object`, `Schema.Object`, or `Database.Schema.Object`. Version 0.3 adds a completion-only shortcut for finding an object when its schema is unknown:

```sql
Database.          -- schemas only
Database.addr      -- matching schemas, then matching row sources across schemas
Database.crm.addr  -- strict crm-only object search
```

`Database.addr` is intentionally incomplete SQL, not a new interpretation of SQL Server two-part names. A shortcut result is visibly qualified, such as `crm.CustomerAddress_0001`; accepting it replaces only `addr`, producing valid `Database.crm.CustomerAddress_0001` SQL. Matching schemas always precede shortcut objects. If the first identifier is a valid schema in the active database, normal `Schema.Object` semantics win over the convenience shortcut.

Developer-facing metadata schemas are indexed too. `sys.tables`, `sys.columns`, `sys.objects`, `sys.schemas`, and common `INFORMATION_SCHEMA` views complete normally, including cross-database forms. The `sys` policy is an explicit allowlist; the extension does not expose every shipped/internal Microsoft object.

Aliases retain their database identity, so columns for aliases in a cross-database join always come from the correct catalog. `linkedserver.database.schema.object` four-part names and Linked Server metadata discovery are intentionally unsupported.

**Refresh IntelliSense Metadata** refreshes only the active editor database. The status command lists every database currently cached for that connection.

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
code --install-extension improved-sql-intellisense-0.3.1.vsix
```

## Architecture

The mssql adapter is the only connection boundary. A catalog loader queries SQL Server `sys.*` views in one round trip, then an explicitly keyed `(connection ID, database)` cache serves completion without keystroke queries. The scope resolver performs lightweight database discovery and lazy loading only for explicit qualifiers. Pure metadata, parser, scope, matching, sorting, and candidate layers are independent of VS Code; only the provider/presenter use editor types. Explicit replacement ranges and fragment-prefixed `filterText` prevent VS Code's secondary prefix filtering from removing contains matches.

The normal integration suite skips without its environment variables. Cross-database integration additionally requires `MSSQL_TEST_SECONDARY_DATABASE=IntelliSenseLabReporting`. The restricted test login cannot create databases; an administrator can provision the small idempotent fixture at `tests/fixtures/create-cross-database-fixture.sql`. The fixture creates metadata-only test objects and grants the existing integration login `CONNECT` and `VIEW DEFINITION` in that disposable database.

## Prototype limitations

- The lightweight tokenizer is intentionally not a complete T-SQL parser. It handles ordinary/bracketed identifiers, comments, strings, common aliases, CTE names, variables and temp-table names, but deeply nested queries and unusual grammar can reduce context quality.
- CTE/table-variable/temp-table column inference is not yet implemented; their names are available as row sources.
- Stored procedure first-result-set discovery is not performed in this version because SQL Server can reject it for permissions, dynamic SQL, or control flow. No result schema is fabricated.
- Explicitly schema-qualified aliases resolve that schema. An unqualified source resolves only when its name is unique; ambiguous names intentionally produce no member completion.
- Metadata reload is explicit after DDL. Switching databases creates a different cache key and cannot serve the prior database's index.
- mssql 1.45 still publishes connection sharing but marks it for future retirement. The adapter is deliberately small so a replacement public contract can be adopted cleanly.
- Cross-database support is limited to databases on the active SQL Server connection. Linked Servers are not queried or indexed.

The next milestone should add incremental document parsing and reliable local/CTE column inference, followed by permission-tolerant procedure result-set discovery.

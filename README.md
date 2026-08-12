# Improved SQL IntelliSense

Improved SQL IntelliSense is a SQL Server completion provider built for fast navigation of large databases. It adds context-aware, metadata-rich suggestions with contiguous, case-insensitive **Contains** matching while reusing the active Microsoft mssql connection. There is no second connection to configure and no duplicate set of credentials to store.

Microsoft's standard completion normally favors names from the beginning. Contains search finds a fragment anywhere in a name. For example, typing `addr` can find:

```text
Addresses
CustomerAddresses
BillingAddress
ShippingAddress
```

Only exact names receive name-based priority. Other matches sort deterministically by semantic type and then alphabetically.

## Requirements

- VS Code 1.105 or later
- [Microsoft SQL Server (`ms-mssql.mssql`)](https://marketplace.visualstudio.com/items?itemName=ms-mssql.mssql)
- An active mssql connection for the SQL editor

The Microsoft SQL Server extension is declared as a required extension dependency. Improved SQL IntelliSense communicates through its public connection-sharing API; it never asks for or stores SQL credentials.

## Features

- Contains completion for schemas, tables, views, table-valued functions, scalar functions, and stored procedures
- Column detail with datatype and `NULL`/`NOT NULL`
- Scalar-function signatures and return types, and stored-procedure signatures
- Alias member completion such as `c.addr`
- `Schema.Object`, `Database.Schema.Object`, and `Database..Object` navigation
- Same-server cross-database joins with database-correct alias metadata
- Database-wide object-search shortcut when a schema is unknown
- Normal completion for curated `sys` metadata and common `INFORMATION_SCHEMA` views
- In-memory metadata caching with no catalog query on each keystroke
- **Refresh IntelliSense Metadata** after DDL changes
- **Show Improved SQL IntelliSense Status** plus an optional diagnostic output channel

Row-source completion also recognizes CTEs, temporary tables, table variables, and synonyms.

## Using completion

### Contains

```sql
SELECT *
FROM addr
```

This can suggest any table, view, or table-valued function whose name contains `addr`, regardless of case.

### Schema qualification

```sql
SELECT *
FROM reporting.cust
```

### Alias members

```sql
SELECT c.addr
FROM dbo.Customers AS c
```

### Cross-database joins

The following fixture names are examples; use databases available on your active SQL Server connection.

```sql
SELECT
    c.*,
    ca.AddressId
FROM IntelliSenseLabReporting.dbo.Customers AS c
JOIN IntelliSenseLab.dbo.CustomerAddresses AS ca
    ON c.CustomerNumber = ca.CustomerId
```

Secondary database metadata loads only after explicit qualification. An ordinary unqualified search remains scoped to the active database.

### Database-wide editing shortcut

Normal navigation works as follows:

```text
Database.                 -> schemas
Database.Schema.          -> objects from that schema
Database.fragment         -> schema matches first, then objects across schemas
```

`Database.fragment` is an IntelliSense editing convenience, not new SQL Server syntax. If `ReportingDb.addr` finds `CustomerAddresses` in schema `sales`, accepting it inserts a valid name:

```sql
ReportingDb.sales.CustomerAddresses
```

If the first identifier is an active-database schema, normal `Schema.Object` behavior takes precedence.

## System metadata

These supported targets complete like normal schema-qualified objects:

```sql
INFORMATION_SCHEMA.TABLES
INFORMATION_SCHEMA.COLUMNS
sys.tables
sys.columns
sys.objects
```

The `sys` catalog is deliberately limited to a useful allowlist instead of exposing every internal Microsoft object.

## Avoiding duplicate suggestions

Microsoft's SQL suggestions should be disabled when using this extension so two completion providers do not return duplicate results. On first use, Improved SQL IntelliSense shows a one-time prompt and changes `mssql.intelliSense.enableSuggestions` only if you choose **Disable globally**.

You can perform the same explicit action later with **Disable Microsoft SQL Suggestions Globally**. This does not disable `mssql.intelliSense.enableQuickInfo` or `mssql.intelliSense.enableErrorChecking`.

## Metadata and diagnostics

Catalog metadata is cached in memory by mssql connection identity and database. Use **Refresh IntelliSense Metadata** after schema changes. Use **Show Improved SQL IntelliSense Status** to see connection state and cached databases. Enable `improvedSqlIntellisense.debugLogging` to write database context and metadata counts to the **Improved SQL IntelliSense** output channel; connection secrets are not logged.

## Privacy and data handling

Improved SQL IntelliSense has no telemetry. It does not transmit query text to an external service, store SQL credentials, or open an independent SQL connection. SQL Server catalog access is performed only through the installed Microsoft mssql extension and its active editor connection.

## Known limitations

- The defensive tokenizer is not a complete T-SQL compiler. Deeply nested queries or unusual grammar can reduce context accuracy.
- CTE, table-variable, and temporary-table names are recognized, but their columns are not inferred yet.
- Stored-procedure first-result-set discovery is not performed; no result schema is fabricated.
- An unqualified source resolves for alias members only when its name is unique. Ambiguous names intentionally return no member completion.
- Metadata refresh after DDL is explicit.
- Cross-database completion is limited to databases on the active SQL Server connection. Linked Servers and four-part names are out of scope.
- The public mssql connection-sharing API is marked for future retirement; integration is isolated so a future public replacement can be adopted.

## Development and support

Repository contributors can find build instructions in `docs/DEVELOPMENT.md` and the release procedure in `docs/PUBLISHING.md`. `SUPPORT.md` lists useful diagnostic information.

## License

Improved SQL IntelliSense is released under the MIT License. See the root `LICENSE` file for the full terms.

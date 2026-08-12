# Improved SQL IntelliSense

Improved SQL IntelliSense is a SQL Server completion provider designed for fast navigation of large databases. It uses case-insensitive Contains matching, so a fragment can match anywhere in an object name, while reusing the active Microsoft mssql connection. No second connection or duplicate credentials are required.

Typing `addr` may find:

```text
Addresses
CustomerAddresses
BillingAddress
ShippingAddress
```

> [!IMPORTANT]
> **Disable Microsoft mssql suggestions when using this extension.**
>
> Improved SQL IntelliSense replaces the suggestion provider from `ms-mssql.mssql`. Running both providers can produce duplicate or inconsistent completion results.
>
> Choose **Disable globally** when prompted on first use, or run **Improved SQL IntelliSense: Disable Microsoft SQL Suggestions** from the Command Palette.
>
> mssql Quick Info and SQL error checking remain available.

## Why Contains?

Matching is contiguous and case-insensitive: `addr` can occur anywhere in a name. An exact match may be prioritized; otherwise results are grouped by semantic type and sorted alphabetically.

## Features

- Case-insensitive Contains completion
- Schemas, tables, views, synonyms, table-valued functions, scalar functions, and stored procedures
- CTEs, temporary tables, and table variables
- Column detail with datatype and `NULL`/`NOT NULL`
- Scalar-function signatures and return types, and stored-procedure signatures
- Alias member completion such as `c.addr`
- `Schema.Object`, `Database.Schema.Object`, and `Database..Object` navigation
- Same-server cross-database completion and database-wide cross-schema search
- `sys` and `INFORMATION_SCHEMA` completion
- In-memory metadata caching
- **Refresh IntelliSense Metadata** after DDL changes
- **Show Improved SQL IntelliSense Status** plus an optional diagnostic output channel

## Usage

### Contains

```sql
SELECT *
FROM addr
```

This can suggest any table, view, or table-valued function whose name contains `addr`, regardless of case.

### Alias

```sql
SELECT c.addr
FROM dbo.Customers AS c
```

### Schema

```sql
SELECT *
FROM reporting.cust
```

### Cross database

Same-server database completion uses databases available through the active mssql connection.

```sql
SELECT
    c.CustomerId,
    o.OrderNumber
FROM CRM.dbo.Customers AS c
JOIN Reporting.sales.Orders AS o
    ON o.CustomerId = c.CustomerId
```

### Database-wide editing shortcut

Normal navigation works as follows:

```text
Database.                 -> schemas
Database.Schema.          -> objects from that schema
Database.fragment         -> schema matches first, then objects across schemas
```

If `ReportingDb.addr` finds `CustomerAddresses` in schema `sales`, accepting it inserts:

```sql
ReportingDb.sales.CustomerAddresses
```

The shortcut inserts a valid `Database.Schema.Object` name; it is not new SQL Server syntax.

System targets work normally, including:

```sql
INFORMATION_SCHEMA.TABLES
INFORMATION_SCHEMA.COLUMNS
sys.tables
sys.columns
sys.objects
```

Use **Refresh IntelliSense Metadata** after schema changes and **Show Improved SQL IntelliSense Status** for connection, cache, and completion-provider diagnostics.

## Requirements

- VS Code 1.105 or later
- [Microsoft SQL Server (`ms-mssql.mssql`)](https://marketplace.visualstudio.com/items?itemName=ms-mssql.mssql)
- An active mssql SQL Server connection

## Privacy

Improved SQL IntelliSense has no telemetry. It does not transmit query text to an external service, store SQL credentials, or open an independent SQL connection. SQL Server catalog access is performed only through the installed Microsoft mssql extension and its active editor connection.

## Known limitations

- The defensive tokenizer is not a complete T-SQL compiler. Deeply nested queries or unusual grammar can reduce context accuracy.
- CTE, table-variable, and temporary-table names are recognized, but their columns are not inferred yet.
- Stored-procedure first-result-set discovery is not performed; no result schema is fabricated.
- Metadata refresh after DDL is explicit.
- Cross-database completion is limited to databases on the active SQL Server connection. Linked Servers and four-part names are out of scope.

## Development and support

Contributor guidance is maintained in `docs/DEVELOPMENT.md` and `docs/PUBLISHING.md`; support guidance is in `SUPPORT.md` in the source repository.

## License

Improved SQL IntelliSense is released under the MIT License. See the root `LICENSE` file for the full terms.

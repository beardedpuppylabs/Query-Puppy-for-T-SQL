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
- Column-aware CTEs, temporary tables, table variables, and derived tables
- `SELECT INTO`, `VALUES`, `CROSS APPLY`, and `OUTER APPLY` row-source inference
- Column detail with datatype and `NULL`/`NOT NULL`
- Scalar-function signatures and return types, and stored-procedure signatures
- INSERT/UPDATE writable-column and EXEC named-parameter completion
- Automatic function Signature Help while typing, with active-parameter tracking; use `Ctrl+Shift+Space` to reopen it manually
- DML OUTPUT completion through `inserted` and `deleted`
- Tab-only expansion of `SELECT *` and `alias.*` into ordered, qualified columns
- Smart editable `AS` alias suggestions after row sources
- Alias member completion such as `c.addr`
- `Schema.Object`, `Database.Schema.Object`, and `Database..Object` navigation
- Same-server cross-database completion and database-wide cross-schema search
- `sys` and `INFORMATION_SCHEMA` completion
- In-memory metadata caching
- **Refresh IntelliSense Metadata** after DDL changes
- **Show Improved SQL IntelliSense Status** plus an optional diagnostic output channel

## Usage

### Expand SELECT wildcards

Place the cursor directly after `*` in a SELECT projection and press Tab. The extension replaces only that wildcard with columns already available from catalog or document-local metadata. Enter always retains its normal editor behavior, and Tab behaves normally outside a resolvable projection wildcard.

For `alias.*`, only that alias is expanded. A plain `*` includes visible row sources in source order and qualifies generated columns.

### Smart aliases

After completing or manually typing a resolvable row source in FROM, JOIN, or APPLY, accept the top `AS` snippet to insert a short editable alias such as `AS co` for `CustomerOrders`. Disable this with `improvedSqlIntellisense.smartAliases.enabled` if desired.

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

### DML and callable objects

```sql
INSERT INTO dbo.Customers (CustomerCode, EmailAddress)

UPDATE c SET BillingAddressId = a.AddressId
FROM dbo.Customers AS c
JOIN dbo.Addresses AS a ON a.CustomerId = c.CustomerId

EXEC dbo.FindCustomerAddress @Search = N'Berlin', @MaxRows = 10

SELECT billing.CalculateBillingTotal(NetAmount, TaxRate)
```

INSERT and UPDATE target completion omits server-maintained columns. EXEC named parameters remain in declaration order and disappear after assignment. Function calls show their parameter list and return type while the cursor moves between arguments.

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

### Document-local row sources

Projected columns, aliases, types, and nullability are inferred where reliable:

```sql
WITH CustomerData AS
(
    SELECT CustomerId, BillingAddressId
    FROM dbo.Customers
)
SELECT c.
FROM CustomerData c
```

Temporary tables created with `CREATE TABLE` or `SELECT INTO`, table variables, derived tables, `VALUES`, and APPLY sources participate in the same alias-member completion.

Use **Refresh IntelliSense Metadata** after schema changes and **Show Improved SQL IntelliSense Status** for connection, cache, and completion-provider diagnostics.

## Requirements

- VS Code 1.105 or later
- [Microsoft SQL Server (`ms-mssql.mssql`)](https://marketplace.visualstudio.com/items?itemName=ms-mssql.mssql)
- An active mssql SQL Server connection

## Privacy

Improved SQL IntelliSense has no telemetry. It does not transmit query text to an external service, store SQL credentials, or open an independent SQL connection. SQL Server catalog access is performed only through the installed Microsoft mssql extension and its active editor connection.

## Known limitations

- The defensive tokenizer is not a complete T-SQL compiler. Deeply nested queries or unusual grammar can reduce context accuracy.
- Unaliased computed projections without a reliable SQL output name are omitted.
- Recursive CTE and UNION branch type reconciliation is best-effort.
- Stored-procedure first-result-set discovery is not performed; no result schema is fabricated.
- Metadata refresh after DDL is explicit.
- Cross-database completion is limited to databases on the active SQL Server connection. Linked Servers and four-part names are out of scope.

## Development and support

Contributor guidance is maintained in `docs/DEVELOPMENT.md` and `docs/PUBLISHING.md`; support guidance is in `SUPPORT.md` in the source repository.

## License

Improved SQL IntelliSense is released under the MIT License. See the root `LICENSE` file for the full terms.

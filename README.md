# Query Puppy for T-SQL

Query Puppy for T-SQL is context-aware SQL Server IntelliSense for databases where memorizing every table, column, function, and relationship is unrealistic. It combines case-insensitive Contains discovery with query-scope analysis and real SQL Server schema metadata.

In a schema with hundreds or thousands of objects, remembering part of a name should be enough to find it. Once tables are joined, actual foreign-key metadata can help construct the `ON` predicate. The extension provides its own completion provider while reusing the active Microsoft SQL Server (`mssql`) connection—there is no second login or separate connection configuration.

## Highlights

- Contains-based discovery across large SQL Server catalogs
- Context-aware completion for clauses, expressions, aliases, and query-local sources
- PK, UQ, and FK metadata on physical columns
- JOIN predicates generated from actual foreign-key relationships
- Query-local scope intelligence for CTEs, temp tables, derived tables, and more
- Scalar-function and table-valued-function Signature Help
- Same-server cross-database completion
- Active `mssql` connection reuse with durable, stale-while-refresh metadata

## Find objects by what you remember

Type a fragment:

```text
addr
```

and find names such as:

```text
Addresses
BillingAddresses
CustomerAddresses
ShippingAddresses
```

Matching is contiguous, case-insensitive Contains—not fuzzy search and not only StartsWith. Exact names may rank first; otherwise results use deterministic semantic groups and alphabetical order within equivalent tiers.

Then let a real SQL Server foreign key complete the join:

```sql
FROM dbo.Customers AS c
JOIN sales.CustomerOrders AS o
    ON
```

can suggest:

```sql
o.CustomerId = c.CustomerId
```

## Context-aware completion

Completion follows the SQL position instead of showing every catalog object everywhere:

```sql
SELECT c.addr
FROM dbo.Customers AS c
WHERE c.
ORDER BY c.
```

- `FROM`, `JOIN`, and `APPLY` offer row sources such as tables, views, synonyms, TVFs, and visible local sources.
- `alias.` offers columns projected by that row source.
- `SELECT`, `WHERE`, `GROUP BY`, `HAVING`, `ORDER BY`, and function arguments offer meaningful expression candidates rather than databases, procedures, and tables.
- Projection aliases are available where SQL Server permits them, including `ORDER BY`.

Contains filtering remains active inside these semantic domains. For example, `c.addr` can find every visible column containing `addr`.

## Type-aware completion

Query Puppy for T-SQL can infer the type expected at common expression positions and rank compatible expressions higher. For example:

```sql
WHERE oh.CustomerId = c.
```

If `oh.CustomerId` is `bigint`, the native suggestion list explains the ranking with compact groups:

```text
─ Type match · bigint
  BillingAddressId
  CustomerId
─ Compatible numeric
  RegionId
─ Other visible columns
  CustomerCode
  DisplayName
```

Only non-empty groups are shown, and a one-group result remains uncluttered. Within a group candidates are alphabetical. Visible string, GUID, and other columns remain selectable—type-aware completion ranks rather than hides visible candidates. With no known expected type there are no type groups and the previous semantic/alphabetical order is preserved exactly.

The same reusable type model supports comparisons in `WHERE` and `JOIN`, catalog-backed scalar UDF/TVF arguments, `UPDATE` right-hand sides, explicit-column `INSERT ... VALUES` and `INSERT ... SELECT`, `LIKE`, and simple arithmetic. For example, inside a parameter declared as `decimal(18,2)`, decimal candidates rank above unrelated types.

The resulting sort key is deterministic: exact typed-name match, real FK JOIN priority where applicable, type compatibility (exact facets, same base type, compatible family, unknown, incompatible), existing semantic/scope priority, semantic kind, then alphabetical name/schema order.

## Schema Intelligence

Query Puppy for T-SQL reads SQL Server catalog metadata for primary keys, unique constraints and indexes, and foreign keys. It understands composite keys, composite foreign keys, filtered unique indexes, and cross-schema relationships within a database.

Physical-column suggestions use one deterministic visible row with fixed name, role, type, and nullability slots:

```text
CustomerId         PK      bigint          NOT NULL
CustomerCode       UQ      varchar(50)     NOT NULL
BillingAddressId   FK      bigint          NULL
DisplayName                nvarchar(200)   NULL
```

Multiple roles appear compactly, for example `PK·FK`. The row uses fixed 32/8/20-character name, role, and type slots before nullability. A shortened visible name still filters, sorts, and inserts using the complete identifier. Completion documentation wraps long identifiers at approximately 40 characters and retains the complete column name, constraint names, composite columns, FK mappings, referential actions, datatype, and nullability.

## FK-aware JOIN Intelligence

After a joined row source, `ON` can offer a complete predicate from the actual enabled SQL Server foreign key:

```sql
FROM dbo.Customers AS c
JOIN sales.CustomerOrders AS o
    ON o.CustomerId = c.CustomerId
```

The relationship is not guessed from similar column names. The currently joined right-side alias is rendered first, and disabled foreign keys are not used as normal relationship suggestions.

When several foreign keys connect the same tables, each valid relationship remains a separate choice. A customer-to-address join can therefore distinguish primary, billing, and shipping address relationships instead of choosing one heuristically.

Composite foreign keys are offered as one ordered predicate:

```sql
ol.CompanyId = oh.CompanyId
AND ol.OrderId = oh.OrderId
```

At a `JOIN` source position, objects connected to a legally visible left source by an enabled FK receive a semantic ranking boost. Contains filtering still applies, and unrelated matching objects remain available.

## Query-local intelligence

Document-local row sources participate in the same completion model as catalog objects:

```sql
WITH CustomerData AS
(
    SELECT CustomerId, BillingAddressId
    FROM dbo.Customers
)
SELECT c.
FROM CustomerData AS c
```

Supported sources include CTEs, `CREATE TABLE` and `SELECT INTO` temp tables, table variables, derived tables, `VALUES`, and `CROSS APPLY`/`OUTER APPLY`. Projected columns, aliases, types, and nullability are retained where they can be inferred reliably.

Nested scopes resolve aliases from the innermost query outward. Eligible correlated outer references remain visible, while inner aliases, sibling scopes, and shadowed names stay isolated. Ordinary derived tables do not correlate; the right side of `APPLY` can see eligible left-side sources.

Set operations—`UNION`, `UNION ALL`, `INTERSECT`, and `EXCEPT`—compose result columns by ordinal using the first branch's names. Their results work through CTEs, derived tables, `APPLY`, alias completion, and wildcard expansion.

## Functions, procedures, and DML

Scalar functions, TVFs, and supported SQL Server built-ins provide VS Code Signature Help with active-argument tracking. Built-in completion, ExpectedType ranking, and return inference currently cover `CHARINDEX`, `DATEADD`, `DATEDIFF`, `DATEFROMPARTS`, `ROUND`, `STRING_AGG`, and `SUBSTRING`. Signature Help opens automatically after `(`, follows commas, and can be reopened with the editor's **Trigger Parameter Hints** command.

Additional context-aware support includes:

- writable-column completion for `INSERT`
- `UPDATE` target and right-hand expression awareness
- statement-correct `inserted` and `deleted` columns in `OUTPUT`
- named `EXEC` parameters in declaration order, excluding parameters already assigned
- stored-procedure parameter signatures

Server-maintained identity, computed, generated, and rowversion columns are excluded from writable-column suggestions.

## SELECT wildcard expansion

Place the cursor directly after a semantic `*` or `alias.*` in a SELECT projection and press Tab to replace that wildcard with known columns. Source and column order are preserved.

- One unaliased source produces unqualified columns.
- One explicitly aliased source uses that alias.
- Multiple visible sources use their aliases or shortest deterministic qualifiers.
- An explicit `alias.*` always preserves that qualifier.

Enter never expands a wildcard. This keeps an ordinary `SELECT *` safe on very wide tables. Tab behaves normally when the wildcard cannot be resolved.

## Smart aliases

After a row source in `FROM`, `JOIN`, or `APPLY`, the extension can suggest an editable alias:

```text
Customers       -> AS c
CustomerOrders  -> AS co
```

Aliases are suggestions, not forced rewrites. They can be disabled with `queryPuppyForTSql.smartAliases.enabled`.

## Cross-database completion

Database, schema, and object qualification work across databases available through the same active SQL Server connection:

```text
Database.                 -> schemas
Database.Schema.          -> objects in that schema
Database.fragment         -> schema matches, then objects across schemas
Database..Object          -> dbo object
```

Secondary-database metadata is loaded only after explicit qualification. Ordinary unqualified `FROM` completion remains restricted to the active database. Linked Servers and four-part names are not supported.

## How it works with mssql

[Microsoft SQL Server (`ms-mssql.mssql`)](https://marketplace.visualstudio.com/items?itemName=ms-mssql.mssql) is a required dependency because it owns SQL Server connections. Query Puppy for T-SQL uses the extension's supported connection-sharing API to identify the active connection/database, list same-server databases, and execute catalog queries.

Query Puppy for T-SQL does not consume or filter Microsoft's completion output; it registers its own completion provider. Running both providers can produce duplicate suggestions. On first use, Query Puppy for T-SQL can offer to disable `mssql.intelliSense.enableSuggestions` globally, or you can run **Query Puppy for T-SQL: Disable Microsoft SQL Suggestions**. It never changes that setting silently. Other `mssql` services, including connection handling, remain available.

## Performance and caching

Catalog metadata is loaded with set-based queries and cached per connection and database. A first cold load is shown in the status bar and writes a durable snapshot to VS Code/VSCodium's extension storage. On later sessions, that snapshot is available immediately while one refresh runs in the background. Completion and FK relationship lookup use the in-memory indexes—there is no metadata query or disk read per keystroke.

After the first session refresh, the fixed 15-minute freshness threshold is checked only when that database is actually used; Query Puppy does not poll every cached database. Secondary databases remain lazy and independently cached. Run **Query Puppy for T-SQL: Refresh Schema Metadata** to pick up a known DDL change immediately.

## Privacy and database permissions

- No extension-specific database credentials are requested or stored.
- The active `mssql` connection is reused; no independent SQL connection is opened.
- Schema metadata discovery is read-only and does not require DDL or DML privileges.
- Allow-listed schema metadata is cached in extension-owned local storage and memory. It contains no database credentials, tokens, query text, or document-local SQL state.
- The extension contains no telemetry and does not upload query text or database content to an external service.

The connected login still needs permission to read the relevant SQL Server catalog metadata.

## Installation and getting started

1. Install [Microsoft SQL Server (`ms-mssql.mssql`)](https://marketplace.visualstudio.com/items?itemName=ms-mssql.mssql).
2. Install [Query Puppy for T-SQL from the Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=BeardedPuppyLabs.query-puppy-for-t-sql), or install a release VSIX in VSCodium.
3. Open a SQL document and connect it with `mssql`.
4. If duplicate completion lists appear, disable Microsoft SQL suggestions when prompted or with the provided command.

Requires VS Code 1.105 or a compatible VSCodium release.

## Commands

- **Query Puppy for T-SQL: Expand SELECT \* to Columns**
- **Query Puppy for T-SQL: Refresh Schema Metadata**
- **Query Puppy for T-SQL: Clear Schema Cache for Active Database**
- **Query Puppy for T-SQL: Show Status**
- **Query Puppy for T-SQL: Disable Microsoft SQL Suggestions**
- **Query Puppy for T-SQL: Diagnose Signature Help**
- **Query Puppy for T-SQL: Diagnose Query Scope**

The diagnostic commands report connection, cache, scope, visible-row-source, correlation, and provider information through VS Code/VSCodium UI and the extension output channel.

## Settings

- `queryPuppyForTSql.enabled`: enable or disable Query Puppy for T-SQL completion.
- `queryPuppyForTSql.debugLogging`: write detailed diagnostics to the **Query Puppy for T-SQL** output channel.
- `queryPuppyForTSql.smartAliases.enabled`: enable or disable smart alias suggestions.

## Known limitations

- SQL Server is the only supported database engine.
- Linked Servers and four-part object names are out of scope. Cross-database support is limited to databases on the active SQL Server connection.
- The defensive parser is not a complete T-SQL compiler; unusually exotic or incomplete grammar can reduce context accuracy.
- Type inference is conservative. Unnamed computed projections may be omitted, and recursive CTE/set-branch type reconciliation is best-effort.
- Type-aware ranking does not implement SQL Server's complete conversion and datatype-precedence engine. Built-in intelligence is intentionally limited to the documented supported set rather than a complete SQL Server function catalog.
- Stored-procedure result-set discovery is not performed, so the extension does not fabricate procedure result columns.
- JOIN predicates require real, enabled FK metadata. The extension does not infer relationships from naming conventions or similar datatypes.
- Background refresh is intentionally a full snapshot refresh, not true incremental schema synchronization. Use the manual refresh command when a just-applied DDL change must appear immediately.
- Completion detail width is controlled by the native Suggest Widget and may be truncated in narrow layouts.

## Development and support

Contributor guidance is in `docs/DEVELOPMENT.md`, publishing guidance is in `docs/PUBLISHING.md`, and support information is in `SUPPORT.md` in the source repository.

## License

Query Puppy for T-SQL is open-source software released under the MIT License. See `LICENSE` in the source repository for the full terms.

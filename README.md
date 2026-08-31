# Query Puppy for T-SQL

Query Puppy for T-SQL is context-aware SQL Server IntelliSense for large and complex databases where memorizing every table, column, function, and relationship is unrealistic. It combines case-insensitive Contains discovery with query-scope analysis, expected types, document-local navigation, and real SQL Server schema metadata.

Query Puppy for T-SQL is free and open-source software under the [GNU General Public License version 3 only](https://github.com/beardedpuppylabs/Query-Puppy-for-T-SQL/blob/main/LICENSE). [Source code, issues, and development](https://github.com/beardedpuppylabs/Query-Puppy-for-T-SQL) are hosted publicly on GitHub.

In a schema with hundreds or thousands of objects, remembering part of a name should be enough to find it. Types and trustworthy schema relationships help rank the most useful suggestions, and relationship intelligence can construct `JOIN` predicates. The extension provides its own completion provider while reusing the active Microsoft SQL Server (`mssql`) connection—there is no second login or separate connection configuration.

## Highlights

- Contains-based discovery across large SQL Server catalogs
- Context- and query-scope-aware completion
- Type-aware ranking that keeps legal alternatives available
- PK, UQ, and FK metadata on physical columns
- JOIN predicates based on actual foreign keys, explicit project relationships, user-confirmed JOINs, qualifying learned evidence, and conservative pair-bounded heuristic fallback
- Local, privacy-conscious acquisition of resolved JOIN evidence on document save
- Built-in and catalog function completion, typing, and Signature Help
- Document-local Go to Definition, Peek Definition, and Find References for
  supported SQL symbols
- Smart Alias and Tab-only wildcard productivity features
- Query-local sources and same-server cross-database completion
- Persistent per-database metadata for fast warm starts
- Active `mssql` connection reuse without separate credentials

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

Typing the whitespace after `ON` can open native completion automatically. If no
usable relationship is known, Query Puppy still offers legal aliases and columns
for the ON expression. It never invents a relationship predicate from name or
datatype similarity alone; the conservative pair-bounded heuristic policy described
below requires complete key, type, naming, and ambiguity evidence.

After a completed unaliased INNER, LEFT, RIGHT, or FULL JOIN source, Query Puppy
offers both the preferred Smart Alias and the `ON` continuation keyword. After a
completed alias, only `ON` remains. CROSS JOIN and APPLY keep their own syntax and
do not receive `ON`.

## Context-aware completion

Completion follows the SQL position instead of showing every catalog object everywhere:

```sql
SELECT c.addr
FROM dbo.Customers AS c
WHERE c.
ORDER BY c.
```

- `FROM`, `JOIN`, and `APPLY` offer row sources such as tables, views, synonyms, TVFs, and visible local sources.
- `UPDATE`, `INSERT INTO`, and `DELETE FROM` target positions offer writable target row sources with the same Contains and qualification behavior.
- Ctrl+Space works at a blank target position; typing a target fragment participates in normal editor suggestion behavior. Query Puppy does not force the multi-provider Suggest Widget open on the blank keyword-space boundary.
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

Only non-empty groups are shown, and a one-group result remains uncluttered. Within a group candidates are alphabetical. An explicit qualifier such as `c.` still limits membership to columns of `c`; type information only ranks those legal members. Visible string, GUID, and other columns remain selectable—type-aware completion ranks rather than hides visible candidates. With no known expected type there are no type groups and the ordinary semantic/alphabetical order is preserved exactly.

The same reusable type model supports comparisons in `WHERE` and `JOIN`, catalog-backed scalar UDF/TVF arguments, `UPDATE` right-hand sides, explicit-column `INSERT ... VALUES` and `INSERT ... SELECT`, `LIKE`, and simple arithmetic. For example, inside a parameter declared as `decimal(18,2)`, decimal candidates rank above unrelated types.

The resulting order is deterministic: an exact typed-name match can rank first, followed by type compatibility and the existing semantic/scope tiers, then alphabetical order. In an explicit comparison, a column participating in the real FK relationship can rank ahead of unrelated columns that are otherwise equally strong type matches.

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

## Declared-FK JOIN Intelligence

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

At a `JOIN` source position, objects connected to a legally visible left source by an enabled FK receive a semantic ranking boost. In an explicit comparison, the relationship-mapped column can also break a tie between equally compatible members. Contains filtering still applies, unrelated matching objects remain available, and relationship intelligence stays within one database.

## Project-defined relationships

Legacy and ERP databases often have valid logical relationships without physical SQL
Server foreign keys. A workspace can define those relationships explicitly in:

```text
.query-puppy/relationships.json
```

Run **Query Puppy for T-SQL: Open Project Relationships** to create or open the file.
The file is ordinary source-control-friendly JSON with native schema validation:

```json
{
  "version": 1,
  "relationships": [
    {
      "source": {
        "database": "IntelliSenseLab",
        "schema": "qpacc",
        "object": "ProjectChild"
      },
      "target": {
        "database": "IntelliSenseLab",
        "schema": "qpacc",
        "object": "ProjectParent"
      },
      "mappings": [
        { "source": "CompanyId", "target": "CompanyId" },
        { "source": "ParentRef", "target": "ParentId" }
      ]
    }
  ]
}
```

`source` is the logical dependent table and `target` is the logical principal table.
Mappings are ordered and composite mappings remain one relationship. Query Puppy
validates every endpoint and column against current cached metadata, ignores invalid
definitions safely, and reports specific errors in its output channel. Changes are
noticed by a native file watcher and applied on the next completion without refreshing
or rewriting the SQL metadata cache.

Project relationships generate the same correctly qualified JOIN predicate shape in
either query order, but native completion identifies them as **Project relationship
JOIN**, not as an FK. A matching physical declared FK wins and is shown first. No
relationship is inferred when the file contains no definition.

You can also save a concrete JOIN you have already written. Place the cursor on its
`JOIN`/`ON` predicate and invoke the native Code Action:

```text
Save JOIN as Query Puppy relationship
```

For example:

```sql
FROM qpacc.ProjectParent AS p
JOIN qpacc.ProjectChild AS c
  ON c.CompanyId = p.CompanyId
 AND c.ParentRef = p.ParentId
```

Query Puppy resolves both aliases and columns, stores the composite mapping as one
`UserConfirmed` relationship, and can offer the same predicate in later queries. If
one mapped endpoint is an unfiltered PK/UQ it determines the principal direction;
otherwise a small native Quick Pick asks which table is the source/dependent. The
saved entry is source-control-visible project knowledge:

```json
{
  "provenance": "userConfirmed",
  "source": {
    "database": "IntelliSenseLab",
    "schema": "qpacc",
    "object": "ProjectChild"
  },
  "target": {
    "database": "IntelliSenseLab",
    "schema": "qpacc",
    "object": "ProjectParent"
  },
  "mappings": [
    { "source": "CompanyId", "target": "CompanyId" },
    { "source": "ParentRef", "target": "ParentId" }
  ]
}
```

The action is deliberately conservative: every predicate term must be a direct
resolved column equality between exactly two persistent same-database tables, joined
only by `AND`. Functions, arithmetic, literals, variables, `OR`, inequalities,
unresolved members, and CTE/temp/derived/table-variable endpoints are not saved.
Writing or saving a JOIN never creates project relationship truth by itself—only
invoking the action updates `relationships.json` and the production relationship
graph.
Completion presents saved edges as **User-confirmed relationship JOIN**, not as an FK.
Query Puppy updates only `.query-puppy/relationships.json`; it never creates a SQL
Server foreign key or executes database DDL.

Version 1 supports same-database table relationships. Applicability is scoped by the
owning workspace folder and database name. In a multi-root workspace, each SQL file
uses only its folder's relationship file; untitled or outside-workspace documents use
declared FKs only. Projects targeting different servers that reuse the same database
name should use separate workspace relationship files.

Existing version-1 entries without `provenance` remain manually authored
`ProjectDefined` relationships. The optional persisted values are currently limited to
`projectDefined` and `userConfirmed`.

## Local learned JOIN evidence

Query Puppy can observe the same conservative, safely resolved equality-only JOIN
shape when an active SQL document is saved. After three independently deduplicated
resolved JOIN occurrences, valid evidence becomes a local
`LearnedFromQuery`/`StrongEvidence` candidate in the same canonical runtime graph used
by other relationships. It can produce **Learned relationship JOIN** predicates,
comparison tie-breaking, and related-RowSource ranking below declared FKs,
UserConfirmed relationships, and ProjectDefined relationships.

Learning is enabled by default through
`queryPuppyForTSql.relationshipLearning.enabled`. It runs only for saved SQL files in
an owning workspace, only when the required database metadata is already loaded, and
never initiates a catalog load. Repeated saves, completion requests, and unrelated
edits do not recount an unchanged JOIN. Persisted occurrence fingerprints preserve
that protection when a file or editor is closed and reopened or the extension host is
restarted. Separate resolved JOIN occurrences count once each; observations with
ambiguous direction are skipped without interrupting typing.

The extension persists only canonical database/schema/object endpoints, canonical
ordered column mappings, an aggregate observation count, and bounded occurrence
fingerprints. Each fingerprint contains SHA-256 hashes of the workspace-relative
document identity and canonical relationship identity, the occurrence ordinal, and a
stable eviction order. It stores no SQL text, comments, literals, aliases, plaintext
paths or filenames, source locations, credentials, connection strings, confidence
score, or raw/unbounded observation history. The versioned evidence file is in VS Code/VSCodium's
extension-managed workspace storage, not in the project directory or
`.query-puppy/relationships.json`, so it is local and normally not committed to source
control. Multi-root folders receive separate hashed evidence files.

Storage is limited to 4,096 unique relationship mappings per workspace folder. When
the limit is exceeded, higher observation counts are retained first and ties use
canonical alphabetical identity. Seen occurrences are separately limited to 16,384;
the oldest recorded fingerprints are evicted first. An evicted occurrence can count
again if encountered later, which is the deliberate bounded-storage tradeoff. Writes
are serialized and atomic. Malformed or unsupported evidence files are ignored rather
than overwritten. Run **Query Puppy for T-SQL: Clear Learned Relationship Evidence**
to clear both counts and occurrence fingerprints for the active workspace folder; the
corresponding learned candidates disappear on the next completion. Explicit
ProjectDefined and UserConfirmed relationships are unaffected. Disabling learning
stops new acquisition without hiding qualifying evidence already stored.

A saved disappearance removes that occurrence's dedupe marker without decrementing
historical evidence. Reintroducing it after the saved absence may therefore contribute
one new observation. Formatting, alias changes, reordered `AND` terms, and unrelated
offset movement do not create a new occurrence. Existing format-version-1 counts are
preserved when the local store upgrades to version 2; because version 1 had no
occurrence fingerprints, the first eligible save after upgrade may contribute once.

An observation identical to a declared FK, ProjectDefined relationship, or
UserConfirmed relationship is excluded and any matching local evidence is removed.
No heuristic participates in learned-evidence acquisition. Query Store, plan-cache,
query history, telemetry, remote services, and query-execution hooks are also absent.
Stale objects, missing columns, incompatible types, and cross-database mappings fail
closed when evidence is resolved against current metadata. Accepting a learned
completion is not confirmation and writes no project file. Use **Save JOIN as Query
Puppy relationship** to explicitly promote a resolved JOIN to UserConfirmed project
knowledge.

## Conservative heuristic JOIN candidates

When both physical tables are already present in a JOIN, Query Puppy may offer one
**Heuristic relationship JOIN** predicate as a last-resort fallback. It does not use
heuristics to discover tables or rank JOIN targets.

A heuristic candidate appears only when one direction has exactly one complete
unfiltered target primary/unique key mapping, every component has known compatible SQL
types, at least one source column exactly combines the target object name with the
target key-column name (for example `CustomerId -> Customers.Id`), and the result is
unambiguous. A same-name tenant/context mapping such as `CompanyId -> CompanyId` may
complete a composite key only when another component supplies that target-aware signal.
Incomplete keys, filtered uniqueness, identical key names alone, incompatible or
unknown types, multiple plausible assignments, and difficult ERP naming intentionally
produce no suggestion.

The candidate is visibly marked **Candidate** and its documentation lists the exact
structural evidence. It is not a SQL Server FK or confirmed relationship. It is
calculated only for the current physical pair, is not persisted to metadata snapshots,
project relationships, or learned evidence, and disappears when current metadata no
longer supports it. Accepting it inserts only the predicate. The developer may then
explicitly invoke **Save JOIN as Query Puppy relationship** to persist the resolved
JOIN as UserConfirmed project knowledge.

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

Supported sources include CTEs and chained CTEs, local and global temp tables, table variables, `SELECT INTO`, derived tables, `VALUES`, and `CROSS APPLY`/`OUTER APPLY`. Projected columns, aliases, types, and nullability are retained where they can be inferred reliably.

Nested scopes resolve aliases from the innermost query outward. Eligible correlated outer references remain visible, while inner aliases, sibling scopes, and shadowed names stay isolated. Ordinary derived tables do not correlate; the right side of `APPLY` can see eligible left-side sources.

Set operations—`UNION`, `UNION ALL`, `INTERSECT`, and `EXCEPT`—compose result columns by ordinal using the first branch's names. Their results work through CTEs, derived tables, `APPLY`, alias completion, and wildcard expansion.

## Functions, procedures, and DML

Supported SQL Server built-ins participate in function completion, native Signature Help, active-parameter tracking, ExpectedType ranking, and return-type inference. The current bounded catalog includes:

- String: `CHARINDEX`, `CONCAT`, `LEFT`, `LEN`, `LOWER`, `LTRIM`, `REPLACE`, `RIGHT`, `RTRIM`, `SUBSTRING`, `UPPER`
- Date/time: `DATEADD`, `DATEDIFF`, `DATEFROMPARTS`, `DATENAME`, `DATEPART`, `EOMONTH`, `GETDATE`, `SYSDATETIME`, `SYSUTCDATETIME`
- Numeric: `ABS`, `CEILING`, `FLOOR`, `ROUND`
- Null/value: `COALESCE`, `ISNULL`, `NULLIF`
- Aggregate: `AVG`, `COUNT`, `COUNT_BIG`, `MAX`, `MIN`, `STRING_AGG`, `SUM`
- Window/ranking/value: `DENSE_RANK`, `LAG`, `LEAD`, `NTILE`, `RANK`, `ROW_NUMBER`

Signature Help opens automatically after `(`, follows commas, and can be reopened with the editor's **Trigger Parameter Hints** command.

Window expressions understand native `OVER (` grammar, `PARTITION BY`, and window `ORDER BY`, then reuse ordinary QueryScope member completion. Datepart positions in `DATEADD`, `DATEDIFF`, `DATEPART`, and `DATENAME` offer documented canonical datepart tokens without treating them as strings or reading database metadata. `CASE` and `COALESCE` use the shared SQL type-precedence model conservatively; advanced window-frame grammar and a complete SQL Server built-in catalog remain outside the current scope.

Catalog scalar UDFs and table-valued functions use the same callable intelligence for parameters and Signature Help. Scalar return types are inferred where metadata permits; TVFs remain row sources whose result columns can participate in `FROM`, `JOIN`, and member completion.

Additional context-aware support includes:

- writable-column completion for `INSERT`
- `UPDATE` targets and ExpectedType ranking for right-hand expressions
- ExpectedType ranking for explicit-column `INSERT ... VALUES` and `INSERT ... SELECT`
- statement-correct `inserted` and `deleted` columns in `OUTPUT`
- named `EXEC` parameters in declaration order, excluding parameters already assigned
- stored-procedure parameter signatures

Server-maintained identity, computed, generated, and rowversion columns are excluded from writable-column suggestions.

## Smart aliases

At a legal alias position after a resolved row source in `FROM`, `JOIN`, or `APPLY`, the extension suggests an explicit alias without replacing the object name:

```text
FROM dbo.CustomerOrders <cursor>
suggestion: AS co    alias for CustomerOrders
```

Accepting the completion inserts `AS co`. If `AS ` is already present, the suggestion inserts only `co` and never duplicates the keyword. At an unaliased predicate-bearing JOIN source, `AS co` ranks above the equally valid `ON` continuation; Smart Alias remains optional and never forces alias syntax. Object-name completion remains active while the cursor is still part of the row-source identifier, already-aliased sources do not receive another alias, and collision fallback is deterministic.

Aliases are suggestions, not rewrites. They can be disabled with `queryPuppyForTSql.smartAliases.enabled`.

## SELECT wildcard expansion

Place the cursor directly after a semantic `*` or `alias.*` in a SELECT projection and press Tab to replace that wildcard with known columns. Source and column order are preserved.

- One unaliased source produces unqualified columns.
- One explicitly aliased source uses that alias.
- Multiple visible sources use their aliases or shortest deterministic qualifiers.
- An explicit `alias.*` always preserves that qualifier.

Enter never expands a wildcard. This keeps an ordinary `SELECT *` safe on very wide tables. Tab behaves normally when the wildcard cannot be resolved.

## Cross-database completion

Database, schema, and object qualification work across databases available through the same active SQL Server connection:

```text
Database.                 -> schemas
Database.Schema.          -> objects in that schema
Database.fragment         -> schema matches, then objects across schemas
Database..Object          -> dbo object
```

Secondary-database metadata is loaded only after explicit qualification, and every referenced database has its own metadata-cache lifecycle. Ordinary unqualified `FROM` completion remains restricted to the active database. Linked Servers and four-part names are not supported.

## Performance and persistent caching

The first use of an uncached database starts a set-based catalog load. On a large ERP database this can take time, so Query Puppy shows a visible schema-loading status and persists the completed snapshot in VS Code/VSCodium extension storage.

On later sessions, cached metadata is hydrated immediately and completion can use it while one first-use background refresh runs for that database. The previous snapshot remains available until a complete replacement is ready, and a refresh failure retains the usable snapshot. Concurrent requests for the same database share the same load or refresh.

After that first-session refresh attempt, the 15-minute freshness threshold is evaluated only when the database is used—there is no refresh poller for idle databases. Completion and FK lookup use in-memory indexes, with no catalog query or persistent-cache read per keystroke. Secondary databases stay lazy and independently cached. After DDL, run **Query Puppy for T-SQL: Refresh Schema Metadata** when you need the change without waiting for the next eligible background refresh.

## How it works with mssql

[Microsoft SQL Server (`ms-mssql.mssql`)](https://marketplace.visualstudio.com/items?itemName=ms-mssql.mssql) is a required dependency because it owns SQL Server connections. Query Puppy for T-SQL uses its connection-sharing integration to identify the active connection/database, list same-server databases, and run read-only catalog queries. It does not request separate SQL credentials or open its own independently configured connection.

Query Puppy for T-SQL does not consume, scrape, or filter Microsoft's completion output; it registers its own completion provider. Running both providers can produce duplicate suggestions. On first use, Query Puppy for T-SQL can offer to disable `mssql.intelliSense.enableSuggestions` globally, or you can run **Query Puppy for T-SQL: Disable Microsoft SQL Suggestions**. It never changes that setting silently. Other `mssql` services, including connection handling, remain available.

## Privacy and database permissions

- No extension-specific database credentials are requested or stored.
- The active `mssql` connection is reused; no independent SQL connection is opened.
- Schema metadata discovery is read-only and does not require DDL or DML privileges.
- Allow-listed schema metadata is cached persistently in extension-owned local storage and hydrated into memory for IntelliSense. The snapshots contain schema metadata, not passwords, tokens, secret-bearing connection strings, query text, or document-local SQL state.
- On SQL document save, optional local relationship learning stores canonical physical endpoints, ordered column mappings, aggregate counts, and bounded SHA-256 occurrence fingerprints in extension-managed workspace storage. It never stores raw SQL, literals, aliases, plaintext paths or filenames, credentials, or connection strings, and it is not transmitted remotely.
- The extension contains no telemetry. Query text, application data, and database contents are not uploaded to an external Query Puppy service.

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
- **Query Puppy for T-SQL: Open Project Relationships**
- **Query Puppy for T-SQL: Clear Learned Relationship Evidence**
- **Query Puppy for T-SQL: Show Status**
- **Query Puppy for T-SQL: Disable Microsoft SQL Suggestions**
- **Query Puppy for T-SQL: Diagnose Signature Help**
- **Query Puppy for T-SQL: Diagnose Query Scope**

The diagnostic commands report connection, cache, scope, visible-row-source, correlation, and provider information through VS Code/VSCodium UI and the extension output channel.

## Settings

- `queryPuppyForTSql.enabled`: enable or disable Query Puppy for T-SQL completion.
- `queryPuppyForTSql.debugLogging`: write detailed diagnostics to the **Query Puppy for T-SQL** output channel.
- `queryPuppyForTSql.smartAliases.enabled`: enable or disable smart alias suggestions.
- `queryPuppyForTSql.relationshipLearning.enabled`: enable or disable local resolved-JOIN evidence acquisition on SQL document save. Enabled by default; disabling acquisition keeps existing qualifying learned candidates visible.

## Known limitations

- SQL Server is the only supported database engine.
- Linked Servers and four-part object names are out of scope. Cross-database support is limited to databases on the active SQL Server connection.
- The defensive parser is not a complete T-SQL compiler; unusually exotic or incomplete grammar can reduce context accuracy.
- Dedicated intelligence for advanced window-frame grammar, `MERGE`, `PIVOT`, and `OPENJSON` is not currently implemented.
- Type inference is conservative. Unnamed computed projections may be omitted, and recursive CTE/set-branch type reconciliation is best-effort.
- Type-aware ranking does not implement SQL Server's complete conversion and datatype-precedence engine. Built-in intelligence is intentionally limited to the documented supported set rather than a complete SQL Server function catalog.
- Stored-procedure result-set discovery is not performed, so the extension does not fabricate procedure result columns.
- Heuristic JOIN predicates are deliberately narrow: they apply only after both physical tables are selected, require complete key/type/name evidence, and fail closed for ambiguous or unfamiliar naming. They do not discover or rank tables.
- Learned candidates require three independently deduplicated eligible occurrences. They remain local StrongEvidence rather than SQL Server FKs or explicit project truth; there is no rejection model, relationship editor, or relationship-navigation feature yet.
- Project relationship format version 1 supports same-database tables only and binds by workspace folder plus database name; cross-database project edges and stable cross-server identities are not yet supported.
- Background refresh replaces a complete snapshot rather than applying incremental schema changes. A recent DDL change may remain absent until refresh completes; run **Query Puppy for T-SQL: Refresh Schema Metadata** when immediate discovery is needed.
- Completion detail width is controlled by the native Suggest Widget and may be truncated in narrow layouts.

## Development and support

See [CONTRIBUTING.md](https://github.com/beardedpuppylabs/Query-Puppy-for-T-SQL/blob/main/CONTRIBUTING.md) for development and pull requests, [SUPPORT.md](https://github.com/beardedpuppylabs/Query-Puppy-for-T-SQL/blob/main/SUPPORT.md) for bugs and feature requests, and [SECURITY.md](https://github.com/beardedpuppylabs/Query-Puppy-for-T-SQL/blob/main/SECURITY.md) for private vulnerability reporting.

## Open source

Query Puppy for T-SQL is free and open-source software under the GNU General
Public License version 3 only (`GPL-3.0-only`). The GPL permits use,
modification, redistribution, and commercial use subject to its terms.

All Query Puppy features remain available without paid feature gates, per-seat
licensing, or a mandatory subscription. Voluntary sponsorship may support
independent development but does not buy features, support obligations, roadmap
priority, proprietary rights, governance, or technical influence.

- [Source code](https://github.com/beardedpuppylabs/Query-Puppy-for-T-SQL)
- [Issue tracker](https://github.com/beardedpuppylabs/Query-Puppy-for-T-SQL/issues)
- [GNU GPL version 3](https://github.com/beardedpuppylabs/Query-Puppy-for-T-SQL/blob/main/LICENSE)
- [Third-party notices](https://github.com/beardedpuppylabs/Query-Puppy-for-T-SQL/blob/main/THIRD_PARTY_NOTICES.md)

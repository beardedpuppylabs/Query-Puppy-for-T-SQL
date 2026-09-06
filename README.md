# Query Puppy for T-SQL

Query Puppy for T-SQL is **free and open-source semantic T-SQL developer tooling** for Visual Studio Code and VSCodium.

It is built for real SQL Server databases where remembering every table, column, function, type, and relationship is unrealistic. Query Puppy adds context-aware completion, relationship intelligence, type awareness, document-local navigation, Hover, and conservative diagnostics while reusing the active Microsoft `mssql` connection for SQL Server context and read-only metadata.

Query Puppy does **not** manage separate SQL credentials, execute your queries, display result sets, or replace your database workbench.

## Development status

Query Puppy is a **pre-1.0 project under active development**. It already supports substantial day-to-day T-SQL work, but it has not reached a stable 1.0 maturity level yet.

Expect occasional rough edges, unsupported SQL patterns, editor-integration quirks, and behavior that may continue to evolve between releases. The project deliberately favors conservative, explainable behavior over pretending to understand SQL it cannot resolve reliably.

If you rely on Query Puppy in day-to-day work, review the documented limitations and report reproducible problems on GitHub. Clear bug reports are especially valuable while the pre-1.0 surface is still maturing.

## Highlights

- **Contains search for large schemas** — find tables, columns, and other objects by the part of the name you remember.
- **Context-aware completion** — suggestions follow the SQL position, visible query scope, aliases, local row sources, and writable targets.
- **Type-aware ranking** — compatible expressions rank higher without hiding other legal choices.
- **Relationship-aware JOINs** — use declared FKs, explicit project knowledge, user-confirmed JOINs, qualifying local evidence, and a narrow heuristic fallback.
- **Native navigation** — Go to Definition / Peek, Find References, Document Highlights, and Document Symbols / Outline for supported local SQL symbols.
- **Hover and diagnostics** — inspect typed local variables and catch a small set of provable document-local mistakes.
- **SQL Server callable intelligence** — built-ins, UDFs, TVFs, stored procedures, ExpectedType, and native Signature Help.
- **Persistent metadata cache** — fast warm starts without querying the catalog on every keystroke.
- **Local-first privacy** — no Query Puppy telemetry, no remote query upload, and no separate credential store.

## Find and complete SQL by context

In a large schema, remembering part of a name should be enough.

Type:

```text
addr
```

and Query Puppy can find names such as:

```text
Addresses
BillingAddresses
CustomerAddresses
ShippingAddresses
```

Matching is contiguous, case-insensitive **Contains** matching. It is not fuzzy search and is not limited to StartsWith.

Completion follows the SQL instead of showing the entire catalog everywhere:

```sql
SELECT c.addr
FROM dbo.Customers AS c
WHERE c.
ORDER BY c.
```

Current semantic completion includes:

- legal row sources in `FROM`, `JOIN`, and `APPLY`;
- writable targets for `UPDATE`, `INSERT INTO`, and `DELETE FROM`;
- columns for visible aliases and row sources;
- meaningful expression candidates in `SELECT`, `WHERE`, `GROUP BY`, `HAVING`, `ORDER BY`, and supported function arguments;
- projection aliases where SQL Server permits them;
- schema disambiguation when physical object names collide;
- CTEs, temp tables, table variables, `SELECT INTO`, derived tables, `VALUES`, and `APPLY`;
- nested scopes, legal correlation, shadowing, and set operations;
- explicit same-server cross-database qualification.

Query Puppy can also infer expected SQL types at supported expression positions. Compatible expressions rank higher, but type awareness does not hide otherwise legal alternatives.

The same type and callable model supports a bounded catalog of common SQL Server built-ins, aggregate and window functions, catalog UDFs and TVFs, stored-procedure parameters, return-type inference where available, and native Signature Help.

## Relationship-aware JOINs

When Query Puppy knows why two physical tables are related, it can offer a complete predicate:

```sql
FROM dbo.Customers AS c
JOIN sales.CustomerOrders AS o
    ON o.CustomerId = c.CustomerId
```

Composite relationships remain one ordered predicate.

Query Puppy keeps relationship provenance explicit:

| Source                   | Meaning                                                                                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Declared foreign key** | An actual enabled SQL Server FK. Authoritative and ranked first.                                                                         |
| **User-confirmed**       | A safely resolved JOIN explicitly saved with **Save JOIN as Query Puppy relationship**.                                                  |
| **Project-defined**      | Explicit project knowledge in `.query-puppy/relationships.json`.                                                                         |
| **Learned**              | Local evidence from at least three independently deduplicated eligible JOIN occurrences, revalidated against current metadata.           |
| **Heuristic candidate**  | A last-resort **Candidate** for an already-selected physical table pair when strict key, type, naming, and ambiguity checks all succeed. |

The heuristic fallback does not discover tables, does not masquerade as a foreign key, and is not persisted as relationship truth.

### Project and learned relationships

Legacy and ERP databases often contain valid logical relationships that are not declared as SQL Server FKs.

Run:

```text
Query Puppy for T-SQL: Open Project Relationships
```

to create or open the source-control-friendly project file:

```text
.query-puppy/relationships.json
```

Version 1 supports same-database physical table relationships.

You can also place the cursor on an eligible equality-only JOIN and invoke:

```text
Save JOIN as Query Puppy relationship
```

to persist it as explicit `UserConfirmed` project knowledge. Query Puppy never creates a SQL Server foreign key or executes database DDL.

Optional relationship learning observes eligible resolved JOINs when a SQL document is saved. It stores only bounded local evidence such as canonical endpoints, ordered mappings, counts, and hashed occurrence identities. It does **not** store raw SQL text, comments, literals, aliases, plaintext file paths, credentials, or connection strings, and it does not transmit learned evidence to a Query Puppy service.

## Navigate and understand local SQL

Query Puppy reuses its document-semantic symbol identities for native editor navigation.

Current document-local support includes:

- **Go to Definition / Peek Definition**
- **Find References**
- **Document Highlights**
- **Document Symbols / Outline**

Supported symbols include CTEs, explicit row-source aliases, scalar local variables, table variables, and deterministic temporary tables.

Navigation stays in the current document and fails closed for unresolved, ambiguous, unsupported, physical-database, or cross-document cases instead of falling back to textual guesses.

### Hover

Typed scalar local variables have native Hover information at supported declaration and reference positions.

Safe direct numeric, string, Unicode-string, and `NULL` declaration initializers can include a bounded source-literal preview. Query Puppy does not evaluate expressions or track runtime values.

## Conservative document diagnostics

Query Puppy reports only document-local errors it can prove with high confidence.

Current diagnostics are:

- **`QP1001`** — a scalar or table variable is referenced where no valid local declaration is available because the matching declaration belongs to an earlier `GO` batch. A declaration later in the current batch does not retroactively validate an earlier use.
- **`QP1002`** — an explicit row-source alias is uniquely and provably referenced outside the query scope where it is visible.

These diagnostics are local and do not require catalog or database access.

Query Puppy is not a complete T-SQL compiler or general SQL linter. When the SQL is ambiguous or outside the supported semantic model, it prefers no diagnostic over a confident-looking guess.

## Small productivity features

### Smart Alias

At a legal alias position after a resolved row source, Query Puppy can suggest a deterministic short alias:

```text
FROM dbo.CustomerOrders <cursor>
```

suggestion:

```text
AS co
```

Disable Smart Alias with:

```text
queryPuppyForTSql.smartAliases.enabled
```

### Tab-only `SELECT *` expansion

Place the cursor directly after a semantic `*` or `alias.*` in a SELECT projection and press **Tab** to replace it with known columns.

**Enter never expands a wildcard.**

## Built for large schemas and the existing SQL Server workbench

Microsoft [`ms-mssql.mssql`](https://marketplace.visualstudio.com/items?itemName=ms-mssql.mssql) is currently a required dependency and remains the SQL Server workbench.

`mssql` owns connection management, credentials, query execution, results, and the broader SQL Server workbench experience.

Query Puppy currently uses its `mssql` integration to identify the active connection/database, enumerate same-server databases, and run read-only catalog queries. It registers its own completion, Signature Help, Hover, navigation, symbol, diagnostic, and code-action providers; it does not scrape or post-process Microsoft's completion list.

Schema metadata is loaded in sets, indexed in memory, and persisted as a completed local snapshot. Later sessions can hydrate cached metadata immediately while an eligible refresh runs. Query Puppy does not query the catalog or read the persistent cache on every keystroke.

After DDL, run:

```text
Query Puppy for T-SQL: Refresh Schema Metadata
```

when you need the new schema state immediately.

If Microsoft completion or Quick Info creates duplicate suggestions or Hover content, Query Puppy can offer to disable the corresponding Microsoft setting. It never changes those settings silently.

## Privacy

- No extension-specific SQL credentials are requested or stored.
- The active `mssql` connection is reused; Query Puppy does not open a separately configured production SQL connection.
- Schema discovery is read-only.
- Persistent snapshots contain allow-listed schema metadata, not passwords, tokens, query text, or application data.
- Optional learned-relationship evidence stays local and minimal.
- Query Puppy contains no telemetry.
- Query text, application data, and database contents are not uploaded to an external Query Puppy service.

## Installation

### Visual Studio Code

1. Install [Microsoft SQL Server (`ms-mssql.mssql`)](https://marketplace.visualstudio.com/items?itemName=ms-mssql.mssql).
2. Install [Query Puppy for T-SQL](https://marketplace.visualstudio.com/items?itemName=BeardedPuppyLabs.query-puppy-for-t-sql) from the Visual Studio Marketplace.
3. Open a SQL document and connect it with `mssql`.
4. Start typing or use **Ctrl+Space** to invoke completion manually.

### VSCodium

VSCodium is a supported target environment. The project does not currently publish a dedicated VSCodium binary-distribution channel or a current public GitHub Release VSIX.

To build the VSIX from the public source repository, follow [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) and run:

```bash
npm ci
npm run package
```

Then install the generated VSIX in VSCodium.

Requires Visual Studio Code 1.105 or a compatible VSCodium release.

## Commands

- **Query Puppy for T-SQL: Expand SELECT \* to Columns**
- **Query Puppy for T-SQL: Refresh Schema Metadata**
- **Query Puppy for T-SQL: Clear Schema Cache for Active Database**
- **Query Puppy for T-SQL: Open Project Relationships**
- **Query Puppy for T-SQL: Clear Learned Relationship Evidence**
- **Query Puppy for T-SQL: Show Status**
- **Query Puppy for T-SQL: Disable Microsoft SQL Suggestions**
- **Query Puppy for T-SQL: Disable Microsoft SQL Quick Info**
- **Query Puppy for T-SQL: Diagnose Signature Help**
- **Query Puppy for T-SQL: Diagnose Query Scope**

## Settings

- `queryPuppyForTSql.enabled` — enable or disable Query Puppy completion.
- `queryPuppyForTSql.debugLogging` — write detailed diagnostics to the **Query Puppy for T-SQL** output channel.
- `queryPuppyForTSql.smartAliases.enabled` — enable or disable Smart Alias suggestions.
- `queryPuppyForTSql.relationshipLearning.enabled` — enable or disable acquisition of new local resolved-JOIN evidence. Existing qualifying evidence remains available when acquisition is disabled.

## Current limitations

- SQL Server/T-SQL is the only supported database engine.
- Linked Servers and four-part object names are not supported.
- Cross-database support is limited to databases available through the active SQL Server connection.
- The defensive parser and type system are deliberately conservative rather than complete implementations of every T-SQL grammar and conversion rule.
- The built-in function catalog is bounded rather than exhaustive.
- Stored-procedure result-set discovery is not performed.
- Project relationship format version 1 supports same-database physical tables only.
- Heuristic JOIN candidates apply only after both physical tables are already selected and only when strict evidence is unambiguous.
- Diagnostics currently cover only the documented high-confidence `QP1001` and `QP1002` cases.
- Query Puppy does not execute queries, display result sets, provide database administration, or replace the SQL Server workbench.

## Development, support, and security

- [Source code](https://github.com/beardedpuppylabs/Query-Puppy-for-T-SQL)
- [Issue tracker](https://github.com/beardedpuppylabs/Query-Puppy-for-T-SQL/issues)
- [Contributing](https://github.com/beardedpuppylabs/Query-Puppy-for-T-SQL/blob/main/CONTRIBUTING.md)
- [Support](https://github.com/beardedpuppylabs/Query-Puppy-for-T-SQL/blob/main/SUPPORT.md)
- [Security](https://github.com/beardedpuppylabs/Query-Puppy-for-T-SQL/blob/main/SECURITY.md)

## Free and open source

Query Puppy for T-SQL is free and open-source software under the GNU General Public License version 3 only (`GPL-3.0-only`).

The GPL permits use, modification, redistribution, and commercial use subject to its terms.

All Query Puppy features remain available without paid feature gates, per-seat licensing, or a mandatory subscription. Voluntary sponsorship may support independent development, but sponsorship does not buy features, support obligations, roadmap priority, proprietary rights, governance, or technical influence.

- [GNU GPL version 3](https://github.com/beardedpuppylabs/Query-Puppy-for-T-SQL/blob/main/LICENSE)
- [Third-party notices](https://github.com/beardedpuppylabs/Query-Puppy-for-T-SQL/blob/main/THIRD_PARTY_NOTICES.md)

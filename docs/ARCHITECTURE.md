# Architecture

## Purpose

This document describes the high-level architecture and semantic boundaries of
Query Puppy for T-SQL.

It documents intended architecture, not incidental implementation details.

When implementation differs from this document, determine whether the code has
drifted or the documentation is stale before changing either.

## High-level system

Conceptually:

    Microsoft mssql extension
              |
              | connection sharing
              v
    Connection Context
              |
              v
    Catalog Metadata Loader
              |
              +---------------------+
              |                     |
              v                     v
       Database Catalog       Relationship Index
              |                     |
              +----------+----------+
                         |
                         v
                 Metadata Cache
                         |
            +------------+------------+
            |                         |
            v                         v
    Document Semantic Model      SQL Type Model
            |
            v
        QueryScopes
            |
            v
         RowSources
            |
            +---------------------------+
            |                           |
            v                           v
    Completion Context           Signature Context
            |                           |
            v                           v
    Semantic Candidates         Signature Help
            |
            v
    Ranking / Grouping
            |
            v
    CompletionItem Materialization
            |
            v
      VS Code / VSCodium

## Callable architecture

Function consumers share one editor-independent semantic boundary:

    SQL text / tokens
        -> ParsedCallSite
        -> callable resolution
        -> CallableSignature
        -> Signature Help / ExpectedType / return inference

`ParsedCallSite` owns callable name parts, qualification, the opening parenthesis,
depth-aware argument ranges, and the active argument. Catalog scalar UDFs and TVFs
are adapted from canonical `DatabaseObject` metadata into `CallableSignature` at
the resolver boundary. Downstream consumers do not require a `DatabaseObject`.

The same boundary is the extension point for future built-in function metadata.
Built-ins must not introduce a second call parser, active-argument calculation,
Signature Help provider, ExpectedType path, or return-type inference engine.

The editor's automatic Signature Help fallback remains UI coordination. It may
restrict which edits are eligible, but semantic call interpretation comes from the
shared call-site parser and callable resolver.

## Microsoft SQL Server extension integration

Query Puppy for T-SQL provides its own completion semantics.

It does not consume Microsoft's completion list.

The Microsoft SQL Server extension remains responsible for the SQL connection.

Query Puppy for T-SQL reuses the active connection through the existing
connection-sharing integration.

Do not introduce independent connection ownership unless explicitly redesigned.

## Metadata loading

Catalog metadata is loaded in set-based operations and cached by the appropriate
connection/database identity.

The cache represents database objects such as where supported:

- schemas
- tables
- views
- physical columns
- scalar functions
- table-valued functions
- stored procedures
- parameters
- types
- synonyms
- sequences
- keys
- unique indexes
- foreign keys
- relationship mappings

The first completion that needs an uncached database may initiate one coalesced
metadata load. Once loaded, completion uses the in-memory catalog and relationship
indexes; subsequent keystrokes do not issue catalog queries. Explicitly qualified
secondary databases are loaded lazily and cached independently.

## Database identity

Database metadata is isolated per database.

Objects from one database must not leak into another database's cache.

Object identity must include enough context to distinguish:

    database
    schema
    object

as required.

Same-named objects in different schemas are distinct.

## Cross-database completion

Same-server cross-database completion is supported where implemented.

Typical forms include:

    Database.
    Database.Schema.
    Database.Schema.Object
    Database..Object

The extension may provide IntelliSense conveniences beyond strictly complete SQL
syntax while ensuring accepted items insert legal SQL.

FK relationship inference does not cross database boundaries.

Linked Servers and arbitrary cross-server four-part-name intelligence are outside
the current architectural scope.

## Document semantic model

Catalog metadata describes persistent SQL Server objects.

The document semantic model describes objects and projections created by the SQL
text being edited.

Examples include:

- CTEs
- temp tables
- table variables
- derived tables
- SELECT INTO results
- VALUES sources
- APPLY results
- projection aliases
- set-operation results

Document-local metadata should preserve known:

- names
- datatypes
- nullability

where they can be inferred reliably.

## QueryScopes

Nested SQL scopes are represented explicitly.

A QueryScope owns its local aliases/RowSources.

Resolution order is conceptually:

    local scope
        ->
    legal correlated parent
        ->
    legal correlated ancestors

Sibling scopes are isolated.

Local alias shadowing is respected.

Do not replace this model with a flat document-wide alias dictionary.

## Correlation

Ordinary subqueries may correlate where SQL semantics allow.

Ordinary derived tables are not automatically correlated.

CROSS APPLY and OUTER APPLY may resolve legally visible left-side RowSources.

Set-operation branches are sibling scopes and do not inherit each other's local
aliases.

## RowSources

A RowSource represents something that exposes named members to SQL expressions.

Examples:

- table
- view
- CTE
- temp table
- table variable
- derived table
- TVF result
- APPLY projection
- set-operation result
- inserted/deleted pseudo source where applicable

RowSource member resolution should use one semantic abstraction rather than
hard-coding physical tables everywhere.

## Schema Intelligence

Persistent catalog columns may contain schema-role information.

The canonical metadata model preserves roles such as:

- PK
- UQ
- FK

Relationship information is stored separately from superficial column-name
similarity.

Composite constraints retain ordinal mapping.

Filtered unique indexes remain distinguishable from ordinary unique constraints.

INCLUDE columns are not key members.

## Relationship indexes

Foreign-key metadata should support efficient navigation in both directions.

Conceptually maintain indexed access for:

    dependent -> principal
    principal -> dependents
    object -> related objects

Relationship-aware completion must avoid full-database scans per keystroke.

## JOIN Intelligence

JOIN predicate suggestions are generated from actual cached FK relationships.

A relationship may generate a complete expression such as:

    o.CustomerId = c.CustomerId

Composite relationships may generate:

    ol.CompanyId = oh.CompanyId
    AND ol.OrderId = oh.OrderId

Multiple FKs between the same objects remain separate candidates.

JOIN source ranking may boost related objects but must preserve Contains filtering.

## Positional SQL visibility

SQL visibility is position-sensitive.

Example:

    FROM A AS a
    JOIN B AS b
        ON ...
    JOIN C AS c
        ON ...

The first ON clause must not see future alias `c`.

The semantic model must be resolved relative to cursor position.

## DML

DML uses the same semantic infrastructure rather than a disconnected subsystem.

Supported contexts may include:

- INSERT target columns
- INSERT expression positions
- UPDATE SET LHS
- UPDATE RHS expected type
- DELETE scope
- OUTPUT
- inserted/deleted
- EXEC procedure parameters

Incomplete statements must remain usable for IntelliSense.

## Type system

The normalized SQL type architecture is documented in
[SQL Type System](TYPE_SYSTEM.md).

Catalog and document columns should expose normalized type information through one
shared representation.

## Completion pipeline

Candidate construction, matching, sorting, grouping, and CompletionItem
materialization are documented in the
[Completion Pipeline](COMPLETION_PIPELINE.md).

That document defines canonical physical-column behavior.

## Performance invariants

The following are architectural invariants:

- after a database's coalesced lazy load, zero catalog queries per completion
  keystroke
- cache persistent metadata by connection/database
- reuse parsed/semantic document state where practical
- prefer indexed lookup to catalog scans
- avoid reparsing unrelated statements unnecessarily
- preserve deterministic completion order

## Security invariants

Runtime metadata access is read-only.

The runtime must not:

- provision schemas
- create integration fixtures
- mutate application data
- require administrator credentials
- store independent SQL credentials

Test fixture provisioning is separate development infrastructure.

## Supported editor architecture

The extension targets native VS Code/VSCodium extension APIs.

Avoid reliance on private editor internals.

When the native Suggest Widget has presentation limitations, keep semantic behavior
correct and place complete information in CompletionItem documentation rather than
building an independent editor UI.

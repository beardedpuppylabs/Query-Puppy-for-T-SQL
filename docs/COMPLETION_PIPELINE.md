# Completion Pipeline

## Purpose

This document defines how Improved SQL IntelliSense turns semantic SQL state into
native VS Code/VSCodium CompletionItems.

The central goal is to prevent context-specific completion paths from duplicating
semantic or presentation logic.

Type normalization and compatibility are defined in the
[SQL Type System](TYPE_SYSTEM.md). Query visibility and metadata ownership are
defined in [Architecture](ARCHITECTURE.md). Verification expectations are in
[Testing Strategy](TESTING.md).

## Pipeline

Conceptually:

    cursor position
        ->
    completion context
        ->
    visible semantic sources
        ->
    semantic candidates
        ->
    Contains filtering
        ->
    optional expected-type classification
        ->
    semantic ranking / grouping
        ->
    deterministic sorting
        ->
    canonical CompletionItem materialization

Presentation is the final stage.

Presentation must not drive semantic resolution.

## Semantic candidates

A CompletionCandidate should retain the canonical information needed for later
materialization.

A physical-column candidate must retain lossless access to its canonical physical
column metadata.

Do not flatten it into only:

    name
    type

if this loses:

- nullability
- PK
- UQ
- FK
- relationship metadata
- source identity
- constraint metadata
- documentation

## Matching contract

Matching is case-insensitive contiguous Contains.

Examples:

    address

matches:

    BillingAddressId
    PrimaryAddressId
    ShippingAddressId

Matching is not fuzzy.

Do not introduce:

- StartsWith-only behavior
- prefix bonuses
- substring-position bonuses

An explicit exact-match priority may remain.

## Filtering order

Contains filtering happens before type compatibility grouping.

If:

    c.address

leaves only compatible bigint members, do not create irrelevant empty groups.

## Explicit qualifier resolution

For:

    c.fragment

resolve `c` first.

Then filter only members of `c`.

Do not search unrelated sources after an explicit qualifier has resolved.

## Candidate ordering

Ordering is deterministic.

Without ExpectedType:

    existing exact-match priority
        ->
    existing semantic tier
        ->
    scope tier
        ->
    alphabetical name

The exact implemented sort-key shape may differ, but equivalent candidates remain
alphabetical.

When no ExpectedType exists, type compatibility must not participate at all.

## Type-aware ordering

When a reliable ExpectedType exists:

    existing exact textual priority
        ->
    type compatibility tier
        ->
    semantic tier
        ->
    scope tier
        ->
    alphabetical

Compatibility is ranking, not normal hard filtering.

Apparently incompatible visible expressions remain available lower in the list.

## User-facing type groups

When several compatibility tiers materially affect ordering, decorative headers may
be emitted.

Preferred user-facing groups:

    Type match · <expected type>
    Compatible <family>
    Other visible columns

Do not expose internal enum names merely because they exist.

Equivalent candidates inside a group remain alphabetical.

## Group headers

Group headers are presentation-only CompletionItems.

They:

- insert nothing
- are not semantic SQL candidates
- are not preselected over a real candidate
- do not participate in star expansion
- do not become RowSources
- do not enter type inference
- do not count as semantic columns in tests

If only one meaningful group survives filtering, omit unnecessary headers.

## Materialization rule

Final native CompletionItems are created only after semantic ranking/grouping.

Type grouping must not create its own stripped physical-column CompletionItems.

Conceptually:

    candidates
        ->
    classify/rank
        ->
    canonical item factory

not:

    candidates
        ->
    special type-aware CompletionItems
        ->
    different formatter

## Physical-column invariant

Given the same physical column, ordinary and grouped completion must produce
equivalent:

- semantic name
- filterText
- insertText
- role metadata
- datatype
- nullability
- documentation
- constraint/FK information
- physical-row formatting

Only ranking/group placement may differ.

This is a critical regression invariant.

## Canonical physical-column item factory

There should be one authoritative physical-column CompletionItem builder.

All physical-column contexts use it, including:

- `alias.`
- WHERE
- ON
- UPDATE RHS
- INSERT SELECT
- function arguments
- correlated outer-member completion
- type-aware grouped completion

Do not create context-specific physical-column factories.

## Physical-column display

Physical columns use a compact deterministic row.

Conceptually:

    Name[32]   Role   Type   Nullability

The visible name slot is:

    NAME_WIDTH = 32

Names longer than this may be shortened with a presentation-only ellipsis.

Example:

Real:

    VeryLongERPBusinessTransactionPostingReferenceIdentifier

Visible:

    VeryLongERPBusinessTransacti…

The precise visible string must obey the configured total name-slot width.

## Complete semantic name

Visible truncation must never change:

- filterText
- insertText
- Contains source
- sort source
- semantic object name
- documentation name

Accepting the candidate inserts the complete SQL identifier.

## Roles

Role display uses one canonical formatter.

Order:

    PK
    UQ
    FK

Examples:

    PK
    UQ
    FK
    PK·FK
    UQ·FK
    PK·UQ·FK

Grouped and ungrouped physical completion use the same formatter.

## SQL type display

Physical rows and group headers use the same canonical SQL declaration formatter.

Valid examples:

    int
    bigint
    varchar(50)
    nvarchar(200)
    decimal(38,18)
    datetime2(3)
    datetimeoffset(7)
    uniqueidentifier
    varbinary(max)

Invalid examples caused by leaking normalized internal metadata:

    bigint(19,0)
    uniqueidentifier(16)

## Nullability

Display:

    NULL
    NOT NULL

Nullability affects presentation and semantic metadata but is not currently an
aggressive completion filter.

## Documentation

Physical-column documentation is generated from canonical metadata.

It should include where applicable:

- complete column name
- complete datatype
- nullability
- roles
- PK/UQ names
- unique-index information
- filtered-index information
- FK relationship names
- FK targets
- referential actions
- composite mapping information

Long identifiers may be wrapped in documentation.

Documentation wrapping is presentation only.

## Display vs insertion

A displayed physical row may contain:

- padding
- role labels
- datatype
- nullability
- ellipsis

Therefore `filterText` and `insertText` must be set explicitly to the complete
semantic identifier.

Do not rely on the formatted display label as the insertion value.

## Scope ranking

Local scope members rank according to the project's semantic scope rules.

Correlated outer members may be visible when legal.

Sibling aliases are not visible.

Type compatibility must not break these scope boundaries.

## JOIN predicate candidates

Complete FK-based JOIN predicates are semantic expression candidates, not physical
column members.

At an empty relevant ON position, a real FK predicate may outrank ordinary column
expressions.

Type-aware member ranking applies normally once the developer explicitly writes an
operand such as:

    ON o.CustomerId = c.

## JOIN source candidates

At JOIN source positions, actual relationship metadata may influence semantic
ranking.

Contains filtering remains intact.

Multiple FKs must not duplicate the same table source candidate.

## RowSource completion

FROM/JOIN source completion may include context-appropriate:

- schemas
- tables
- views
- TVFs
- local RowSources

Do not reuse physical-column formatting for mixed object domains.

## Functions and procedures

Functions/procedures use their domain-specific CompletionItem presentation.

Do not force the physical-column fixed-width row format onto:

- scalar functions
- TVFs
- procedures
- schemas
- tables
- aliases
- keywords

## Wildcard expansion

Star expansion is separate from CompletionItem display.

Tab-based expansion uses semantic RowSource members.

Decorative type headers and presentation strings must never enter expansion logic.

## Regression invariants

The following cases should remain protected:

### No ExpectedType

    SELECT s.
    FROM T AS s;

Equivalent physical columns remain alphabetically ordered.

### ExpectedType

    WHERE a.BigintColumn = b.

Compatible members may group/rank higher.

Incompatible members remain available.

### Contains

    b.address

filters before grouping.

### Physical metadata

A column marked UQ/FK/PK in ordinary completion keeps that role when ranked or
grouped.

### Long names

The visible name is bounded.

The inserted name remains complete.

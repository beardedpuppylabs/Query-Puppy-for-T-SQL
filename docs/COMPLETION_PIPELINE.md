# Completion Pipeline

## Purpose

This document defines how Query Puppy for T-SQL turns semantic SQL state into
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

Batch-local scalar-variable candidates retain their declared name and known SQL
type. They are a distinct semantic kind from physical columns, RowSources,
procedures, and keywords. Table variables remain RowSources rather than scalar
expression candidates.

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
- final syntax after acceptance for the same completion shape
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
semantic identifier or the syntax-aware qualified expression described below.

Do not rely on the formatted display label as the insertion value.

When an unqualified semantic column is owned by a RowSource with an explicit alias,
its insertion text is `<alias>.<column>`. The candidate retains the owning QueryScope
binding, so same-name columns from different aliases remain distinct. When the user
already typed `alias.` or `alias.fragment`, only the member fragment is replaced and
the existing qualifier is not duplicated. Unaliased sources and projection aliases
retain bare insertion. Syntax-restricted targets such as an `UPDATE SET` left-hand
side also remain bare; legal expression RHS candidates use their explicit alias.

## Scope ranking

Local scope members rank according to the project's semantic scope rules.

Correlated outer members may be visible when legal.

Sibling aliases are not visible.

Type compatibility must not break these scope boundaries.

## JOIN predicate candidates

Complete relationship-based JOIN predicates are semantic expression candidates, not
physical column members. They retain their canonical relationship, including
provenance and confidence, rather than carrying the physical catalog record or
project definition as a parallel semantic edge.

At an empty relevant ON position, a declared-FK or explicit project-relationship
predicate may outrank ordinary column expressions. Trust order is
DeclaredForeignKey/Authoritative, UserConfirmed/Confirmed, then
ProjectDefined/Confirmed. Native detail/documentation distinguishes `FK JOIN`,
`User-confirmed relationship JOIN`, and `Project relationship JOIN`; logical
relationship documentation lists the explicit mappings and states that it is not a
SQL Server foreign key.

Type-aware member ranking applies normally once the developer explicitly writes an
operand such as:

    ON o.CustomerId = c.

When both operands resolve to physical columns, enabled authoritative declared-FK
mappings may break a tie among otherwise equivalent type-compatible member
candidates. Only the column paired with the resolved opposite operand receives the
contextual advantage. This does not create a separate visible group, use name/type
heuristics, or affect ordinary member completion outside a comparison.

## JOIN source candidates

At JOIN source positions, enabled authoritative declared-FK, confirmed UserConfirmed,
and confirmed ProjectDefined relationships may influence semantic ranking after
Contains filtering. Declared FKs rank above user-confirmed relationships, which rank
above manually authored project relationships. Learned and heuristic sources remain
excluded until their own production workflows exist.

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

Smart Alias Suggestions begin only after the RowSource identifier is syntactically
complete and the cursor is in a legal alias position, either after separating
whitespace or after `AS` and separating whitespace. While the cursor remains part
of the identifier token, normal RowSource completion remains active even when the
typed text exactly matches a catalog object. An already supplied alias ends the
alias-suggestion phase.

Alias eligibility is derived from SQL token boundaries, not catalog candidate
cardinality. Alias generation and deterministic collision fallback use the resolved
semantic object name and visible QueryScope.

The alias CompletionItem uses a compact native label such as `AS bp`, a description
such as `alias for BelegePositionen`, a schema-qualified detail such as
`alias for qpacc.BelegePositionen`, and the native local-binding/variable kind. At
a completed RowSource it inserts `AS bp` as plain text at an empty cursor range. If
the user already typed `AS `, it labels and inserts only `bp`; it never duplicates
the keyword or replaces the RowSource. `filterText` follows the actual displayed
and inserted alias text. Typing the whitespace that establishes a legal alias
position may open the native Suggest Widget. This automatic trigger is
limited to syntactically valid, resolved, unaliased RowSources and is synchronized
with the post-edit cursor. The first legal whitespace after the RowSource or
after `AS` is sufficient; a second space must not be required. Arbitrary SQL
whitespace does not trigger it.

All whitespace-driven completion uses one version-bound trigger lifecycle. The
trigger records the edit's resulting document version and expected cursor, waits
for the active editor selection to reflect that edit, resolves the semantic domain
from that current state, closes any Suggest session that belongs to the previous
phase, and invokes native Suggest once. A later document version, active-editor
change, or cursor move cancels the pending trigger. Automatic completion therefore
uses the same provider/domain as Ctrl+Space at the same final version and position;
it does not retry through arbitrary timing delays.

## DML target candidates

`UPDATE`, `INSERT INTO`, and `DELETE FROM` target positions use a distinct target
domain instead of ordinary expression completion. They expose legal target row
sources such as tables, views, synonyms, visible CTEs, temp tables, and table
variables, with normal Contains filtering and schema/database qualification.

This target domain is separate from DML expression and column phases. `UPDATE SET`
target-column completion, assignment right-hand sides, INSERT column lists,
OUTPUT pseudo sources, DELETE aliases, and EXEC parameter completion continue to
use their existing DML-specific paths.

Completed DML keywords separated from the cursor by whitespace are grammar
context, not identifier search text. Ctrl+Space at an empty target position and
normal suggestion behavior after a typed fragment use this target domain. Query
Puppy deliberately does not force native Suggest at the blank keyword-space
boundary because that command opens every installed completion/snippet provider,
which the extension neither controls nor filters.

## JOIN continuation keyword

Whitespace after a RowSource is resolved into one explicit phase rather than
falling back to generic RowSource discovery:

- completed predicate-bearing JOIN object: Smart Alias first, then `ON`
- explicit `AS`: alias only, because the alias is syntactically required
- completed JOIN alias, with or without `AS`: `ON` only
- completed FROM/APPLY object: Smart Alias only

The predicate-bearing forms are `JOIN`, `INNER JOIN`, `LEFT [OUTER] JOIN`, `RIGHT
[OUTER] JOIN`, and `FULL [OUTER] JOIN`. Accepting `ON` inserts only `ON `; existing
ON expression and FK intelligence then owns the next completion phase. `CROSS
JOIN`, `CROSS APPLY`, and `OUTER APPLY` do not offer ON. Accepting `ON` directly
without an alias keeps the RowSource's shortest legal object qualifier and does
not weaken FK resolution.

## Automatic expression triggers

Typing the whitespace after a completed `JOIN ... ON` may open the native Suggest
Widget for Query Puppy semantic expression candidates. If real FK metadata exists
between the current-right RowSource and legally visible left sources, the usual
FK predicate candidates participate. If no relationship exists, ordinary legal
expression candidates such as aliases and visible columns remain available. The
trigger does not inspect Microsoft completion items and does not infer
relationships from matching names or datatypes.

## Functions and procedures

Functions/procedures use their domain-specific CompletionItem presentation.

Supported SQL Server built-ins are static language candidates in expression
contexts. Scalar, aggregate, window, and expression-like callables use the same
Contains filter, deterministic type ordering, callable presentation, parsed call
site, and semantic deduplication as catalog functions, but they are not database
objects and never appear as RowSources.

An active datepart parameter narrows the domain to the canonical static datepart
grammar values. An unfinished `OVER (` narrows it to `ORDER BY` and `PARTITION BY`;
inside either clause, ordinary QueryScope columns and strict explicit-qualifier
membership resume. These are context domains, not fuzzy keywords mixed into every
expression list. Window `ORDER BY` does not expose top-level projection aliases.

Do not force the physical-column fixed-width row format onto:

- scalar functions
- built-in scalar, aggregate, expression-like, and window functions
- TVFs
- procedures
- schemas
- tables
- aliases
- keywords

## Wildcard expansion

Star expansion is separate from CompletionItem display.

Tab-based expansion uses semantic RowSource members.

The wildcard resolver uses the same tokenizer-backed current-statement range as
QueryScope and completion. It never scans into an adjacent statement, while CTE,
derived, table-variable, temp-table, VALUES, TVF/APPLY, and set-result RowSources
retain their established expansion behavior. Source and column order remain
semantic order.

The native keybinding remains Tab-only. Enter has no expansion binding and ordinary
Enter edits never invoke the expansion command.

Decorative type headers and presentation strings must never enter expansion logic.

## Local variable completion

Typing `@` is a native CompletionItemProvider trigger alongside `.`. At `@` or a
partial token such as `@Man`, the provider replaces the complete variable token with
the declared name, so acceptance produces exactly one `@`. Variables use normal
case-insensitive contiguous Contains filtering, deterministic ordering, canonical
type metadata, and the native Variable CompletionItem kind. They participate only
in legal expression domains; scalar variables never enter FROM/DML-target domains.

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

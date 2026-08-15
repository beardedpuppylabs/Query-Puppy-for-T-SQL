# Improved SQL IntelliSense — Project Instructions

These instructions apply to all work in this repository.

They extend the global engineering guidelines from the user's Codex configuration.
More specific task instructions may override them when explicitly required.

## Project mission

Improved SQL IntelliSense is a context-aware SQL Server IntelliSense extension for
VS Code and VSCodium.

It is designed especially for large real-world SQL Server schemas such as ERP
systems containing hundreds or thousands of tables, views, columns, functions,
procedures, and relationships.

The extension provides its own semantic completion provider.

It does not scrape, filter, or post-process Microsoft SQL Server completion
results.

The Microsoft SQL Server extension is used for its active SQL connection through
its supported connection-sharing integration.

## Required architecture reading

Before modifying completion candidate creation, member completion, filtering,
ranking, sorting, grouping, physical-column presentation, CompletionItem
construction, or CompletionItem documentation:

Read [docs/COMPLETION_PIPELINE.md](docs/COMPLETION_PIPELINE.md).

Before modifying SQL datatype representation, expression type inference,
expected-type detection, compatibility ranking, function argument typing,
UPDATE/INSERT typing, or type-group presentation:

Read [docs/TYPE_SYSTEM.md](docs/TYPE_SYSTEM.md).

Before modifying connection handling, catalog loading, metadata caching,
QueryScopes, RowSources, subsystem boundaries, cross-database behavior, or
schema/relationship metadata:

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

Before adding or changing automated tests, integration tests, Extension Host tests,
or manual SQL acceptance cases:

Read [docs/TESTING.md](docs/TESTING.md).

When a task crosses several of these areas, read all relevant documents before
changing production code.

## Core completion contract

Matching is:

- case-insensitive
- contiguous Contains

Do not change it to StartsWith.

Do not add fuzzy matching.

Do not add prefix bonuses.

Do not add substring-position bonuses.

An exact textual match may retain its existing explicit priority.

Within equivalent semantic/ranking tiers, candidates are deterministic and
alphabetical.

## Candidate visibility

Semantic intelligence should normally rank candidates rather than hide them.

Type-aware intelligence must not normally remove visible expressions because their
type appears incompatible.

Apparently incompatible candidates remain available below stronger matches unless a
different SQL semantic rule genuinely makes them invalid.

## Explicit qualifiers

For:

    alias.

only members actually belonging to that resolved RowSource may be returned.

Ranking may reorder those members.

It must not broaden an explicit qualifier to unrelated RowSources.

## Native editor UI

Use the supported native VS Code/VSCodium APIs.

Do not introduce a custom completion popup, custom editor overlay, external search
window, or webview merely to work around Suggest Widget presentation limitations.

Use native CompletionItems, Signature Help, documentation, commands, and settings.

## SQL connection contract

Reuse the active SQL connection owned by the Microsoft SQL Server extension.

Do not introduce:

- a second independent SQL connection
- extension-specific SQL credentials
- duplicate credential management
- credential scraping
- credential persistence

Runtime metadata access remains read-only.

Do not require administrator credentials.

Do not provision integration fixtures from extension runtime code.

## Performance contract

After the coalesced lazy load for a database completes, a completion request must
perform zero SQL catalog queries per keystroke. A first request may initiate that
load; explicitly qualified secondary databases load lazily and are cached.

Hot-path completion operates from:

- cached catalog metadata
- cached relationship metadata
- document semantic state
- QueryScopes
- RowSources
- local expression/type inference

Performance decisions must account for databases with hundreds or thousands of
objects and many thousands of columns.

Prefer indexed lookups over complete-catalog scans.

## Canonical metadata

Do not lose semantic metadata while transforming candidates.

Physical-column metadata may include:

- complete identifier
- source database/schema/object
- datatype and facets
- nullability
- PK membership
- UQ membership
- FK membership
- key/index names
- FK relationship information
- referential actions
- documentation metadata

Do not reduce a physical column to a lossy temporary representation such as only:

    { name, type }

when the canonical metadata already contains more information.

Filtering, ranking, grouping, and presentation decorate canonical candidates.
They must not replace them with stripped copies.

## Single-responsibility implementation rule

Before creating a new:

- formatter
- CompletionItem factory
- candidate mapper
- documentation builder
- role formatter
- datatype formatter
- sort-key builder
- parser helper
- QueryScope resolver
- RowSource member resolver
- compatibility classifier

search the repository for an existing implementation of the same responsibility.

Prefer extending or consolidating the canonical implementation.

Do not create parallel implementations for the same concept.

Repeated context-specific implementations are architectural drift.

## Physical-column completion invariant

The same physical column must retain the same semantic and presentation metadata in
all contexts.

For example, if:

    ExternalKey

is:

    UQ
    uniqueidentifier
    NULL

in ordinary:

    c.

completion, it must retain the same:

- UQ role
- datatype
- nullability
- filterText
- insertText
- documentation

when appearing in:

- WHERE
- JOIN expressions
- UPDATE RHS
- INSERT SELECT
- function arguments
- type-aware compatibility groups

Context may change:

- ranking
- sortText
- group placement
- preselection

Context must not change the physical-column identity or strip metadata.

## Physical-column presentation

Physical-column rows use one canonical presentation implementation.

The visible physical-column name slot is:

    NAME_WIDTH = 32

Names longer than this may be shortened with a presentation-only ellipsis.

Never truncate the semantic identifier.

The complete identifier remains the source for:

- filterText
- insertText
- Contains matching
- semantic resolution
- sorting
- documentation

Accepting a truncated visual item inserts the complete identifier.

Role order is:

    PK
    UQ
    FK

Combined examples:

    PK·UQ
    PK·FK
    UQ·FK
    PK·UQ·FK

SQL type display uses canonical SQL declaration syntax.

Examples:

    int
    bigint
    varchar(50)
    nvarchar(200)
    decimal(38,18)
    datetime2(3)
    datetimeoffset(7)
    uniqueidentifier

Do not expose internal normalized facets as invalid SQL declarations.

Therefore:

    bigint

not:

    bigint(19,0)

and:

    uniqueidentifier

not:

    uniqueidentifier(16)

## Type-aware intelligence

There is one normalized type system and one compatibility model.

Do not build separate type systems for:

- comparisons
- JOIN expressions
- function arguments
- UPDATE
- INSERT
- arithmetic

Type-aware completion is primarily ranking.

When a reliable expected type exists, compatibility may affect ordering.

When no expected type exists, type ranking must not participate.

The pre-type-intelligence ordering must then remain unchanged.

Decorative compatibility groups may explain changed ordering.

Typical user-facing groups are:

    Type match · <type>
    Compatible <family>
    Other visible columns

Within a group, equivalent candidates remain alphabetical.

Group headers are no-op presentation items, not semantic SQL candidates.

## Query scope semantics

Nested SQL scopes must remain explicit.

Do not flatten query aliases into one global alias map.

A nested QueryScope may resolve:

1. local RowSources
2. legally correlated parent scopes
3. legally correlated ancestors

Sibling scopes do not leak into each other.

Local aliases shadow correlated aliases with the same name.

Ordinary derived tables are non-correlated unless SQL semantics allow otherwise.

CROSS APPLY and OUTER APPLY may correlate to legally visible left-side sources.

## JOIN semantics

JOIN visibility is positional.

A future RowSource must not be visible in an earlier ON condition.

FK-aware JOIN intelligence uses actual SQL Server relationship metadata.

Do not infer an FK merely because names or datatypes match.

Multiple valid FKs between the same tables remain separate choices.

Composite FKs remain one relationship and should generate one ordered predicate.

Disabled FKs are not normal trusted JOIN suggestions.

FK relationship intelligence is database-local.

Do not infer cross-database or cross-server foreign keys.

## Cross-database scope

Support the existing same-server cross-database completion semantics.

Do not silently extend this to:

- Linked Servers
- arbitrary four-part-name intelligence
- cross-server relationship discovery

unless explicitly requested.

## Local RowSources

Preserve semantic support where implemented for:

- CTEs
- temp tables
- global temp tables where supported
- table variables
- derived tables
- VALUES
- SELECT INTO
- APPLY
- projection aliases
- set-operation results

Preserve datatype/nullability information through local projections where it can be
inferred reliably.

## Set operations

Preserve support for:

    UNION
    UNION ALL
    INTERSECT
    EXCEPT

Branches are sibling scopes.

Branch-local aliases do not leak into sibling branches.

Legal outer correlation follows containing QueryScope rules.

Set-result names follow SQL semantics from the first/leftmost result projection
unless explicitly overridden.

Type reconciliation remains conservative.

Do not pretend to implement the entire SQL Server type-precedence engine unless
that is explicitly requested and implemented.

## DML

Preserve context-aware semantics for:

- INSERT
- UPDATE
- DELETE
- OUTPUT
- inserted
- deleted
- EXEC parameters

UPDATE SET assignments are positional.

Expected RHS type comes from the assignment that owns the cursor.

Comma handling must respect expression nesting.

Incomplete SQL is a normal IntelliSense state.

## Signature Help

Preserve the existing automatic Signature Help behavior for supported catalog-backed
functions.

Typing `(` should trigger Signature Help where supported.

Comma navigation updates the active parameter.

Nested expressions must not corrupt active-parameter tracking.

Ctrl+Space remains completion.

Signature Help remains the editor's Signature Help mechanism.

## Wildcard expansion

Wildcard expansion is intentionally explicit.

Tab may expand semantic:

    *
    alias.*

to explicit columns.

Enter must never trigger wildcard expansion.

## Schema Intelligence

PK/UQ/FK metadata comes from actual SQL Server catalog metadata.

Preserve currently supported semantics including where applicable:

- primary keys
- unique constraints
- unique indexes
- filtered unique indexes
- foreign keys
- composite keys
- composite FKs
- referential actions
- enabled/disabled state
- trusted/untrusted state

INCLUDE columns must not incorrectly become UQ members.

Incoming FKs must not incorrectly mark principal columns as FK columns.

Object identity must include sufficient database/schema context to avoid collapsing
same-named objects.

## Presentation must not affect semantics

Presentation-only changes must never modify:

- filterText
- insertText
- semantic identity
- Contains behavior
- scope resolution
- replacement ranges
- type inference
- relationship inference

Keep semantic data and presentation data separate.

## Refactoring threshold

When a task exposes duplicate implementations of the same responsibility in the
affected subsystem, prefer a small safe consolidation over adding another special
case.

Examples:

- multiple physical-column CompletionItem factories
- multiple SQL type display formatters
- separate grouped/ungrouped role formatters
- duplicate documentation builders
- multiple competing sort-key builders

Do not perform unrelated repository-wide rewrites.

If safe consolidation would require a broad high-risk change, document the issue
and propose a dedicated refactoring task instead.

## Testing

Follow `docs/TESTING.md`.

For behavioral bugs:

1. reproduce the failure
2. add a regression test when practical
3. make sure the test actually fails against the broken implementation
4. fix the root cause
5. run relevant regressions

Provider bugs require provider-level verification.

A helper-only test is not sufficient evidence that CompletionProvider integration
works.

## Publisher identity

Current publisher display name:

    Bearded Puppy Labs

Publisher ID:

    BeardedPuppyLabs

Current full extension ID:

    BeardedPuppyLabs.improved-sql-intellisense

Do not revert active package/documentation links to an old publisher identity.

## Release safety

Do not publish automatically.

VSIX packaging for verification is allowed when requested or part of the established
test flow.

Marketplace/Open VSX publication requires explicit user instruction.

Do not bump the version merely because code changed unless the release task or
release process requires it.

## Definition of done

Before considering a task complete:

1. confirm the root cause was addressed
2. confirm existing behavior remains intact
3. confirm canonical project responsibilities were reused
4. confirm no new duplicate implementation was introduced
5. run relevant provider/unit tests
6. run Extension Host/integration tests when applicable
7. run formatting, lint, strict TypeScript, and production build when applicable
8. inspect the final diff
9. remove temporary diagnostics
10. confirm no credentials or private data were introduced
11. report exactly what was verified
12. do not publish unless explicitly instructed

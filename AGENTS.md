# Query Puppy for T-SQL — Project Instructions

These instructions apply to all work in this repository.

They extend the global engineering guidelines from the user's Codex configuration.
More specific task instructions may override them when explicitly required.

## Project mission

Query Puppy for T-SQL is a context-aware SQL Server IntelliSense extension for
VS Code and VSCodium.

It is designed especially for large real-world SQL Server schemas such as ERP
systems containing hundreds or thousands of tables, views, columns, functions,
procedures, and relationships.

The extension provides its own semantic completion provider.

It does not scrape, filter, or post-process Microsoft SQL Server completion
results.

The Microsoft SQL Server extension is used for its active SQL connection through
the project's existing connection-sharing integration.

## Documentation model

The repository documentation has distinct responsibilities.

Project strategy, product boundaries, roadmap direction, versioning policy,
licensing/compliance policy, sustainability policy, and cross-cutting engineering
principles are defined by:

- `PROJECT_DEVELOPMENT_PLAN.md`

`PROJECT_DEVELOPMENT_PLAN.md` is the authoritative strategic source. Repository
instructions and operational documentation must apply that policy and must not
redefine or contradict it.

Current architecture is defined by:

- `docs/ARCHITECTURE.md`
- `docs/COMPLETION_PIPELINE.md`
- `docs/TYPE_SYSTEM.md`
- `docs/TESTING.md`

Operational development and release guidance is defined by:

- `docs/DEVELOPMENT.md`
- `docs/PUBLISHING.md`

Milestone planning and implementation history are recorded in:

- `docs/IMPLEMENTATION_PLAN.md`

`docs/IMPLEMENTATION_PLAN.md` is not authoritative for current architecture.

Historical milestone notes may describe implementation details that were correct
for a particular release and later changed.

When historical implementation notes conflict with current architecture
documentation, treat the current architecture documents as the intended present-day
design contract and inspect the implementation before changing either.

## Required reading

Before modifying completion candidate creation, member completion, filtering,
ranking, sorting, grouping, physical-column presentation, CompletionItem
construction, or CompletionItem documentation:

    read docs/COMPLETION_PIPELINE.md

Before modifying SQL datatype representation, expression type inference,
expected-type detection, compatibility ranking, function argument typing,
UPDATE/INSERT typing, arithmetic typing, or type-group presentation:

    read docs/TYPE_SYSTEM.md

Before modifying connection handling, catalog loading, metadata caching,
QueryScopes, RowSources, subsystem boundaries, cross-database behavior,
schema/relationship metadata, or major data flow:

    read docs/ARCHITECTURE.md

Before adding or changing automated tests, integration tests, Extension Host tests,
or manual SQL acceptance cases:

    read docs/TESTING.md

Before modifying developer prerequisites, npm scripts, build commands,
integration-test environment setup, local development workflow, or packaging
commands:

    read docs/DEVELOPMENT.md

Before modifying versioning, licensing/compliance policy, or deciding whether a
publishable code change requires a package-version bump:

    read PROJECT_DEVELOPMENT_PLAN.md

Before adding, copying, vendoring, replacing, or materially upgrading third-party
software or redistributable assets:

    read PROJECT_DEVELOPMENT_PLAN.md

Before modifying VSIX release procedures, Marketplace publication, publisher
identity, publishing authentication, relicensing, or release security checks:

    read PROJECT_DEVELOPMENT_PLAN.md
    read docs/PUBLISHING.md

Before planning a new milestone, changing milestone scope, or updating completed
milestone state:

    read docs/IMPLEMENTATION_PLAN.md

When a task crosses several areas, read all relevant documents before changing
production code.

## Documentation maintenance

Treat maintained project documentation as part of the implementation. Assess the
documentation impact of every meaningful change and update affected maintained
documentation in the same task.

When a task changes or introduces:

- user-visible behavior or the public feature set
- commands or settings
- subsystem responsibilities
- data flow
- completion pipeline behavior
- semantic candidate structure
- caching or metadata-loading behavior
- QueryScope or RowSource semantics
- SQL type inference or compatibility rules
- testing strategy or regression coverage
- development prerequisites or workflows
- build or packaging commands
- release or publishing procedures
- versioning, licensing/compliance policy, or release metadata
- publisher identity
- milestone scope or completion state
- known limitations
- privacy or storage behavior
- Marketplace or other public positioning
- an architectural invariant documented in this repository

review the relevant documentation before considering the task complete.

Update documentation when its intended contract, workflow, public behavior, or
project state has actually changed.

Do not update documentation merely because implementation details were renamed,
moved, or rearranged without affecting the documented contract.

A milestone is not complete while maintained documentation describes the previous
behavior, and manual acceptance is not complete while its required editor or
database context remains ambiguous.

### Architecture documentation responsibilities

`docs/ARCHITECTURE.md` owns:

- subsystem boundaries
- connection and database architecture
- catalog and metadata flow
- caching and lazy loading
- QueryScopes
- RowSources
- Schema Intelligence
- relationships
- cross-database boundaries
- performance and security invariants

`docs/COMPLETION_PIPELINE.md` owns:

- semantic candidate creation
- matching and filtering
- ranking
- grouping
- sorting
- CompletionItem materialization
- physical-column presentation
- completion invariants

`docs/TYPE_SYSTEM.md` owns:

- normalized SQL types
- type families and facets
- expression inference
- ExpectedType
- compatibility behavior
- canonical SQL type display

`docs/TESTING.md` owns:

- unit tests
- provider tests
- Extension Host tests
- live SQL integration tests
- installed VSCodium acceptance
- regression requirements
- manual acceptance conventions

### Operational documentation responsibilities

`docs/DEVELOPMENT.md` owns:

- prerequisites
- dependency installation
- development commands
- build and verification commands
- integration-test environment setup
- local packaging workflow
- concise developer-facing architecture entry points

It should link to architecture documentation rather than duplicating detailed
architecture.

`docs/PUBLISHING.md` owns:

- Marketplace publisher requirements
- release verification
- VSIX packaging and inspection
- explicit publication procedures
- publishing authentication guidance
- release security checks

It should remain durable and avoid unnecessary release-version-specific examples.

### Planning and history responsibility

`docs/IMPLEMENTATION_PLAN.md` owns:

- milestone scope
- completed milestone state
- implementation history
- release-specific verification notes
- deliberately deferred work

Historical implementation notes must not override current architecture contracts.

Before completing every development task, explicitly evaluate:

    Does this change require an update to AGENTS.md or docs/?

If no documentation contract changed, do not create documentation churn merely to
touch the files.

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

Do not turn IntelliSense into a type checker.

## Explicit qualifiers

For:

    alias.

only members actually belonging to that resolved RowSource may be returned.

Ranking may reorder those members.

It must not broaden an explicit qualifier to unrelated RowSources.

## Native editor UI

Use supported native VS Code/VSCodium APIs.

Do not introduce a custom completion popup, custom editor overlay, external search
window, or webview merely to work around Suggest Widget presentation limitations.

Use native CompletionItems, Signature Help, documentation, commands, and settings.

Do not rely on private VS Code/VSCodium APIs to manipulate Suggest Widget geometry
or behavior.

## SQL connection contract

Reuse the active SQL connection owned by the Microsoft SQL Server extension
through the project's backend-neutral connection and metadata boundary. The
current production backend is the Microsoft mssql Connection Sharing adapter.

Semantic, parser, completion, type, relationship, presentation, metadata-cache,
and document-analysis code must not call Microsoft mssql Connection Sharing APIs
directly. Route active editor context, same-server database enumeration, and
read-only catalog SQL execution through the backend-neutral contracts.

Connection Sharing has not been removed yet. Do not claim it has been removed
until the production adapter no longer uses it.

Do not introduce:

- a second independent SQL connection
- extension-specific SQL credentials
- duplicate credential management
- credential scraping
- credential persistence

Runtime metadata access remains read-only.

Do not require administrator credentials.

Do not provision integration fixtures from extension runtime code.

## Catalog loading and performance contract

Persistent SQL Server metadata is cached by the appropriate backend
connection/database context.

A first access to an uncached database checks its versioned snapshot in
`ExtensionContext.globalStorageUri`. A valid snapshot is hydrated into a rebuilt
`DatabaseIndex` and returned before its first-session background refresh completes.
With no valid snapshot, the database uses the visible coalesced cold-load path.

Refresh is stale-while-revalidate: a usable snapshot remains active until a
complete replacement has loaded, validated, and been atomically persisted. A
refresh failure retains the stale snapshot. Automatic refresh is demand-driven:
one first-use attempt per cached database per extension-host session, then a fixed
15-minute freshness/retry threshold evaluated on later database use. Do not add a
global refresh timer.

Concurrent requests for the same not-yet-loaded catalog must share or coalesce that
load rather than starting duplicate loads for the same metadata state.

Concurrent automatic or manual refresh requests for the same cache identity must
share one refresh. Manual refresh bypasses freshness but uses the same canonical
pipeline.

Once the relevant catalog has been loaded, the steady-state completion hot path
uses cached metadata and performs no repeated SQL catalog access for each
keystroke.

Do not turn lazy loading into repeated per-completion metadata access.

Persistent storage is session hydration, not the per-keystroke hot path. Persist
only allow-listed canonical catalog metadata, never credentials, CompletionItems,
static built-ins, QueryScopes, or document-local RowSources. Rebuild runtime indexes
from the serialized canonical graph.

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

Do not add expensive whole-catalog work to the per-keystroke path when equivalent
indexed or precomputed state can be used.

## Canonical metadata

Do not lose semantic metadata while transforming candidates.

Physical-column metadata may include:

- complete identifier
- source database
- source schema
- source object
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

If an existing abstraction represents the same semantic responsibility but cannot
currently support the requested behavior cleanly, first determine whether it should
be extended or refactored rather than bypassed.

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
- canonical column identity
- documentation
- constraint/index metadata

when appearing in:

- WHERE
- JOIN expressions
- UPDATE RHS
- INSERT SELECT
- function arguments
- correlated scopes
- type-aware compatibility groups

Context may change:

- ranking
- sortText
- compatibility group
- group placement
- preselection
- syntax-aware insertion text and replacement range

When an unqualified semantic column belongs to a RowSource with an explicit alias,
acceptance inserts `<alias>.<column>`. Explicit `alias.`/`alias.fragment` input must
not duplicate the qualifier, unaliased RowSources retain bare-column insertion, and
projection aliases remain bare. Syntax-restricted targets such as the left side of
`UPDATE SET` must not be forcibly qualified.

Context must not change the physical-column identity or strip metadata.

If ordinary completion and a context-specific completion path produce different
physical metadata for the same column, treat that as architectural drift rather
than patching the presentation locally.

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

### Roles

Role order is:

    PK
    UQ
    FK

Combined examples:

    PK·UQ
    PK·FK
    UQ·FK
    PK·UQ·FK

Use one canonical role formatter.

Do not create grouped and ungrouped variants.

### SQL type display

SQL type display uses canonical SQL declaration syntax.

Examples:

    tinyint
    smallint
    int
    bigint
    varchar(50)
    nvarchar(200)
    decimal(38,18)
    datetime2(3)
    datetimeoffset(7)
    uniqueidentifier
    varbinary(max)
    nvarchar(max)

Do not expose internal normalized facets as invalid SQL declarations.

Therefore:

    bigint

not:

    bigint(19,0)

and:

    uniqueidentifier

not:

    uniqueidentifier(16)

The same canonical display formatter should be reused wherever the same SQL type
needs the same user-facing declaration representation.

## Type-aware intelligence

There is one normalized type system and one compatibility model.

Do not build separate type systems for:

- comparisons
- JOIN expressions
- function arguments
- UPDATE
- INSERT
- arithmetic
- built-in, aggregate, window, and conditional-expression intelligence

Type-aware completion is primarily ranking.

When a reliable ExpectedType exists, compatibility may affect ordering.

When no expected type exists, type ranking must not participate.

The pre-type-intelligence ordering must then remain unchanged.

Decorative compatibility groups may explain changed ordering.

Typical user-facing groups are:

    Type match · <type>
    Compatible <family>
    Other visible columns

Within a group, equivalent candidates remain alphabetical.

Group headers are no-op presentation items, not semantic SQL candidates.

If filtering leaves only one meaningful group, avoid unnecessary group-header
clutter.

Expected-type classification decorates canonical candidates.

It must not create stripped replacement physical-column candidates.

## Query scope semantics

Nested SQL scopes must remain explicit.

Do not flatten query aliases into one global alias map.

A nested QueryScope may resolve:

1. local RowSources
2. legally correlated parent scopes
3. legally correlated ancestors

Sibling scopes do not leak into each other.

Independent sequential top-level statements do not leak aliases, RowSources,
projection aliases, or clause state into each other. A semicolon is not required to
separate consecutive ordinary top-level SELECT statements. Nested queries and
set-operation branches remain within their containing query expression.

Local aliases shadow correlated aliases with the same name.

QueryScope, statement, and client batch are distinct ownership levels. Table
aliases, RowSources, projection aliases, and clause state are query/statement
local. Declared scalar variables and table variables remain visible across later
statements in the same batch. Only a tokenizer-validated standalone `GO` starts a
new batch; delimited identifiers such as `[go]` and `"go"` never do.

Independent top-level SELECT, INSERT, UPDATE, DELETE, and EXEC/EXECUTE statements
must not share query-local state when optional semicolons are omitted. INSERT ...
SELECT, CTE consumers, set-operation branches, and nested/correlated SELECTs remain
within their owning statement.

Ordinary derived tables are non-correlated unless SQL semantics allow otherwise.

CROSS APPLY and OUTER APPLY may correlate to legally visible left-side sources.

## Relationship Intelligence

Relationship Intelligence uses one canonical relationship model and one canonical
runtime graph. Evidence sources must not create parallel FK, project, learned, or
heuristic graph implementations.

Every relationship carries structured provenance and confidence plus source/target
object references and ordered column mappings. Supported model provenance includes
declared foreign key, project-defined, user-confirmed, learned-from-query, and
heuristic-candidate relationships. Declared SQL Server foreign keys are authoritative
and retain their physical constraint identity, actions, disabled/trust state, and
composite mapping order in declared-FK-specific details.

Physical foreign-key metadata and semantic relationships are distinct. Never invent a
foreign key: non-FK relationships must never receive fabricated constraint names,
catalog IDs, trust state, or other physical FK metadata. Production completion admits
enabled authoritative declared FKs plus explicit workspace UserConfirmed/Confirmed and
ProjectDefined/Confirmed relationships loaded from
`.query-puppy/relationships.json`. File-backed relationships are validated against
canonical metadata and overlaid after physical cache hydration; they must never enter
physical SQL metadata snapshots or be presented as FKs. UserConfirmed is written only
after the user invokes the native save-JOIN Code Action for a safely resolved direct-
equality predicate. Ordinary query editing never persists confirmed or authoritative
relationship knowledge.

Production completion also admits local `LearnedFromQuery`/`StrongEvidence`
relationships only after at least three independently deduplicated saved observations
are revalidated against current canonical metadata. They use the same canonical
runtime graph, remain below `ProjectDefined` in trust, never acquire physical FK
metadata, and never enter project files or physical metadata snapshots. Acquisition is
local, save-driven, bounded, and cross-session-deduplicated; accepting completion is
not confirmation.

The E3 heuristic source is active only as a transient, conservative JOIN-predicate
fallback for an already-selected physical table pair. It requires one complete
unfiltered target key, compatible known types, target-aware deterministic naming, and
an unambiguous full mapping. Any stronger relationship suppresses it. A heuristic
candidate never enters persistence, the canonical database relationship graph, global
discovery/ranking, navigation, diagnostics, or multi-hop paths. The explicit save-JOIN
Code Action remains the sole promotion path to `UserConfirmed` project knowledge.

## JOIN semantics

JOIN visibility is positional.

A future RowSource must not be visible in an earlier ON condition.

Current JOIN intelligence uses enabled authoritative declared-FK, confirmed
UserConfirmed, confirmed ProjectDefined, and qualifying LearnedFromQuery relationships
from the canonical relationship graph, plus a contextual HeuristicCandidate fallback
for the already-selected physical pair. Explicit trust order is declared FK,
UserConfirmed, ProjectDefined, LearnedFromQuery, then HeuristicCandidate. Heuristics do
not participate in JOIN source discovery or relationship-aware source/member ranking.

Do not infer an FK merely because names or datatypes match.

Multiple valid FKs between the same tables remain separate choices.

Composite FKs remain one relationship and should generate one ordered predicate.

Disabled FKs are not normal trusted JOIN suggestions.

Declared-FK relationship intelligence is database-local.

Do not infer cross-database or cross-server foreign keys.

Relationship-aware source ranking may promote actually related objects but must not
change the project's Contains matching contract.

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

Declared scalar variables are batch-scoped expression candidates, not RowSources.
Table variables remain RowSources and must not enter scalar-variable completion.
Typing `@` uses the registered native CompletionItemProvider trigger and normal
case-insensitive contiguous Contains matching; accepting a candidate replaces the
typed `@`/partial variable token exactly once.

Do not replace known type information with Unknown unnecessarily.

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

Do not solve DML-context bugs through heuristics that break nested expressions or
other statement forms.

## Signature Help

Preserve the existing automatic Signature Help behavior for supported
catalog-backed functions.

Typing `(` should trigger Signature Help where supported.

Comma navigation updates the active parameter.

Nested expressions must not corrupt active-parameter tracking.

Ctrl+Space remains normal completion.

Signature Help remains the editor's native Signature Help mechanism.

Built-in, aggregate, and window intelligence must reuse the existing
signature/type infrastructure wherever the semantic responsibilities are shared
rather than creating a second parallel subsystem.

Callable name parsing, depth-aware argument ranges, active-argument calculation,
signature resolution, parameter ExpectedType, and scalar return inference share the
canonical parser-layer call-site/callable infrastructure. Future callable sources
must plug into that boundary rather than bypass it.

## Wildcard expansion

Wildcard expansion is intentionally explicit.

Tab may expand semantic:

    *
    alias.*

to explicit columns.

Enter must never trigger wildcard expansion.

Expansion resolves only RowSources owned by the wildcard's current semantic
statement. Adjacent statements must never contribute sources or columns.

This behavior is intentional and protects normal workflows on very wide tables.

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

Physical FK roles and constraint documentation must use actual SQL Server catalog
metadata. Never relabel same-name/type guesses or provenance-tagged logical
relationships as foreign keys. Learned relationships are active only through the
explicitly implemented and tested E1/E2 learned-evidence pipeline. Conservative
heuristic JOIN candidates are active only through the implemented E3 pair-bounded
fallback and remain Candidate-confidence non-FK suggestions outside the canonical
database relationship graph.

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
- canonical metadata

Keep semantic data and presentation data separate.

If a UI workaround requires changing semantic metadata, reconsider the approach.

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
- context-specific copies of canonical semantic metadata

Do not perform unrelated repository-wide rewrites.

If safe consolidation would require a broad high-risk change, document the issue
and propose a dedicated refactoring task instead.

Repeated bugs caused by different code paths implementing the same semantic
responsibility are a strong signal that a dedicated consolidation/refactoring task
may be appropriate.

## Testing

Follow `docs/TESTING.md`.

For behavioral bugs:

1. reproduce the failure
2. identify the failing subsystem/path
3. add a regression test when practical
4. ensure the regression actually fails against the broken behavior
5. fix the root cause
6. run the regression
7. run relevant surrounding regressions

Provider bugs require provider-level verification.

A helper-only test is not sufficient evidence that CompletionProvider integration
works.

Native Suggest Widget or Signature Help behavior may require installed VSCodium
acceptance in addition to automated tests.

## Manual SQL acceptance

When user-visible IntelliSense behavior requires manual acceptance, provide compact
copy/paste SQL test cases.

Comments inside the SQL document may identify:

- test number
- scenario
- cursor position

Do not place expected candidate names in SQL comments.

VS Code/VSCodium word completion can surface comment text as generic `abc`
suggestions and create false positives.

Expected semantic candidates must be described separately from the SQL script.

Within equivalent groups, expected candidate lists should be alphabetical.

Generic editor word suggestions do not count as Query Puppy for T-SQL semantic
results.

## Licensing and third-party compliance

Query Puppy version 0.12.6 and subsequent versions are licensed under
`GPL-3.0-only`. Officially published releases through 0.12.5 retain their original
MIT license terms; do not rewrite historical release licensing.

GPL compatibility is a mandatory pre-adoption gate. Before adding,
copying, vendoring, replacing, or materially upgrading third-party software, source,
binaries, or redistributable assets:

1. identify the material and authoritative upstream source;
2. verify the exact license/version/exception terms;
3. verify compatibility with Query Puppy's approved `GPL-3.0-only` distribution model
   for the intended use;
4. determine whether it is bundled, copied, linked, generated into, or otherwise
   redistributed with the VSIX;
5. determine required copyright, attribution, NOTICE, source, relinking, offer, or
   other redistribution obligations;
6. update `THIRD_PARTY_NOTICES.md` and other required notice/license material in the
   same coherent change.

Do not rely solely on a package-manager `license` field when compatibility or
redistribution is material. Prefer authoritative upstream LICENSE/NOTICE files and
project licensing documentation.

If compatibility is unknown, ambiguous, unusual, or depends on unresolved legal
interpretation, do not adopt the material. Report it for explicit review.

The gate applies to dependencies, copied/adapted code, vendored source, drivers,
embedded runtimes, native binaries, fonts, icons/assets, generated third-party code,
and similar external material. Ordinary language/runtime/platform facilities such as
Node.js built-ins and normal VS Code/VSCodium public API usage are not individually
credited merely for being platform facilities.

Microsoft `mssql` is currently a separately installed extension dependency. Do not
represent its code as bundled with Query Puppy unless artifact inspection proves that
Query Puppy actually redistributes Microsoft material.

For every GPL release, inspect the actual production bundle and final VSIX. Verify
that required notices survive packaging and that the exact distributed VSIX maps to
an immutable release tag/source revision whose required Corresponding Source is
available for that exact release.

Public/project communication must not describe GPL as non-commercial, prohibit
commercial use or sale, prohibit forks/modification, claim that all modifications must
always be published, or claim that private/internal modification is forbidden.

Sponsorship is voluntary support for independent development. It does not create a
right to features, support/SLA commitments, roadmap priority, proprietary licensing,
governance, or technical influence.

## Publisher identity

Current publisher display name:

    Bearded Puppy Labs

Publisher ID:

    BeardedPuppyLabs

Current full extension ID:

    BeardedPuppyLabs.query-puppy-for-t-sql

All maintained repository references to the project/publisher identity must use the
current identity.

Do not preserve obsolete publisher names merely because a maintained document
describes an older milestone.

Historical milestone meaning may be preserved without retaining an obsolete
publisher identifier.

Do not rewrite Git history.

## Release safety

`PROJECT_DEVELOPMENT_PLAN.md` is the authoritative source for release-version,
licensing/compliance, and relicensing policy.

Versioning is part of publishable product work, not merely a release-time
administrative step.

For every task that changes publishable production behavior:

1. inspect `PROJECT_DEVELOPMENT_PLAN.md`;
2. determine the appropriate next SemVer version;
3. update `package.json`;
4. update `package-lock.json`;
5. update `CHANGELOG.md`;
6. keep those changes in the same coherent task as the behavior change.

Never reuse a version that has already been officially released for different code
or behavior. Released version numbers identify immutable product states.

Use the project SemVer policy from `PROJECT_DEVELOPMENT_PLAN.md` rather than
inventing a local rule.

In particular:

- bug fixes, patch-level behavior corrections, and small non-breaking refinements
  increment PATCH;
- meaningful new user-facing capabilities or feature milestones increment MINOR;
- incompatible configuration, public API, or migration changes increment MAJOR
  where appropriate;
- licensing-only work follows the deliberate release/version decision recorded in
  `PROJECT_DEVELOPMENT_PLAN.md`; do not invent another version transition.

A version bump is normally not required for documentation-only, test-only, internal
behavior-preserving refactoring, research-only, or non-publishable experimental work.
Local development builds and temporary test VSIX files do not reserve or consume a
version number.

Do not publish ad hoc as part of normal Codex development work.

For normal Codex development work, do not run production builds, bundle commands,
VSIX packaging, or publication unless they are explicitly required by the task or
the established release/test workflow. Codex should still run relevant tests,
ESLint, strict TypeScript checking, Prettier checking, and `git diff --check`.

VSIX packaging for verification is allowed when requested or part of the established
test/release flow. Marketplace/Open VSX publication requires explicit user
instruction unless an established documented release workflow explicitly owns
publication under its deliberate release condition.

Before packaging or publishing, ensure no credentials, tokens, private SQL
connection strings, fixture secrets, or other sensitive local data are included.

Before any release, verify required third-party attribution and license notices in
the final artifact according to `PROJECT_DEVELOPMENT_PLAN.md` and the maintained
notice files.

The 0.12.6 GPL transition established the required ownership/provenance review,
bundle/VSIX inventory, research-only exclusions, `THIRD_PARTY_NOTICES.md`, exact
`GPL-3.0-only` package and LICENSE metadata, and synchronized public documentation.
Every GPL release must repeat artifact-level compliance verification and establish
exact release-tag/source/VSIX Corresponding Source traceability before publication.

For release-process changes, keep `docs/PUBLISHING.md` synchronized with the actual
package scripts and current supported publication workflow.

If repository instructions conflict with `PROJECT_DEVELOPMENT_PLAN.md` on strategic
versioning, licensing, or sustainability policy, treat the Development Plan as
authoritative and update the conflicting maintained repository documentation in the
same coherent task where appropriate.

## Documentation growth

The current core architecture documentation is:

    docs/ARCHITECTURE.md
    docs/COMPLETION_PIPELINE.md
    docs/TYPE_SYSTEM.md
    docs/TESTING.md

Operational documentation currently includes:

    docs/DEVELOPMENT.md
    docs/PUBLISHING.md

Milestone planning/history currently lives in:

    docs/IMPLEMENTATION_PLAN.md

Do not create additional architecture documents without a concrete reason.

A dedicated architecture document becomes appropriate when a subsystem:

- develops substantial independent architecture
- has several important invariants of its own
- repeatedly requires long explanations in task prompts
- causes an existing document to become difficult to navigate
- becomes risky to modify without focused architectural context

Potential future splits might include:

- built-in function intelligence
- QueryScope/parser architecture
- Schema Intelligence
- relationship/JOIN intelligence

These are examples, not instructions to create those files now.

If such a threshold is reached, report the recommended documentation split before
or as part of the relevant architectural task.

## Repository and package documentation policy

All maintained project documentation remains version-controlled.

Do not add:

- `PROJECT_DEVELOPMENT_PLAN.md`
- `AGENTS.md`
- `docs/ARCHITECTURE.md`
- `docs/COMPLETION_PIPELINE.md`
- `docs/DEVELOPMENT.md`
- `docs/IMPLEMENTATION_PLAN.md`
- `docs/PUBLISHING.md`
- `docs/TESTING.md`
- `docs/TYPE_SYSTEM.md`

to `.gitignore`.

Git tracking and VSIX packaging are separate concerns.

Internal engineering documentation may be excluded from the published VSIX through
`.vscodeignore` when that matches the repository's package-content policy.

Do not use `.gitignore` to control VSIX contents.

Before changing `.vscodeignore`, inspect the actual package-content policy and
current `vsce` file list.

## Definition of done

Before considering a development task complete:

1. confirm the root cause or requested behavior was addressed
2. confirm relevant existing behavior remains intact
3. confirm canonical project responsibilities were reused
4. confirm no unnecessary duplicate implementation was introduced
5. confirm semantic metadata remains lossless through affected pipelines
6. determine whether the task changes publishable production behavior
7. if publishable behavior changed, apply the required SemVer bump from
   `PROJECT_DEVELOPMENT_PLAN.md` and update `package.json`, `package-lock.json`, and
   `CHANGELOG.md`
8. if no version bump was applied, ensure the task genuinely falls under a documented
   no-bump category or another explicit project rule explains the decision
9. confirm no officially released version was reused for different code or behavior
10. if third-party material was added, copied, vendored, replaced, or materially
    upgraded, verify provenance, exact license, `GPL-3.0-only` compatibility,
    redistribution status, and required notices before accepting the change
11. if third-party compatibility remains unclear or unresolved, do not ship or adopt
    it; report the blocker explicitly
12. update `THIRD_PARTY_NOTICES.md` and other required notice/license material when
    applicable
13. run relevant provider/unit tests
14. run Extension Host/integration tests when applicable
15. run formatting, lint, and strict TypeScript; run a production build only when the
    user explicitly delegates it or the established task/release workflow requires it
16. perform installed VSCodium acceptance when native UI behavior requires it
17. inspect the final diff
18. remove temporary diagnostics/debugging
19. confirm no credentials or private data were introduced
20. for packaging/release work, inspect the actual intended VSIX contents and verify
    required notices survive packaging
21. for GPL release work, verify the exact release version/tag/source revision/VSIX
    mapping and availability of the required Corresponding Source
22. review whether `AGENTS.md`, `PROJECT_DEVELOPMENT_PLAN.md`, or any `docs/` file needs
    updating
23. update documentation when its architectural, operational, release, versioning,
    licensing/compliance, sustainability, or milestone contract genuinely changed
24. verify maintained publisher identity references when public/release metadata was
    affected
25. verify operational documentation still references commands that actually exist in
    `package.json`
26. verify internal documentation remains tracked and package inclusion/exclusion is
    controlled through the appropriate mechanism
27. report the versioning decision, including old/new version for publishable changes
    or the reason no version bump was required
28. report third-party/license impact, including `none` when no external material
    changed
29. report exactly what was verified and what was not
30. do not publish unless explicitly instructed or an established documented release
    workflow explicitly owns publication

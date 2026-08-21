# Testing Strategy

## Purpose

Query Puppy for T-SQL has several distinct verification layers.

Use the lowest layer that proves the behavior, but completion integration bugs
usually require provider-level or Extension Host verification.

Do not claim a behavior is verified merely because a helper unit test passes.

The contracts under test are described in [Architecture](ARCHITECTURE.md), the
[Completion Pipeline](COMPLETION_PIPELINE.md), and the
[SQL Type System](TYPE_SYSTEM.md).

## Test layers

### Unit tests

Use for isolated logic such as:

- Contains matching
- SQL type normalization
- compatibility classification
- datatype formatting
- role formatting
- projection parsing
- scope helpers
- relationship indexing
- sort-key construction
- documentation helpers

Unit tests should be fast and deterministic.

Connection-boundary tests also verify session API reuse, concurrent active-context
coalescing, transient shared-connection reuse within one metadata operation,
failure/retry behavior, and dynamic connection/database switching.

### Persistent metadata lifecycle tests

Protect the cache lifecycle with deterministic stores and an injectable clock:

- canonical metadata survives serialization/deserialization and rebuilds equivalent
  object, callable, key, writable-column, and relationship indexes
- concurrent cold consumers issue one loader call and one persistent write
- warm hydration returns the persisted snapshot before its SQL refresh resolves
- the first cached use in each session schedules only one refresh
- stale metadata remains available until a complete replacement has been persisted
  and atomically swapped
- refresh failure retains memory and disk snapshots and uses a bounded retry point
- 14 minutes 59 seconds is not stale; 15 minutes becomes eligible on the next use
- manual and automatic refreshes use and coalesce through the same cache path
- server/database identities remain isolated and secondary databases remain lazy
- corrupt or format-incompatible cache files fall back to a cold load
- serialized snapshots exclude secrets, static built-ins, CompletionItems, and
  document-local state
- the memory index remains the hot path with no repeated SQL load or disk
  deserialization

Do not sleep for the refresh interval in tests and do not provision SQL fixtures
from runtime or test extension code.

### CompletionProvider tests

Use the actual CompletionItemProvider for user-facing completion behavior.

This is the preferred regression layer for:

- candidate presence
- candidate absence
- candidate ordering
- Contains behavior
- explicit qualifier behavior
- type grouping
- physical-column metadata
- filterText
- insertText
- sortText
- group headers
- UPDATE/INSERT context
- scope resolution integration

If a bug only occurs after several semantic layers combine, a helper-only test is
not enough.

### Extension Host tests

Use Extension Host tests for behavior involving real VS Code extension
registration/API integration.

Examples:

- provider registration
- command registration
- Signature Help registration
- trigger behavior
- extension activation
- settings interaction

### Live SQL integration tests

Use the existing SQL Server fixtures for catalog behavior that should be verified
against real SQL Server metadata.

Examples:

- PK/UQ/FK discovery
- filtered unique indexes
- INCLUDE behavior
- composite keys
- composite FKs
- disabled/untrusted FK state
- referential actions
- same-name objects in different schemas
- database isolation
- scalar function signatures

Runtime extension code must not provision these fixtures.

### Installed VSCodium acceptance

Use installed packaged VSIX testing for native widget behavior that automated object
assertions cannot prove completely.

Examples:

- actual Suggest Widget layout
- text clipping
- group-header readability
- Signature Help UX
- Tab wildcard expansion
- full identifier insertion after truncated presentation

Do not declare a visual problem solved from TypeScript object inspection alone.

## Bug-fix workflow

For a practical bug:

1. reproduce the issue
2. identify the failing subsystem/path
3. add a regression test if practical
4. verify the new test fails against the broken implementation
5. fix the root cause
6. run the regression
7. run nearby regression suites
8. inspect the final diff
9. perform installed acceptance when native UI behavior matters

Do not modify an expected test value merely to fit incorrect implementation
behavior.

## Manual SQL acceptance tests

When user-visible IntelliSense behavior needs manual checking, provide one
copy/paste SQL script containing sequential test cases.

Comments inside the SQL document may contain:

- test number
- feature/context name
- cursor position

Do not put expected candidate column names into SQL comments.

VS Code/VSCodium word-based completion may expose comment text as generic `abc`
suggestions and create false positives.

Bad:

    /* Expected:
       CustomerId
       ExternalKey
    */

Good:

    /* TEST 03
       Cursor hinter c.
    */

Expected semantic results are documented separately outside the SQL script.

## Manual candidate expectations

Only semantic Query Puppy for T-SQL items count as successful results.

Generic editor word suggestions with an `abc` icon do not count.

When equivalent expected candidates form a list, document them alphabetically.

When type-aware grouping intentionally changes ordering, document:

1. group heading
2. candidates alphabetically inside that group

## Contains tests

Always protect the matching contract:

- case-insensitive
- contiguous Contains
- no fuzzy behavior
- no StartsWith-only behavior

Example fragment:

    address

may match:

    BillingAddressId
    PrimaryAddressId
    ShippingAddressId

An exact object name that is also a prefix of longer object names must affect only
ranking. The exact object and every longer legal Contains match remain independent
completion candidates with complete replacement ranges and canonical RowSource
identity.

## Smart Alias boundary tests

Protect the semantic phase boundary between RowSource-name completion and Smart
Alias Suggestions:

- an identifier touching the cursor remains object-name completion
- separating whitespace after a resolved RowSource enables alias completion
- separating whitespace after `AS` enables the same preferred alias
- an already supplied alias does not receive a redundant alias suggestion
- replacement ranges at alias positions are empty and never replace the RowSource
- deterministic collision fallback considers only legally visible QueryScopes
- automatic whitespace triggering waits for the post-edit cursor and occurs only
  when the provider resolves a semantic Smart Alias candidate

Prefix-family fixtures must prove that an exact shorter object never suppresses
longer Contains candidates while its identifier token is still active.

## No-ExpectedType regression

A query with no reliable ExpectedType must preserve the previous semantic ordering.

Protect at least one complete exact-order provider test.

This prevents candidate-own datatype from accidentally influencing ordering when no
type context exists.

## Type-aware tests

Verify:

- Exact/SameBase types rank strongly
- compatible family follows
- incompatible visible candidates remain present
- group headers appear only when useful
- equivalent items inside a group remain alphabetical

## Physical-column equivalence invariant

The same physical column obtained through:

- ordinary member completion
- grouped type-aware completion
- writable INSERT/UPDATE target completion, when eligible
- legal `inserted`/`deleted` OUTPUT member completion

must produce equivalent:

- role metadata
- datatype
- nullability
- filterText
- insertText
- documentation
- visible physical-row presentation

Ignore only deliberate ranking/group positioning differences.

Writable-target tests must separately prove that identity, computed, generated,
hidden, and rowversion columns remain excluded. OUTPUT pseudo-source tests must prove
that those columns retain canonical metadata when legally visible rather than being
subjected to writable-target filtering.

This test protects against duplicate CompletionItem pipelines.

## Long identifier tests

For identifiers longer than:

    NAME_WIDTH = 32

verify:

- visible label is bounded
- visible representation may use ellipsis
- filterText is complete
- insertText is complete
- Contains uses the complete identifier
- semantic sorting uses the complete identifier
- documentation contains the complete identifier
- accepting the item inserts the complete identifier

## QueryScope tests

Protect:

- local aliases
- outer correlation
- multi-level correlation
- sibling isolation
- alias shadowing
- ordinary derived-table non-correlation
- APPLY correlation
- incomplete SQL

Do not test only parser output; provider-level scope behavior should also be
covered.

## Set operation tests

Protect:

- UNION
- UNION ALL
- INTERSECT
- EXCEPT
- first/leftmost result names
- branch sibling isolation
- legal outer correlation
- semantic star projection
- explicit CTE column-list overrides

## DML tests

Protect:

- INSERT writable columns
- INSERT VALUES expected type
- INSERT SELECT expected type
- UPDATE SET LHS
- UPDATE RHS
- multiple UPDATE assignments
- nested commas in UPDATE expressions
- DELETE scope
- OUTPUT
- inserted/deleted
- EXEC parameters

## Signature Help tests

Protect:

- automatic trigger after `(`
- active parameter
- comma advancement
- nested argument commas
- scalar UDF signatures
- TVF signatures
- manual Signature Help fallback

## Callable infrastructure invariant

Signature Help, function-argument ExpectedType, and scalar-call return inference
must resolve through the same parsed call-site and callable-signature
infrastructure.

Protect:

- qualification/name parts
- depth-aware argument ranges
- one active-argument calculation
- incomplete calls while typing
- catalog scalar UDF parameters and return type
- catalog TVF parameters and non-scalar semantics
- static built-in lookup, availability, optionality, and callable kind
- built-in completion without RowSource pollution or database I/O
- built-in family ExpectedType and fixed/derived/datatype-dependent returns
- built-in Signature Help for every supported definition, including nesting
- qualified physical members inside incomplete built-in and catalog callable
  arguments, including a `FROM` clause after the cursor
- same-server database-qualified resolution

Helper coverage for the call site is necessary, but provider or Extension Host
coverage must also prove that native Signature Help consumes the common result.

## JOIN tests

Protect:

- actual FK-based predicate
- reverse query order
- current-right alias first
- multiple FKs between same tables
- composite FK predicate
- cross-schema FK
- disabled FK exclusion
- unrelated table negative case
- positional visibility
- relationship-aware table ranking

Never treat same-name/type heuristic matches as proof of an FK relationship.

## Schema Intelligence tests

Protect:

- PK
- UQ
- FK
- PK+FK
- UQ+FK
- filtered unique indexes
- INCLUDE safety
- composite key ordering
- composite FK ordering
- incoming/principal direction
- duplicate object names across schemas
- database isolation

## Wildcard expansion tests

Protect the interaction contract:

    Tab expands
    Enter does not expand

Test:

    *
    alias.*
    single source
    aliased source
    multiple sources
    local RowSources

## Verification claims

Never report:

    tests passed

unless those tests actually ran.

If some layer cannot run, report:

- which layer was not run
- why it could not run
- what remains unverified

## Final development checks

Use the project's existing package scripts/tooling for:

- formatting
- lint
- strict TypeScript
- unit/regression tests
- provider tests
- Extension Host tests
- production build
- VSIX packaging
- credential/archive scan

Do not invent alternative commands if the repository already defines authoritative
ones.

For normal Codex tasks, run the non-production checks relevant to the change but do
not run a production build, bundle, VSIX package, or publication unless the user
explicitly delegates that step. Human developers retain the full build and package
workflow documented in [Development](DEVELOPMENT.md).

## Publishing

Packaging/installing locally is testing.

Publishing is not testing.

Never publish automatically unless the user explicitly requests publication.

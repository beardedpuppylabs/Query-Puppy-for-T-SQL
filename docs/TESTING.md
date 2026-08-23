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

The 0.12 runtime-parity sentinel exercises the registered completion provider,
compares its built-in inventory with the authoritative static catalog, retains an
explicit Contains assertion, and covers representative datepart, window, and
Signature Help paths. This protects against source/catalog expansion failing to
reach the activated extension bundle.

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

## Permanent feature-contract suite

Run the compact cross-feature regression gate with:

```bash
npm run test:contracts
```

Contract sentinels have test names beginning with `contract:`. The command loads the
normal test files but executes only those sentinels, so it protects high-risk
cross-feature behavior without duplicating production implementations or replacing
the complete `npm test` run.

When a production regression is found, first add or identify a `contract:` test that
fails for the reported SQL shape. A newly added test that fails because its expected
value was written incorrectly is a test-authoring error, not evidence of a product
regression; correct the assertion and record that distinction rather than changing
production code to satisfy it.

### Feature contract inventory

This table is the maintained feature-to-sentinel map. `Implemented` means the
behavior is part of the current product contract. Deferred and obsolete entries are
listed explicitly so historical milestone notes are not mistaken for current
promises.

| Feature area                                                                         | Status                           | Sentinel test or fixture                                                                                   |
| ------------------------------------------------------------------------------------ | -------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Case-insensitive contiguous Contains matching                                        | Implemented                      | `matcher-sorter.test.ts` — `contract: Contains matching is contiguous and case-insensitive`                |
| Exact object ranking without prefix-family suppression                               | Implemented                      | `candidates.test.ts` — `contract: exact RowSource matches retain longer prefix-family Contains candidates` |
| Database discovery, lazy cross-database loading, and unqualified isolation           | Implemented                      | `completion-scope.test.ts` database-discovery and secondary-metadata contracts                             |
| Same-server database/schema/object qualification                                     | Implemented                      | `candidates.test.ts` — three-part completion contract                                                      |
| Tables, views, synonyms, and TVFs as RowSources                                      | Implemented                      | `candidates.test.ts` — row-source type contract                                                            |
| Explicit qualifier members remain source-local                                       | Implemented                      | `feature-contracts.test.ts` comparison, callable, and UPDATE RHS contracts                                 |
| SELECT/WHERE/GROUP/HAVING/ORDER and incomplete clause recognition                    | Implemented                      | `clause-context.test.ts` — incomplete clause contract                                                      |
| JOIN positional visibility                                                           | Implemented                      | `clause-context.test.ts` — positional RowSource contract                                                   |
| Projection alias clause visibility                                                   | Implemented                      | `clause-context.test.ts` — projection alias contract                                                       |
| Nested, correlated, shadowed, and sibling QueryScopes                                | Implemented                      | `query-scopes.test.ts` nested and isolation contracts                                                      |
| UNION/UNION ALL/INTERSECT/EXCEPT projection semantics                                | Implemented                      | `query-scopes.test.ts` — set-operator contract                                                             |
| CTEs and chained CTEs                                                                | Implemented                      | `document-semantics.test.ts` — chained CTE contract                                                        |
| Temp tables, global temp tables, and table variables                                 | Implemented                      | `document-semantics.test.ts` — local declared-source contract                                              |
| SELECT INTO inference                                                                | Implemented                      | `document-semantics.test.ts` — SELECT INTO contract                                                        |
| Derived tables                                                                       | Implemented                      | `document-semantics.test.ts` — derived projection contract                                                 |
| VALUES and APPLY RowSources                                                          | Implemented                      | `document-semantics.test.ts` — VALUES/APPLY contract                                                       |
| Smart Alias phase boundary, collisions, and cross-database names                     | Implemented                      | `feature-contracts.test.ts` and `productivity.test.ts` Smart Alias contracts                               |
| Wildcard expansion qualification and Tab-only activation                             | Implemented                      | `productivity.test.ts` and `feature-contracts.test.ts` wildcard contracts                                  |
| PK/UQ/FK roles and canonical column metadata                                         | Implemented                      | `schema-intelligence.test.ts` role contract and `dml-call.test.ts` canonical-metadata contract             |
| Composite, directional, cross-schema, and disabled FK state                          | Implemented                      | `schema-intelligence.test.ts` relationship contract                                                        |
| Same-named objects across schemas/databases                                          | Implemented                      | `schema-intelligence.test.ts` database-index contract                                                      |
| FK-aware JOIN predicates, multiple FKs, and composite FKs                            | Implemented                      | `join-intelligence.test.ts` FK predicate contracts                                                         |
| Relationship ranking after Contains                                                  | Implemented                      | `join-intelligence.test.ts` — relationship ranking contract                                                |
| No inferred cross-database FK relationships                                          | Implemented                      | `join-intelligence.test.ts` — cross-database negative contract                                             |
| INSERT writable-column semantics                                                     | Implemented                      | `dml-call.test.ts` — INSERT target contract                                                                |
| UPDATE target/RHS ownership and nested expression depth                              | Implemented                      | `dml-call.test.ts` and `type-intelligence.test.ts` UPDATE contracts                                        |
| DELETE, OUTPUT inserted/deleted, and EXEC parameters                                 | Implemented                      | `dml-call.test.ts` DELETE, OUTPUT, and EXEC contracts                                                      |
| Catalog scalar functions and TVF call signatures                                     | Implemented                      | `dml-call.test.ts` — catalog signature contract                                                            |
| Built-in completion, signatures, ExpectedType, and return inference                  | Implemented                      | `builtin-functions.test.ts` and `broader-language-intelligence.test.ts` contracts                          |
| Aggregates, windows/OVER, CASE/COALESCE, and datepart grammar values                 | Implemented                      | `broader-language-intelligence.test.ts` provider and inference contracts                                   |
| Type normalization, ExpectedType, compatibility ranking, and visibility              | Implemented                      | `type-intelligence.test.ts` ExpectedType and ranking contracts                                             |
| Canonical physical-column layout and long-name semantic preservation                 | Implemented                      | `presentation.test.ts` physical-column presentation contracts                                              |
| Native Signature Help registration                                                   | Implemented                      | `provider-registration.test.ts` — Signature Help contract                                                  |
| Shared mssql connection context without extension-owned credentials                  | Implemented                      | `connection.test.ts` connection-sharing contracts                                                          |
| Read-only Schema Intelligence initialization                                         | Implemented                      | `metadata-loader.test.ts` — catalog-read-only contract                                                     |
| Document semantic version cache                                                      | Implemented                      | `document-semantic-cache.test.ts` — invalidation contract                                                  |
| Concurrent in-memory catalog load coalescing                                         | Implemented                      | `metadata-cache.test.ts` — catalog coalescing contract                                                     |
| Persistent hydration, stale-while-revalidate, isolation, allow-listing, and recovery | Implemented                      | all `contract:` tests in `persistent-metadata.test.ts`                                                     |
| Microsoft suggestion first-run coexistence                                           | Implemented                      | `microsoft-suggestions.test.ts` — explicit scoped setup contract                                           |
| Real SQL Server catalog/relationship metadata                                        | Implemented, opt-in verification | `tests/integration/intellisense-lab.test.ts` and separately provisioned SQL fixtures                       |
| Native Suggest Widget layout and installed-editor interaction                        | Implemented, manual verification | `tests/extension/index.ts` plus installed-editor acceptance                                                |
| Linked Servers and arbitrary four-part cross-server intelligence                     | Deferred                         | No sentinel; outside the same-server database contract                                                     |
| Full SQL grammar/type-precedence coverage and every SQL Server built-in              | Deferred                         | No sentinel; current parsers and built-in catalog are deliberately bounded                                 |
| Runtime fixture provisioning or extension-owned SQL credentials                      | Prohibited                       | Read-only loader and connection-sharing contracts are negative sentinels                                   |
| Pre-persistent memory-only catalog lifecycle                                         | Obsolete                         | Replaced by persistent metadata lifecycle contracts                                                        |
| StartsWith/fuzzy/prefix-bonus ranking                                                | Obsolete and prohibited          | Contains contract is the authoritative negative sentinel                                                   |

The four installed-editor regression shapes involving `qpacc.Customers`,
`qpacc.OrderLines`, `qpacc.CompletionLayoutStress`, and
`qpacc.CalculateBillingTotal_Manual` are represented directly in
`feature-contracts.test.ts`. They deliberately construct canonical metadata rather
than provisioning SQL. If those tests pass but an installed catalog contains no
`qpacc` objects, the failure is a missing or stale integration prerequisite, not a
reason to broaden explicit-qualifier completion or guess unresolved aliases.

### Explicit qualifier membership invariant

For an explicit qualifier such as `c.`, tests must prove this order of operations:

1. resolve `c` against legally visible RowSources
2. enumerate only the canonical members owned by that source
3. infer an ExpectedType from the surrounding expression when reliable
4. rank and group those already-resolved members

ExpectedType must never replace the qualified member domain, broaden it to unrelated
sources, or hide incompatible but legal members. If the RowSource itself cannot be
resolved because its catalog or local metadata is absent, the provider must not
invent members.

### Incomplete SQL acceptance invariant

Incomplete editor-state SQL is a first-class test input. Contract and provider tests
must cover open expressions such as `DATEADD(day, 1, c.`, `fn(c.`,
`SET Column = c.`, and `JOIN ... ON left.Column = right.` without requiring closing
parentheses, semicolons, or a complete statement after the cursor.

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

When user-visible IntelliSense behavior needs manual checking, provide a compact
copy/paste SQL suite. A combined file is acceptable only when its isolation
boundaries are unmistakable.

For database-backed acceptance, state the required active database prominently.
The active database selected by the mssql editor connection is authoritative; a
`USE` statement inside intentionally incomplete SQL is not a substitute. If a
fixture script finishes in another database, explicitly switch the editor back to
the required database and run **Query Puppy for T-SQL: Refresh Schema Metadata**
when provisioning or database changes may have left cached metadata stale.

Every intentionally incomplete SQL scenario must say **RUN ALONE IN A FRESH SQL
EDITOR**, identify the exact cursor position, and distinguish positioning the
cursor from typing a trigger character. Use the native editor commands precisely:

- `Ctrl+Space` opens ordinary completion.
- `Ctrl+Shift+Space` opens Signature Help / Parameter Hints manually.
- Typing `(` tests automatic Signature Help activation.

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
- native CompletionItem presentation retains the semantic alias as `label`,
  `insertText`, and `filterText`, identifies the short source name with
  `label.description`, retains schema-qualified source detail, and uses the stable
  local-binding kind

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
- aggregate callable kinds and SQL Server numeric return promotions
- CASE/COALESCE shared precedence, ISNULL distinction, and unresolved-input fallback
- required/optional OVER metadata plus window grammar and scoped member completion
- datepart grammar candidates only in the documented active argument
- built-in Signature Help for every supported definition, including nesting
- qualified physical members inside incomplete built-in and catalog callable
  arguments, including a `FROM` clause after the cursor
- same-server database-qualified resolution
- live supplemental-fixture metadata saved and reloaded through the production
  persistent snapshot format before catalog-UDF member completion

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
- relationship-mapped member tie-breaking in both comparison directions
- no comparison-member reordering without a real relationship

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

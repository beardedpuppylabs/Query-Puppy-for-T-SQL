# Development

## Purpose

This document describes the local development, verification, integration-test, and
packaging workflow for Query Puppy for T-SQL.

For system architecture and semantic design, see:

- [Architecture](ARCHITECTURE.md)
- [Completion Pipeline](COMPLETION_PIPELINE.md)
- [SQL Type System](TYPE_SYSTEM.md)

For verification responsibilities and acceptance conventions, see:

- [Testing Strategy](TESTING.md)

For release and publication procedures, see:

- [Publishing](PUBLISHING.md)

## Prerequisites

- Node.js 24 LTS and npm
- VS Code 1.105 or later
- Microsoft SQL Server extension (`ms-mssql.mssql`) for Extension Development Host
  testing that exercises the real mssql integration

Use versions compatible with the repository's current package metadata and
development dependencies.

Node.js 24 is the maintained CI and contributor baseline for the 0.12.1 hygiene
release. Newer non-LTS local runtimes are not the compatibility target merely
because they are installed on a contributor's machine.

Do not assume that the newest globally available Node.js, npm, VS Code, VSCodium,
or vsce release is automatically the version targeted by this repository.

## Build a publishable VSIX in one command

From the repository root, run:

```bash
npm ci && npm run package
```

This single command installs the exact dependencies from `package-lock.json`, runs
format checking, linting, strict TypeScript compilation, unit/provider tests,
Extension Host tests, and the production build, then creates the versioned VSIX in
the repository root.

The command does not publish the extension. Its output file follows this naming
convention:

```text
query-puppy-for-t-sql-<version>.vsix
```

If any verification step fails, the command stops and no successful package should
be assumed. Live SQL Server integration tests are intentionally separate because
they require a configured fixture and credentials; see [Integration tests](#integration-tests).

## Install the built VSIX

Replace `<version>` with the version from `package.json` or the generated VSIX
filename.

Install in Visual Studio Code:

```bash
code --install-extension query-puppy-for-t-sql-<version>.vsix --force
```

Install in VSCodium:

```bash
codium --install-extension query-puppy-for-t-sql-<version>.vsix --force
```

Restart or reload the editor after installation. These commands install the local
VSIX only; they do not publish it to a registry or Marketplace.

## Install dependencies

For ordinary development:

```bash
npm install
```

For a clean reproducible installation using the committed lockfile:

```bash
npm ci
```

## Standard verification

Run the repository verification flow with:

```bash
npm run verify
```

`package.json` is authoritative for the exact checks performed by this script.

The repository currently uses its verification flow to cover the configured
formatting, ESLint, strict TypeScript compilation, automated tests, and production
build.

For details about which verification layer proves which behavior, see
[Testing Strategy](TESTING.md).

For a fast permanent regression gate spanning the major shipped feature contracts,
run:

```bash
npm run test:contracts
```

This focused command complements rather than replaces `npm test`. See the feature
contract inventory in [Testing Strategy](TESTING.md) for the sentinel mapping.

## Codex verification boundary

For normal development tasks, Codex runs the applicable non-production checks:

```bash
npm run format:check && npm run lint && npm run compile && npm test
```

Codex does not run production builds, bundle commands, Extension Host scripts that
implicitly build, VSIX packaging, or publication unless the user explicitly asks
for that step in the current task. The human build and packaging commands in this
document remain the supported workflow for developers.

## Extension Development Host

Use the repository's configured VS Code launch setup, normally by pressing F5, to
build and start an Extension Development Host.

Testing behavior that depends on the real Microsoft SQL Server extension requires
`ms-mssql.mssql` to be available in that host.

Completion and Signature Help behavior that depends on native editor interaction may
require Extension Host or installed VSIX verification even when lower-level tests
already pass.

## Integration tests

The live SQL Server integration suite is opt-in and skips when its environment is
not configured.

Run it with:

```bash
npm run test:integration
```

The integration environment uses:

```text
MSSQL_TEST_SERVER
MSSQL_TEST_DATABASE
MSSQL_TEST_USER
MSSQL_TEST_PASSWORD
```

Cross-database coverage also uses:

```text
MSSQL_TEST_SECONDARY_DATABASE
```

Keep credentials in the local environment.

Never commit:

- SQL passwords
- connection secrets
- private infrastructure credentials
- test-user credentials
- production connection strings

The disposable secondary-database fixture is located at:

```text
tests/fixtures/create-cross-database-fixture.sql
```

Persistent Schema Intelligence fixtures are development/integration infrastructure.

Runtime extension code must never provision those fixtures.

## Architecture entry point

The backend-neutral connection and metadata contracts are the project's SQL
connectivity boundary.

Production activation currently wires those contracts to the mssql connection
sharing adapter. The extension still reuses the active Microsoft SQL Server
connection through the existing mssql connection-sharing integration instead of
opening an independent credentialed SQL connection.

Catalog metadata is loaded lazily using set-based metadata operations and cached
by the appropriate backend connection/database identity.

Concurrent requests for the same not-yet-loaded catalog use the project's existing
coalesced loading path.

Canonical snapshots are persisted in the directory represented by VS Code's
`ExtensionContext.globalStorageUri`, never in the workspace or source tree. A warm
session rebuilds the in-memory `DatabaseIndex` from that snapshot before its
background SQL refresh completes. After hydration, steady-state completion uses
memory catalog and relationship indexes together with document semantic state,
without catalog queries or disk deserialization for each keystroke.

The authoritative description of current metadata loading, cache ownership, and
subsystem boundaries is in [Architecture](ARCHITECTURE.md).

Do not duplicate exact catalog-query-count assumptions here unless they are a
stable documented contract.

## Testing the persistent metadata lifecycle

Use the active database commands and Extension Host/VSCodium restarts to exercise
the lifecycle without relying on machine-specific storage paths:

1. Run **Query Puppy for T-SQL: Clear Schema Cache for Active Database**, confirm
   the prompt, then trigger schema-backed completion. Verify a database-specific
   cold-load status appears and completion eventually succeeds.
2. Restart the Extension Host/editor, reconnect the same database, and trigger
   completion. Verify cached results are available without waiting for the
   background refresh status to finish.
3. While refresh is visible, test a known alias such as `c.` and verify stale
   physical-column completion remains available.
4. Run **Query Puppy for T-SQL: Refresh Schema Metadata** to exercise the same
   canonical refresh path while bypassing the freshness threshold.
5. Reference a secondary database explicitly and verify it starts its own lazy
   lifecycle without loading unrelated databases.

Corrupt and incompatible payload behavior is intentionally covered with isolated
temporary directories in `tests/persistent-metadata.test.ts`; contributors should
not edit their editor's real global storage to test it. The focused command is:

```bash
node --import tsx --test tests/persistent-metadata.test.ts
```

Runtime and test code must remain metadata-read-only. If a fixture changes, an
administrator or user provisions it separately; Query Puppy never executes DDL to
repair a missing prerequisite.

## External mssql integration

The external mssql integration is intentionally isolated behind the project's
backend-neutral `ConnectionContextResolver` and `MetadataBackend` contracts.

The current `MssqlConnectionSharingAdapter` may continue using the mssql
Connection Sharing API while it remains available. Connection Sharing has not
been removed and Query Puppy does not yet implement a direct SQL Server backend.

The adapter currently implements both neutral contracts, but they remain separate
capabilities. The composition root may pass the same adapter instance into separate
context-resolution and metadata-transport dependency slots. Consumers must accept
only the capability they use and must not require both capabilities to have the same
concrete implementation or object identity.

This allows changes in the external connection API to be handled by replacing or
rewriting the adapter without coupling the semantic completion engine directly to
editor/database integration details.

Do not call external mssql connection APIs throughout parser, completion, type,
metadata-cache, or semantic code when the backend contracts can provide the
required operation.

The current mssql-owned credential model remains unchanged:

- mssql owns connection profiles and authentication
- Query Puppy does not request or store SQL credentials
- no extension-owned SecretStorage, settings credentials, or connection UI exists
  for SQL Server connectivity

## Catalog and document semantics

Persistent catalog metadata and document-local semantics are separate layers.

Catalog/cache state contains persistent SQL Server metadata keyed by the
appropriate connection/database identity.

Physical SQL Server foreign-key records are converted during `DatabaseIndex`
construction into the provenance-aware canonical relationship model and its single
bidirectional runtime graph. A workspace's versioned
`.query-puppy/relationships.json` is parsed once per file lifecycle, validated against
the current physical index, and reapplied as ProjectDefined/Confirmed or explicitly
saved UserConfirmed/Confirmed relationships after cache hydration or refresh. It is
not stored in the physical metadata snapshot. The native save-JOIN Code Action writes
only direct equality mappings after explicit user acceptance; learned and heuristic
relationships are not production inputs. See
[Architecture](ARCHITECTURE.md#relationship-intelligence).

Use **Query Puppy for T-SQL: Open Project Relationships** to create or open the file
for the active workspace folder. Native JSON schema validation is contributed from
`schemas/project-relationships.schema.json`. Automated tests should use controlled
metadata and temporary/injected project configuration; runtime code must never create
database objects while resolving project relationships.

`npm run test:extension` launches Electron with a fresh disposable workspace and
user-data directory. This lets the activated save-JOIN contract create and reload a
real `.query-puppy/relationships.json` without modifying the repository or inheriting
stale editor windows.

Document semantic analysis derives query-local state such as:

- QueryScopes
- aliases
- RowSources
- CTEs
- projections
- local variables
- temp-table semantics
- set-operation results

from SQL text and already available metadata.

Document semantic analysis must not become an implicit SQL-query path.

The document semantic cache follows the repository's current
document/version/cursor/catalog-identity invalidation model.

See [Architecture](ARCHITECTURE.md) for the current semantic and cache boundaries.

## Testing local learned JOIN evidence

Phase E1 observes eligible resolved JOIN occurrences only when the active workspace SQL
document is saved. It consumes an already-loaded `DatabaseIndex`; a learning test must
not expect the observer to cold-load metadata. The focused editor-neutral regression is:

```bash
node --import tsx --test tests/learned-relationship-evidence.test.ts
```

`npm run test:extension` also exercises the activated save lifecycle in its disposable
multi-root workspace. The runner's fresh user-data directory owns
`ExtensionContext.storageUri`, so evidence never enters the repository and is deleted
with the disposable test root.

Runtime evidence lives under the editor-provided workspace storage URI in
`learned-relationship-evidence/workspace-<sha256>.json`. Do not create or inspect a
`.query-puppy` evidence file: `.query-puppy/relationships.json` remains explicit project
truth only. Use **Query Puppy for T-SQL: Clear Learned Relationship Evidence** for the
active workspace folder, or disable future acquisition with
`queryPuppyForTSql.relationshipLearning.enabled`.

Format version 2 persists a bounded current occurrence set alongside the evidence. A
workspace-relative document identity and canonical relationship identity are SHA-256
hashed; the same-relationship ordinal distinguishes independent duplicate JOINs. This
state must deduplicate unchanged saves across document/extension/editor lifetimes.
Tests that recreate `FileLearnedRelationshipEvidenceStore` against the same directory
are the restart boundary. Format-version-1 fixtures must preserve their counts and
upgrade on the next mutation.

The store caps evidence at 4,096 relationships and occurrences at 16,384 identities.
The clear command resets both collections. Disabling learning must perform no store
mutation. An occurrence removed in one saved snapshot loses only its dedupe marker; a
later reintroduction may count once without decrementing historical evidence.

Tests must continue proving that evidence acquisition performs no catalog query, does
not retain raw SQL or credentials, and cannot enter completion or the canonical graph.

## Completion architecture

Metadata, parsing, matching, ranking, and semantic candidate construction should
remain independent from VS Code presentation wherever practical.

Native editor-specific materialization belongs at the provider/presentation
boundary.

Physical-column completion follows the canonical pipeline documented in
[Completion Pipeline](COMPLETION_PIPELINE.md).

Do not create context-specific physical-column presentation implementations when the
canonical factory or formatter already represents the same responsibility.

## Editor word suggestions

Alias-member completion from Query Puppy for T-SQL is semantic and
columns-only after an explicit RowSource qualifier resolves.

If the extension returns no semantic item while the editor still shows generic
`abc` entries, those may come from VS Code/VSCodium word-based suggestions.

Query Puppy for T-SQL does not modify:

```text
editor.wordBasedSuggestions
```

Manual IntelliSense acceptance must distinguish semantic extension items from
generic editor word suggestions.

See [Testing Strategy](TESTING.md).

## DML and callable analysis

The DML/callable analyzer remains part of the parser/catalog semantic layer.

Completion presentation belongs to the completion boundary.

VS Code Signature Help is adapted through the project's Signature Help provider
rather than coupling parser internals directly to editor UI objects.

Writable-column metadata originates in cached catalog metadata.

Catalog lookups remain scoped by the appropriate connection/database identity.

SQL Server built-in definitions are static language metadata in
`src/parser/BuiltinFunctionCatalog.ts`. They resolve through the common callable
boundary and require no mssql connection, metadata load, or server-version query.
Definitions retain minimum-version metadata; runtime filtering is deliberately
not performed until a trustworthy server version is available without extra I/O.

## Build

Create the production bundle with:

```bash
npm run build
```

## Package

Build the VSIX with:

```bash
npm run package
```

Packaging is not publication.

Do not publish as a side effect of:

- dependency installation
- build
- tests
- verification
- packaging

For Marketplace publication, follow [Publishing](PUBLISHING.md).

## Before considering development work complete

Use the relevant project checks rather than assuming every task requires every
possible verification layer.

At minimum:

1. run the relevant automated tests
2. run `npm run verify` when a human developer wants the complete verification and
   production-build flow
3. run integration tests when the change depends on live SQL Server metadata and
   the environment is available
4. perform Extension Host or installed VSCodium acceptance when native editor
   behavior is material
5. inspect the final diff
6. ensure no credentials or debugging artifacts were introduced
7. review whether relevant architecture/development documentation still matches the
   implementation
8. do not publish unless explicitly requested

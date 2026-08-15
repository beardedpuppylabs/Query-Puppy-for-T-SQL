# Development

## Purpose

This document describes the local development, verification, integration-test, and
packaging workflow for Improved SQL IntelliSense.

For system architecture and semantic design, see:

- [Architecture](ARCHITECTURE.md)
- [Completion Pipeline](COMPLETION_PIPELINE.md)
- [SQL Type System](TYPE_SYSTEM.md)

For verification responsibilities and acceptance conventions, see:

- [Testing Strategy](TESTING.md)

For release and publication procedures, see:

- [Publishing](PUBLISHING.md)

## Prerequisites

- Node.js and npm
- VS Code 1.105 or later
- Microsoft SQL Server extension (`ms-mssql.mssql`) for Extension Development Host
  testing that exercises the real mssql integration

Use versions compatible with the repository's current package metadata and
development dependencies.

Do not assume that the newest globally available Node.js, npm, VS Code, VSCodium,
or vsce release is automatically the version targeted by this repository.

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

The mssql adapter is the project's SQL connection boundary.

The extension reuses the active Microsoft SQL Server connection through the
existing mssql connection-sharing integration instead of opening an independent
credentialed SQL connection.

Catalog metadata is loaded lazily using set-based metadata operations and cached by
the appropriate connection/database identity.

Concurrent requests for the same not-yet-loaded catalog use the project's existing
coalesced loading path.

After the relevant database metadata has been loaded, steady-state completion uses
cached catalog and relationship indexes together with document semantic state
rather than issuing repeated catalog queries for each keystroke.

The authoritative description of current metadata loading, cache ownership, and
subsystem boundaries is in [Architecture](ARCHITECTURE.md).

Do not duplicate exact catalog-query-count assumptions here unless they are a
stable documented contract.

## External mssql integration

The external mssql integration is intentionally isolated behind the project's
adapter and connection-service boundary.

This allows changes in the external connection API to be handled without coupling
the semantic completion engine directly to editor/database integration details.

Do not call external mssql connection APIs throughout parser, completion, type, or
semantic code when the existing adapter/service boundary can provide the required
operation.

## Catalog and document semantics

Persistent catalog metadata and document-local semantics are separate layers.

Catalog/cache state contains persistent SQL Server metadata keyed by the
appropriate connection/database identity.

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

Alias-member completion from Improved SQL IntelliSense is semantic and
columns-only after an explicit RowSource qualifier resolves.

If the extension returns no semantic item while the editor still shows generic
`abc` entries, those may come from VS Code/VSCodium word-based suggestions.

Improved SQL IntelliSense does not modify:

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
2. run `npm run verify` when appropriate
3. run integration tests when the change depends on live SQL Server metadata and
   the environment is available
4. perform Extension Host or installed VSCodium acceptance when native editor
   behavior is material
5. inspect the final diff
6. ensure no credentials or debugging artifacts were introduced
7. review whether relevant architecture/development documentation still matches the
   implementation
8. do not publish unless explicitly requested
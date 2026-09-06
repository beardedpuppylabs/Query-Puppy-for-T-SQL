# Contributing to Query Puppy for T-SQL

Thank you for helping improve Query Puppy for T-SQL.

Query Puppy is a **pre-1.0 project under active development**. The extension already has substantial real-world functionality, but correctness, semantic coverage, editor integration, documentation, and user experience are still maturing. Contributions should improve that maturity without overstating what the current product supports.

Query Puppy is focused on **semantic T-SQL developer tooling for SQL Server in Visual Studio Code and VSCodium**. Contributions should strengthen SQL editing, understanding, navigation, analysis, or safe semantic productivity without turning the extension into a second database workbench.

## Before you start

- Use the [bug report form](https://github.com/beardedpuppylabs/Query-Puppy-for-T-SQL/issues/new?template=bug_report.yml) for reproducible defects.
- Use the [feature request form](https://github.com/beardedpuppylabs/Query-Puppy-for-T-SQL/issues/new?template=feature_request.yml) to discuss meaningful product changes before investing in a large implementation.
- Follow [SECURITY.md](SECURITY.md) for vulnerabilities. Do not disclose sensitive security details in a public issue.

For larger feature proposals, describe the editing problem first. Query Puppy should add semantic value that is not already sufficiently provided by Visual Studio Code, VSCodium, or Microsoft `mssql`.

## Development setup

Prerequisites:

- Node.js 24 LTS and npm
- Visual Studio Code 1.105 or later, or a compatible VSCodium release
- Microsoft SQL Server (`ms-mssql.mssql`) in the Extension Development Host for tests that exercise the current connection integration

From the repository root:

```bash
npm ci
npm run format:check
npm run lint
npm run compile
npm run test:contracts
npm test
```

The contract suite is a fast cross-feature sentinel. It complements the complete unit/provider suite.

See:

- [Development](docs/DEVELOPMENT.md) for local build and Extension Host workflows
- [Testing Strategy](docs/TESTING.md) for automated, integration, Extension Host, and manual acceptance responsibilities
- [Architecture](docs/ARCHITECTURE.md) for current semantic and subsystem boundaries
- [Publishing](docs/PUBLISHING.md) for release and Marketplace procedures

Live SQL Server integration tests are opt-in and require separately provisioned fixtures. Never add credentials to source, tests, examples, logs, or issues.

## Engineering principles

### Build on the semantic engine

Reuse the existing document, scope, type, callable, metadata, and relationship models. Do not create a second parser, resolver, type system, relationship graph, or source-of-truth model for one feature unless there is a concrete architectural reason.

Completion is one consumer of the semantic engine, not the whole product. Current native consumers also include Signature Help, Definition, References, Document Highlights, Document Symbols / Outline, Hover, Diagnostics, and Code Actions.

### Prefer native editor capabilities

Use supported public Visual Studio Code and VSCodium language/editor APIs.

Prefer native:

- completion;
- Signature Help;
- Hover;
- Definition and References;
- Document Highlights;
- Document Symbols;
- Diagnostics;
- Code Actions;
- Quick Picks and Workspace Edits where appropriate.

Do not add a custom completion popup or a parallel editor UI when the native platform already provides a suitable surface.

### Keep Query Puppy out of the database-workbench business

Microsoft `mssql` currently owns the active SQL Server workbench connection, credentials, query execution, and results.

Query Puppy's production metadata/connectivity code is isolated behind the project's backend-neutral capability boundary. Do not leak provider-specific connection details into semantic consumers.

Do not add user-query execution, a results grid, Object Explorer replacement, or general database administration as part of an ordinary semantic feature.

### Prefer conservative correctness

- Prefer `Unknown` or no result to confidently incorrect SQL semantics.
- Preserve deterministic behavior and stable ordering within equivalent semantic tiers.
- Preserve case-insensitive contiguous Contains matching.
- Fail closed when identity, scope, type, or relationship evidence is ambiguous.
- Keep declared SQL Server FK metadata distinct from project-defined, user-confirmed, learned, and heuristic relationship evidence.
- Never present inferred or learned knowledge as a physical SQL Server FK.

### Treat large schemas as a product requirement

Keep expensive catalog work outside per-keystroke hot paths.

Changes that affect metadata loading, caching, indexes, query-scope construction, relationship lookup, or completion materialization should be reviewed for large-schema behavior.

### Preserve privacy and read-only metadata behavior

Runtime metadata access must remain read-only.

Do not add telemetry, remote query upload, credential persistence, or raw SQL persistence as an incidental part of a feature.

Relationship-learning changes must preserve the documented local-only, minimal-evidence contract.

### Keep third-party provenance reviewable

Before adding, copying, vendoring, replacing, or materially upgrading third-party software or redistributable assets:

- verify license compatibility with the project's `GPL-3.0-only` distribution;
- record required notices;
- update `THIRD_PARTY_NOTICES.md` and any required license/NOTICE material in the same coherent change;
- do not commit material whose provenance or redistribution rights are unresolved.

Detailed repository implementation invariants are documented in [AGENTS.md](AGENTS.md).

## Tests

Add regression coverage at the layer that proves the behavior.

Examples:

- completion behavior should normally have provider-level coverage, not only helper tests;
- navigation changes should prove semantic identity and provider behavior;
- diagnostics should include false-positive and fail-closed cases;
- relationship changes should include ambiguity and stronger-evidence precedence cases;
- editor-visible native behavior may require Extension Host or manual Visual Studio Code/VSCodium acceptance.

Do not claim a test layer was run when its required environment was unavailable.

## Pull requests

Keep pull requests focused.

Explain:

1. the user-visible or engineering problem;
2. the root cause;
3. the chosen solution;
4. what was tested;
5. any remaining limitation or intentionally deferred work.

Before requesting review:

- run the relevant checks;
- review the diff for unrelated changes and generated artifacts;
- assess documentation impact;
- remove temporary diagnostics and local data;
- confirm no credentials or sensitive production details were introduced;
- disclose any third-party dependency, copied code, binary, or asset introduced or materially changed.

Small, well-scoped contributions are welcome.

A pull request does not need live SQL Server or manual editor acceptance when those layers are unrelated. State clearly what was and was not verified.

## License

Query Puppy for T-SQL is licensed under `GPL-3.0-only`.

Contributions are accepted under the repository license in force for the contributed version. The repository does not silently establish a separate CLA or DCO requirement.

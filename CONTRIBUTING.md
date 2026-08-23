# Contributing to Query Puppy for T-SQL

Thank you for helping improve Query Puppy for T-SQL. Contributions should stay
focused on semantic T-SQL IntelliSense for SQL Server in VS Code and VSCodium.

## Before you start

- Use the [bug report form](https://github.com/beardedpuppylabs/Query-Puppy-for-T-SQL/issues/new?template=bug_report.yml)
  for reproducible defects.
- Use the [feature request form](https://github.com/beardedpuppylabs/Query-Puppy-for-T-SQL/issues/new?template=feature_request.yml)
  to discuss product changes before investing in a large implementation.
- Follow [SECURITY.md](SECURITY.md) for vulnerabilities; do not disclose sensitive
  details in a public issue.

The project is SQL Server/T-SQL focused. Proposals should add semantic value that
is not already sufficiently provided by VS Code, VSCodium, or Microsoft `mssql`.

## Development setup

Prerequisites:

- Node.js 24 LTS and npm
- VS Code 1.105 or later, or a compatible VSCodium release
- Microsoft SQL Server (`ms-mssql.mssql`) in the Extension Development Host for
  tests that exercise the real connection integration

From the repository root:

```bash
npm ci
npm run format:check
npm run lint
npm run compile
npm run test:contracts
npm test
```

The contract suite is a fast cross-feature sentinel; it complements the complete
unit/provider suite. Extension Host, live SQL Server, manual acceptance, build, and
packaging workflows are documented in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)
and [docs/TESTING.md](docs/TESTING.md).

Live integration tests are opt-in and require separately provisioned fixtures.
Never add credentials to source, tests, examples, logs, or issues. Native Suggest
Widget or Signature Help changes may also require manual VS Code/VSCodium
acceptance.

## Engineering principles

- Reuse the active `mssql` connection. Do not add a second database connection or
  Query Puppy credential management.
- Use supported public VS Code and `mssql` integration surfaces. Do not depend on
  private APIs.
- Stay inside native editor completion and Signature Help UI; do not add a custom
  completion popup.
- Preserve deterministic semantic behavior, case-insensitive contiguous Contains
  matching, and stable alphabetical ordering inside equivalent tiers.
- Prefer `Unknown` to confidently incorrect SQL semantics.
- Treat performance on large schemas as a product requirement. Keep catalog work
  out of the per-keystroke hot path.
- Use real SQL Server FK metadata, never naming or datatype heuristics, for
  relationship intelligence.
- Keep runtime metadata access read-only and fixture provisioning separate.
- Update the maintained documentation whenever behavior, architecture, testing,
  development, or release contracts meaningfully change.

Detailed implementation invariants live in [AGENTS.md](AGENTS.md). Human
contributors do not need to duplicate that document in a pull request, but changes
must preserve the contracts relevant to the affected subsystem.

## Pull requests

Keep pull requests focused and explain the problem, the root cause, and the chosen
solution. Add regression coverage at the layer that proves the behavior; completion
provider bugs generally need provider-level tests rather than helper-only tests.

Before requesting review:

- run the relevant checks
- review the diff for unrelated changes and generated artifacts
- assess documentation impact
- remove diagnostics and local data
- confirm that no credentials or sensitive production details were introduced

Small, well-scoped contributions are welcome. A pull request does not need to run
live SQL or manual editor acceptance when those layers are unrelated; state clearly
what was and was not verified.

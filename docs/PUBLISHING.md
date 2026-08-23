# Publishing to the Visual Studio Marketplace

## Purpose

This document describes the explicit release and Visual Studio Marketplace
publication procedure for Query Puppy for T-SQL.

Publishing is intentionally separate from development, verification, build, and
packaging.

For local development and packaging prerequisites, see:

- [Development](DEVELOPMENT.md)

For verification responsibilities, see:

- [Testing Strategy](TESTING.md)

## Current public identity

Publisher display name:

```text
Bearded Puppy Labs
```

Marketplace publisher ID:

```text
BeardedPuppyLabs
```

Extension name:

```text
query-puppy-for-t-sql
```

Full extension identifier:

```text
BeardedPuppyLabs.query-puppy-for-t-sql
```

Public source repository:

```text
https://github.com/beardedpuppylabs/Query-Puppy-for-T-SQL
```

Public issue tracker:

```text
https://github.com/beardedpuppylabs/Query-Puppy-for-T-SQL/issues
```

The Marketplace publisher with ID `BeardedPuppyLabs` must exist and be owned by the
developer before publication.

`package.json` is the authoritative repository source for the current package
version and manifest publisher field.

Release tags use semantic versions prefixed with `v`:

```text
vX.Y.Z
```

The matching GitHub Release title is:

```text
Query Puppy for T-SQL X.Y.Z
```

The Visual Studio Marketplace remains the primary extension-binary distribution
channel. A GitHub Release records the source milestone and release notes; attaching
a VSIX to every GitHub Release is not required by the current project policy.

## Publication safety

Publishing must never occur automatically as a side effect of:

- dependency installation
- formatting
- linting
- compilation
- tests
- verification
- build
- VSIX packaging

Marketplace publication requires an explicit release action.

Never commit:

- Marketplace credentials
- Personal Access Tokens
- Microsoft Entra credentials
- private keys
- SQL credentials
- private infrastructure secrets

Use minimum privileges for publication credentials.

Publishing authentication guidance changes over time.

Before changing publishing automation or authentication, verify the current
official Microsoft Visual Studio Marketplace / VS Code extension-publishing
documentation instead of relying on historical project notes.

## Manual release procedure

### 1. Verify Marketplace publisher ownership

Sign in to the Visual Studio Marketplace publisher management page and verify that
the account owns the publisher whose ID is exactly:

```text
BeardedPuppyLabs
```

Do not publish from an account that owns only a similarly named publisher.

### 2. Verify repository identity

Confirm that `package.json` declares:

```json
"publisher": "BeardedPuppyLabs"
```

Confirm that the resulting extension identity is:

```text
BeardedPuppyLabs.query-puppy-for-t-sql
```

Also confirm:

- the manifest uses SPDX license `MIT`
- the root `LICENSE` contains the canonical project MIT terms
- `repository`, `bugs`, and `homepage` point to the canonical public GitHub project
- current Marketplace links use the current publisher identity
- no obsolete publisher identity remains in maintained package or release metadata

### 3. Verify version and changelog

Before a release:

- confirm the intended package version in `package.json`
- confirm the lockfile version is consistent where applicable
- update `CHANGELOG.md` with an accurate release summary, including maintenance or
  repository-only releases
- synchronize affected README, support, security, contribution, architecture,
  testing, development, roadmap, and publishing documentation
- do not bump the version merely because implementation or documentation work
  occurred unless the release process requires a new package version

### 4. Start from a clean reviewable state

Prefer a clean checkout or otherwise ensure the release diff is fully understood.

Install exact committed dependencies with:

```bash
npm ci
```

### 5. Run repository verification

Run:

```bash
npm run test:contracts
npm run verify
git diff --check
```

`npm run verify` includes the complete unit/provider suite, so the preceding
contract-only run is a fast explicit release sentinel rather than unique coverage.

Complete the release's documented manual VS Code/VSCodium acceptance when native
completion, Signature Help, packaging, or other editor-visible behavior changed.
Record what was actually tested; do not claim manual or live SQL acceptance for a
repository-only patch when it was not required.

When the live SQL Server test environment is available and relevant to the release,
also run:

```bash
npm run test:integration
```

Do not report integration tests as passed when the environment was absent or the
suite was skipped.

### 6. Build the VSIX

Run:

```bash
npm run package
```

Production build and packaging are deliberate, user-owned release steps. They are
not run automatically by normal contributor CI or routine Codex development work.

Use the exact VSIX path produced by the current package script.

The package script is intentionally non-interactive. Keep Marketplace manifest
repository metadata pointed at the canonical public GitHub repository; never
replace it with a private or machine-local Git origin.

Do not hard-code a historical release version into this permanent publishing guide.

The generated archive is expected to follow the project's current package naming
convention, for example:

```text
query-puppy-for-t-sql-<version>.vsix
```

where `<version>` is the actual current package version.

### 7. Inspect package contents

Inspect the file list that vsce intends to package:

```bash
npx vsce ls --no-dependencies
```

Then inspect the exact VSIX produced by `npm run package`:

```bash
unzip -l query-puppy-for-t-sql-<version>.vsix
```

Replace `<version>` with the actual package version.

Verify that the package contains the intended runtime and Marketplace-facing files
and excludes development-only or sensitive content according to the repository's
`.vscodeignore` policy.

Check specifically for accidental inclusion of:

- credentials
- `.env` files
- SQL passwords
- private infrastructure addresses that should not be public
- test-only secrets
- development dependency trees
- unnecessary internal engineering documentation

Repository documentation may remain tracked in Git while being excluded from the
published VSIX.

`.gitignore` and `.vscodeignore` serve different purposes.

### 8. Inspect packaged identity

Verify the packaged extension manifest resolves to:

```text
BeardedPuppyLabs.query-puppy-for-t-sql
```

Do not rely only on the source `package.json`.

Inspect the actual package output as part of release verification.

### 9. Review and push the release source

Review the complete diff and ensure generated VSIX or production artifacts are not
accidentally staged. Commit the intended source changes, then push the release
source to the canonical public GitHub repository.

Verify the public branch contains:

- the intended package and lockfile version
- the matching changelog entry
- the canonical MIT `LICENSE`
- current source, repository, issue, support, and security links

### 10. Create and push the release tag

Create the annotated or lightweight semantic version tag using the exact package
version, then push it explicitly:

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

Do not reuse or move an already published release tag.

### 11. Create the GitHub Release

Create a GitHub Release from `vX.Y.Z` with title:

```text
Query Puppy for T-SQL X.Y.Z
```

Use the changelog as the release-note source and keep claims consistent with actual
verification. The Marketplace remains the primary binary channel, so a VSIX
attachment is optional rather than required.

### 12. Authenticate for Marketplace publication

For a manual release, uploading the verified VSIX through Marketplace publisher
management is acceptable.

For command-line or automated publication, use the currently supported secure
authentication workflow documented by Microsoft.

If the repository exposes an explicit publication script such as:

```bash
npm run publish:marketplace
```

verify that the script actually exists and inspect its current implementation in
`package.json` before using it.

Do not assume a historical publication command still exists.

Do not build new long-lived automation around an authentication method that current
Microsoft guidance marks as deprecated or scheduled for retirement.

If a token-based workflow is deliberately used and remains officially supported:

- grant only the minimum required Marketplace permissions
- never store the token in this repository
- never print the token into logs
- revoke temporary credentials when they are no longer needed

### 13. Publish explicitly

Only after all preceding checks pass, perform the explicit publication action.

Depending on the current supported repository workflow, this may be:

- manual upload of the verified VSIX through Marketplace publisher management
- the repository's verified explicit publish script
- a currently supported `vsce` publication command

Publication must never be triggered implicitly by:

```text
npm install
npm test
npm run verify
npm run build
npm run package
```

### 14. Verify public release state

Wait for Marketplace validation and scanning to complete.

Then verify the public listing:

- publisher is Bearded Puppy Labs
- full identifier is `BeardedPuppyLabs.query-puppy-for-t-sql`
- version is correct
- Preview state is correct
- icon renders correctly
- README renders correctly
- dependency information is correct
- commands and settings are correct
- installation succeeds
- no stale Marketplace links remain

Also verify the public GitHub source and Release:

- the default branch and tag resolve to the intended source
- the GitHub Release title and notes match the tag and changelog
- source, issue, support, security, and MIT License links work
- no release-only credential or generated artifact was committed

Repository About metadata is maintained manually in GitHub's UI. When relevant,
verify these values:

Description:

```text
Semantic T-SQL IntelliSense for SQL Server in Visual Studio Code and VSCodium.
```

Website: the Visual Studio Marketplace listing.

Topics:

```text
sql-server
tsql
mssql
vscode
vscodium
intellisense
autocomplete
completion
database-tools
typescript
open-source
```

## Later releases

Before every later release:

1. confirm the intended version
2. update the changelog and synchronize affected documentation
3. run contract, repository, and diff verification
4. run relevant manual and live integration acceptance when required
5. perform the user-owned production build and package a fresh VSIX
6. inspect the exact archive and packaged extension identity
7. verify no credentials or private infrastructure leaked into the package
8. review and push the public release source
9. create and push the `vX.Y.Z` tag
10. create `Query Puppy for T-SQL X.Y.Z` as the GitHub Release
11. review current Marketplace authentication guidance
12. publish only through an explicit Marketplace release action
13. verify Marketplace, GitHub source, tag, Release, License, and links
14. verify repository About metadata when it changed

## Publisher migration policy

The maintained repository identity is:

```text
BeardedPuppyLabs.query-puppy-for-t-sql
```

Do not reintroduce obsolete publisher identifiers into maintained package,
documentation, release, test, or Marketplace references.

Changing Marketplace publisher ID changes extension identity.

Migration or deprecation of an older Marketplace listing is a separate Marketplace
operation and must not be performed automatically by normal packaging or
publication tooling.

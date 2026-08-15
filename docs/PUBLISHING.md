# Publishing to the Visual Studio Marketplace

## Purpose

This document describes the explicit release and Visual Studio Marketplace
publication procedure for Improved SQL IntelliSense.

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
improved-sql-intellisense
```

Full extension identifier:

```text
BeardedPuppyLabs.improved-sql-intellisense
```

The Marketplace publisher with ID `BeardedPuppyLabs` must exist and be owned by the
developer before publication.

`package.json` is the authoritative repository source for the current package
version and manifest publisher field.

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
BeardedPuppyLabs.improved-sql-intellisense
```

Also confirm:

- the manifest uses SPDX license `MIT`
- the root `LICENSE` contains the canonical project MIT terms
- current Marketplace links use the current publisher identity
- no obsolete publisher identity remains in maintained package or release metadata

### 3. Verify version and changelog

Before a release:

- confirm the intended package version in `package.json`
- confirm the lockfile version is consistent where applicable
- update `CHANGELOG.md` when the release changes user-visible behavior
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
npm run verify
```

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

Use the exact VSIX path produced by the current package script.

Do not hard-code a historical release version into this permanent publishing guide.

The generated archive is expected to follow the project's current package naming
convention, for example:

```text
improved-sql-intellisense-<version>.vsix
```

where `<version>` is the actual current package version.

### 7. Inspect package contents

Inspect the file list that vsce intends to package:

```bash
npx vsce ls --no-dependencies
```

Then inspect the exact VSIX produced by `npm run package`:

```bash
unzip -l improved-sql-intellisense-<version>.vsix
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
BeardedPuppyLabs.improved-sql-intellisense
```

Do not rely only on the source `package.json`.

Inspect the actual package output as part of release verification.

### 9. Authenticate for publication

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

### 10. Publish explicitly

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

### 11. Wait for Marketplace validation

Wait for Marketplace validation and scanning to complete.

Then verify the public listing:

- publisher is Bearded Puppy Labs
- full identifier is `BeardedPuppyLabs.improved-sql-intellisense`
- version is correct
- Preview state is correct
- icon renders correctly
- README renders correctly
- dependency information is correct
- commands and settings are correct
- installation succeeds
- no stale Marketplace links remain

## Later releases

Before every later release:

1. confirm the intended version
2. update the changelog when appropriate
3. run the repository verification flow
4. run relevant live integration tests when available
5. package a fresh VSIX
6. inspect the exact archive
7. inspect the packaged extension identity
8. review current publishing authentication guidance
9. verify no credentials or private infrastructure leaked into the package
10. publish only through an explicit release action
11. verify the public Marketplace result

## Publisher migration policy

The maintained repository identity is:

```text
BeardedPuppyLabs.improved-sql-intellisense
```

Do not reintroduce obsolete publisher identifiers into maintained package,
documentation, release, test, or Marketplace references.

Changing Marketplace publisher ID changes extension identity.

Migration or deprecation of an older Marketplace listing is a separate Marketplace
operation and must not be performed automatically by normal packaging or
publication tooling.
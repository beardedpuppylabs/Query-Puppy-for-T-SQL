# GitHub Releases and Visual Studio Marketplace Publishing

## Purpose

This document describes the automatic version-driven GitHub Release workflow and
the subsequent manual Visual Studio Marketplace publication procedure for Query
Puppy for T-SQL.

Publishing is intentionally separate from development, verification, build, and
packaging.

For local development and packaging prerequisites, see:

- [Development](DEVELOPMENT.md)

For verification responsibilities, see:

- [Testing Strategy](TESTING.md)

This document defines the repository-facing release and publication procedure.
Maintainer project governance may impose additional release constraints, but external
contributors do not need access to private project-management sources. Officially
released package versions are immutable: do not reuse a released version for different
code or artifacts.

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

Query Puppy for T-SQL is licensed under `GPL-3.0-only`.

Release tags use semantic versions prefixed with `v`:

```text
vX.Y.Z
```

The matching GitHub Release title is:

```text
Query Puppy for T-SQL X.Y.Z
```

GitHub Releases are the authoritative source for release VSIX bytes. The Visual
Studio Marketplace remains the primary extension installation channel, but every
Marketplace upload must use the exact verified VSIX attached to the corresponding
GitHub Release. This preserves an auditable artifact-to-source mapping.

## Release automation safety

Marketplace publishing must never occur automatically as a side effect of:

- dependency installation
- formatting
- linting
- compilation
- tests
- verification
- build
- VSIX packaging

Marketplace publication requires an explicit manual upload of the GitHub Release
asset.

Normal contributor and Codex development tasks must not publish ad hoc. The
maintained CI workflow owns GitHub Release publication after a deliberate manifest
version bump reaches `main` and all prerequisite jobs pass. Pull requests and normal
same-version commits do not create releases.

Automatic GitHub releases begin only above the explicit floor in
`.github/release-policy.json`. The floor is `0.18.1` because that Marketplace-only
release cannot be backfilled without its proven original VSIX bytes. The floor is a
one-time bootstrap policy and is not advanced after later releases.

The release job alone receives `contents: write`; workflow defaults remain
`contents: read`. It uses the GitHub-provided workflow token and no Marketplace PAT,
Azure credential, paid runner, or paid service.

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

## Release procedure

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

- the manifest uses SPDX license `GPL-3.0-only`
- the root `LICENSE` is byte-for-byte the unmodified official GNU GPL version 3 text
- `repository`, `bugs`, and `homepage` point to the canonical public GitHub project
- current Marketplace links use the current publisher identity
- no obsolete publisher identity remains in maintained package or release metadata

### 3. Verify version and changelog

Before a release:

- apply the next SemVer required by the current maintainer release decision in the
  same coherent change as publishable production behavior
- verify that the intended version has not already been officially released for
  different code; released versions are immutable
- confirm the intended package version in `package.json`
- confirm the lockfile version is consistent where applicable
- update `CHANGELOG.md` with an accurate release summary, including maintenance or
  repository-only releases
- ensure the packaged changelog begins with the latest release and contains no empty
  `Unreleased` section
- synchronize affected README, support, security, contribution, architecture,
  testing, development, roadmap, and publishing documentation
- do not consume a new version for documentation-only, test-only, internal
  behavior-preserving refactoring, research-only, or non-publishable experimental work
  unless another explicit release requirement applies

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

### 6. Let successful `main` CI build the release VSIX

For local release rehearsal, run:

```bash
npm run package
```

`npm run package` remains the safe all-in-one local verification and packaging
command. Its output is not the release artifact and must not be uploaded later in
place of CI output.

After the version, lockfile, and changelog change reaches `main`, the existing CI
workflow waits for both `quality` and `extension-host-and-build`. The release job
then uses `npm run package:vsix` to build exactly one release VSIX. The package-only
script avoids repeating the complete prerequisite test suite while retaining the
normal `vscode:prepublish` production build.

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

### 7. Automated package and checksum verification

For a local rehearsal, inspect the file list that `vsce` intends to package:

```bash
npx vsce ls --no-dependencies
```

Then inspect the local VSIX produced by `npm run package`:

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

The release job performs these checks against its exact single VSIX before any
GitHub mutation. It verifies the packaged identity and version, compares packaged
`LICENSE` and `THIRD_PARTY_NOTICES.md` with their repository sources, rejects
forbidden development content, and confirms that the production bundle is present.

Also verify locally, when rehearsing, that:

- `LICENSE` and `THIRD_PARTY_NOTICES.md` are present
- `spike/**`, `node_modules/**`, development/test source, and temporary project-source
  exports are absent
- the production bundle and archive contain no third-party material omitted from
  `THIRD_PARTY_NOTICES.md`

Repository documentation may remain tracked in Git while being excluded from the
published VSIX.

`.gitignore` and `.vscodeignore` serve different purposes.

### 8. Release identity and changelog preflight

The release job verifies the packaged extension manifest resolves to:

```text
BeardedPuppyLabs.query-puppy-for-t-sql
```

It does not rely only on the source `package.json`.

Before packaging or GitHub mutation, it also requires one stable `X.Y.Z` manifest
version, matching root lockfile versions, a non-empty exact changelog section, a
candidate above the automatic-release floor, the exact successful workflow commit
still at current `main`, and non-conflicting tag and Release state.

### 9. Review and push the release source

Review the complete diff and ensure generated VSIX or production artifacts are not
accidentally staged. Commit the intended source changes, then push the release
source to the canonical public GitHub repository.

Verify the public branch contains:

- the intended package and lockfile version
- the matching changelog entry
- the canonical GPLv3 `LICENSE` and current `THIRD_PARTY_NOTICES.md`
- current source, repository, issue, support, and security links

Record the release commit SHA. The automatic tag, GitHub Release source archives,
attached VSIX, and later Marketplace upload must all map to this exact reviewed
source.

### 10. Automatic tag and GitHub Release

For an eligible unreleased version, successful `main` CI creates immutable tag
`vX.Y.Z` at the exact current `main` commit and publishes a GitHub Release titled:

```text
Query Puppy for T-SQL X.Y.Z
```

Release notes are exactly the matching `CHANGELOG.md` section. Ordinary `0.x`
versions are normal releases with `prerelease: false`.

The workflow creates or resumes only an exact matching draft, uploads the verified
VSIX and `<vsix-filename>.sha256`, verifies both assets are non-empty, and only then
publishes the Release. The checksum contains conventional output:

```text
<sha256>  query-puppy-for-t-sql-<version>.vsix
```

An already complete exact Release is a successful no-op. A stale run exits without
publishing. Conflicting tags, Releases, or published partial states fail closed.
Release-job concurrency plus a final `main` HEAD and remote-state check prevents
rapid pushes from racing. Never reuse, move, or force-update a release tag.

### 11. Obtain the exact GitHub Release VSIX

Wait for the successful GitHub Release. Download its attached VSIX and checksum;
verify the SHA-256 when desired or required. Do not run `npm run package`, run
`vsce package`, or use another build to replace these bytes before Marketplace
upload.

The GitHub Release VSIX is the sole Marketplace input for that version.

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

### 13. Publish the exact asset explicitly

Only after all preceding checks pass, perform the explicit publication action using
the downloaded, checksum-verifiable VSIX bytes attached to the GitHub Release.

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
- source, issue, support, security, GNU GPL, and third-party notice links work
- no release-only credential or generated artifact was committed

Verify that the immutable tag and GitHub source archive provide the Corresponding
Source for the exact distributed VSIX, including the build and packaging scripts
needed to reproduce it. A moving default branch is not sufficient.

Repository About metadata is maintained manually in GitHub's UI. When relevant,
verify these values:

Description:

```text
Semantic T-SQL developer tooling for SQL Server in Visual Studio Code and VSCodium.
```

Website: the Visual Studio Marketplace listing.

Topics:

```text
sql-server
mssql
tsql
t-sql
vscode
vscodium
vscode-extension
intellisense
autocomplete
sql-tools
database-tools
semantic-sql
code-navigation
diagnostics
relationships
open-source
foss
floss
typescript
```

## Later releases

Before every later release:

1. confirm the intended next version and update `package.json`, the lockfile,
   `CHANGELOG.md`, and affected maintained documentation together
2. run contract, repository, diff, and relevant manual/live acceptance checks
3. review and push the release source to `main`
4. wait for the prerequisite CI jobs and automatic GitHub Release to succeed
5. verify the tag, source commit, title, exact changelog notes, normal-release state,
   VSIX, checksum, License, notices, Corresponding Source, and links
6. download the exact GitHub Release VSIX and optionally recheck its SHA-256
7. review current Marketplace authentication guidance
8. upload those exact bytes through an explicit manual Marketplace action without
   rebuilding
9. verify Marketplace identity, version, content, and links
10. verify repository About metadata when it changed

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

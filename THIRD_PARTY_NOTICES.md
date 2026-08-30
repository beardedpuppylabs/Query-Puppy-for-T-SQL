# Third-Party Notices

Query Puppy for T-SQL version 0.12.6 is distributed under the GNU General Public
License version 3 only (`GPL-3.0-only`). See [LICENSE](LICENSE) for the complete
license text.

This inventory records deliberately used direct third-party software and the
material actually redistributed in the extension package. It is evidence-based on
the locked dependency tree and the production bundle/package inspection for version
0.12.6. It does not replace the authoritative upstream license or NOTICE files.

## Material redistributed in the VSIX

The production extension bundle contains project source plus Node.js built-in and
VS Code API references. The VS Code API is supplied by the editor host and is not
bundled. The extension package contains no npm runtime dependency tree, third-party
native binary, embedded runtime, font, or copied third-party source.

`images/logo.png` is a project-owned Bearded Puppy Labs asset supplied for Query
Puppy and is not third-party material.

Accordingly, no additional third-party license text or NOTICE file is required for
the material redistributed in the version 0.12.6 VSIX. This file is nevertheless
included in the package so the audited boundary remains visible to recipients.

## External editor dependency

Microsoft's SQL Server extension (`ms-mssql.mssql`) is a separately installed VS
Code extension dependency. Query Puppy uses its public connection-sharing surface,
but does not redistribute Microsoft extension source or binaries.

## Direct development dependencies

The following packages are direct development, test, research, build, or packaging
dependencies. Their code is not shipped as an npm dependency tree in the VSIX.
Versions are the exact versions resolved by `package-lock.json` for the 0.12.6
release audit.

| Package                 | Version | License    | Purpose / authoritative upstream                                                                                | Redistributed in VSIX? | VSIX notice/source obligation                                                 |
| ----------------------- | ------: | ---------- | --------------------------------------------------------------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------- |
| `@eslint/js`            |  9.39.5 | MIT        | Lint configuration; [ESLint](https://github.com/eslint/eslint)                                                  | No                     | None; development-only                                                        |
| `@types/mssql`          |  9.1.11 | MIT        | Direct-connect research/test types; [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped)       | No                     | None; development-only                                                        |
| `@types/node`           | 24.13.3 | MIT        | Development types; [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped)                        | No                     | None; type declarations only                                                  |
| `@types/vscode`         | 1.125.0 | MIT        | Editor API development types; [DefinitelyTyped](https://github.com/DefinitelyTyped/DefinitelyTyped)             | No                     | None; type declarations only                                                  |
| `@vscode/test-electron` |   2.5.2 | MIT        | Extension Host test runner; [vscode-test](https://github.com/microsoft/vscode-test)                             | No                     | None; test-only                                                               |
| `@vscode/vsce`          |   3.9.2 | MIT        | VSIX packaging; [vsce](https://github.com/microsoft/vscode-vsce)                                                | No                     | None; packaging tool only                                                     |
| `esbuild`               |  0.27.7 | MIT        | Production bundling; [esbuild](https://github.com/evanw/esbuild)                                                | No                     | None; the tool runs during build, but its code is not emitted into the bundle |
| `eslint`                |  9.39.5 | MIT        | Static analysis; [ESLint](https://github.com/eslint/eslint)                                                     | No                     | None; development-only                                                        |
| `mssql`                 |  12.7.0 | MIT        | Opt-in live integration and direct-connect research only; [node-mssql](https://github.com/tediousjs/node-mssql) | No                     | None; absent from the production bundle and VSIX                              |
| `prettier`              |   3.9.6 | MIT        | Formatting; [Prettier](https://github.com/prettier/prettier)                                                    | No                     | None; development-only                                                        |
| `tsx`                   | 4.23.12 | MIT        | TypeScript test execution; [tsx](https://github.com/privatenumber/tsx)                                          | No                     | None; test-only                                                               |
| `typescript`            |   5.9.3 | Apache-2.0 | Compilation and type checking; [TypeScript](https://github.com/microsoft/TypeScript)                            | No                     | None; compiler code and notices are not redistributed                         |
| `typescript-eslint`     |  8.66.0 | MIT        | TypeScript lint integration; [typescript-eslint](https://github.com/typescript-eslint/typescript-eslint)        | No                     | None; development-only                                                        |

The authoritative LICENSE/NOTICE material installed with these packages was
reviewed in addition to package metadata. The GNU project's
[license-compatibility guidance](https://www.gnu.org/licenses/license-compatibility.html)
confirms compatibility of the permissive license families above with GPLv3 for
these uses. No dependency or external material with unresolved compatibility was
accepted during this audit.

One transitive test-tool dependency, JSZip 3.10.1, declares the choice
`MIT OR GPL-3.0-or-later`. Its authoritative `LICENSE.markdown` grants an explicit
choice of the MIT terms or GPLv3. Query Puppy uses it only indirectly through
`@vscode/test-electron`, does not import it, and does not redistribute it in the
VSIX; the audit records the MIT option. Other transitive build/test packages and
native packaging helpers likewise remain outside the bundle and final archive.

## Maintenance rule

Before adding, copying, vendoring, replacing, or materially upgrading third-party
software or assets, verify its provenance, exact license and exceptions,
GPL-3.0-only compatibility, redistribution status, and notice/source obligations.
Update this file and required license material in the same coherent change. If the
answer is ambiguous, do not adopt the material until it has been explicitly
reviewed.

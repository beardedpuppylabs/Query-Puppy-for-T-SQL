# Publishing to the Visual Studio Marketplace

The manifest is prepared for publisher ID `Bismarck`. That external Marketplace identity must exist and be owned by the developer before publication. Do not change the publisher merely to work around an identity conflict.

## Manual release procedure

1. Sign in to the [Visual Studio Marketplace publisher management page](https://marketplace.visualstudio.com/manage) and create or verify ownership of the publisher whose ID is exactly `Bismarck`.
2. Authenticate with a currently supported method. For a first manual release, package locally and upload the VSIX through the publisher management page. For automation, follow Microsoft's current guidance for secure publishing with Microsoft Entra ID. Azure DevOps global Personal Access Tokens retire on December 1, 2026, so do not build new long-lived automation around a global PAT. If a PAT is temporarily used with `vsce login Bismarck`, create the minimum required Marketplace scope, never place it in this repository, and revoke it when no longer needed.
3. Confirm that `package.json` still declares publisher `Bismarck` and that the authenticated Marketplace account owns it.
   Also confirm that the manifest declares SPDX license `MIT` and the root `LICENSE` contains the canonical MIT terms with the project's copyright notice.
4. From a clean checkout, run:

   ```bash
   npm ci
   npm run verify
   npm run test:integration # when the SQL Server test environment is available
   ```

5. Build the release archive:

   ```bash
   npm run package
   ```

6. Inspect the exact file list before upload:

   ```bash
   npx vsce ls --no-dependencies
   unzip -l improved-sql-intellisense-0.4.1.vsix
   ```

7. Publish only after the preceding review. Either upload the VSIX on the publisher management page or explicitly run:

   ```bash
   npm run publish:marketplace
   ```

   Publishing is intentionally never a side effect of build, test, verification, or packaging.

8. Wait for Marketplace validation and scanning to finish. Verify the Preview badge, icon, README, dependency, commands, installability, and identifier `Bismarck.improved-sql-intellisense` on the public listing.

Before every later release, update the version and changelog, rerun all checks, inspect the VSIX, and ensure no credentials or private infrastructure URLs are present.

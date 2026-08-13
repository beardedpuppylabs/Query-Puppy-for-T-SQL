import path from "node:path";
import { fileURLToPath } from "node:url";
import { runTests } from "@vscode/test-electron";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requestedExecutable = process.env["VSCODE_TEST_EXECUTABLE"];
const extensionUnderTest = process.env["EXTENSION_UNDER_TEST"] ?? root;

// Codex may itself run inside an extension host. Do not make the child Electron
// process inherit the parent's Node/extension-host bootstrap mode.
for (const name of Object.keys(process.env))
  if (name === "ELECTRON_RUN_AS_NODE" || name.startsWith("VSCODE_"))
    delete process.env[name];

await runTests({
  ...(requestedExecutable
    ? { vscodeExecutablePath: requestedExecutable }
    : { version: "1.105.1" }),
  extensionDevelopmentPath: [
    extensionUnderTest,
    path.join(root, "tests/fixtures/mssql-stub"),
  ],
  extensionTestsPath: path.join(root, ".build/tests/extension/index.js"),
  launchArgs: [root, "--disable-workspace-trust"],
});

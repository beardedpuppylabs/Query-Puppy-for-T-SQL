import path from "node:path";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
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

const acceptanceRoot = await mkdtemp(
  path.join(tmpdir(), "query-puppy-extension-host-"),
);
const relationshipWorkspace = path.join(acceptanceRoot, "relationship-project");
const unrelatedWorkspace = path.join(acceptanceRoot, "unrelated-project");
const workspaceFile = path.join(acceptanceRoot, "acceptance.code-workspace");
await mkdir(relationshipWorkspace);
await mkdir(unrelatedWorkspace);
await writeFile(
  workspaceFile,
  `${JSON.stringify(
    {
      folders: [
        { name: "relationship-project", path: relationshipWorkspace },
        { name: "unrelated-project", path: unrelatedWorkspace },
      ],
    },
    undefined,
    2,
  )}\n`,
);
process.env["QUERY_PUPPY_TEST_RELATIONSHIP_WORKSPACE"] = relationshipWorkspace;
process.env["QUERY_PUPPY_TEST_UNRELATED_WORKSPACE"] = unrelatedWorkspace;

try {
  await runTests({
    ...(requestedExecutable
      ? { vscodeExecutablePath: requestedExecutable }
      : { version: "1.105.1" }),
    extensionDevelopmentPath: [
      extensionUnderTest,
      path.join(root, "tests/fixtures/mssql-stub"),
    ],
    extensionTestsPath: path.join(root, ".build/tests/extension/index.js"),
    launchArgs: [
      workspaceFile,
      "--disable-workspace-trust",
      `--user-data-dir=${path.join(acceptanceRoot, "user-data")}`,
    ],
  });
} finally {
  delete process.env["QUERY_PUPPY_TEST_RELATIONSHIP_WORKSPACE"];
  delete process.env["QUERY_PUPPY_TEST_UNRELATED_WORKSPACE"];
  await rm(acceptanceRoot, { recursive: true, force: true });
}

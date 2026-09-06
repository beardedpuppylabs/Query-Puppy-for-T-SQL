import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  expectedVsixFilename,
  parseReleaseVersion,
} from "./release-policy.mjs";

function unzip(arguments_) {
  const result = spawnSync("unzip", arguments_, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(result.stderr || `unzip ${arguments_.join(" ")} failed.`);
  }
  return result.stdout;
}

const [vsixPath, version] = process.argv.slice(2);
if (!vsixPath || !version) {
  throw new Error(
    "Usage: node scripts/verify-release-vsix.mjs <vsix-path> <version>",
  );
}
parseReleaseVersion(version);

if (path.basename(vsixPath) !== expectedVsixFilename(version)) {
  throw new Error(`Unexpected VSIX filename: ${path.basename(vsixPath)}`);
}

const entries = unzip(["-Z1", vsixPath]).split(/\r?\n/u).filter(Boolean);
const requiredEntries = [
  "extension/package.json",
  "extension/dist/extension.js",
  "extension/LICENSE",
  "extension/THIRD_PARTY_NOTICES.md",
];
for (const entry of requiredEntries) {
  if (!entries.includes(entry)) {
    throw new Error(`VSIX is missing required entry ${entry}.`);
  }
}

const forbiddenPatterns = [
  /^extension\/(?:src|tests|benchmarks|scripts|spike|tmp|docs|node_modules)\//u,
  /^extension\/(?:\.env(?:\.|$)|AGENTS\.md$|PROJECT_DEVELOPMENT_PLAN\.md$)/u,
];
const forbiddenEntry = entries.find((entry) =>
  forbiddenPatterns.some((pattern) => pattern.test(entry)),
);
if (forbiddenEntry) {
  throw new Error(
    `VSIX contains forbidden development content: ${forbiddenEntry}`,
  );
}

const packagedManifest = JSON.parse(
  unzip(["-p", vsixPath, "extension/package.json"]),
);
const expectedRepository =
  "https://github.com/beardedpuppylabs/Query-Puppy-for-T-SQL.git";
if (
  packagedManifest.name !== "query-puppy-for-t-sql" ||
  packagedManifest.publisher !== "BeardedPuppyLabs" ||
  packagedManifest.version !== version ||
  packagedManifest.license !== "GPL-3.0-only" ||
  packagedManifest.repository?.url !== expectedRepository
) {
  throw new Error(
    "Packaged extension identity, version, license, or repository is invalid.",
  );
}

for (const file of ["LICENSE", "THIRD_PARTY_NOTICES.md"]) {
  const repositoryBytes = await readFile(file);
  const packagedBytes = Buffer.from(
    unzip(["-p", vsixPath, `extension/${file}`]),
    "utf8",
  );
  if (!repositoryBytes.equals(packagedBytes)) {
    throw new Error(`Packaged ${file} differs from the repository source.`);
  }
}

console.log(
  `Verified ${path.basename(vsixPath)} as ${packagedManifest.publisher}.${packagedManifest.name}.`,
);

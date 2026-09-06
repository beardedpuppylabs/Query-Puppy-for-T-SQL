import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  evaluateLocalReleaseCandidate,
  expectedVsixFilename,
} from "./release-policy.mjs";

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const outputDirectory = option("--output-dir");
const githubOutput = option("--github-output");
if (!outputDirectory) {
  throw new Error(
    "Usage: node scripts/prepare-release.mjs --output-dir <directory>",
  );
}

const [manifestText, lockText, changelog, policyText] = await Promise.all([
  readFile("package.json", "utf8"),
  readFile("package-lock.json", "utf8"),
  readFile("CHANGELOG.md", "utf8"),
  readFile(".github/release-policy.json", "utf8"),
]);
const manifest = JSON.parse(manifestText);
const lock = JSON.parse(lockText);
const policy = JSON.parse(policyText);
const lockVersions = [lock.version, lock.packages?.[""]?.version].filter(
  Boolean,
);

if (lockVersions.length === 0 || new Set(lockVersions).size !== 1) {
  throw new Error(
    "package-lock.json does not contain one consistent root version.",
  );
}

const candidate = evaluateLocalReleaseCandidate({
  manifestVersion: manifest.version,
  lockVersion: lockVersions[0],
  changelog,
  minimumExclusiveVersion: policy.minimumExclusiveVersion,
});
const version = manifest.version;
const vsixFilename = expectedVsixFilename(version);
const checksumFilename = `${vsixFilename}.sha256`;
const metadataPath = path.join(outputDirectory, "metadata.json");
const releaseNotesPath = path.join(outputDirectory, "release-notes.md");

await mkdir(outputDirectory, { recursive: true });
await writeFile(releaseNotesPath, candidate.releaseNotes, "utf8");
await writeFile(
  metadataPath,
  `${JSON.stringify(
    {
      version,
      tagName: `v${version}`,
      releaseTitle: `Query Puppy for T-SQL ${version}`,
      prerelease: false,
      vsixFilename,
      checksumFilename,
      releaseNotes: candidate.releaseNotes,
      releaseNotesPath,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(candidate.reason);
if (githubOutput) {
  await appendFile(
    githubOutput,
    [
      `eligible=${String(candidate.eligible)}`,
      `metadata_path=${metadataPath}`,
      `vsix_filename=${vsixFilename}`,
      `checksum_filename=${checksumFilename}`,
      "",
    ].join("\n"),
    "utf8",
  );
}

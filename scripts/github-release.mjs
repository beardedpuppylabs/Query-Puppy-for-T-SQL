import { createHash } from "node:crypto";
import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import {
  evaluateRemoteReleaseState,
  selectReleaseByTag,
} from "./release-policy.mjs";

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const command = process.argv[2];
const metadataPath = option("--metadata");
const githubOutput = option("--github-output");
const repository = process.env.GITHUB_REPOSITORY;
const expectedHeadSha = process.env.GITHUB_SHA;
const token = process.env.GITHUB_TOKEN;

if (!command || !metadataPath || !repository || !expectedHeadSha || !token) {
  throw new Error(
    "Usage: node scripts/github-release.mjs <preflight|publish> --metadata <path> with GITHUB_REPOSITORY, GITHUB_SHA, and GITHUB_TOKEN set.",
  );
}

const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
const apiBase = `https://api.github.com/repos/${repository}`;

async function githubRequest(url, { method = "GET", body, contentType } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(contentType ? { "Content-Type": contentType } : {}),
    },
    body,
  });

  if (!response.ok) {
    const detail = await response.text();
    const error = new Error(
      `GitHub API ${method} ${url} failed with ${response.status}: ${detail}`,
    );
    error.status = response.status;
    throw error;
  }

  if (response.status === 204) {
    return null;
  }
  return response.json();
}

async function githubRequestOrNull(url) {
  try {
    return await githubRequest(url);
  } catch (error) {
    if (error.status === 404) {
      return null;
    }
    throw error;
  }
}

async function listReleases() {
  const releases = [];
  for (let page = 1; page <= 10; page += 1) {
    const batch = await githubRequest(
      `${apiBase}/releases?per_page=100&page=${page}`,
    );
    releases.push(...batch);
    if (batch.length < 100) {
      return releases;
    }
  }
  throw new Error(
    "More than 1,000 GitHub Releases exist; refusing an incomplete state scan.",
  );
}

async function resolveTagCommitSha(tagName) {
  let reference = await githubRequestOrNull(
    `${apiBase}/git/ref/tags/${encodeURIComponent(tagName)}`,
  );
  if (!reference) {
    return null;
  }

  for (
    let depth = 0;
    reference.object.type === "tag" && depth < 5;
    depth += 1
  ) {
    const tag = await githubRequest(
      `${apiBase}/git/tags/${reference.object.sha}`,
    );
    reference = { object: tag.object };
  }
  if (reference.object.type !== "commit") {
    throw new Error(`Tag ${tagName} does not resolve to a commit.`);
  }
  return reference.object.sha;
}

function policyRelease(release) {
  if (!release) {
    return null;
  }
  return {
    id: release.id,
    authorLogin: release.author?.login,
    tagName: release.tag_name,
    name: release.name ?? "",
    body: (release.body ?? "").trim(),
    targetCommitish: release.target_commitish,
    draft: release.draft,
    prerelease: release.prerelease,
    assets: release.assets.map((asset) => ({
      id: asset.id,
      name: asset.name,
      size: asset.size,
    })),
  };
}

async function remoteState() {
  const [mainReference, rawReleases, tagCommitSha] = await Promise.all([
    githubRequest(`${apiBase}/git/ref/heads/main`),
    listReleases(),
    resolveTagCommitSha(metadata.tagName),
  ]);
  const releases = rawReleases.map(policyRelease);
  const release = selectReleaseByTag(releases, metadata.tagName);

  return {
    expectedHeadSha,
    currentMainSha: mainReference.object.sha,
    tagName: metadata.tagName,
    tagCommitSha,
    release,
    releaseTitle: metadata.releaseTitle,
    releaseNotes: metadata.releaseNotes,
    expectedAssetNames: [metadata.vsixFilename, metadata.checksumFilename],
  };
}

async function decide() {
  return evaluateRemoteReleaseState(await remoteState());
}

async function createDraft() {
  return githubRequest(`${apiBase}/releases`, {
    method: "POST",
    contentType: "application/json",
    body: JSON.stringify({
      tag_name: metadata.tagName,
      target_commitish: expectedHeadSha,
      name: metadata.releaseTitle,
      body: metadata.releaseNotes,
      draft: true,
      prerelease: false,
    }),
  });
}

async function uploadAsset(releaseId, filePath, assetName, contentType) {
  const bytes = await readFile(filePath);
  return githubRequest(
    `https://uploads.github.com/repos/${repository}/releases/${releaseId}/assets?name=${encodeURIComponent(assetName)}`,
    { method: "POST", body: bytes, contentType },
  );
}

if (command === "preflight") {
  const decision = await decide();
  console.log(`${decision.action}: ${decision.reason}`);
  if (githubOutput) {
    await appendFile(githubOutput, `action=${decision.action}\n`, "utf8");
  }
} else if (command === "publish") {
  const vsixPath = option("--vsix");
  const checksumPath = option("--checksum");
  if (!vsixPath || !checksumPath) {
    throw new Error("publish requires --vsix and --checksum.");
  }
  if (path.basename(vsixPath) !== metadata.vsixFilename) {
    throw new Error(
      "VSIX path does not match the expected release asset name.",
    );
  }
  if (path.basename(checksumPath) !== metadata.checksumFilename) {
    throw new Error(
      "Checksum path does not match the expected release asset name.",
    );
  }

  const [vsixBytes, checksumText] = await Promise.all([
    readFile(vsixPath),
    readFile(checksumPath, "utf8"),
  ]);
  const digest = createHash("sha256").update(vsixBytes).digest("hex");
  if (checksumText.trim() !== `${digest}  ${metadata.vsixFilename}`) {
    throw new Error("Checksum file does not match the exact release VSIX.");
  }

  const state = await remoteState();
  const decision = evaluateRemoteReleaseState(state);
  if (decision.action === "noop" || decision.action === "stale") {
    console.log(`${decision.action}: ${decision.reason}`);
    process.exit(0);
  }

  // This is the first mutation. All local, package, remote, CI, and current-HEAD
  // checks have completed before reaching this point.
  let draft;
  if (decision.action === "publish") {
    draft = await createDraft();
  } else if (decision.retargetDraft) {
    draft = await githubRequest(`${apiBase}/releases/${state.release.id}`, {
      method: "PATCH",
      contentType: "application/json",
      body: JSON.stringify({ target_commitish: expectedHeadSha }),
    });

    const retargetedState = await remoteState();
    const retargetedDecision = evaluateRemoteReleaseState(retargetedState);
    if (retargetedDecision.action === "stale") {
      console.log(`stale: ${retargetedDecision.reason}`);
      process.exit(0);
    }
    if (
      retargetedDecision.action !== "recover-draft" ||
      retargetedDecision.retargetDraft
    ) {
      throw new Error(
        "The stale draft did not reach the exact current-commit recovery state.",
      );
    }
    draft = retargetedState.release;
  } else {
    draft = await githubRequest(`${apiBase}/releases/${state.release.id}`);
  }
  if (!draft.draft) {
    throw new Error(`Release ${metadata.tagName} is no longer a draft.`);
  }

  const expectedNames = new Set([
    metadata.vsixFilename,
    metadata.checksumFilename,
  ]);
  for (const asset of draft.assets) {
    if (expectedNames.has(asset.name)) {
      await githubRequest(`${apiBase}/releases/assets/${asset.id}`, {
        method: "DELETE",
      });
    }
  }

  await uploadAsset(
    draft.id,
    vsixPath,
    metadata.vsixFilename,
    "application/octet-stream",
  );
  await uploadAsset(
    draft.id,
    checksumPath,
    metadata.checksumFilename,
    "text/plain",
  );

  const readyDraft = policyRelease(
    await githubRequest(`${apiBase}/releases/${draft.id}`),
  );
  const readyDecision = evaluateRemoteReleaseState({
    ...(await remoteState()),
    release: readyDraft,
  });
  if (readyDecision.action !== "recover-draft") {
    throw new Error(
      "The draft did not reach the expected recoverable state after asset upload.",
    );
  }
  const requiredAssets = new Set([
    metadata.vsixFilename,
    metadata.checksumFilename,
  ]);
  if (
    readyDraft.assets.length !== requiredAssets.size ||
    !readyDraft.assets.every(
      (asset) => requiredAssets.has(asset.name) && asset.size > 0,
    )
  ) {
    throw new Error(
      "The draft does not contain exactly the required non-empty release assets.",
    );
  }

  await githubRequest(`${apiBase}/releases/${draft.id}`, {
    method: "PATCH",
    contentType: "application/json",
    body: JSON.stringify({ draft: false, prerelease: false }),
  });

  const finalDecision = await decide();
  if (finalDecision.action !== "noop") {
    throw new Error(
      "Published release verification did not reach the complete no-op state.",
    );
  }
  console.log(`Published ${metadata.releaseTitle} from ${expectedHeadSha}.`);
} else {
  throw new Error(`Unknown command: ${command}`);
}

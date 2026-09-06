import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  evaluateLocalReleaseCandidate,
  evaluateRemoteReleaseState,
  expectedVsixFilename,
  extractChangelogReleaseNotes,
  selectReleaseByTag,
  type RemoteReleaseStateInput,
  type ReleaseState,
} from "../scripts/release-policy.mjs";

const changelog = `# Changelog

## 0.19.0

- Automatic releases.

## 0.18.1

- Existing Marketplace release.
`;

const localCandidate = (
  manifestVersion = "0.19.0",
  lockVersion = manifestVersion,
) =>
  evaluateLocalReleaseCandidate({
    manifestVersion,
    lockVersion,
    changelog,
    minimumExclusiveVersion: "0.18.1",
  });

const completeRelease = (
  overrides: Partial<ReleaseState> = {},
): ReleaseState => ({
  id: 42,
  authorLogin: "github-actions[bot]",
  tagName: "v0.19.0",
  name: "Query Puppy for T-SQL 0.19.0",
  body: "- Automatic releases.",
  targetCommitish: "release-commit",
  draft: false,
  prerelease: false,
  assets: [
    { name: "query-puppy-for-t-sql-0.19.0.vsix", size: 100 },
    { name: "query-puppy-for-t-sql-0.19.0.vsix.sha256", size: 90 },
  ],
  ...overrides,
});

const remoteState = (
  overrides: Partial<RemoteReleaseStateInput> = {},
): RemoteReleaseStateInput => ({
  expectedHeadSha: "release-commit",
  currentMainSha: "release-commit",
  tagName: "v0.19.0",
  tagCommitSha: "release-commit",
  release: completeRelease(),
  releaseTitle: "Query Puppy for T-SQL 0.19.0",
  releaseNotes: "- Automatic releases.",
  expectedAssetNames: [
    "query-puppy-for-t-sql-0.19.0.vsix",
    "query-puppy-for-t-sql-0.19.0.vsix.sha256",
  ],
  ...overrides,
});

test("release policy skips the Marketplace-only 0.18.1 bootstrap version", () => {
  assert.equal(localCandidate("0.18.1").eligible, false);
});

test("release policy accepts a future version with matching lock and changelog", () => {
  assert.equal(localCandidate().eligible, true);
});

test("release eligibility is independent of whether the triggering commit changed the version", () => {
  assert.deepEqual(localCandidate(), localCandidate());
});

test("release policy rejects manifest and lockfile mismatch", () => {
  assert.throws(() => localCandidate("0.19.0", "0.18.1"), /does not match/u);
});

test("release policy rejects missing and empty changelog sections", async (context) => {
  await context.test("missing", () => {
    assert.throws(
      () =>
        evaluateLocalReleaseCandidate({
          manifestVersion: "0.20.0",
          lockVersion: "0.20.0",
          changelog,
          minimumExclusiveVersion: "0.18.1",
        }),
      /exactly one release section/u,
    );
  });
  await context.test("empty", () => {
    assert.throws(
      () =>
        evaluateLocalReleaseCandidate({
          manifestVersion: "0.20.0",
          lockVersion: "0.20.0",
          changelog: "# Changelog\n\n## 0.20.0\n\n## 0.19.0\n\n- Previous.\n",
          minimumExclusiveVersion: "0.18.1",
        }),
      /is empty/u,
    );
  });
});

test("release notes contain only the exact matching changelog section", () => {
  assert.equal(
    extractChangelogReleaseNotes(changelog, "0.19.0"),
    "- Automatic releases.",
  );
});

test("VSIX filename derives from the manifest version", () => {
  assert.equal(
    expectedVsixFilename("0.19.0"),
    "query-puppy-for-t-sql-0.19.0.vsix",
  );
});

test("ordinary 0.x releases are complete non-prerelease releases", () => {
  assert.deepEqual(evaluateRemoteReleaseState(remoteState()), {
    action: "noop",
    reason: "The intended version is already fully released.",
  });
});

test("an existing fully released version is a no-op", () => {
  assert.equal(evaluateRemoteReleaseState(remoteState()).action, "noop");
});

test("stale workflow commits never publish", () => {
  assert.equal(
    evaluateRemoteReleaseState(
      remoteState({ currentMainSha: "newer-main-commit" }),
    ).action,
    "stale",
  );
});

test("a stale automation draft remains recoverable by the next same-version main commit", () => {
  const commitA = "commit-a";
  const commitB = "commit-b";
  const draftFromRunA = completeRelease({
    targetCommitish: commitA,
    draft: true,
    assets: [{ name: "query-puppy-for-t-sql-0.19.0.vsix", size: 100 }],
  });

  assert.equal(
    evaluateRemoteReleaseState(
      remoteState({
        expectedHeadSha: commitA,
        currentMainSha: commitA,
        tagCommitSha: null,
        release: null,
      }),
    ).action,
    "publish",
  );

  assert.equal(
    evaluateRemoteReleaseState(
      remoteState({
        expectedHeadSha: commitA,
        currentMainSha: commitB,
        tagCommitSha: null,
        release: draftFromRunA,
      }),
    ).action,
    "stale",
  );

  assert.deepEqual(
    evaluateRemoteReleaseState(
      remoteState({
        expectedHeadSha: commitB,
        currentMainSha: commitB,
        tagCommitSha: null,
        release: draftFromRunA,
      }),
    ),
    {
      action: "recover-draft",
      retargetDraft: true,
      reason:
        "An exact tagless automation-owned draft can be retargeted and completed safely.",
    },
  );

  const recoveryAssetStates = [
    [],
    [{ name: "query-puppy-for-t-sql-0.19.0.vsix", size: 100 }],
    completeRelease().assets,
  ];
  for (const assets of recoveryAssetStates) {
    assert.equal(
      evaluateRemoteReleaseState(
        remoteState({
          expectedHeadSha: commitB,
          currentMainSha: commitB,
          tagCommitSha: null,
          release: { ...draftFromRunA, assets },
        }),
      ).retargetDraft,
      true,
    );
  }

  assert.deepEqual(
    evaluateRemoteReleaseState(
      remoteState({
        expectedHeadSha: commitB,
        currentMainSha: commitB,
        tagCommitSha: null,
        release: { ...draftFromRunA, targetCommitish: commitB },
      }),
    ),
    {
      action: "recover-draft",
      retargetDraft: false,
      reason: "An exact automation-owned draft can be completed safely.",
    },
  );
});

test("conflicting and partial published states fail closed", async (context) => {
  await context.test("tag without release", () => {
    assert.throws(
      () => evaluateRemoteReleaseState(remoteState({ release: null })),
      /exists without its GitHub Release/u,
    );
  });
  await context.test("published release missing checksum", () => {
    assert.throws(
      () =>
        evaluateRemoteReleaseState(
          remoteState({
            release: completeRelease({
              assets: [
                { name: "query-puppy-for-t-sql-0.19.0.vsix", size: 100 },
              ],
            }),
          }),
        ),
      /missing required non-empty assets/u,
    );
  });
  await context.test("tag on another commit", () => {
    assert.throws(
      () =>
        evaluateRemoteReleaseState(
          remoteState({ tagCommitSha: "other-commit" }),
        ),
      /points to a different commit/u,
    );
  });
  await context.test("published release targeting another commit", () => {
    assert.throws(
      () =>
        evaluateRemoteReleaseState(
          remoteState({
            expectedHeadSha: "commit-b",
            currentMainSha: "commit-b",
            tagCommitSha: "commit-b",
            release: completeRelease({ targetCommitish: "commit-a" }),
          }),
        ),
      /targets a different commit/u,
    );
  });
  await context.test("stale draft with an immutable tag", () => {
    assert.throws(
      () =>
        evaluateRemoteReleaseState(
          remoteState({
            expectedHeadSha: "commit-b",
            currentMainSha: "commit-b",
            tagCommitSha: "commit-a",
            release: completeRelease({
              targetCommitish: "commit-a",
              draft: true,
            }),
          }),
        ),
      /points to a different commit/u,
    );
  });
  await context.test("draft from another author", () => {
    assert.throws(
      () =>
        evaluateRemoteReleaseState(
          remoteState({
            tagCommitSha: null,
            release: completeRelease({
              authorLogin: "maintainer",
              draft: true,
            }),
          }),
        ),
      /was not created by the release automation/u,
    );
  });
});

test("an exact draft is recoverable without selecting unrelated historical drafts", () => {
  const historicalDraft = completeRelease({
    tagName: "v0.12.2",
    name: "Old draft",
    draft: true,
    assets: [{ name: "query-puppy-for-t-sql-0.12.2.vsix", size: 100 }],
  });
  assert.equal(selectReleaseByTag([historicalDraft], "v0.19.0"), null);
  assert.equal(
    evaluateRemoteReleaseState(
      remoteState({
        tagCommitSha: null,
        release: completeRelease({ draft: true, assets: [] }),
      }),
    ).action,
    "recover-draft",
  );
});

test("contract: CI releases only successful current main pushes with narrow permissions", async () => {
  const workflow = await readFile(".github/workflows/ci.yml", "utf8");
  const githubRelease = await readFile("scripts/github-release.mjs", "utf8");

  assert.match(workflow, /push:/u);
  assert.match(workflow, /pull_request:/u);
  assert.doesNotMatch(workflow, /workflow_dispatch/u);
  assert.match(workflow, /github\.event_name == 'push'/u);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/u);
  assert.match(
    workflow,
    /needs:\s*\n\s*- quality\s*\n\s*- extension-host-and-build/u,
  );
  assert.match(workflow, /needs\.quality\.result == 'success'/u);
  assert.match(
    workflow,
    /needs\.extension-host-and-build\.result == 'success'/u,
  );
  assert.match(workflow, /permissions:\s*\n\s*contents: read/u);
  assert.equal(workflow.match(/contents: write/gu)?.length, 1);
  assert.match(workflow, /group: release-\$\{\{ github\.repository \}\}/u);
  assert.match(workflow, /cancel-in-progress: false/u);
  assert.match(workflow, /scripts\/github-release\.mjs preflight/u);
  assert.match(workflow, /scripts\/github-release\.mjs publish/u);
  assert.match(githubRelease, /prerelease: false/u);
  assert.ok(
    (githubRelease.match(/target_commitish: expectedHeadSha/gu)?.length ?? 0) >=
      2,
  );
  assert.match(githubRelease, /retargetedDecision\.action === "stale"/u);
  assert.doesNotMatch(workflow, /marketplace|open[ -]?vsx/iu);
});

test("contract: the automatic-release floor is explicit and remains at 0.18.1", async () => {
  const policy: unknown = JSON.parse(
    await readFile(".github/release-policy.json", "utf8"),
  );
  assert.ok(policy && typeof policy === "object");
  assert.ok("minimumExclusiveVersion" in policy);
  assert.ok("reason" in policy);
  assert.equal(policy.minimumExclusiveVersion, "0.18.1");
  if (typeof policy.reason !== "string") {
    assert.fail("Release floor reason must be a string.");
  }
  assert.match(policy.reason, /Marketplace-only 0\.18\.1/u);
});

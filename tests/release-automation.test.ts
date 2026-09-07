import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  orchestrateGitHubRelease,
  type CreateDraftPayload,
  type PublishDraftPayload,
  type RetargetDraftPayload,
} from "../scripts/github-release-orchestration.mjs";
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

const vsixName = "query-puppy-for-t-sql-0.19.0.vsix";
const checksumName = `${vsixName}.sha256`;
const vsixAsset = { id: 101, name: vsixName, size: 100 };
const checksumAsset = { id: 102, name: checksumName, size: 90 };
const completeAssets: ReleaseState["assets"] = [vsixAsset, checksumAsset];

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
  assets: completeAssets,
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
  expectedAssetNames: [vsixName, checksumName],
  ...overrides,
});

const draftRelease = (
  targetCommitish: string,
  assets: ReleaseState["assets"] = [],
  overrides: Partial<ReleaseState> = {},
): ReleaseState =>
  completeRelease({
    targetCommitish,
    draft: true,
    assets,
    ...overrides,
  });

const stateAtB = (
  release: ReleaseState | null,
  tagCommitSha: string | null = null,
  currentMainSha = "commit-b",
): RemoteReleaseStateInput =>
  remoteState({
    expectedHeadSha: "commit-b",
    currentMainSha,
    tagCommitSha,
    release,
  });

function orchestrationHarness(states: RemoteReleaseStateInput[]) {
  const events: string[] = [];
  const createPayloads: CreateDraftPayload[] = [];
  const retargetPayloads: RetargetDraftPayload[] = [];
  const publishPayloads: PublishDraftPayload[] = [];
  let readIndex = 0;

  return {
    events,
    createPayloads,
    retargetPayloads,
    publishPayloads,
    run: () =>
      orchestrateGitHubRelease({
        expectedHeadSha: "commit-b",
        loadRemoteState: async () => {
          events.push("read");
          const state = states[readIndex];
          readIndex += 1;
          if (!state) {
            throw new Error("The fake has no remote state for this read.");
          }
          return structuredClone(state);
        },
        createDraft: async (payload) => {
          events.push("create");
          createPayloads.push(payload);
          return draftRelease("commit-b");
        },
        retargetDraft: async (releaseId, payload) => {
          events.push(`retarget:${releaseId}`);
          retargetPayloads.push(payload);
        },
        deleteAsset: async (assetId) => {
          events.push(`delete:${assetId}`);
        },
        uploadAsset: async (releaseId, assetName) => {
          events.push(`upload:${releaseId}:${assetName}`);
        },
        publishDraft: async (releaseId, payload) => {
          events.push(`publish:${releaseId}`);
          publishPayloads.push(payload);
        },
      }),
  };
}

test("release policy skips the Marketplace-only 0.18.1 bootstrap version", () => {
  assert.equal(localCandidate("0.18.1").eligible, false);
});

test("release policy accepts a future version with matching lock and changelog", () => {
  assert.equal(localCandidate().eligible, true);
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

test("a release completed at A is a no-op for a later same-version commit B", () => {
  assert.equal(localCandidate("0.19.0").eligible, true);
  assert.deepEqual(
    evaluateRemoteReleaseState(
      remoteState({
        expectedHeadSha: "commit-b",
        currentMainSha: "commit-b",
        tagCommitSha: "commit-a",
        release: completeRelease({ targetCommitish: "commit-a" }),
      }),
    ),
    {
      action: "noop",
      reason: "The intended version is already fully released.",
    },
  );
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
      assetsComplete: false,
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
      assetsComplete: false,
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
  await context.test(
    "published Release target and immutable tag disagree",
    () => {
      assert.throws(
        () =>
          evaluateRemoteReleaseState(
            remoteState({ tagCommitSha: "other-commit" }),
          ),
        /target and immutable tag identify different commits/u,
      );
    },
  );
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
      /target and immutable tag identify different commits/u,
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
      /cannot be recovered because its immutable tag already exists/u,
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

test("release policy rejects ambiguous and internally inconsistent release state", async (context) => {
  await context.test("duplicate matching Releases", () => {
    assert.throws(
      () =>
        selectReleaseByTag(
          [completeRelease(), completeRelease({ id: 43 })],
          "v0.19.0",
        ),
      /Multiple GitHub Releases/u,
    );
  });
  await context.test("unexpected draft asset", () => {
    assert.throws(
      () =>
        evaluateRemoteReleaseState(
          stateAtB(
            draftRelease("commit-b", [
              { id: 103, name: "unexpected.zip", size: 100 },
            ]),
          ),
        ),
      /unexpected assets/u,
    );
  });
  await context.test("duplicate draft asset name", () => {
    assert.throws(
      () =>
        evaluateRemoteReleaseState(
          stateAtB(
            draftRelease("commit-b", [
              { id: 101, name: vsixName, size: 100 },
              { id: 103, name: vsixName, size: 100 },
            ]),
          ),
        ),
      /duplicate asset names/u,
    );
  });
  for (const [name, release] of [
    ["tag name", completeRelease({ tagName: "v0.20.0" })],
    ["title", completeRelease({ name: "Wrong title" })],
    ["notes", completeRelease({ body: "Wrong notes" })],
    ["prerelease state", completeRelease({ prerelease: true })],
  ] as const) {
    await context.test(`conflicting Release ${name}`, () => {
      assert.throws(
        () => evaluateRemoteReleaseState(remoteState({ release })),
        /conflicting identity or metadata/u,
      );
    });
  }
});

test("release orchestration recovers stale tagless drafts and replaces assets", async (context) => {
  const recoveryCases = [
    {
      name: "no assets",
      assets: [],
      deletedEvents: [],
    },
    {
      name: "one expected asset",
      assets: [vsixAsset],
      deletedEvents: ["delete:101"],
    },
    {
      name: "both expected assets",
      assets: completeAssets,
      deletedEvents: ["delete:101", "delete:102"],
    },
  ];

  for (const recoveryCase of recoveryCases) {
    await context.test(recoveryCase.name, async () => {
      const harness = orchestrationHarness([
        stateAtB(draftRelease("commit-a", recoveryCase.assets)),
        stateAtB(draftRelease("commit-b", recoveryCase.assets)),
        stateAtB(draftRelease("commit-b", completeAssets)),
        stateAtB(completeRelease({ targetCommitish: "commit-b" }), "commit-b"),
      ]);

      assert.equal((await harness.run()).action, "published");
      assert.deepEqual(harness.events, [
        "read",
        "retarget:42",
        "read",
        ...recoveryCase.deletedEvents,
        `upload:42:${vsixName}`,
        `upload:42:${checksumName}`,
        "read",
        "publish:42",
        "read",
      ]);
      assert.deepEqual(harness.retargetPayloads, [
        { target_commitish: "commit-b" },
      ]);
      assert.deepEqual(harness.publishPayloads, [
        { draft: false, prerelease: false },
      ]);
    });
  }
});

test("release orchestration stops stale and conflicting drafts before asset mutation", async (context) => {
  await context.test("main advances immediately after retarget", async () => {
    const harness = orchestrationHarness([
      stateAtB(draftRelease("commit-a")),
      stateAtB(draftRelease("commit-b"), null, "commit-c"),
    ]);

    assert.equal((await harness.run()).action, "stale");
    assert.deepEqual(harness.events, ["read", "retarget:42", "read"]);
  });

  await context.test("stale draft has an immutable tag", async () => {
    const harness = orchestrationHarness([
      stateAtB(draftRelease("commit-a"), "commit-b"),
    ]);

    await assert.rejects(
      harness.run,
      /cannot be recovered because its immutable tag already exists/u,
    );
    assert.deepEqual(harness.events, ["read"]);
  });

  await context.test("draft has a foreign author", async () => {
    const harness = orchestrationHarness([
      stateAtB(draftRelease("commit-a", [], { authorLogin: "maintainer" })),
    ]);

    await assert.rejects(harness.run, /not created by the release automation/u);
    assert.deepEqual(harness.events, ["read"]);
  });

  await context.test("draft contains an unexpected asset", async () => {
    const harness = orchestrationHarness([
      stateAtB(
        draftRelease("commit-b", [
          { id: 103, name: "unexpected.zip", size: 100 },
        ]),
      ),
    ]);

    await assert.rejects(harness.run, /unexpected assets/u);
    assert.deepEqual(harness.events, ["read"]);
  });
});

test("release orchestration creates and publishes only after fresh state validation", async () => {
  const harness = orchestrationHarness([
    stateAtB(null),
    stateAtB(draftRelease("commit-b")),
    stateAtB(draftRelease("commit-b", completeAssets)),
    stateAtB(completeRelease({ targetCommitish: "commit-b" }), "commit-b"),
  ]);

  assert.equal((await harness.run()).action, "published");
  assert.deepEqual(harness.events, [
    "read",
    "create",
    "read",
    `upload:42:${vsixName}`,
    `upload:42:${checksumName}`,
    "read",
    "publish:42",
    "read",
  ]);
  assert.deepEqual(harness.createPayloads, [
    {
      tag_name: "v0.19.0",
      target_commitish: "commit-b",
      name: "Query Puppy for T-SQL 0.19.0",
      body: "- Automatic releases.",
      draft: true,
      prerelease: false,
    },
  ]);
  assert.deepEqual(harness.publishPayloads, [
    { draft: false, prerelease: false },
  ]);
});

test("release orchestration rejects zero-byte final assets before publication", async () => {
  const harness = orchestrationHarness([
    stateAtB(draftRelease("commit-b")),
    stateAtB(
      draftRelease("commit-b", [
        { id: 101, name: vsixName, size: 0 },
        checksumAsset,
      ]),
    ),
  ]);

  await assert.rejects(harness.run, /required non-empty release assets/u);
  assert.deepEqual(harness.events, [
    "read",
    `upload:42:${vsixName}`,
    `upload:42:${checksumName}`,
    "read",
  ]);
});

test("post-publication verification detects the final current-main race", async () => {
  const harness = orchestrationHarness([
    stateAtB(draftRelease("commit-b")),
    stateAtB(draftRelease("commit-b", completeAssets)),
    stateAtB(
      completeRelease({ targetCommitish: "commit-b" }),
      "commit-b",
      "commit-c",
    ),
  ]);

  await assert.rejects(harness.run, /complete no-op state: stale/u);
  assert.deepEqual(harness.events, [
    "read",
    `upload:42:${vsixName}`,
    `upload:42:${checksumName}`,
    "read",
    "publish:42",
    "read",
  ]);
});

test("published same-version A to later B is an orchestration no-op", async () => {
  const harness = orchestrationHarness([
    stateAtB(completeRelease({ targetCommitish: "commit-a" }), "commit-a"),
  ]);

  assert.equal((await harness.run()).action, "noop");
  assert.deepEqual(harness.events, ["read"]);
  assert.deepEqual(harness.createPayloads, []);
  assert.deepEqual(harness.retargetPayloads, []);
  assert.deepEqual(harness.publishPayloads, []);
});

test("contract: CI releases only successful current main pushes with narrow permissions", async () => {
  const workflow = await readFile(".github/workflows/ci.yml", "utf8");

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
  assert.match(workflow, /if: steps\.candidate\.outputs\.eligible == 'true'/u);
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

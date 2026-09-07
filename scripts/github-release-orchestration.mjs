import { evaluateRemoteReleaseState } from "./release-policy.mjs";

function requiredReleaseId(release) {
  if (!Number.isInteger(release?.id)) {
    throw new Error("The GitHub Release is missing its numeric ID.");
  }
  return release.id;
}

function requiredAssetId(asset) {
  if (!Number.isInteger(asset.id)) {
    throw new Error(`Release asset ${asset.name} is missing its numeric ID.`);
  }
  return asset.id;
}

function requireCurrentDraft(state, decision, releaseId) {
  if (
    decision.action !== "recover-draft" ||
    decision.retargetDraft ||
    !state.release?.draft ||
    requiredReleaseId(state.release) !== releaseId
  ) {
    throw new Error(
      "The release did not reach the exact current-commit recovery state.",
    );
  }
  return state.release;
}

export async function orchestrateGitHubRelease({
  expectedHeadSha,
  loadRemoteState,
  createDraft,
  retargetDraft,
  deleteAsset,
  uploadAsset,
  publishDraft,
}) {
  let state = await loadRemoteState();
  let decision = evaluateRemoteReleaseState(state);
  if (decision.action === "noop" || decision.action === "stale") {
    return decision;
  }

  let releaseId;
  let stateMustBeReread = false;
  if (decision.action === "publish") {
    const created = await createDraft({
      tag_name: state.tagName,
      target_commitish: expectedHeadSha,
      name: state.releaseTitle,
      body: state.releaseNotes,
      draft: true,
      prerelease: false,
    });
    releaseId = requiredReleaseId(created);
    stateMustBeReread = true;
  } else {
    releaseId = requiredReleaseId(state.release);
    if (decision.retargetDraft) {
      await retargetDraft(releaseId, {
        target_commitish: expectedHeadSha,
      });
      stateMustBeReread = true;
    }
  }

  if (stateMustBeReread) {
    state = await loadRemoteState();
    decision = evaluateRemoteReleaseState(state);
    if (decision.action === "noop" || decision.action === "stale") {
      return decision;
    }
  }

  const draft = requireCurrentDraft(state, decision, releaseId);
  for (const assetName of state.expectedAssetNames) {
    const existing = draft.assets.find((asset) => asset.name === assetName);
    if (existing) {
      await deleteAsset(requiredAssetId(existing));
    }
  }
  for (const assetName of state.expectedAssetNames) {
    await uploadAsset(releaseId, assetName);
  }

  const readyState = await loadRemoteState();
  const readyDecision = evaluateRemoteReleaseState(readyState);
  if (readyDecision.action === "noop" || readyDecision.action === "stale") {
    return readyDecision;
  }
  requireCurrentDraft(readyState, readyDecision, releaseId);
  if (!readyDecision.assetsComplete) {
    throw new Error(
      "The draft does not contain exactly the required non-empty release assets.",
    );
  }

  await publishDraft(releaseId, { draft: false, prerelease: false });

  const finalState = await loadRemoteState();
  const finalDecision = evaluateRemoteReleaseState(finalState);
  if (finalDecision.action !== "noop") {
    throw new Error(
      `Published release verification did not reach the complete no-op state: ${finalDecision.action}: ${finalDecision.reason}`,
    );
  }

  return {
    action: "published",
    reason: `Published ${finalState.releaseTitle} from ${expectedHeadSha}.`,
  };
}

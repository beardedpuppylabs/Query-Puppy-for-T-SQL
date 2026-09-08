import { setTimeout as delay } from "node:timers/promises";
import { evaluateRemoteReleaseState } from "./release-policy.mjs";

const RELEASE_CONVERGENCE_DELAYS_MS = [250, 1_000, 2_000];

async function defaultWaitForReleaseConvergence(attempt) {
  await delay(RELEASE_CONVERGENCE_DELAYS_MS[attempt - 1]);
}

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
    const observedId = Number.isInteger(state.release?.id)
      ? state.release.id
      : "none";
    throw new Error(
      `GitHub Release recovery validation failed for ID ${releaseId}: action=${decision.action}, retarget=${String(decision.retargetDraft)}, draft=${String(state.release?.draft)}, observedId=${observedId}. Refusing release mutation.`,
    );
  }
  return state.release;
}

async function readConvergedDraft({
  releaseId,
  mutation,
  allowPendingRetarget,
  loadRemoteState,
  waitForReleaseConvergence,
}) {
  const maximumReads = RELEASE_CONVERGENCE_DELAYS_MS.length + 1;
  for (let read = 1; read <= maximumReads; read += 1) {
    const state = await loadRemoteState(releaseId);
    const decision = evaluateRemoteReleaseState(state);
    if (decision.action === "noop" || decision.action === "stale") {
      return { state, decision };
    }
    if (decision.action === "recover-draft" && !decision.retargetDraft) {
      requireCurrentDraft(state, decision, releaseId);
      return { state, decision };
    }

    const isTransientConvergenceState =
      decision.action === "publish" ||
      (allowPendingRetarget &&
        decision.action === "recover-draft" &&
        decision.retargetDraft);
    if (!isTransientConvergenceState) {
      requireCurrentDraft(state, decision, releaseId);
    }
    if (read === maximumReads) {
      throw new Error(
        `GitHub Release ID ${releaseId} did not converge to the exact current-commit draft after ${maximumReads} reads following ${mutation}. Refusing asset, tag, and publication mutation.`,
      );
    }
    await waitForReleaseConvergence(read);
  }
  throw new Error("Unreachable release convergence state.");
}

export async function orchestrateGitHubRelease({
  expectedHeadSha,
  loadRemoteState,
  createDraft,
  retargetDraft,
  deleteAsset,
  uploadAsset,
  publishDraft,
  waitForReleaseConvergence = defaultWaitForReleaseConvergence,
}) {
  let state = await loadRemoteState();
  let decision = evaluateRemoteReleaseState(state);
  if (decision.action === "noop" || decision.action === "stale") {
    return decision;
  }

  let releaseId;
  let convergenceMutation;
  let allowPendingRetarget = false;
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
    convergenceMutation = "draft creation";
  } else {
    releaseId = requiredReleaseId(state.release);
    if (decision.retargetDraft) {
      await retargetDraft(releaseId, {
        target_commitish: expectedHeadSha,
      });
      convergenceMutation = "draft retargeting";
      allowPendingRetarget = true;
    }
  }

  if (convergenceMutation) {
    ({ state, decision } = await readConvergedDraft({
      releaseId,
      mutation: convergenceMutation,
      allowPendingRetarget,
      loadRemoteState,
      waitForReleaseConvergence,
    }));
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

  const readyState = await loadRemoteState(releaseId);
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

  const finalState = await loadRemoteState(releaseId);
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

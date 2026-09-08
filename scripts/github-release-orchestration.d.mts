import type { RemoteReleaseStateInput } from "./release-policy.mjs";

export interface CreateDraftPayload {
  tag_name: string;
  target_commitish: string;
  name: string;
  body: string;
  draft: true;
  prerelease: false;
}

export interface RetargetDraftPayload {
  target_commitish: string;
}

export interface PublishDraftPayload {
  draft: false;
  prerelease: false;
}

export interface ReleaseMutationResult {
  id?: number;
}

export interface GitHubReleaseOrchestration {
  expectedHeadSha: string;
  loadRemoteState(releaseId?: number): Promise<RemoteReleaseStateInput>;
  createDraft(payload: CreateDraftPayload): Promise<ReleaseMutationResult>;
  retargetDraft(
    releaseId: number,
    payload: RetargetDraftPayload,
  ): Promise<unknown>;
  deleteAsset(assetId: number): Promise<unknown>;
  uploadAsset(releaseId: number, assetName: string): Promise<unknown>;
  publishDraft(
    releaseId: number,
    payload: PublishDraftPayload,
  ): Promise<unknown>;
  waitForReleaseConvergence?(attempt: number): Promise<void>;
}

export function orchestrateGitHubRelease(
  orchestration: GitHubReleaseOrchestration,
): Promise<{
  action: "stale" | "noop" | "published";
  reason: string;
}>;

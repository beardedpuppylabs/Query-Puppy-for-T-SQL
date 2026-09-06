export interface LocalReleaseCandidateInput {
  manifestVersion: string;
  lockVersion: string;
  changelog: string;
  minimumExclusiveVersion: string;
}

export interface ReleaseAssetState {
  name: string;
  size: number;
  id?: number;
}

export interface ReleaseState {
  id?: number;
  tagName: string;
  name: string;
  body: string;
  targetCommitish: string;
  draft: boolean;
  prerelease: boolean;
  assets: ReleaseAssetState[];
}

export interface RemoteReleaseStateInput {
  expectedHeadSha: string;
  currentMainSha: string;
  tagName: string;
  tagCommitSha: string | null;
  release: ReleaseState | null;
  releaseTitle: string;
  releaseNotes: string;
  expectedAssetNames: string[];
}

export function parseReleaseVersion(value: string): number[];
export function compareReleaseVersions(left: string, right: string): number;
export function expectedVsixFilename(version: string): string;
export function extractChangelogReleaseNotes(
  changelog: string,
  version: string,
): string;
export function evaluateLocalReleaseCandidate(
  input: LocalReleaseCandidateInput,
): {
  eligible: boolean;
  reason: string;
  releaseNotes: string;
};
export function selectReleaseByTag(
  releases: ReleaseState[],
  tagName: string,
): ReleaseState | null;
export function evaluateRemoteReleaseState(input: RemoteReleaseStateInput): {
  action: "stale" | "publish" | "recover-draft" | "noop";
  reason: string;
};

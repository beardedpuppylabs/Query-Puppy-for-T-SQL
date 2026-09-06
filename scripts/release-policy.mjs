const RELEASE_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function parseReleaseVersion(value) {
  const match = RELEASE_VERSION_PATTERN.exec(value);
  if (!match) {
    throw new Error(
      `Expected a stable SemVer X.Y.Z version, received: ${value}`,
    );
  }

  return match.slice(1).map(Number);
}

export function compareReleaseVersions(left, right) {
  const leftParts = parseReleaseVersion(left);
  const rightParts = parseReleaseVersion(right);

  for (let index = 0; index < leftParts.length; index += 1) {
    const difference = leftParts[index] - rightParts[index];
    if (difference !== 0) {
      return Math.sign(difference);
    }
  }

  return 0;
}

export function expectedVsixFilename(version) {
  parseReleaseVersion(version);
  return `query-puppy-for-t-sql-${version}.vsix`;
}

export function extractChangelogReleaseNotes(changelog, version) {
  parseReleaseVersion(version);
  const headings = Array.from(
    changelog.matchAll(
      /^##[ \t]+(?:\[([^\]]+)\]|([^\s]+))(?:[ \t]+-[^\n]*)?[ \t]*$/gm,
    ),
  );
  const matches = headings.filter(
    (heading) => (heading[1] ?? heading[2]) === version,
  );

  if (matches.length !== 1) {
    throw new Error(
      `CHANGELOG.md must contain exactly one release section for ${version}; found ${matches.length}.`,
    );
  }

  const heading = matches[0];
  const headingIndex = heading.index;
  if (headingIndex === undefined) {
    throw new Error(
      `Could not locate the CHANGELOG.md section for ${version}.`,
    );
  }

  const nextHeading = headings.find(
    (candidate) => (candidate.index ?? -1) > headingIndex,
  );
  const sectionStart = headingIndex + heading[0].length;
  const sectionEnd = nextHeading?.index ?? changelog.length;
  const notes = changelog.slice(sectionStart, sectionEnd).trim();

  if (!notes) {
    throw new Error(`CHANGELOG.md release section ${version} is empty.`);
  }

  return notes;
}

export function evaluateLocalReleaseCandidate({
  manifestVersion,
  lockVersion,
  changelog,
  minimumExclusiveVersion,
}) {
  parseReleaseVersion(manifestVersion);
  parseReleaseVersion(lockVersion);
  parseReleaseVersion(minimumExclusiveVersion);

  if (manifestVersion !== lockVersion) {
    throw new Error(
      `Manifest version ${manifestVersion} does not match lockfile version ${lockVersion}.`,
    );
  }

  const releaseNotes = extractChangelogReleaseNotes(changelog, manifestVersion);
  if (compareReleaseVersions(manifestVersion, minimumExclusiveVersion) <= 0) {
    return {
      eligible: false,
      reason: `Version ${manifestVersion} is at or below the automatic-release floor ${minimumExclusiveVersion}.`,
      releaseNotes,
    };
  }

  return {
    eligible: true,
    reason: `Version ${manifestVersion} is above the automatic-release floor ${minimumExclusiveVersion}.`,
    releaseNotes,
  };
}

export function selectReleaseByTag(releases, tagName) {
  const matches = releases.filter((release) => release.tagName === tagName);
  if (matches.length > 1) {
    throw new Error(`Multiple GitHub Releases use tag ${tagName}.`);
  }
  return matches[0] ?? null;
}

function validateReleaseMetadata(release, expected) {
  if (
    release.name !== expected.releaseTitle ||
    release.body !== expected.releaseNotes ||
    release.prerelease !== false
  ) {
    throw new Error(
      `GitHub Release ${expected.tagName} has conflicting identity or metadata.`,
    );
  }
}

function classifyAssets(release, expectedAssetNames) {
  const names = release.assets.map((asset) => asset.name);
  if (new Set(names).size !== names.length) {
    throw new Error(
      `GitHub Release ${release.tagName} contains duplicate asset names.`,
    );
  }

  const unexpected = names.filter((name) => !expectedAssetNames.includes(name));
  if (unexpected.length > 0) {
    throw new Error(
      `GitHub Release ${release.tagName} contains unexpected assets: ${unexpected.join(", ")}.`,
    );
  }

  return {
    complete:
      names.length === expectedAssetNames.length &&
      expectedAssetNames.every((name) =>
        release.assets.some((asset) => asset.name === name && asset.size > 0),
      ),
  };
}

export function evaluateRemoteReleaseState({
  expectedHeadSha,
  currentMainSha,
  tagName,
  tagCommitSha,
  release,
  releaseTitle,
  releaseNotes,
  expectedAssetNames,
}) {
  if (currentMainSha !== expectedHeadSha) {
    return {
      action: "stale",
      reason: "main advanced beyond this workflow commit.",
    };
  }

  if (!release) {
    if (tagCommitSha) {
      throw new Error(`Tag ${tagName} exists without its GitHub Release.`);
    }
    return { action: "publish", reason: "No tag or GitHub Release exists." };
  }

  validateReleaseMetadata(release, {
    tagName,
    releaseTitle,
    releaseNotes,
  });

  if (tagCommitSha && tagCommitSha !== expectedHeadSha) {
    throw new Error(`Tag ${tagName} points to a different commit.`);
  }

  const assets = classifyAssets(release, expectedAssetNames);
  if (release.draft) {
    if (release.authorLogin !== "github-actions[bot]") {
      throw new Error(
        `Draft GitHub Release ${tagName} was not created by the release automation.`,
      );
    }
    if (release.targetCommitish !== expectedHeadSha && tagCommitSha) {
      throw new Error(
        `Draft GitHub Release ${tagName} cannot be retargeted because its tag already exists.`,
      );
    }
    return {
      action: "recover-draft",
      retargetDraft: release.targetCommitish !== expectedHeadSha,
      reason:
        release.targetCommitish === expectedHeadSha
          ? "An exact automation-owned draft can be completed safely."
          : "An exact tagless automation-owned draft can be retargeted and completed safely.",
    };
  }

  if (release.targetCommitish !== expectedHeadSha) {
    throw new Error(
      `Published GitHub Release ${tagName} targets a different commit.`,
    );
  }

  if (!tagCommitSha) {
    throw new Error(
      `Published GitHub Release ${tagName} has no immutable tag.`,
    );
  }
  if (!assets.complete) {
    throw new Error(
      `Published GitHub Release ${tagName} is missing required non-empty assets.`,
    );
  }

  return {
    action: "noop",
    reason: "The intended version is already fully released.",
  };
}

/**
 * Pure selection / version logic for the published N-1 gate (unit-tested,
 * no network, no fs beyond checksum verification of a supplied path).
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { NoPublishedServerN1Error } from "./typed-failures.mjs";

const PLAIN_SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/** Plain X.Y.Z only — the repo's only published version shape. Null otherwise. */
export function parsePlainSemver(value) {
  if (typeof value !== "string") return null;
  const raw = value.startsWith("v") ? value.slice(1) : value;
  if (!PLAIN_SEMVER.test(raw)) return null;
  const [major, minor, patch] = raw.split(".").map(Number);
  return { major, minor, patch, raw };
}

/** -1 / 0 / 1 on plain X.Y.Z versions. */
export function compareSemver(a, b) {
  for (const field of ["major", "minor", "patch"]) {
    if (a[field] !== b[field]) return a[field] > b[field] ? 1 : -1;
  }
  return 0;
}

export function parseTarget(target) {
  const index = target.indexOf("-");
  if (index <= 0) throw new Error(`invalid server target "${target}" (expected <platform>-<arch>)`);
  return { platform: target.slice(0, index), arch: target.slice(index + 1) };
}

export function serverArtifactAssetName(target) {
  return `server-artifact-${target}.json`;
}

export function n1TarballAssetName(version, target) {
  return `poracode-server-${version}-${target}.tar.gz`;
}

/**
 * Pick the N-1 release: the newest stable (non-draft, non-prerelease, plain
 * X.Y.Z tag) published release STRICTLY below the candidate version whose
 * asset list carries the target's `server-artifact-<target>.json`. Releases
 * that fail any requirement are recorded in the evidence with the reason, so
 * a `NO_PUBLISHED_SERVER_N1` verdict is auditable rather than a shrug.
 */
export function selectN1Release({ releases, candidateVersion, target }) {
  const candidate = parsePlainSemver(candidateVersion);
  if (!candidate) throw new Error(`candidate version is not plain X.Y.Z: "${candidateVersion}"`);
  const wantedMetadata = serverArtifactAssetName(target);

  const evidence = [];
  let best = null;
  for (const release of releases ?? []) {
    const tag =
      typeof release?.tag_name === "string" ? release.tag_name : String(release?.tag_name);
    const entry = { tag, decision: null, reason: null };
    const ignore = (reason) => {
      entry.decision = "ignored";
      entry.reason = reason;
      evidence.push(entry);
    };
    if (release?.draft === true) {
      ignore("draft");
      continue;
    }
    if (release?.prerelease === true) {
      ignore("prerelease");
      continue;
    }
    const version = parsePlainSemver(tag);
    if (!version) {
      ignore("tag is not plain X.Y.Z");
      continue;
    }
    entry.version = version.raw;
    if (compareSemver(version, candidate) >= 0) {
      ignore(`version ${version.raw} is not below candidate ${candidate.raw}`);
      continue;
    }
    const assetNames = (release.assets ?? []).map((asset) => asset?.name).filter(Boolean);
    if (!assetNames.includes(wantedMetadata)) {
      ignore(`no ${wantedMetadata} asset (assets: ${assetNames.join(", ") || "none"})`);
      continue;
    }
    entry.decision = "candidate";
    evidence.push(entry);
    if (best === null || compareSemver(version, best) > 0) best = { ...version, release };
  }

  if (best === null) {
    throw new NoPublishedServerN1Error(
      `No published stable release strictly below ${candidate.raw} publishes ` +
        `${wantedMetadata} — there is no compatible server N-1 to upgrade from.`,
      {
        candidateVersion: candidate.raw,
        target,
        wantedMetadataAsset: wantedMetadata,
        releasesConsidered: evidence.length,
        releases: evidence,
      },
    );
  }
  const chosen = evidence.find((entry) => entry.version === best.raw);
  chosen.decision = "selected";
  return {
    tag: best.release.tag_name,
    version: best.raw,
    metadataAssetName: wantedMetadata,
    evidence,
  };
}

/**
 * Fail-closed checksum verification: the published metadata is the only
 * authority for what the N-1 bytes must hash to. A missing file or a
 * mismatch throws with both digests; a release without usable checksum
 * metadata must never qualify.
 */
export function assertTarballChecksum({ tarballPath, expectedSha256 }) {
  if (typeof expectedSha256 !== "string" || !/^[0-9a-f]{64}$/u.test(expectedSha256)) {
    throw new Error(`published metadata carries no valid sha256 (got ${expectedSha256})`);
  }
  if (!existsSync(tarballPath)) throw new Error(`downloaded tarball is missing: ${tarballPath}`);
  const actual = createHash("sha256").update(readFileSync(tarballPath)).digest("hex");
  if (actual !== expectedSha256) {
    throw new Error(
      `published N-1 tarball checksum mismatch: expected ${expectedSha256}, got ${actual} ` +
        `(${tarballPath})`,
    );
  }
}

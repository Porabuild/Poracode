/**
 * Pure selection / version logic for the published N-1 gate (unit-tested,
 * no network, no fs beyond checksum verification of a supplied path).
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { NoPublishedServerN1Error } from "./typed-failures.mjs";

const PLAIN_SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const FIRST_STABLE_SERVER_VERSION = "2.0.0";
const BOOTSTRAP_NIGHTLY_TAG = /^v(2\.0\.0-nightly\.\d{12})$/u;

/** Stable X.Y.Z versions. Null otherwise. */
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
 * asset list carries the target's `server-artifact-<target>.json`. The first
 * stable server release can bootstrap from the newest published nightly on
 * its own release train. Both choices undergo the same upgrade qualification.
 */
export function selectN1Release({ releases, candidateVersion, target }) {
  const candidate = parsePlainSemver(candidateVersion);
  if (!candidate) throw new Error(`candidate version is not plain X.Y.Z: "${candidateVersion}"`);
  const wantedMetadata = serverArtifactAssetName(target);

  const evidence = [];
  let stable = null;
  let bootstrap = null;
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
      const nightly =
        candidate.raw === FIRST_STABLE_SERVER_VERSION ? BOOTSTRAP_NIGHTLY_TAG.exec(tag)?.[1] : null;
      if (!nightly) {
        ignore("prerelease");
        continue;
      }
      const assetNames = (release.assets ?? []).map((asset) => asset?.name);
      if (
        !assetNames.includes(wantedMetadata) ||
        !assetNames.includes(n1TarballAssetName(nightly, target))
      ) {
        ignore(`bootstrap nightly is missing metadata or the tarball for ${target}`);
        continue;
      }
      entry.version = nightly;
      entry.decision = "candidate";
      evidence.push(entry);
      if (bootstrap === null || nightly > bootstrap.version) bootstrap = entry;
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
    if (stable === null || compareSemver(version, stable.version) > 0) stable = { version, entry };
  }

  const chosen = stable?.entry ?? bootstrap;
  if (chosen === null) {
    const bootstrapDetail =
      candidate.raw === FIRST_STABLE_SERVER_VERSION
        ? " or matching published bootstrap nightly"
        : "";
    throw new NoPublishedServerN1Error(
      `No published stable release strictly below ${candidate.raw}${bootstrapDetail} publishes ` +
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
  chosen.decision = "selected";
  return {
    tag: chosen.tag,
    version: chosen.version,
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

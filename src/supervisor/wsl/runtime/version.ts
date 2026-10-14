import { compareVersions } from "@/shared/changelog";
import {
  MIN_ACCEPTED_NODE_MAJOR,
  PORACODE_PINNED_NODE_VERSION,
  parseNodeMajor,
} from "../../runtime/pinnedNode";

export type ParsedNodeVersion = readonly [major: number, minor: number, patch: number];

export function parseMinimumNodeVersion(
  version: string | undefined,
): ParsedNodeVersion | undefined {
  if (version === undefined) return undefined;
  const parsed = parseNodeVersion(version);
  if (!parsed) {
    throw new Error(`invalid minimum Node version "${version}"; expected a semantic version`);
  }
  return parsed;
}

export function parseNodeVersion(version: string): ParsedNodeVersion | undefined {
  const match = /^v?(\d+)\.(\d+)(?:\.(\d+))?(?:[-+][0-9A-Za-z.-]+)?$/.exec(version.trim());
  if (!match) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)];
}

/**
 * `parseNodeVersion` already rejects malformed input, so the ordering itself
 * can reuse the shared numeric-segment comparison.
 */
export function compareNodeVersions(left: ParsedNodeVersion, right: ParsedNodeVersion): number {
  return compareVersions(left.join("."), right.join("."));
}

export function nodeVersionIsAccepted(
  version: string,
  minimumVersion: ParsedNodeVersion | undefined,
): boolean {
  if (minimumVersion) {
    const parsed = parseNodeVersion(version);
    return parsed !== undefined && compareNodeVersions(parsed, minimumVersion) >= 0;
  }
  const major = parseNodeMajor(version);
  return major !== null && major >= MIN_ACCEPTED_NODE_MAJOR;
}

export function assertManagedNodeSatisfiesMinimum(
  requestedMinimum: string | undefined,
  minimumVersion: ParsedNodeVersion | undefined,
): void {
  if (!minimumVersion) return;
  const managedVersion = parseNodeVersion(PORACODE_PINNED_NODE_VERSION);
  if (managedVersion && compareNodeVersions(managedVersion, minimumVersion) >= 0) return;
  throw new Error(
    `Poracode-managed Node ${PORACODE_PINNED_NODE_VERSION} does not satisfy the requested minimum ${requestedMinimum}.`,
  );
}

/**
 * Single source of truth for the pinned Node.js LTS that poracode downloads
 * when the user doesn't have an acceptable Node available. Both the WSL
 * runtime resolver (`src/supervisor/wsl/runtime/index.ts`) and the native
 * runtime resolver (`src/supervisor/native/runtime/index.ts`) read these
 * constants. The release-prep script `scripts/refresh-node-checksums.mjs`
 * walks this file's `NODE_TARBALL_CHECKSUMS` table and replaces it with
 * fresh values from nodejs.org's official SHASUMS256.txt.
 */

/**
 * Pinned Node LTS version. Bumped manually with new LTS releases. Keep in
 * lockstep with `MIN_ACCEPTED_NODE_MAJOR`. After bumping, run
 * `node scripts/refresh-node-checksums.mjs` to refresh the table below.
 */
export const PORACODE_PINNED_NODE_VERSION = "22.14.0";

/**
 * Minimum Node major version we accept from the user's environment. Below
 * this, we fall back to poracode-managed runtime. Same major as
 * `PORACODE_PINNED_NODE_VERSION` so we have a single supported version line
 * for testing/debugging.
 */
export const MIN_ACCEPTED_NODE_MAJOR = 22;

/**
 * All target triples that map to an official nodejs.org tarball/zip we ship
 * a checksum for. Both WSL (linux-*) and native (darwin-*, win-*) consume
 * these. Linux arm64 also covers WSL on ARM Windows hosts.
 */
export type NodeTargetTriple =
  | "linux-x64"
  | "linux-arm64"
  | "darwin-x64"
  | "darwin-arm64"
  | "win-x64"
  | "win-arm64";

/**
 * SHA256 checksums for the pinned Node archives, parsed from the official
 * nodejs.org SHASUMS256.txt. Updated by `scripts/refresh-node-checksums.mjs`.
 *
 * - linux-* are `.tar.xz` (used by WSL extract via the distro's `tar`).
 * - darwin-* are `.tar.xz` (extracted natively via Windows/macOS `tar`).
 * - win-* are `.zip` (extracted natively via Windows `tar.exe -xf`, which
 *   transparently handles zip).
 *
 * If a checksum is empty, install fails loudly — refresh after bumping
 * `PORACODE_PINNED_NODE_VERSION`.
 */
export const NODE_TARBALL_CHECKSUMS: Record<NodeTargetTriple, string> = {
  // node-v22.14.0-linux-x64.tar.xz
  "linux-x64": "69b09dba5c8dcb05c4e4273a4340db1005abeafe3927efda2bc5b249e80437ec",
  // node-v22.14.0-linux-arm64.tar.xz
  "linux-arm64": "08bfbf538bad0e8cbb0269f0173cca28d705874a67a22f60b57d99dc99e30050",
  // node-v22.14.0-darwin-x64.tar.xz
  "darwin-x64": "deb5b211c25f3f803cd49c1c3fc3964e6c3725546d7d9608d994270388dcbf02",
  // node-v22.14.0-darwin-arm64.tar.xz
  "darwin-arm64": "4e845cb71b4e897289312743b2e31c405a8a48720655404d82a4dce23fc43527",
  // node-v22.14.0-win-x64.zip
  "win-x64": "55b639295920b219bb2acbcfa00f90393a2789095b7323f79475c9f34795f217",
  // node-v22.14.0-win-arm64.zip
  "win-arm64": "2d71f5f9b2fffa33baa108c07d74b0d24e0c3dd8f441d567772ae0e3dd4b1a22",
};

export function nodeArchiveExtension(target: NodeTargetTriple): "tar.xz" | "zip" {
  return target.startsWith("win-") ? "zip" : "tar.xz";
}

export function nodeArchiveFileName(target: NodeTargetTriple): string {
  return `node-v${PORACODE_PINNED_NODE_VERSION}-${target}.${nodeArchiveExtension(target)}`;
}

export function nodeArchiveDirName(target: NodeTargetTriple): string {
  return `node-v${PORACODE_PINNED_NODE_VERSION}-${target}`;
}

export function nodeArchiveUrl(target: NodeTargetTriple): string {
  return `https://nodejs.org/dist/v${PORACODE_PINNED_NODE_VERSION}/${nodeArchiveFileName(target)}`;
}

/**
 * POSIX archives put node under `bin/node`; Windows zips put `node.exe`
 * at the root.
 */
export function nodeBinaryRelPath(target: NodeTargetTriple): string {
  return target.startsWith("win-") ? "node.exe" : "bin/node";
}

/**
 * Map `process.platform` + `process.arch` to a target triple for the
 * native (non-WSL) runtime install. Returns null for unsupported targets
 * (e.g. linux-x86, freebsd, etc.) — caller falls back to Electron-as-Node.
 */
export function detectNativeNodeTarget(
  platform: NodeJS.Platform = process.platform,
  arch: NodeJS.Architecture = process.arch,
): NodeTargetTriple | null {
  if (platform === "linux") {
    if (arch === "x64") return "linux-x64";
    if (arch === "arm64") return "linux-arm64";
    return null;
  }
  if (platform === "darwin") {
    if (arch === "x64") return "darwin-x64";
    if (arch === "arm64") return "darwin-arm64";
    return null;
  }
  if (platform === "win32") {
    if (arch === "x64") return "win-x64";
    if (arch === "arm64") return "win-arm64";
    return null;
  }
  return null;
}

/** Parse the major version from a Node version string ("22.11.0" → 22). */
export function parseNodeMajor(version: string): number | null {
  const match = /^v?(\d+)\./.exec(version);
  if (!match) return null;
  const n = Number.parseInt(match[1]!, 10);
  return Number.isFinite(n) ? n : null;
}

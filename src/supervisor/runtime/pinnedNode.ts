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
 * `pnpm tsx scripts/refresh-node-checksums.mjs` to refresh the table below.
 */
export const PORACODE_PINNED_NODE_VERSION = "22.11.0";

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
  // node-v22.11.0-linux-x64.tar.xz
  "linux-x64": "83bf07dd343002a26211cf1fcd46a9d9534219aad42ee02847816940bf610a72",
  // node-v22.11.0-linux-arm64.tar.xz
  "linux-arm64": "6031d04b98f59ff0f7cb98566f65b115ecd893d3b7870821171708cdbaf7ae6e",
  // node-v22.11.0-darwin-x64.tar.xz
  "darwin-x64": "ab28d1784625d151e3f608a9412a009118f376118ed842ae643f8c2efdfb0af6",
  // node-v22.11.0-darwin-arm64.tar.xz
  "darwin-arm64": "c379a90c6aa605b74042a233ddcda4247b347ba5732007d280e44422cc8f9ecb",
  // node-v22.11.0-win-x64.zip
  "win-x64": "905373a059aecaf7f48c1ce10ffbd5334457ca00f678747f19db5ea7d256c236",
  // node-v22.11.0-win-arm64.zip
  "win-arm64": "b9ff5a6b6ffb68a0ffec82cc5664ed48247dabbd25ee6d129facd2f65a8ca80d",
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

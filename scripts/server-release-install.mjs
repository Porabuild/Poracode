#!/usr/bin/env node
/**
 * Shared release-directory install for the standalone server artifact.
 *
 * One implementation is used by the prefix installer
 * (`scripts/install-server-prefix.mjs`), the in-place upgrade path
 * (`src/server/serverUpgrade.ts`), the out-of-checkout qualification
 * (`scripts/server-install-qualification.mjs`) and the Dockerfile flow:
 * extract safely → `npm install --omit=dev --ignore-scripts` → apply the
 * verified native overlay (the same order the Dockerfile uses, and the only
 * order where npm's reify cannot delete the staged bindings).
 *
 * A published artifact is untrusted input for the extracting host, so the
 * archive is validated before a single byte is written:
 * - every entry must be a relative path with no `..` segment and no absolute
 *   or drive-qualified path,
 * - symlink and hardlink entries are refused (the artifact never contains
 *   them, so a link is either corruption or an escape attempt).
 *
 * This file ships inside the server tarball as
 * `scripts/server-release-install.mjs` so a launcher can run the very same
 * install contract it is about to execute.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { isAbsolute, join, normalize, relative, sep } from "node:path";
import { applyServerNativeOverlay } from "./server-native-overlay.mjs";

/** The one npm invocation the standalone runtime install uses. */
export const RUNTIME_NPM_INSTALL_ARGS = [
  "install",
  "--omit=dev",
  "--no-audit",
  "--no-fund",
  "--loglevel=error",
];

/**
 * The shared release install must never let a package's install script run: the
 * staged native overlay is the only source of bindings, and `node-pty`'s
 * install probe would fall back to `node-gyp rebuild` when it cannot find a
 * prebuild — a compiler the qualified host does not have. D4's upgrade path
 * keeps `RUNTIME_NPM_INSTALL_ARGS` unchanged (it applies the overlay before its
 * own install), so this flag is opt-in rather than part of the shared array.
 */
export const RUNTIME_NPM_INSTALL_ARGS_IGNORE_SCRIPTS = [
  ...RUNTIME_NPM_INSTALL_ARGS,
  "--ignore-scripts",
];

export class UnsafeServerTarballError extends Error {
  constructor(message) {
    super(message);
    this.name = "UnsafeServerTarballError";
  }
}

/** True for a path that stays inside the extraction root. */
function isContainedRelativePath(entry) {
  if (typeof entry !== "string" || entry.length === 0) return false;
  if (isAbsolute(entry) || /^[A-Za-z]:[\\/]/u.test(entry) || entry.startsWith("\\\\")) return false;
  const normalized = normalize(entry);
  if (normalized === ".." || normalized.startsWith(`..${sep}`)) return false;
  return !normalized.split(/[\\/]/u).includes("..");
}

/**
 * Refuse an archive whose entry list would escape the extraction root or
 * plant links. `verboseListing` is `tar -tvzf` output; its first column is the
 * type flag (`l` symlink, `h` hardlink, `-` regular file, `d` directory).
 */
export function assertSafeTarballEntries(entries, verboseListing) {
  for (const entry of entries) {
    if (!isContainedRelativePath(entry)) {
      throw new UnsafeServerTarballError(
        `Refusing to extract the server tarball: entry escapes the install directory (${entry}).`,
      );
    }
  }
  for (const line of verboseListing) {
    const type = line.trimStart()[0];
    if (type === "l" || type === "h") {
      throw new UnsafeServerTarballError(
        `Refusing to extract the server tarball: link entry is not allowed (${line.trim()}).`,
      );
    }
  }
}

function defaultRun(command, args, options = {}) {
  return execFileSync(command, args, { stdio: "pipe", ...options });
}

/** List entries, validate them, then extract into `destination`. */
export function extractServerTarball(options) {
  const run = options.run ?? defaultRun;
  const tar = options.tar ?? "tar";
  const names = run(tar, ["-tzf", options.tarball], { encoding: "utf8" })
    .toString("utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line !== ".");
  const verbose = run(tar, ["-tvzf", options.tarball], { encoding: "utf8" })
    .toString("utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0);
  assertSafeTarballEntries(names, verbose);
  mkdirSync(options.destination, { recursive: true });
  run(tar, ["-xzf", options.tarball, "-C", options.destination], { stdio: "pipe" });
  return { entries: names.length };
}

export function npmInstallRuntimeDependencies(releaseDir, options = {}) {
  const run = options.run ?? defaultRun;
  const npm = options.npm ?? "npm";
  const args = options.ignoreScripts
    ? RUNTIME_NPM_INSTALL_ARGS_IGNORE_SCRIPTS
    : RUNTIME_NPM_INSTALL_ARGS;
  run(npm, args, { cwd: releaseDir, stdio: "inherit" });
}

/**
 * Extract one release directory and make it loadable without a toolchain.
 *
 * Order matters (D3 clean-host contract): install with `--ignore-scripts`
 * first, then apply the verified native overlay. The stage ships
 * `node_modules`-less, and npm's reify deletes an overlay planted before it
 * (a staged `node_modules/node-pty/prebuilds/<target>` has no package.json),
 * so applying the overlay first loses the prebuild and makes node-pty fall
 * back to a compiler. Applying it after reify is the Dockerfile order, and it
 * is the only order that survives npm 12 (install scripts blocked by default).
 */
export function installServerRelease(options) {
  extractServerTarball({ ...options, destination: options.releaseDir });
  if (options.skipNpmInstall !== true) {
    npmInstallRuntimeDependencies(options.releaseDir, { ...options, ignoreScripts: true });
  }
  const overlayRoot = join(options.releaseDir, "native-overlay");
  let overlayApplied = false;
  if (existsSync(join(overlayRoot, "node-pty", "overlay.json"))) {
    applyServerNativeOverlay({ prefix: options.releaseDir, overlayRoot });
    overlayApplied = true;
  }
  return { releaseDir: options.releaseDir, overlayApplied };
}

/** Point `<prefix>/current` at a release directory (relative symlink). */
export function writeCurrentSymlink(prefix, releaseDir) {
  const current = join(prefix, "current");
  rmSync(current, { force: true });
  const target = relative(prefix, releaseDir) || ".";
  symlinkSync(target, current, "dir");
}

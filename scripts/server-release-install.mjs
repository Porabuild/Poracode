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
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { isAbsolute, join, normalize, sep } from "node:path";
import {
  npmInvocation,
  removeDirectoryLink,
  resolveTar,
  retryTransientFsSync,
  tarCommand,
  writeDirectoryLink,
} from "./server-host-tools.mjs";
import { applyServerNativeOverlay, runtimePlatformKey } from "./server-native-overlay.mjs";

/**
 * Self-contained ("standalone") archives are the server tarball plus an
 * installed `node_modules`, a pinned Node executable under `runtime/`, and a
 * `standalone.json` marker (written by `scripts/build-standalone-archive.mjs`).
 * They install without npm, a registry or a host Node. Format 1 is closed:
 * unknown kinds or future formats refuse before any install effect. The marker
 * is additive to the prefix layout, so older installers still treat the
 * archive as an ordinary tarball (their npm install reconciles the tree).
 */
export const STANDALONE_RUNTIME_FILE = "standalone.json";
export const STANDALONE_RUNTIME_KIND = "poracode-standalone-runtime";
export const STANDALONE_RUNTIME_FORMAT_VERSION = 1;

export class StandaloneRuntimeError extends Error {
  constructor(message) {
    super(message);
    this.name = "StandaloneRuntimeError";
  }
}

/** `<platform>-<arch>` in the overlay/tarball vocabulary (`linuxmusl-*` on musl). */
export function hostRuntimeTarget() {
  return `${runtimePlatformKey()}-${process.arch}`;
}

/**
 * Read and validate a release directory's standalone marker; `null` when the
 * release is an ordinary (npm-installed) tarball.
 */
export function readStandaloneRuntimeMarker(releaseDir) {
  const path = join(releaseDir, STANDALONE_RUNTIME_FILE);
  if (!existsSync(path)) return null;
  let marker;
  try {
    marker = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new StandaloneRuntimeError(
      `${path} is not readable JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (
    !marker ||
    typeof marker !== "object" ||
    marker.kind !== STANDALONE_RUNTIME_KIND ||
    marker.formatVersion !== STANDALONE_RUNTIME_FORMAT_VERSION
  ) {
    throw new StandaloneRuntimeError(
      `${path} is not a format-${STANDALONE_RUNTIME_FORMAT_VERSION} standalone runtime marker; ` +
        "a newer or foreign archive is never installed by this installer.",
    );
  }
  const executable = marker.node?.executable;
  if (
    typeof marker.version !== "string" ||
    typeof marker.target !== "string" ||
    typeof marker.node?.version !== "string" ||
    !isContainedRelativePath(executable) ||
    !String(executable).startsWith("runtime/")
  ) {
    throw new StandaloneRuntimeError(`${path} is missing its version, target or node executable.`);
  }
  return marker;
}

/** Absolute path of the bundled Node executable a standalone release runs with. */
export function standaloneNodeExecutable(releaseDir, marker) {
  return join(releaseDir, ...marker.node.executable.split("/"));
}

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

/**
 * Archive listings are captured whole. A standalone archive carries its
 * installed node_modules (tens of thousands of entries), far past
 * execFileSync's 1 MiB default, so listings get an explicit bound.
 */
export const ARCHIVE_LISTING_MAX_BUFFER = 256 * 1024 * 1024;

/** List entries, validate them, then extract into `destination`. */
export function extractServerTarball(options) {
  const run = options.run ?? defaultRun;
  const tool = options.tar
    ? { command: options.tar, baseArgs: [] }
    : resolveTar(options.tarResolution);
  const tar = (args) => tarCommand(tool, args);
  const listing = { encoding: "utf8", maxBuffer: ARCHIVE_LISTING_MAX_BUFFER };
  const names = run(...tar(["-tzf", options.tarball]), listing)
    .toString("utf8")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line !== ".");
  const verbose = run(...tar(["-tvzf", options.tarball]), listing)
    .toString("utf8")
    .split(/\r?\n/u)
    .filter((line) => line.trim().length > 0);
  assertSafeTarballEntries(names, verbose);
  mkdirSync(options.destination, { recursive: true });
  run(...tar(["-xzf", options.tarball, "-C", options.destination]), { stdio: "pipe" });
  return { entries: names.length };
}

export function npmInstallRuntimeDependencies(releaseDir, options = {}) {
  const run = options.run ?? defaultRun;
  const args = options.ignoreScripts
    ? RUNTIME_NPM_INSTALL_ARGS_IGNORE_SCRIPTS
    : RUNTIME_NPM_INSTALL_ARGS;
  const invocation = options.npm
    ? { command: options.npm, args: [...args], shell: false }
    : npmInvocation(args, options.npmResolution);
  run(invocation.command, invocation.args, {
    cwd: releaseDir,
    stdio: "inherit",
    ...(invocation.shell ? { shell: true } : {}),
  });
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
  // A standalone archive already carries its installed dependencies, applied
  // native overlay and Node executable, all built for exactly one target.
  const standalone = readStandaloneRuntimeMarker(options.releaseDir);
  if (standalone) {
    const host = options.hostTarget ?? hostRuntimeTarget();
    if (standalone.target !== host) {
      throw new StandaloneRuntimeError(
        `This self-contained archive is built for ${standalone.target}, but this host is ${host}. ` +
          "Download the archive for this platform.",
      );
    }
    if (!existsSync(standaloneNodeExecutable(options.releaseDir, standalone))) {
      throw new StandaloneRuntimeError(
        `The self-contained archive is missing its Node executable (${standalone.node.executable}).`,
      );
    }
    return { releaseDir: options.releaseDir, overlayApplied: false, standalone: true };
  }
  if (options.skipNpmInstall !== true) {
    npmInstallRuntimeDependencies(options.releaseDir, { ...options, ignoreScripts: true });
  }
  const overlayRoot = join(options.releaseDir, "native-overlay");
  let overlayApplied = false;
  if (existsSync(join(overlayRoot, "node-pty", "overlay.json"))) {
    applyServerNativeOverlay({ prefix: options.releaseDir, overlayRoot });
    overlayApplied = true;
  }
  return { releaseDir: options.releaseDir, overlayApplied, standalone: false };
}

/**
 * Point `<prefix>/current` at a release directory: a relative symlink on POSIX,
 * a junction on Windows (no symlink privilege required). The old link is
 * removed first; removal and creation ride out transient Windows file locks.
 */
export function writeCurrentSymlink(prefix, releaseDir, options = {}) {
  const current = join(prefix, "current");
  const retry = options.retry ?? {};
  retryTransientFsSync(() => removeDirectoryLink(current, options), retry);
  retryTransientFsSync(() => writeDirectoryLink(current, releaseDir, options), retry);
}

/**
 * WSL Node runtime resolver.
 *
 * Single entry point for "give me an absolute path to a usable Node binary
 * inside <distro>". Two paths:
 *
 *   1. Probe the user's login shell for an existing `node`. If it resolves
 *      to a binary at version >= MIN_ACCEPTED_NODE_MAJOR, use it. Re-probed
 *      every supervisor boot so nvm version changes are picked up.
 *
 *   2. If no acceptable node is found, download the pinned LTS Node tarball
 *      from nodejs.org, verify SHA256, stage it via `\\wsl.localhost\` UNC,
 *      and extract inside the distro using its own `tar`.
 *
 * In both cases the returned `nodePath` is an absolute Linux path baked
 * into hook commands and the bridge launch argv. /bin/sh -c never needs
 * to resolve `node` from PATH.
 */

import { execFile } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { toWslUncPath } from "@/shared/wsl";
import {
  batchWslCommandsAsync,
  execInWsl,
  getWslCommand,
  resolveWslHomeDirectoryAsync,
} from "../../agents/base";
import { pruneStaleRuntimeDirs, safeRm } from "../../runtime/cleanup";
import { downloadToFile, verifySha256 } from "../../runtime/download";
import {
  LIGHTCODE_PINNED_NODE_VERSION,
  MIN_ACCEPTED_NODE_MAJOR,
  NODE_TARBALL_CHECKSUMS,
  nodeArchiveDirName,
  nodeArchiveFileName,
  nodeArchiveUrl,
  parseNodeMajor,
  type NodeTargetTriple as SharedNodeTargetTriple,
} from "../../runtime/pinnedNode";
import { spawnAndAwaitExit } from "../../runtime/spawn";

export { LIGHTCODE_PINNED_NODE_VERSION, MIN_ACCEPTED_NODE_MAJOR, NODE_TARBALL_CHECKSUMS };

export type LinuxArch = "x64" | "arm64";
/**
 * Subset of `NodeTargetTriple` that this WSL resolver actually downloads —
 * always glibc Linux tarballs. The wider native targets (darwin-*, win-*)
 * are handled by `src/supervisor/native/runtime`.
 */
export type NodeTargetTriple = Extract<SharedNodeTargetTriple, "linux-x64" | "linux-arm64">;
const execFileAsync = promisify(execFile);

// ── Cache ────────────────────────────────────────────────────────────────

export interface ResolvedNode {
  /** Absolute Linux path to the node binary inside the distro. */
  nodePath: string;
  /** Version string, e.g. "22.11.0". */
  nodeVersion: string;
  /** Whether we found the user's node or installed our own. */
  source: "user-installed" | "lightcode-managed";
}

/**
 * Cleared on supervisor restart so users picking up a new nvm default get
 * re-probed without manual action.
 */
const distroNodeCache = new Map<string, ResolvedNode>();

// ── Progress reporting ───────────────────────────────────────────────────

export type RuntimeProgressEvent =
  | { kind: "probe-start" }
  | { kind: "probe-result"; resolved: "found" | "missing" | "too-old"; version?: string }
  | {
      kind: "download-start";
      url: string;
      target: NodeTargetTriple;
      sizeBytes?: number;
    }
  | { kind: "download-progress"; bytesReceived: number; bytesTotal: number }
  | { kind: "verify-start" }
  | { kind: "extract-start" }
  | { kind: "ready"; nodePath: string };

export type RuntimeProgressListener = (event: RuntimeProgressEvent) => void;

export interface ResolveNodeOptions {
  onProgress?: RuntimeProgressListener;
  useBridge?: boolean;
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Resolve a usable Node binary inside `distro`. Probes once per supervisor
 * lifetime (cheap, ~50ms via login shell); falls back to downloading the
 * pinned LTS if no acceptable node is found.
 */
export async function resolveNodeForDistro(
  distro: string,
  options?: ResolveNodeOptions,
): Promise<ResolvedNode> {
  const cached = distroNodeCache.get(distro);
  if (cached) {
    if (cached.source === "user-installed" || existsSync(toWslUncPath(distro, cached.nodePath))) {
      options?.onProgress?.({ kind: "ready", nodePath: cached.nodePath });
      return cached;
    }
    distroNodeCache.delete(distro);
  }

  options?.onProgress?.({ kind: "probe-start" });
  const useBridge = options?.useBridge !== false;
  const probed = await probeUserNode(distro, { useBridge });

  if (probed) {
    const major = parseNodeMajor(probed.version);
    if (major !== null && major >= MIN_ACCEPTED_NODE_MAJOR) {
      options?.onProgress?.({ kind: "probe-result", resolved: "found", version: probed.version });
      const resolved: ResolvedNode = {
        nodePath: probed.nodePath,
        nodeVersion: probed.version,
        source: "user-installed",
      };
      distroNodeCache.set(distro, resolved);
      options?.onProgress?.({ kind: "ready", nodePath: probed.nodePath });
      return resolved;
    }
    options?.onProgress?.({ kind: "probe-result", resolved: "too-old", version: probed.version });
  } else {
    options?.onProgress?.({ kind: "probe-result", resolved: "missing" });
  }

  const installed = await installRuntimeIntoDistro(distro, options);
  const resolved: ResolvedNode = {
    nodePath: installed.nodePath,
    nodeVersion: LIGHTCODE_PINNED_NODE_VERSION,
    source: "lightcode-managed",
  };
  distroNodeCache.set(distro, resolved);
  options?.onProgress?.({ kind: "ready", nodePath: installed.nodePath });
  return resolved;
}

// ── Probe ────────────────────────────────────────────────────────────────

/**
 * Run `command -v node && node --version` through the user's login shell.
 * Login shells source `.bashrc`/`.zshrc` which load nvm/fnm, so this
 * surfaces the user's nvm-default node even when /bin/sh's PATH wouldn't
 * find it. Returns null when no node is found.
 */
export async function probeUserNode(
  distro: string,
  options?: { useBridge?: boolean },
): Promise<{ nodePath: string; version: string } | null> {
  const commands = ["command -v node", "node --version 2>/dev/null"];
  const [pathResult, versionResult] =
    options?.useBridge === false
      ? await batchWslCommandsForBootstrap(distro, commands)
      : await batchWslCommandsAsync(distro, commands);

  const nodePath = (pathResult?.stdout ?? "").trim();
  const versionRaw = (versionResult?.stdout ?? "").trim();
  if (!nodePath || !nodePath.startsWith("/")) return null;
  if (!versionRaw.startsWith("v")) return null;
  const version = versionRaw.slice(1).split(/\s/)[0] ?? "";
  if (!parseNodeMajor(version)) return null;
  return { nodePath, version };
}

async function probeDistroArch(distro: string): Promise<LinuxArch | null> {
  const [archResult] = await batchWslCommandsAsync(distro, ["uname -m"]);
  const out = (archResult?.stdout ?? "").trim();
  if (out === "x86_64" || out === "amd64") return "x64";
  if (out === "aarch64" || out === "arm64") return "arm64";
  return null;
}

async function probeDistroArchForBootstrap(distro: string): Promise<LinuxArch | null> {
  const [archResult] = await batchWslCommandsForBootstrap(distro, ["uname -m"]);
  const out = (archResult?.stdout ?? "").trim();
  if (out === "x86_64" || out === "amd64") return "x64";
  if (out === "aarch64" || out === "arm64") return "arm64";
  return null;
}

async function batchWslCommandsForBootstrap(
  distro: string,
  commands: string[],
): Promise<{ ok: boolean; stdout: string }[]> {
  const sep = "---LIGHTCODE_BOOTSTRAP_BATCH_SEP---";
  const script = commands.map((cmd) => `(${cmd}) 2>/dev/null; printf '\\n${sep}\\n'`).join("\n");
  try {
    const { stdout } = await execFileAsync(
      getWslCommand(),
      ["-d", distro, "--", "/bin/bash", "-l", "-i", "-c", script],
      { encoding: "utf8", windowsHide: true, timeout: 15_000 },
    );
    const parts = stdout.split(sep);
    return commands.map((_, index) => {
      const raw = (parts[index] ?? "").trim();
      return { ok: raw.length > 0, stdout: raw };
    });
  } catch {
    return commands.map(() => ({ ok: false, stdout: "" }));
  }
}

async function resolveWslHomeDirectoryForBootstrap(distro: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync(
      getWslCommand(),
      ["-d", distro, "--", "sh", "-lc", 'printf %s "$HOME"'],
      { encoding: "utf8", windowsHide: true, timeout: 5_000 },
    );
    const home = (stdout ?? "")
      .split(/\r?\n/g)
      .map((line) => line.trim())
      .findLast((line) => line.length > 0);
    return home;
  } catch {
    return undefined;
  }
}

// ── Install ──────────────────────────────────────────────────────────────

/**
 * Download and extract the pinned Node tarball into the distro. Throws
 * with a descriptive Error on failure (no arch, no checksum, network
 * failure, archive corruption, etc.). Only the official glibc tarballs
 * are supported here — Alpine/musl users are expected to surface their
 * own node via the probe.
 */
export async function installRuntimeIntoDistro(
  distro: string,
  options?: ResolveNodeOptions,
): Promise<{ nodePath: string }> {
  const useBridge = options?.useBridge !== false;
  const arch = useBridge
    ? await probeDistroArch(distro)
    : await probeDistroArchForBootstrap(distro);
  if (!arch) {
    throw new Error(`could not detect architecture for WSL distro "${distro}"`);
  }
  const target: NodeTargetTriple = `linux-${arch}` as const;

  const checksum = NODE_TARBALL_CHECKSUMS[target];
  if (!checksum) {
    throw new Error(
      `lightcode is missing the SHA256 checksum for Node ${LIGHTCODE_PINNED_NODE_VERSION} ${target}; rerun scripts/refresh-node-checksums.mjs`,
    );
  }

  const home = useBridge
    ? await resolveWslHomeDirectoryAsync(distro)
    : await resolveWslHomeDirectoryForBootstrap(distro);
  if (!home) {
    throw new Error(`could not resolve $HOME inside WSL distro "${distro}"`);
  }

  const linuxRuntimeDir = `${home}/.poracode/runtime`;
  const versionedDirName = nodeArchiveDirName(target);
  const linuxNodePath = `${linuxRuntimeDir}/${versionedDirName}/bin/node`;
  const uncNodePath = toWslUncPath(distro, linuxNodePath);

  if (existsSync(uncNodePath)) {
    return { nodePath: linuxNodePath };
  }

  const tarballName = nodeArchiveFileName(target);
  const url = nodeArchiveUrl(target);

  options?.onProgress?.({ kind: "download-start", url, target });
  const tmpTarball = join(tmpdir(), `lightcode-node-${Date.now()}-${tarballName}`);
  try {
    await downloadToFile(url, tmpTarball, {
      ...(options?.onProgress
        ? {
            onProgress: ({ bytesReceived, bytesTotal }) =>
              options.onProgress?.({
                kind: "download-progress",
                bytesReceived,
                bytesTotal,
              }),
          }
        : {}),
    });
    options?.onProgress?.({ kind: "verify-start" });
    await verifySha256(tmpTarball, checksum);

    // Stage the tarball into the distro via UNC, then ask the distro's
    // own tar to extract it (saves marshalling bytes back through wsl.exe
    // stdin and lets us use tar's xz/strip-components flags directly).
    const uncRuntimeDir = toWslUncPath(distro, linuxRuntimeDir);
    mkdirSync(uncRuntimeDir, { recursive: true });
    const stagedLinuxPath = `${linuxRuntimeDir}/${tarballName}`;
    const stagedUncPath = toWslUncPath(distro, stagedLinuxPath);
    copyFileSync(tmpTarball, stagedUncPath);

    options?.onProgress?.({ kind: "extract-start" });
    if (useBridge) {
      await execInWsl(distro, "/", "tar", ["-xJf", stagedLinuxPath, "-C", linuxRuntimeDir], {
        timeout: 60_000,
      });
    } else {
      await spawnAndAwaitExit(getWslCommand(), [
        "-d",
        distro,
        "--",
        "tar",
        "-xJf",
        stagedLinuxPath,
        "-C",
        linuxRuntimeDir,
      ]);
    }

    safeRm(stagedUncPath);

    if (!existsSync(uncNodePath)) {
      throw new Error(`Node binary not found at expected path after extraction: ${linuxNodePath}`);
    }
    pruneStaleRuntimeDirs(uncRuntimeDir, versionedDirName);
    return { nodePath: linuxNodePath };
  } finally {
    safeRm(tmpTarball);
  }
}

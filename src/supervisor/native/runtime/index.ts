/**
 * Native Node runtime resolver.
 *
 * Symmetric to the WSL resolver in `src/supervisor/wsl/runtime/index.ts`,
 * but for the host platform (mac/linux/win32). Three layers, in order of
 * cost:
 *
 *   1. **Poracode-managed runtime** (zero-shell-spawn fast path).
 *      A previous background install dropped the pinned LTS at
 *      `~/.poracode/runtime/<archive-dir>/`. A single `existsSync` decides.
 *
 *   2. **Login-shell probe.** On mac/linux, GUI-launched apps don't inherit
 *      the user's interactive PATH (no Homebrew, no nvm, no fnm) — so we
 *      spawn `bash -lic` / `zsh -lic` to source the user's rc files and
 *      surface their `node`. On Windows, the registry-driven user PATH is
 *      already inherited by Electron, so `where.exe node` is enough.
 *
 *   3. **Background install.** When 1 + 2 both miss, we kick off a
 *      fire-and-forget download of the pinned LTS archive into
 *      `~/.poracode/runtime/`. The current install pass falls back to
 *      Electron-as-Node for this boot; the next supervisor boot picks up
 *      the managed runtime via the fast path.
 *
 * Resolution result is memoized for the supervisor lifetime — every
 * provider's installer shares one probe, so the login-shell spawn cost
 * is paid once per process.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, renameSync } from "node:fs";
import { join } from "node:path";
import { resolvePoracodePaths } from "@/shared/poracodePaths";
import { pruneStaleRuntimeDirs, safeRm } from "../../runtime/cleanup";
import { downloadToFile, verifySha256 } from "../../runtime/download";
import {
  PORACODE_PINNED_NODE_VERSION,
  MIN_ACCEPTED_NODE_MAJOR,
  NODE_TARBALL_CHECKSUMS,
  detectNativeNodeTarget,
  nodeArchiveDirName,
  nodeArchiveFileName,
  nodeArchiveUrl,
  nodeBinaryRelPath,
  parseNodeMajor,
  type NodeTargetTriple,
} from "../../runtime/pinnedNode";
import { spawnAndAwaitExit } from "../../runtime/spawn";

// ── Public types ─────────────────────────────────────────────────────────

export interface ResolvedNativeNode {
  /** Absolute path to a usable Node binary on the host. */
  nodePath: string;
  /** Reported version, e.g. "22.11.0". */
  nodeVersion: string;
  /** How we found it — useful for logs and tests. */
  source: "user-installed" | "poracode-managed";
}

export interface NativeRuntimeProgressEvent {
  kind:
    | "probe-start"
    | "probe-found-managed"
    | "probe-found-user"
    | "probe-missing"
    | "background-install-start"
    | "background-install-progress"
    | "background-install-ready"
    | "background-install-failed";
  nodePath?: string;
  version?: string;
  bytesReceived?: number;
  bytesTotal?: number;
  reason?: string;
}

export type NativeRuntimeProgressListener = (event: NativeRuntimeProgressEvent) => void;

export interface ResolveNativeNodeOptions {
  /** Override `~/.poracode` for tests / dev runs. */
  baseDir?: string;
  /** Optional progress sink. */
  onProgress?: NativeRuntimeProgressListener;
  /**
   * Skip the background install kick-off when the resolver falls back to
   * Electron-as-Node. Tests pass this so they don't spawn network I/O.
   */
  skipBackgroundInstall?: boolean;
}

// ── Resolution cache ─────────────────────────────────────────────────────

/**
 * In-flight or resolved result, keyed by base dir. The promise is shared
 * so concurrent installers hitting `resolveNativeNode` race-free converge
 * on one probe (single login-shell spawn per supervisor lifetime).
 */
const resolutionCache = new Map<string, Promise<ResolvedNativeNode | null>>();

/**
 * In-flight background install per base dir. Prevents stacking concurrent
 * downloads when multiple providers race to resolve at boot.
 */
const backgroundInstallCache = new Map<string, Promise<{ nodePath: string } | null>>();

export function resetNativeRuntimeCacheForTests(): void {
  resolutionCache.clear();
  backgroundInstallCache.clear();
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Resolve a usable native Node binary for the host. Returns `null` when no
 * acceptable runtime is found (callers fall back to Electron-as-Node).
 *
 * Side effect on miss: kicks off a background download of the pinned LTS
 * (unless `skipBackgroundInstall` is set). The background promise is
 * fire-and-forget — this call returns null without awaiting it.
 */
export function resolveNativeNode(
  options?: ResolveNativeNodeOptions,
): Promise<ResolvedNativeNode | null> {
  const key = options?.baseDir ?? "";
  const cached = resolutionCache.get(key);
  if (cached) return cached;
  const promise = resolveNativeNodeUncached(options);
  resolutionCache.set(key, promise);
  return promise;
}

async function resolveNativeNodeUncached(
  options: ResolveNativeNodeOptions | undefined,
): Promise<ResolvedNativeNode | null> {
  const onProgress = options?.onProgress;
  onProgress?.({ kind: "probe-start" });

  const target = detectNativeNodeTarget();
  const baseDir = options?.baseDir ?? resolvePoracodePaths().baseDir;

  if (target) {
    const managedPath = managedNodePath(baseDir, target);
    if (existsSync(managedPath)) {
      onProgress?.({
        kind: "probe-found-managed",
        nodePath: managedPath,
        version: PORACODE_PINNED_NODE_VERSION,
      });
      return {
        nodePath: managedPath,
        nodeVersion: PORACODE_PINNED_NODE_VERSION,
        source: "poracode-managed",
      };
    }
  }

  const userNode = await probeUserNode();
  if (userNode) {
    onProgress?.({
      kind: "probe-found-user",
      nodePath: userNode.nodePath,
      version: userNode.version,
    });
    return {
      nodePath: userNode.nodePath,
      nodeVersion: userNode.version,
      source: "user-installed",
    };
  }

  onProgress?.({ kind: "probe-missing" });

  if (target && !options?.skipBackgroundInstall) {
    void runBackgroundInstall(baseDir, target, onProgress).catch((err) => {
      onProgress?.({
        kind: "background-install-failed",
        reason: err instanceof Error ? err.message : String(err),
      });
    });
  }

  return null;
}

/**
 * Path the managed runtime *would* live at if installed. Returned even
 * when the file doesn't exist, so callers can pre-bake it before a
 * pending background install lands.
 */
export function managedNodePath(baseDir: string, target: NodeTargetTriple): string {
  return join(baseDir, "runtime", nodeArchiveDirName(target), nodeBinaryRelPath(target));
}

// ── Probe ────────────────────────────────────────────────────────────────

export async function probeUserNode(): Promise<{ nodePath: string; version: string } | null> {
  if (process.platform === "win32") return probeWindowsNode();
  return probePosixLoginShellNode();
}

const PROBE_PATH_MARKER = "__LC_NODE_PATH__:";
const PROBE_VERSION_MARKER = "__LC_NODE_VERSION__:";
const PROBE_TIMEOUT_MS = 6_000;
const MAX_PROBE_OUTPUT_BYTES = 64 * 1024;

/**
 * Spawn the user's login shell with `-lic` so rc files load nvm/fnm/asdf
 * before we resolve `node`. We surround the output with sentinels so we
 * can extract the path/version even when the shell prints MOTDs, banners,
 * or fnm/nvm noise.
 */
async function probePosixLoginShellNode(): Promise<{ nodePath: string; version: string } | null> {
  const shell = pickPosixShell();
  const script = `echo "${PROBE_PATH_MARKER}$(command -v node)"; echo "${PROBE_VERSION_MARKER}$(node --version 2>/dev/null)"`;

  const output = await runCapturing(shell, ["-lic", script], { timeoutMs: PROBE_TIMEOUT_MS });
  if (output === null) return null;

  const nodePath = extractMarker(output, PROBE_PATH_MARKER);
  const versionRaw = extractMarker(output, PROBE_VERSION_MARKER);
  if (!nodePath || !nodePath.startsWith("/")) return null;
  if (!versionRaw || !versionRaw.startsWith("v")) return null;
  const version = versionRaw.slice(1).split(/\s/)[0] ?? "";
  const major = parseNodeMajor(version);
  if (major === null || major < MIN_ACCEPTED_NODE_MAJOR) return null;
  return { nodePath, version };
}

function pickPosixShell(): string {
  const shellEnv = process.env.SHELL;
  if (shellEnv && shellEnv.length > 0) return shellEnv;
  return process.platform === "darwin" ? "/bin/zsh" : "/bin/bash";
}

/**
 * Windows probe. Electron inherits the user's PATH from the registry, so
 * `where.exe node` finds Volta/nvm-windows/Scoop/winget node without any
 * shell init. Skips `node.cmd` shims by preferring `node.exe` lines.
 */
async function probeWindowsNode(): Promise<{ nodePath: string; version: string } | null> {
  const whereOut = await runCapturing("where.exe", ["node"], { timeoutMs: PROBE_TIMEOUT_MS });
  if (whereOut === null) return null;
  const lines = whereOut
    .split(/\r?\n/g)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const exeLine = lines.find((l) => l.toLowerCase().endsWith("node.exe")) ?? lines[0];
  if (!exeLine) return null;

  const versionOut = await runCapturing(exeLine, ["--version"], { timeoutMs: PROBE_TIMEOUT_MS });
  if (versionOut === null) return null;
  const versionRaw = versionOut
    .split(/\r?\n/g)
    .find((l) => l.trim().startsWith("v"))
    ?.trim();
  if (!versionRaw) return null;
  const version = versionRaw.slice(1).split(/\s/)[0] ?? "";
  const major = parseNodeMajor(version);
  if (major === null || major < MIN_ACCEPTED_NODE_MAJOR) return null;
  return { nodePath: exeLine, version };
}

/**
 * Spawn a process and return its stdout, or null on any failure. Bounded
 * by `timeoutMs` so a hung shell rc never blocks supervisor boot. stdout
 * is capped to the trailing 64 KiB so a chatty rc (fortune, neofetch,
 * MOTD) can't OOM us — markers we look for are echoed last anyway.
 */
function runCapturing(
  command: string,
  args: string[],
  opts: { timeoutMs: number },
): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    let settled = false;
    const finish = (value: string | null, killOnTimeout = false) => {
      if (settled) return;
      settled = true;
      // Only kill on the timeout path; the natural-exit and error paths
      // mean the child is already gone, and on Windows kill() against a
      // recycled PID would be pointed at someone else.
      if (killOnTimeout) {
        try {
          child.kill();
        } catch {
          // ESRCH if the timer fired between exit and our handler.
        }
      }
      resolve(value);
    };
    const timer = setTimeout(() => finish(null, true), opts.timeoutMs);
    child.stdout?.on("data", (chunk: Buffer) => {
      out += chunk.toString("utf8");
      if (out.length > MAX_PROBE_OUTPUT_BYTES) {
        out = out.slice(out.length - MAX_PROBE_OUTPUT_BYTES);
      }
    });
    child.on("error", () => {
      clearTimeout(timer);
      finish(null);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      finish(code === 0 ? out : null);
    });
  });
}

function extractMarker(output: string, marker: string): string | null {
  const idx = output.indexOf(marker);
  if (idx < 0) return null;
  const tail = output.slice(idx + marker.length);
  const eol = tail.indexOf("\n");
  return (eol < 0 ? tail : tail.slice(0, eol)).trim();
}

// ── Background install ───────────────────────────────────────────────────

/**
 * Install the pinned Node LTS into `<baseDir>/runtime/`. Idempotent.
 * Stages download + extraction inside `<baseDir>/runtime/.staging-*` so
 * the atomic rename into `<archive-dir>/` stays on the same volume —
 * `tmpdir()` is often on a different drive (Windows %TEMP% on C:, profile
 * on D:) which would fail with EXDEV.
 */
export async function installNativeRuntime(
  baseDir: string,
  target: NodeTargetTriple,
  onProgress?: NativeRuntimeProgressListener,
): Promise<{ nodePath: string }> {
  const finalNodePath = managedNodePath(baseDir, target);
  if (existsSync(finalNodePath)) return { nodePath: finalNodePath };

  const checksum = NODE_TARBALL_CHECKSUMS[target];
  if (!checksum) {
    throw new Error(
      `poracode is missing the SHA256 checksum for Node ${PORACODE_PINNED_NODE_VERSION} ${target}; rerun scripts/refresh-node-checksums.mjs`,
    );
  }

  const runtimeDir = join(baseDir, "runtime");
  mkdirSync(runtimeDir, { recursive: true });
  const stagingRoot = mkdtempSync(join(runtimeDir, ".staging-"));

  const url = nodeArchiveUrl(target);
  const archivePath = join(stagingRoot, nodeArchiveFileName(target));

  onProgress?.({ kind: "background-install-start" });

  try {
    await downloadToFile(url, archivePath, {
      ...(onProgress
        ? {
            onProgress: ({ bytesReceived, bytesTotal }) => {
              onProgress({ kind: "background-install-progress", bytesReceived, bytesTotal });
            },
          }
        : {}),
    });
    await verifySha256(archivePath, checksum);

    await extractArchive(archivePath, stagingRoot, target);

    const stagedDir = join(stagingRoot, nodeArchiveDirName(target));
    if (!existsSync(stagedDir)) {
      throw new Error(`extracted archive missing expected dir ${stagedDir}`);
    }

    const finalDir = join(runtimeDir, nodeArchiveDirName(target));
    if (existsSync(finalDir)) {
      // Concurrent install or earlier failure left a partial dir; the
      // runtime dir is owned exclusively by poracode, so we replace it.
      safeRm(finalDir);
    }
    renameSync(stagedDir, finalDir);

    if (!existsSync(finalNodePath)) {
      throw new Error(`node binary missing after install at ${finalNodePath}`);
    }

    pruneStaleRuntimeDirs(runtimeDir, nodeArchiveDirName(target));

    onProgress?.({ kind: "background-install-ready", nodePath: finalNodePath });
    return { nodePath: finalNodePath };
  } finally {
    safeRm(stagingRoot);
  }
}

function runBackgroundInstall(
  baseDir: string,
  target: NodeTargetTriple,
  onProgress?: NativeRuntimeProgressListener,
): Promise<{ nodePath: string } | null> {
  const key = `${baseDir}|${target}`;
  const inflight = backgroundInstallCache.get(key);
  if (inflight) return inflight;

  const promise = installNativeRuntime(baseDir, target, onProgress)
    .catch((error) => {
      console.warn("[native-runtime] background install failed:", error);
      return null;
    })
    .finally(() => {
      backgroundInstallCache.delete(key);
    });
  backgroundInstallCache.set(key, promise);
  return promise;
}

// ── Extraction ───────────────────────────────────────────────────────────

/**
 * Extract `archivePath` into `destDir`. Both `.tar.xz` (mac/linux) and
 * `.zip` (Windows) are handled by `tar` / `tar.exe` — Windows 10+ ships a
 * libarchive-based tar.exe that transparently extracts zip.
 */
async function extractArchive(
  archivePath: string,
  destDir: string,
  target: NodeTargetTriple,
): Promise<void> {
  const tarBin = process.platform === "win32" ? "tar.exe" : "tar";
  const flags = target.startsWith("win-") ? ["-xf", archivePath] : ["-xJf", archivePath];
  await spawnAndAwaitExit(tarBin, [...flags, "-C", destDir]);
}

/**
 * Native Node runtime resolver.
 *
 * Symmetric to the WSL resolver in `src/supervisor/wsl/runtime/index.ts`,
 * but for the host platform (mac/linux/win32). Four layers, in order of
 * cost:
 *
 *   1. **Poracode-managed runtime** (zero-shell-spawn fast path).
 *      A previous background install dropped the pinned LTS at
 *      `~/.poracode/runtime/<archive-dir>/`. A single `existsSync` decides.
 *
 *   2. **Compatible bare Node host.** Reuse the supervisor executable when
 *      it already runs under Node; Electron-as-Node does not qualify.
 *
 *   3. **Login-shell probe.** On mac/linux, GUI-launched apps don't inherit
 *      the user's interactive PATH (no Homebrew, no nvm, no fnm) — so we
 *      spawn `bash -lic` / `zsh -lic` to source the user's rc files and
 *      surface their `node`. On Windows, the registry-driven user PATH is
 *      already inherited by Electron, so `where.exe node` is enough.
 *
 *   4. **Background install.** When the earlier layers miss, we kick off a
 *      fire-and-forget download of the pinned LTS archive into
 *      `~/.poracode/runtime/`. The current install pass falls back to
 *      Electron-as-Node for this boot; the next supervisor boot picks up
 *      the managed runtime via the fast path.
 *
 * Resolution result is memoized for the supervisor lifetime — every
 * provider's installer shares one probe, so the login-shell spawn cost
 * is paid once per process.
 */

import { resolveHostNode } from "./hostNode";
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
import { exitCouldNotBeConfirmed, spawnAndAwaitExit } from "../../runtime/spawn";
import {
  nativeRuntimeWork,
  resetNativeRuntimeWorkForTests,
  startNativeRuntimeWork,
  stopNativeRuntimeWork,
} from "./work";

// ── Public types ─────────────────────────────────────────────────────────

export interface ResolvedNativeNode {
  /** Absolute path to a usable Node binary on the host. */
  nodePath: string;
  /** Reported version, e.g. "22.11.0". */
  nodeVersion: string;
  /** How we found it — useful for logs and tests. */
  source: "host-runtime" | "user-installed" | "poracode-managed";
}

export interface NativeRuntimeProgressEvent {
  kind:
    | "probe-start"
    | "probe-found-host"
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
  resetNativeRuntimeWorkForTests();
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
  const key = options?.baseDir ?? resolvePoracodePaths().baseDir;
  const owner = nativeRuntimeWork(key);
  owner.signal.throwIfAborted();
  const cached = resolutionCache.get(key);
  if (cached) return cached;
  const promise = owner.run(() =>
    resolveNativeNodeUncached({ ...options, baseDir: key }, owner.signal),
  );
  resolutionCache.set(key, promise);
  return promise;
}

/** Prefetch establishes the shared owner before provider installers use the resolver. */
export function startNativeRuntimeSession(baseDir: string): void {
  if (startNativeRuntimeWork(baseDir)) resolutionCache.delete(baseDir);
}

/** Stop admission, cancel I/O and join the actual probe/extraction before shutdown. */
export async function disposeNativeRuntime(baseDir: string): Promise<void> {
  await stopNativeRuntimeWork(baseDir);
}

async function resolveNativeNodeUncached(
  options: ResolveNativeNodeOptions,
  signal: AbortSignal,
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

  const hostNode = resolveHostNode();
  if (hostNode) {
    onProgress?.({
      kind: "probe-found-host",
      nodePath: hostNode.nodePath,
      version: hostNode.version,
    });
    return { nodePath: hostNode.nodePath, nodeVersion: hostNode.version, source: "host-runtime" };
  }

  const userNode = await probeUserNode(signal);
  signal.throwIfAborted();
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

export async function probeUserNode(
  signal?: AbortSignal,
): Promise<{ nodePath: string; version: string } | null> {
  if (process.platform === "win32") return probeWindowsNode(signal);
  return probePosixLoginShellNode(signal);
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
async function probePosixLoginShellNode(
  signal?: AbortSignal,
): Promise<{ nodePath: string; version: string } | null> {
  const shell = pickPosixShell();
  const script = `echo "${PROBE_PATH_MARKER}$(command -v node)"; echo "${PROBE_VERSION_MARKER}$(node --version 2>/dev/null)"`;

  const output = await runCapturing(shell, ["-lic", script], {
    timeoutMs: PROBE_TIMEOUT_MS,
    ...(signal ? { signal } : {}),
  });
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
async function probeWindowsNode(
  signal?: AbortSignal,
): Promise<{ nodePath: string; version: string } | null> {
  const whereOut = await runCapturing("where.exe", ["node"], {
    timeoutMs: PROBE_TIMEOUT_MS,
    ...(signal ? { signal } : {}),
  });
  if (whereOut === null) return null;
  const lines = whereOut
    .split(/\r?\n/g)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const exeLine = lines.find((l) => l.toLowerCase().endsWith("node.exe")) ?? lines[0];
  if (!exeLine) return null;

  const versionOut = await runCapturing(exeLine, ["--version"], {
    timeoutMs: PROBE_TIMEOUT_MS,
    ...(signal ? { signal } : {}),
  });
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
async function runCapturing(
  command: string,
  args: string[],
  opts: { timeoutMs: number; signal?: AbortSignal },
): Promise<string | null> {
  let out = "";
  try {
    await spawnAndAwaitExit(command, args, {
      ...opts,
      onStdout: (chunk) => {
        out += chunk.toString("utf8");
        if (out.length > MAX_PROBE_OUTPUT_BYTES) out = out.slice(-MAX_PROBE_OUTPUT_BYTES);
      },
    });
    return out;
  } catch (error) {
    if (opts.signal?.aborted || exitCouldNotBeConfirmed(error)) throw error;
    return null;
  }
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
  const owner = nativeRuntimeWork(baseDir);
  return owner.run(() => installNativeRuntimeOwned(baseDir, target, onProgress, owner.signal));
}

async function installNativeRuntimeOwned(
  baseDir: string,
  target: NodeTargetTriple,
  onProgress: NativeRuntimeProgressListener | undefined,
  signal: AbortSignal,
): Promise<{ nodePath: string }> {
  signal.throwIfAborted();
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
  let exitUnconfirmed = false;

  try {
    await downloadToFile(url, archivePath, {
      signal,
      ...(onProgress
        ? {
            onProgress: ({ bytesReceived, bytesTotal }) => {
              onProgress({ kind: "background-install-progress", bytesReceived, bytesTotal });
            },
          }
        : {}),
    });
    await verifySha256(archivePath, checksum, signal);
    signal.throwIfAborted();

    await extractArchive(archivePath, stagingRoot, target, signal);
    signal.throwIfAborted();

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
  } catch (error) {
    exitUnconfirmed = exitCouldNotBeConfirmed(error);
    throw error;
  } finally {
    if (!exitUnconfirmed) safeRm(stagingRoot);
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

  const owner = nativeRuntimeWork(baseDir);
  const promise = owner.run(() =>
    installNativeRuntime(baseDir, target, onProgress)
      .catch((error) => {
        if (!nativeRuntimeWork(baseDir).signal.aborted)
          console.warn("[native-runtime] background install failed:", error);
        return null;
      })
      .finally(() => {
        if (backgroundInstallCache.get(key) === promise) backgroundInstallCache.delete(key);
      }),
  );
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
  signal: AbortSignal,
): Promise<void> {
  const tarBin = process.platform === "win32" ? "tar.exe" : "tar";
  const flags = target.startsWith("win-") ? ["-xf", archivePath] : ["-xJf", archivePath];
  await spawnAndAwaitExit(tarBin, [...flags, "-C", destDir], { signal });
}

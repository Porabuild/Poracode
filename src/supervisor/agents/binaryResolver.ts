import type { ProjectLocation } from "@/shared/contracts";
import {
  findPosixExecutableInWellKnownDirs,
  getCachedExecutablePath,
  isExecutableRegularFile,
  resolveExecutablePath,
} from "./base";

// Single process-wide cache, keyed by `${distro}\0${binary}`.
// Replaces per-adapter `detectedWslExecPaths` maps so detection probes and
// launch spec resolution share one cache instead of five.
const cache = new Map<string, string | undefined>();

function keyOf(scope: string, binary: string): string {
  return `${scope}\0${binary}`;
}

/**
 * Resolve the absolute path of a CLI binary for the given project location.
 * WSL binaries are resolved inside the distro; native Windows binaries fall
 * back to the registry-backed PATH lookup so packaged apps launched outside a
 * shell can still find user-installed CLIs.
 */
export function resolveAgentBinaryPath(
  location: ProjectLocation,
  binary: string,
): string | undefined {
  if (location.kind === "windows") {
    const key = keyOf("windows", binary);
    if (cache.has(key)) {
      return cache.get(key);
    }
    const resolved = resolveExecutablePath(binary);
    cache.set(key, resolved);
    return resolved;
  }
  if (location.kind === "wsl") {
    const key = keyOf(location.distro, binary);
    return cache.get(key);
  }
  // posix: piggy-back on the shared exec-path cache populated by
  // primeExecutablePathCache during agent detection. The cached path may come
  // from a temporary login shell (e.g. fnm multishell) that has since been
  // cleaned up — verify the file still exists so node-pty doesn't get a stale
  // absolute path and fail with opaque "posix_spawnp failed".
  const cached = getCachedExecutablePath(binary);
  if (cached !== undefined && isExecutableRegularFile(cached)) return cached;
  // Cache miss (never primed, expired past the TTL, or the cached path is gone).
  // Fall back to the well-known install dirs so launch finds a binary whose dir
  // isn't on the login `$SHELL` PATH (e.g. OpenCode in ~/.opencode/bin wired
  // only into the user's fish config).
  return findPosixExecutableInWellKnownDirs(binary);
}

/**
 * Populate the cache directly. Install detection already runs `command -v`
 * as part of its probe — calling this avoids a second probe at launch time.
 */
export function primeAgentBinaryPath(
  distro: string,
  binary: string,
  path: string | undefined,
): void {
  cache.set(keyOf(distro, binary), path);
}

export function clearAgentBinaryPathCache(): void {
  cache.clear();
}

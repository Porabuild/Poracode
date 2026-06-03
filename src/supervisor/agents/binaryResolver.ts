import { statSync } from "node:fs";
import type { ProjectLocation } from "@/shared/contracts";
import { getCachedExecutablePath, resolveExecutablePath, resolveWslExecutablePath } from "./base";

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
    if (cache.has(key)) {
      return cache.get(key);
    }
    const resolved = resolveWslExecutablePath(location.distro, binary);
    cache.set(key, resolved);
    return resolved;
  }
  if (location.kind === "ssh") {
    return undefined;
  }
  // posix: piggy-back on the shared exec-path cache populated by
  // primeExecutablePathCache during agent detection. The cached path may come
  // from a temporary login shell (e.g. fnm multishell) that has since been
  // cleaned up — verify the file still exists so node-pty doesn't get a stale
  // absolute path and fail with opaque "posix_spawnp failed".
  const cached = getCachedExecutablePath(binary);
  if (cached) {
    try {
      const s = statSync(cached);
      if (!s.isFile() || (s.mode & 0o111) === 0) return undefined;
    } catch {
      return undefined;
    }
  }
  return cached;
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

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ProjectLocation } from "@/shared/contracts";
import { resolveLightcodeBaseDir } from "@/shared/lightcodePaths";
import { getProjectPosixPath } from "@/shared/wsl";

/**
 * Empty scratch directory used as `cwd` for ACP capability probes.
 *
 * Some agent CLIs (notably cursor-agent) walk their `cwd` at probe time via a
 * bundled `rg` indexer. When that cwd is the user's project or home, the scan
 * touches sandbox-protected paths (Photos, Calendar, Containers) and macOS
 * routes the access through `sandboxd` → `tccd`, attributing the request to
 * the responsible parent (Poracode). The result is a launch-time "would like
 * to access data from other apps" prompt unrelated to anything the user asked
 * Poracode to do. Pointing every probe at an empty, Poracode-owned
 * directory keeps the scan contained.
 *
 * Posix only — TCC lives on macOS, and on Linux the home dir is generally
 * safe. WSL falls back to the project's posix path; Windows falls back to the
 * project's native (Windows) path. Callers on those platforms typically pair
 * this with `resolveProbeSpawnCwd`, which keeps the spec's own cwd handling
 * (`wsl.exe --cd` / `cmd /c`) untouched.
 */
let cachedProbeDir: string | undefined;

export function getAgentProbeCwd(location: ProjectLocation): string {
  if (location.kind !== "posix") return getProjectPosixPath(location);
  const probeDir = cachedProbeDir ?? join(resolveLightcodeBaseDir(), "agent-probe");
  try {
    // mkdir on every call: `recursive: true` is a cheap no-op when the dir
    // already exists, and recovers automatically if the cached dir was removed
    // out from under us.
    mkdirSync(probeDir, { recursive: true });
    cachedProbeDir = probeDir;
    return probeDir;
  } catch {
    return getProjectPosixPath(location);
  }
}

/**
 * On posix, redirect a probe spawn into the contained probe dir; on WSL and
 * Windows, keep the caller's spec cwd (which handles `wsl.exe --cd` / `cmd /c`
 * semantics).
 */
export function resolveProbeSpawnCwd(
  location: ProjectLocation,
  specCwd: string | undefined,
): string | undefined {
  return location.kind === "posix" ? getAgentProbeCwd(location) : specCwd;
}

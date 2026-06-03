import { promises as fs } from "node:fs";
import { join } from "node:path";
import { resolveLightcodePaths } from "@/shared/lightcodePaths";
import { FAST_MODE_CACHE_FILENAME } from "./fastModeCacheCore";

/**
 * Host-side fast-mode availability cache path. The native probe and the WSL
 * probe worker both read/write this one file via the shared core (the worker is
 * handed the path as a `/mnt/c/...` mount), so a probe runs the billed turn at
 * most once per account across native + WSL, and an explicit
 * `refreshAgentStatuses` clears it to re-check.
 *
 * Honors the injected data dir (matching the rest of the supervisor) so dev runs
 * (`~/.lightcode-dev`) and prod don't read/write each other's cache.
 */
export function resolveFastModeCachePath(): string {
  return join(
    resolveLightcodePaths(process.env.LIGHTCODE_DATA_DIR).cacheDir,
    FAST_MODE_CACHE_FILENAME,
  );
}

/** Cleared on explicit refresh so an org enabling/disabling fast is picked up. */
export async function clearFastModeCache(): Promise<void> {
  try {
    await fs.rm(resolveFastModeCachePath(), { force: true });
  } catch {
    // Best-effort.
  }
}

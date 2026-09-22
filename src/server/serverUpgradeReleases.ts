import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readlinkSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { UpgradeRefusedError } from "./serverUpgradeContract";

/**
 * Release-directory phase helpers: collision-resistant release identity, the
 * unique staged directory, the `current` symlink read, and current-relative
 * path resolution. Extracted from `serverUpgrade.ts` so the recovery path uses
 * the same rules the orchestrator does.
 */

/** Collision-resistant release id: time-sortable prefix plus 48 random bits. */
export function allocateUpgradeReleaseId(now: Date = new Date()): string {
  const stamp = now
    .toISOString()
    .replace(/[-:.TZ]/gu, "")
    .slice(0, 14);
  return `release-${stamp}-${randomBytes(6).toString("hex")}`;
}

export function allocateReleaseDirectory(prefix: string, releaseId: string): string {
  const releases = join(prefix, "releases");
  mkdirSync(releases, { recursive: true, mode: 0o700 });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const id = attempt === 0 ? releaseId : `${releaseId}-${attempt}`;
    const directory = join(releases, id);
    try {
      mkdirSync(directory, { mode: 0o700 });
      return directory;
    } catch (error) {
      if (
        !(error !== null && typeof error === "object" && "code" in error && error.code === "EEXIST")
      )
        throw error;
    }
  }
  throw new UpgradeRefusedError(`Could not allocate a unique release directory under ${releases}.`);
}

/** The `current` symlink target as recorded (relative), or null when absent. */
export function readCurrentTarget(prefix: string): string | null {
  const current = join(prefix, "current");
  if (!existsSync(current)) return null;
  try {
    return readlinkSync(current);
  } catch {
    return current;
  }
}

/** Absolute path of a recorded `current` target (absolute or prefix-relative). */
export function previousReleasePath(prefix: string, previous: string): string {
  return previous.startsWith("/") ? previous : join(prefix, previous);
}

/** True when `releaseDir` is the release `current` points at. */
export function isCurrentRelease(prefix: string, releaseDir: string): boolean {
  const current = readCurrentTarget(prefix);
  return current !== null && previousReleasePath(prefix, current) === releaseDir;
}

/** True when `releaseDir` is a direct `<prefix>/releases/<id>` child. */
export function isDirectReleaseDirectory(prefix: string, releaseDir: string): boolean {
  return dirname(releaseDir) === join(prefix, "releases");
}

/** Remove a staged (non-current) release directory; never deletes `current`. */
export function removeStagedReleaseDirectory(prefix: string, releaseDir: string): void {
  if (isCurrentRelease(prefix, releaseDir)) return;
  rmSync(releaseDir, { recursive: true, force: true });
}

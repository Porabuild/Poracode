import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Write a file atomically: serialize to a sibling temp file, then `rename` it
 * into place. A same-volume rename is atomic on POSIX and NTFS, so a crash or
 * power loss mid-write leaves either the old file or the new one intact —
 * never a truncated/partial file. Use for any file whose corruption would lose
 * user data or silently fall back to defaults (settings, registries, keys).
 *
 * The temp name includes the pid so concurrent writers in different processes
 * don't clobber each other's temp file.
 */
export function writeFileAtomic(
  filePath: string,
  data: string | NodeJS.ArrayBufferView,
  options?: { encoding?: BufferEncoding; mode?: number },
): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, data, options);
    renameSync(tmp, filePath);
  } catch (error) {
    // Best-effort cleanup of the temp file; ignore if it never got created.
    try {
      rmSync(tmp, { force: true });
    } catch {
      // ignore cleanup failure
    }
    throw error;
  }
}

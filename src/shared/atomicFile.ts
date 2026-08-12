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
    renameAtomic(filePath, tmp);
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

/**
 * Rename `tmp` onto `filePath`, retrying transient lock failures. On Windows,
 * `renameSync` (MoveFileEx with MOVEFILE_REPLACE_EXISTING) fails with EPERM
 * when the destination is momentarily open by another process — real-time
 * antivirus scanning, Windows Search/Indexing, or a second app instance. These
 * locks clear within milliseconds, so a short bounded retry rides them out
 * without giving up atomic writes. Note: the retries are only hit on the rare
 * lock path; the writes already block synchronously, so a few ms of sleep is
 * consistent with the existing design.
 */
function renameAtomic(filePath: string, tmp: string): void {
  const RETRYABLE_CODES = new Set(["EPERM", "EACCES", "EBUSY"]);
  const MAX_RETRIES = 5;
  const RETRY_DELAY_MS = 10;

  for (let attempt = 0; ; attempt++) {
    try {
      renameSync(tmp, filePath);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= MAX_RETRIES || !code || !RETRYABLE_CODES.has(code)) throw error;
      // Block the loop synchronously so the caller's sync contract is kept.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, RETRY_DELAY_MS);
    }
  }
}

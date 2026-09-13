import { closeSync, mkdirSync, openSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";

/**
 * Write through an exclusively created sibling file, then rename it into place.
 * Readers see the complete old or new file. This helper does not fsync and does
 * not provide a power-loss durability guarantee.
 *
 * Each invocation owns a unique temporary name. Legacy PID.tmp files are ignored;
 * an existing file, link or FIFO at a colliding name is never opened or removed.
 */
export function writeFileAtomic(
  filePath: string,
  data: string | NodeJS.ArrayBufferView,
  options?: { encoding?: BufferEncoding; mode?: number },
): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${randomUUID()}.tmp`;
  let ownsTemporary = false;
  try {
    const descriptor = openSync(tmp, "wx", options?.mode);
    ownsTemporary = true;
    try {
      writeFileSync(descriptor, data, options);
    } finally {
      closeSync(descriptor);
    }
    renameAtomic(filePath, tmp);
  } catch (error) {
    if (ownsTemporary) {
      // Never remove a pre-existing path after open failed before ownership.
      try {
        rmSync(tmp, { force: true });
      } catch {
        // Preserve the original failure if cleanup also fails.
      }
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

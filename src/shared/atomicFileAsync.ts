import { randomUUID } from "node:crypto";
import { mkdir, open, rename, rm, type FileHandle } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Async sibling of {@link writeFileAtomic}: write through an exclusively
 * created sibling file, then rename it into place. Readers see the complete
 * old or new file. Atomic *visibility* is the whole contract: this helper does
 * not fsync the file or its directory and makes no power-loss durability
 * claim, so a crash may still lose the most recent generation.
 *
 * Each invocation owns a unique temporary name. A pre-existing file, link, or
 * FIFO at a colliding name is never opened, removed, or renamed: cleanup runs
 * only after this call successfully created (and therefore owns) the
 * temporary path, so a failed exclusive open leaves foreign bytes untouched.
 */
export async function writeFileAtomicAsync(
  filePath: string,
  data: string | NodeJS.ArrayBufferView,
  options?: { encoding?: BufferEncoding; mode?: number },
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${randomUUID()}.tmp`;
  let descriptor: FileHandle | null = null;
  let ownsTemporary = false;
  try {
    descriptor = await open(tmp, "wx", options?.mode);
    ownsTemporary = true;
    await descriptor.writeFile(data, options);
    await descriptor.close();
    descriptor = null;
    await renameWithRetry(tmp, filePath);
  } catch (error) {
    try {
      await descriptor?.close();
    } catch {
      // Preserve the original failure.
    }
    if (ownsTemporary) {
      try {
        await rm(tmp, { force: true });
      } catch {
        // Preserve the original failure.
      }
    }
    throw error;
  }
}

/**
 * Rename `from` onto `to`, retrying transient lock failures. On Windows,
 * rename (MoveFileEx with MOVEFILE_REPLACE_EXISTING) fails with EPERM when the
 * destination is momentarily open by another process — real-time antivirus
 * scanning, Windows Search/Indexing, or a second app instance. These locks
 * clear within milliseconds, so a short bounded retry rides them out without
 * giving up atomic replacement. Retries stay async: the event loop keeps
 * serving timers and cancellation while the lock clears.
 */
async function renameWithRetry(from: string, to: string): Promise<void> {
  const retryable = new Set(["EPERM", "EACCES", "EBUSY"]);
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= 5 || !code || !retryable.has(code)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}

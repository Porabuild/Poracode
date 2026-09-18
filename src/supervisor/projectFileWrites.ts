import { FILE_SAVE_CONFLICT_MESSAGE } from "@/shared/fileSaveErrors";
import { readFile, stat, writeFile } from "node:fs/promises";
import { buildWriteBuffer, isBinaryBuffer, MAX_EDITABLE_FILE_SIZE } from "./projectFileContent";

// Shared across project/external editors and service instances in this
// supervisor. File identity also joins symlink/hard-link aliases. Entries live
// only while writes are queued; unrelated files have independent queues.
const writeTails = new Map<string, Promise<void>>();

async function withFileWrite<T>(identity: string, operation: () => Promise<T>): Promise<T> {
  const previous = writeTails.get(identity) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => current);
  writeTails.set(identity, tail);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (writeTails.get(identity) === tail) writeTails.delete(identity);
  }
}

/** The mtime check and save must share a critical section: otherwise two
 * clients can both validate the same old baseline before either writes.
 * This serializes this supervisor's editor writes, not unrelated processes.
 * Existing timestamp precision/tolerance semantics remain unchanged. */
export async function writeNativeEditorFile(
  filePath: string,
  payload: { content: string; baseModifiedAtMs: number },
  onWritten?: () => void,
): Promise<{ modifiedAtMs: number }> {
  const identity = await stat(filePath, { bigint: true });
  return withFileWrite(`${identity.dev}:${identity.ino}`, async () => {
    const current = await stat(filePath, { bigint: true });
    if (current.dev !== identity.dev || current.ino !== identity.ino) {
      throw new Error(FILE_SAVE_CONFLICT_MESSAGE);
    }
    if (!current.isFile()) throw new Error("Only files can be saved from the editor.");
    const modifiedAtMs = Number(current.mtimeNs) / 1_000_000;
    if (Math.abs(modifiedAtMs - payload.baseModifiedAtMs) > 1) {
      throw new Error(FILE_SAVE_CONFLICT_MESSAGE);
    }
    if (current.size > BigInt(MAX_EDITABLE_FILE_SIZE)) {
      throw new Error("This file is too large to save from the editor.");
    }
    const existingBuffer = await readFile(filePath);
    if (isBinaryBuffer(existingBuffer)) {
      throw new Error("Binary files cannot be saved from the editor.");
    }
    await writeFile(filePath, buildWriteBuffer(existingBuffer, payload.content));
    onWritten?.();
    return { modifiedAtMs: (await stat(filePath)).mtimeMs };
  });
}

import { open } from "node:fs/promises";
import { closeSync, constants, fstatSync, openSync, readSync } from "node:fs";

// A regular file may be replaced by a FIFO before open. Nonblocking admission
// reaches fstat without waiting for a peer; a pre-lstat check alone would race.
// Node does not expose O_NONBLOCK on Windows, which has no filesystem FIFOs.
const READ_FLAGS = constants.O_RDONLY | (process.platform === "win32" ? 0 : constants.O_NONBLOCK);

/** Build/archive callers retain their existing synchronous interface. */
export function readBoundedRuntimeFileSync(path: string, maxBytes: number): Buffer {
  const file = openSync(path, READ_FLAGS);
  try {
    const stat = fstatSync(file);
    if (!stat.isFile()) throw new Error("Runtime source is not a regular file.");
    if (stat.size > maxBytes) throw new Error("Runtime file exceeds its byte limit.");
    const bytes = Buffer.alloc(Math.min(stat.size, maxBytes) + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const read = readSync(file, bytes, offset, bytes.length - offset, offset);
      if (read === 0) return bytes.subarray(0, offset);
      offset += read;
    }
    throw new Error("Runtime file changed size while being read.");
  } finally {
    closeSync(file);
  }
}

/** A stat check alone cannot bound an allocation if a mutable build file grows. */
export async function readBoundedRuntimeFile(
  path: string,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<Buffer> {
  signal?.throwIfAborted();
  const file = await open(path, READ_FLAGS);
  try {
    signal?.throwIfAborted();
    const stat = await file.stat();
    if (!stat.isFile()) throw new Error("Runtime source is not a regular file.");
    if (stat.size > maxBytes) throw new Error("Runtime file exceeds its byte limit.");
    const bytes = Buffer.alloc(Math.min(stat.size, maxBytes) + 1);
    let offset = 0;
    while (offset < bytes.length) {
      signal?.throwIfAborted();
      const { bytesRead } = await file.read(bytes, offset, bytes.length - offset, offset);
      signal?.throwIfAborted();
      if (bytesRead === 0) return bytes.subarray(0, offset);
      offset += bytesRead;
    }
    // Filling the extra byte means the file grew after the stat or exceeded the
    // declared size. Do not silently validate only its original prefix.
    throw new Error("Runtime file changed size while being read.");
  } finally {
    await file.close();
  }
}

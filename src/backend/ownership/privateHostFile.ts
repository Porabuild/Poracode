import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from "node:fs";
import { join } from "node:path";
import type { HostRootPaths } from "./hostRootPaths";

/** Read owner-private metadata or credentials, never the SQLite lease inode. */
export function readPrivateHostFile(paths: HostRootPaths, name: string, maxBytes: number): Buffer {
  const path = join(paths.dataRoot, name);
  const leasePath = paths.leasePath;
  const metadata = lstatSync(path);
  const leaseMetadata = lstatSync(leasePath);
  if (
    !metadata.isFile() ||
    metadata.nlink !== 1 ||
    (metadata.dev === leaseMetadata.dev && metadata.ino === leaseMetadata.ino)
  )
    throw new Error("Invalid private host file.");
  const descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fstatSync(descriptor);
    if (
      !opened.isFile() ||
      opened.nlink !== 1 ||
      opened.dev !== metadata.dev ||
      opened.ino !== metadata.ino ||
      opened.size > maxBytes ||
      (process.getuid && (opened.uid !== process.getuid() || (opened.mode & 0o077) !== 0))
    )
      throw new Error("Invalid private host file.");
    const bytes = Buffer.alloc(maxBytes + 1);
    let size = 0;
    while (size < bytes.length) {
      const read = readSync(descriptor, bytes, size, bytes.length - size, size);
      if (read === 0) break;
      size += read;
    }
    if (size > maxBytes) throw new Error("Invalid private host file.");
    return bytes.subarray(0, size);
  } finally {
    closeSync(descriptor);
  }
}

import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic } from "@/shared/atomicFile";
import { readBoundedRuntimeFileSync } from "@/shared/readBoundedRuntimeFile";
import { runtimeDirectoryFiles } from "@/shared/runtimeResourceInventory";

const MAX_ARCHIVE_FILE_BYTES = 8 * 1024 * 1024;

/** Cache hits must not return a pipe or link as an uploadable archive. */
export function regularArchiveExists(path: string): boolean {
  try {
    if (!lstatSync(path).isFile()) throw new Error("Runtime archive is not a regular file.");
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export function stageRuntimeFile(
  source: string,
  destination: string,
  maxBytes = MAX_ARCHIVE_FILE_BYTES,
): void {
  const stat = lstatSync(source);
  if (!stat.isFile()) throw new Error("Runtime source is not a regular file.");
  const bytes = readBoundedRuntimeFileSync(source, maxBytes);
  // Copy captured bytes, without reopening a source that could have become a
  // FIFO. Atomic replacement also avoids opening a changed output path.
  writeFileAtomic(destination, bytes, { mode: stat.mode & 0o777 });
}

export function stageRuntimeDirectory(source: string | undefined, destination: string): void {
  mkdirSync(destination, { recursive: true });
  if (!source || !existsSync(source)) return;
  for (const file of runtimeDirectoryFiles(source))
    stageRuntimeFile(file.source, join(destination, file.path));
}

export function hashRuntimeDirectory(root: string): string {
  const hash = createHash("sha256");
  for (const file of runtimeDirectoryFiles(root)) {
    hash.update(file.path).update("\0");
    hash.update(readBoundedRuntimeFileSync(file.source, MAX_ARCHIVE_FILE_BYTES)).update("\0");
  }
  return hash.digest("hex");
}

/** Metadata-only cache hint. Build declarations are checked separately before
 * the lookup, and staged bytes are verified before a new archive is created. */
export function runtimeStatSignature(roots: readonly string[], extra: string): string {
  const hash = createHash("sha256");
  for (const root of roots) {
    hash.update(`${root}\0`);
    if (!existsSync(root)) continue;
    const stat = lstatSync(root);
    if (stat.isDirectory()) {
      for (const file of runtimeDirectoryFiles(root)) {
        const fileStat = lstatSync(file.source);
        if (!fileStat.isFile()) throw new Error("Runtime source is not a regular file.");
        hash.update(`${file.path}\0${fileStat.size}\0${fileStat.mtimeMs}\0`);
      }
    } else if (stat.isFile()) hash.update(`${stat.size}\0${stat.mtimeMs}\0`);
    else throw new Error("Runtime source is not a regular file.");
  }
  hash.update(extra);
  return hash.digest("hex");
}

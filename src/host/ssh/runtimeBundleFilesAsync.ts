import { createHash } from "node:crypto";
import { lstat, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { writeFileAtomicAsync } from "@/shared/atomicFileAsync";
import { readBoundedRuntimeFile } from "@/shared/readBoundedRuntimeFile";
import type { RuntimeCodeFile } from "@/shared/runtimeCodeManifest";
import { msg } from "@/shared/messages";
import { runtimeDirectoryFiles } from "@/shared/runtimeResourceInventory";
import { MAX_ARCHIVE_FILE_BYTES } from "./runtimeBundleFiles";

/** Async mirror of `regularArchiveExists` for the worker staging path. */
export async function regularArchiveExistsAsync(path: string): Promise<boolean> {
  try {
    if (!(await lstat(path)).isFile()) throw new Error("Runtime archive is not a regular file.");
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

/**
 * Re-exported for the worker's existing import path. The implementation lives
 * in `@/shared/atomicFileAsync` so the worker and the host environment store
 * share one atomic writer (no second copy to drift).
 */
export { writeFileAtomicAsync };

export async function stageRuntimeFileAsync(
  source: string,
  destination: string,
  maxBytes = MAX_ARCHIVE_FILE_BYTES,
  signal?: AbortSignal,
): Promise<void> {
  const stat = await lstat(source);
  if (!stat.isFile()) throw new Error("Runtime source is not a regular file.");
  const bytes = await readBoundedRuntimeFile(
    source,
    Math.min(maxBytes, MAX_ARCHIVE_FILE_BYTES),
    signal,
  );
  await writeFileAtomicAsync(destination, bytes, { mode: stat.mode & 0o777 });
}

export async function stageRuntimeDirectoryAsync(
  source: string | undefined,
  destination: string,
  signal?: AbortSignal,
): Promise<void> {
  await mkdir(destination, { recursive: true });
  if (!source) return;
  try {
    if (!(await lstat(source)).isDirectory()) throw new Error("Runtime source is not a directory.");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  for (const file of runtimeDirectoryFiles(source)) {
    signal?.throwIfAborted();
    await stageRuntimeFileAsync(file.source, join(destination, file.path), undefined, signal);
  }
}

export async function hashRuntimeDirectoryAsync(
  root: string,
  signal?: AbortSignal,
): Promise<string> {
  const hash = createHash("sha256");
  for (const file of runtimeDirectoryFiles(root)) {
    signal?.throwIfAborted();
    hash.update(file.path).update("\0");
    hash
      .update(await readBoundedRuntimeFile(file.source, MAX_ARCHIVE_FILE_BYTES, signal))
      .update("\0");
  }
  return hash.digest("hex");
}

/** Metadata-only cache hint; build declarations are checked separately. */
export async function runtimeStatSignatureAsync(
  roots: readonly string[],
  extra: string,
  signal?: AbortSignal,
): Promise<string> {
  const hash = createHash("sha256");
  for (const root of roots) {
    signal?.throwIfAborted();
    hash.update(`${root}\0`);
    let stat;
    try {
      stat = await lstat(root);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    if (stat.isDirectory()) {
      for (const file of runtimeDirectoryFiles(root)) {
        const fileStat = await lstat(file.source);
        if (!fileStat.isFile()) throw new Error("Runtime source is not a regular file.");
        hash.update(`${file.path}\0${fileStat.size}\0${fileStat.mtimeMs}\0`);
      }
    } else if (stat.isFile()) hash.update(`${stat.size}\0${stat.mtimeMs}\0`);
    else throw new Error("Runtime source is not a regular file.");
  }
  hash.update(extra);
  return hash.digest("hex");
}

export async function verifyRuntimeBuildCodeAsync(
  mainBundleDir: string,
  files: readonly RuntimeCodeFile[],
  signal?: AbortSignal,
): Promise<void> {
  for (const file of files) {
    signal?.throwIfAborted();
    const bytes = await readBoundedRuntimeFile(join(mainBundleDir, file.path), file.bytes, signal);
    if (
      bytes.length !== file.bytes ||
      createHash("sha256").update(bytes).digest("hex") !== file.sha256
    )
      throw new Error(msg("ssh.runtimeManifest.invalid", { path: join(mainBundleDir, file.path) }));
  }
}

export async function sha256FileAsync(
  path: string,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<string> {
  return createHash("sha256")
    .update(await readBoundedRuntimeFile(path, maxBytes, signal))
    .digest("hex");
}

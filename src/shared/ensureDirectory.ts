import { mkdirSync, statSync } from "node:fs";
import { mkdir, stat } from "node:fs/promises";

/**
 * `mkdir -p` whose postcondition is "the directory exists". Node 26 on Windows
 * rejects a recursive mkdir of an already existing directory on a
 * `\\wsl.localhost\<distro>` UNC share with `EISDIR`, so any failure is
 * re-checked against the filesystem: an existing directory is success, and the
 * original error is reported for everything else.
 */
export async function ensureDirectory(path: string, mode?: number): Promise<void> {
  try {
    await mkdir(path, { recursive: true, ...(mode !== undefined ? { mode } : {}) });
  } catch (error) {
    if (await isDirectory(path)) return;
    throw error;
  }
}

/** Synchronous sibling of {@link ensureDirectory}. */
export function ensureDirectorySync(path: string, mode?: number): void {
  try {
    mkdirSync(path, { recursive: true, ...(mode !== undefined ? { mode } : {}) });
  } catch (error) {
    if (isDirectorySync(path)) return;
    throw error;
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

function isDirectorySync(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

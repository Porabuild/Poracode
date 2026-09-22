import { randomBytes } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  WslStagingDeployRequest,
  WslStagingDeployResult,
  WslStagingFreshness,
  WslStagingReadDirResult,
  WslStagingReadFileResult,
  WslStagingRequest,
} from "./protocol";

/**
 * Filesystem verbs executed inside the staging worker. All operations are
 * async so a single stalled call cannot block the worker's event loop; the
 * supervisor bounds the worker itself (timeout + kill) when the underlying
 * filesystem never returns.
 */
export async function executeStagingRequest(request: WslStagingRequest): Promise<unknown> {
  switch (request.op) {
    case "deploy":
      return deployFiles(request);
    case "exists":
      return pathExists(request.path);
    case "remove":
      await removePath(request.path, request.recursive);
      return undefined;
    case "mkdirp":
      await mkdir(request.path, {
        recursive: true,
        ...(request.mode !== undefined ? { mode: request.mode } : {}),
      });
      return undefined;
    case "stage-file":
      await stageFile(request.src, request.dest);
      return undefined;
    case "prune-dirs":
      await pruneDirs(request.dir, request.keepPrefix, request.keepName);
      return undefined;
    case "read-file":
      return readStagedFile(request.path);
    case "write-file":
      await writeStagedFile(request.path, request.contentBase64, request.mode);
      return undefined;
    case "read-dir":
      return readStagedDirectory(request.path);
  }
}

/** Join a child entry onto `base` using whichever separator `base` uses. */
export function appendPath(base: string, ...segments: readonly string[]): string {
  const separator = base.includes("\\") ? "\\" : "/";
  const root = base.replace(/[\\/]+$/u, "");
  return [root, ...segments].join(separator);
}

async function deployFiles(request: WslStagingDeployRequest): Promise<WslStagingDeployResult> {
  let filesWritten = 0;
  for (const file of request.files) {
    const segments = file.relDest.split("/").filter((segment) => segment.length > 0);
    if (segments.length === 0) continue;
    const dest = appendPath(request.base, ...segments);
    await mkdir(dirname(dest), { recursive: true });
    if (await isFresh(file.src, dest, request.freshness)) continue;
    await writeFileAtomic(file.src, dest);
    filesWritten += 1;
  }
  return { filesWritten };
}

async function isFresh(
  src: string,
  dest: string,
  freshness: WslStagingFreshness,
): Promise<boolean> {
  try {
    const [sourceStat, destStat] = await Promise.all([stat(src), stat(dest)]);
    if (!sourceStat.isFile() || !destStat.isFile()) return false;
    if (sourceStat.size !== destStat.size) return false;
    if (freshness === "size-mtime") return sourceStat.mtimeMs <= destStat.mtimeMs;
    const [source, current] = await Promise.all([readFile(src), readFile(dest)]);
    return source.equals(current);
  } catch {
    return false;
  }
}

/**
 * Copy through a uniquely named sibling and rename into place. The rename is
 * a same-directory move, so readers never observe a partially written file
 * and a failed copy leaves only a removable temp entry.
 */
async function writeFileAtomic(src: string, dest: string): Promise<void> {
  const temp = `${dest}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    await copyFile(src, temp);
    await rename(temp, dest);
  } catch (error) {
    await rm(temp, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function stageFile(src: string, dest: string): Promise<void> {
  await mkdir(dirname(dest), { recursive: true });
  await writeFileAtomic(src, dest);
}

async function readStagedFile(path: string): Promise<WslStagingReadFileResult> {
  try {
    const content = await readFile(path);
    return { exists: true, contentBase64: content.toString("base64") };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { exists: false };
    throw error;
  }
}

/**
 * Write text through the same temp-file + rename discipline as `stage-file`,
 * so a provider settings/hook document is never observed half-written even
 * when a reader races the install.
 */
async function writeStagedFile(path: string, contentBase64: string, mode?: number): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    await writeFile(temp, Buffer.from(contentBase64, "base64"), {
      ...(mode !== undefined ? { mode } : {}),
    });
    await rename(temp, path);
  } catch (error) {
    await rm(temp, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function readStagedDirectory(path: string): Promise<WslStagingReadDirResult> {
  let entries;
  try {
    entries = await readdir(path, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { exists: false, entries: [] };
    throw error;
  }
  return {
    exists: true,
    entries: entries.map((entry) => ({ name: entry.name, directory: entry.isDirectory() })),
  };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Best-effort cleanup: callers treat removal as advisory. */
async function removePath(path: string, recursive: boolean): Promise<void> {
  await rm(path, { recursive, force: true }).catch(() => undefined);
}

async function pruneDirs(dir: string, keepPrefix: string, keepName: string): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => undefined);
  if (!entries) return;
  for (const entry of entries) {
    if (!entry.name.startsWith(keepPrefix) || entry.name === keepName) continue;
    const target = appendPath(dir, entry.name);
    try {
      if (!(await stat(target)).isDirectory()) continue;
    } catch {
      continue;
    }
    await rm(target, { recursive: true, force: true }).catch(() => undefined);
  }
}

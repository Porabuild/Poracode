import { createHash } from "node:crypto";
import {
  copyFile,
  lstat,
  mkdir,
  readdir,
  readFile,
  readlink,
  realpath,
  rm,
  stat,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, posix, relative, resolve } from "node:path";

/**
 * Filesystem primitives for skill folders: managed-path naming, the copy
 * manifest, content hashing, and safe recursive copy — all link-aware (skills
 * may contain internal links; links escaping the folder and cyclic directories
 * are rejected). Used by the scanner, importer, and marketplace installer.
 */

const MANIFEST_FILE = ".poracode-skill.json";
const DISABLED_SUFFIX = ".poracode-disabled";

export interface SkillManifest {
  version: 1;
  mode: "copy" | "projection";
  sourcePath: string;
  sourceHash: string;
}

export function disabledRoot(rootPath: string): string {
  return `${rootPath}${DISABLED_SUFFIX}`;
}

export function normalizePath(path: string): string {
  const normalized = resolve(path).replace(/[\\/]+$/u, "");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

export function isDirectChild(rootPath: string, childPath: string): boolean {
  const rel = relative(resolve(rootPath), resolve(childPath));
  return rel.length > 0 && !rel.startsWith("..") && !isAbsolute(rel) && !/[\\/]/u.test(rel);
}

/** Run `fn` over `items` with at most `limit` in flight, preserving result order. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function readManifest(skillPath: string): Promise<SkillManifest | undefined> {
  try {
    const parsed = JSON.parse(await readFile(join(skillPath, MANIFEST_FILE), "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object") return undefined;
    const record = parsed as Record<string, unknown>;
    if (
      record.version !== 1 ||
      (record.mode !== "copy" && record.mode !== "projection") ||
      typeof record.sourcePath !== "string" ||
      typeof record.sourceHash !== "string"
    ) {
      return undefined;
    }
    return record as unknown as SkillManifest;
  } catch {
    return undefined;
  }
}

export async function writeManifest(skillPath: string, manifest: SkillManifest): Promise<void> {
  await writeFile(join(skillPath, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

export async function hashDirectory(rootPath: string): Promise<string> {
  const hash = createHash("sha256");
  const rootRealPath = await realpath(rootPath);
  const activeDirectories = new Set<string>();

  const visit = async (directory: string, relativeDirectory: string): Promise<void> => {
    const realDirectory = await realpath(directory);
    const directoryKey = normalizePath(realDirectory);
    if (activeDirectories.has(directoryKey)) {
      throw new Error(`Skill contains a cyclic directory link: ${relativeDirectory || "."}`);
    }
    activeDirectories.add(directoryKey);
    try {
      const entries = await readdir(realDirectory, { withFileTypes: true });
      entries.sort((left, right) => left.name.localeCompare(right.name));
      for (const entry of entries) {
        if (entry.name === MANIFEST_FILE) continue;
        const path = join(realDirectory, entry.name);
        const relativePath = relativeDirectory
          ? posix.join(relativeDirectory, entry.name)
          : entry.name;
        const info = await lstat(path);
        if (info.isSymbolicLink()) {
          const target = await realpath(path);
          const rel = relative(rootRealPath, target);
          if (rel.startsWith("..") || isAbsolute(rel)) {
            throw new Error(`Skill contains a link outside its folder: ${relativePath}`);
          }
          const targetInfo = await stat(target);
          hash.update(`L\0${relativePath}\0`);
          if (targetInfo.isDirectory()) await visit(target, relativePath);
          else if (targetInfo.isFile()) hash.update(await readFile(target));
          continue;
        }
        if (info.isDirectory()) {
          hash.update(`D\0${relativePath}\0`);
          await visit(path, relativePath);
        } else if (info.isFile()) {
          hash.update(`F\0${relativePath}\0`);
          hash.update(await readFile(path));
        }
      }
    } finally {
      activeDirectories.delete(directoryKey);
    }
  };

  await visit(rootRealPath, "");
  return hash.digest("hex");
}

export async function copyDirectorySafely(
  sourcePath: string,
  destinationPath: string,
): Promise<void> {
  const sourceRealPath = await realpath(sourcePath);
  const activeDirectories = new Set<string>();
  await mkdir(destinationPath, { recursive: true });

  const visit = async (source: string, destination: string): Promise<void> => {
    const realSource = await realpath(source);
    const directoryKey = normalizePath(realSource);
    if (activeDirectories.has(directoryKey)) {
      throw new Error(
        `Skill contains a cyclic directory link: ${relative(sourceRealPath, realSource) || "."}`,
      );
    }
    activeDirectories.add(directoryKey);
    try {
      const entries = await readdir(realSource, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === MANIFEST_FILE) continue;
        const from = join(realSource, entry.name);
        const to = join(destination, entry.name);
        const info = await lstat(from);
        if (info.isSymbolicLink()) {
          const target = await realpath(from);
          const rel = relative(sourceRealPath, target);
          if (rel.startsWith("..") || isAbsolute(rel)) {
            throw new Error(`Skill contains a link outside its folder: ${entry.name}`);
          }
          const targetInfo = await stat(target);
          if (targetInfo.isDirectory()) {
            await mkdir(to, { recursive: true });
            await visit(target, to);
          } else if (targetInfo.isFile()) {
            await copyFile(target, to);
          }
          continue;
        }
        if (info.isDirectory()) {
          await mkdir(to, { recursive: true });
          await visit(from, to);
        } else if (info.isFile()) {
          await copyFile(from, to);
        }
      }
    } finally {
      activeDirectories.delete(directoryKey);
    }
  };

  await visit(sourceRealPath, destinationPath);
}

export async function removeSkillPath(path: string): Promise<void> {
  const info = await lstat(path);
  if (info.isSymbolicLink()) await unlink(path);
  else await rm(path, { recursive: true, force: false });
}

export async function createDirectoryLink(targetPath: string, linkPath: string): Promise<void> {
  await symlink(resolve(targetPath), linkPath, process.platform === "win32" ? "junction" : "dir");
}

export async function readDirectoryLinkTarget(linkPath: string): Promise<string | undefined> {
  try {
    if (!(await lstat(linkPath)).isSymbolicLink()) return undefined;
    const target = await readlink(linkPath);
    return isAbsolute(target) ? resolve(target) : resolve(dirname(linkPath), target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export function isCanonicalManagedSkillPath(path: string, folderName: string): boolean {
  const skillsRoot = dirname(path);
  return (
    basename(path) === folderName &&
    basename(skillsRoot) === "skills" &&
    basename(dirname(skillsRoot)) === ".agents"
  );
}

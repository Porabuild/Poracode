import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import type { ProjectLocation } from "@/shared/contracts";
import { getProjectFsPath } from "@/shared/wsl";

export function normalizeProjectRelativePath(input: string): string {
  const normalized = input.replace(/\\/gu, "/").replace(/^\/+|\/+$/gu, "");
  const parts = normalized.split("/").filter((part) => part && part !== ".");
  if (parts.includes("..")) throw new Error("Path traversal is not allowed.");
  return parts.join("/");
}

export function resolveProjectEntryPath(location: ProjectLocation, path: string): string {
  const root = resolve(getProjectFsPath(location));
  const target = resolve(root, ...normalizeProjectRelativePath(path).split("/").filter(Boolean));
  assertContained(root, target);
  return target;
}

/** Native project reads share one filesystem-resolved boundary. WSL callers
 * use the in-distro bridge's equivalent check for Linux symlink semantics.
 */
export async function resolveContainedProjectEntryPath(
  location: ProjectLocation,
  path: string,
): Promise<string> {
  const [root, target] = await Promise.all([
    realpath(getProjectFsPath(location)),
    realpath(resolveProjectEntryPath(location, path)),
  ]);
  assertContained(root, target);
  return target;
}

function assertContained(root: string, target: string): void {
  const tail = relative(root, target);
  if (isAbsolute(tail) || tail.split(/[\\/]/u)[0] === "..") {
    throw new Error("Path escapes the project root.");
  }
}

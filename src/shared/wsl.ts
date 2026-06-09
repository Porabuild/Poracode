import type { ProjectLocation } from "./contracts";

export function stripNulChars(value: string): string {
  return value.split("\0").join("");
}

export function normalizeWslListOutput(raw: string): string[] {
  return stripNulChars(raw)
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function toWslUncPath(distro: string, linuxPath: string): string {
  const normalizedLinuxPath = linuxPath.replace(/^\/+/, "").replace(/\//g, "\\");
  return `\\\\wsl.localhost\\${distro}\\${normalizedLinuxPath}`;
}

export function parseWslUncPath(uncPath: string): { distro: string; linuxPath: string } | null {
  // The subpath after the distro is optional so a bare distro root
  // (`\\wsl.localhost\Ubuntu`, with or without a trailing separator) parses to
  // linuxPath "/" rather than failing and being misread as a Windows path.
  const match = /^\\\\wsl(?:\.localhost|\$)\\([^\\]+)(?:\\(.*))?$/i.exec(uncPath);
  if (!match) return null;
  const distro = match[1]!;
  const rest = match[2];
  const linuxPath = rest ? "/" + rest.replace(/\\/g, "/") : "/";
  return { distro, linuxPath };
}

export function getProjectDisplayPath(location: ProjectLocation): string {
  if (location.kind === "wsl") return `${location.distro}:${location.linuxPath}`;
  return location.path;
}

export function getProjectName(location: ProjectLocation): string {
  const rawPath = getProjectPosixPath(location);
  const segments = rawPath.split(/[\\/]/g).filter(Boolean);
  return segments.at(-1) ?? rawPath;
}

/**
 * Windows-accessible absolute path to the project root. Use for Node `fs`
 * operations, `cwd` of Windows-side child processes, and any API that reads
 * the project through the host OS.
 *
 * - windows → `location.path`
 * - wsl     → `location.uncPath` (e.g. `\\wsl.localhost\Ubuntu\home\user\repo`)
 * - posix   → `location.path`
 */
export function getProjectFsPath(location: ProjectLocation): string {
  if (location.kind === "wsl") return location.uncPath;
  return location.path;
}

/**
 * POSIX-style absolute path to the project root. Use for in-distro shell
 * commands (`wsl.exe -- <cmd>`), display, and anything that needs a Linux
 * view of the path. For non-WSL projects this is just `location.path`.
 *
 * - windows → `location.path` (kept as-is; Windows projects never run
 *             in-distro commands)
 * - wsl     → `location.linuxPath` (e.g. `/home/user/repo`)
 * - posix   → `location.path`
 */
export function getProjectPosixPath(location: ProjectLocation): string {
  if (location.kind === "wsl") return location.linuxPath;
  return location.path;
}

/**
 * Join a project-relative path to the POSIX project path using forward
 * slashes. Returns the root path unchanged when `relative` is empty.
 */
export function joinProjectPosixPath(location: ProjectLocation, relative: string): string {
  const root = getProjectPosixPath(location);
  if (!relative) return root;
  return `${root}/${relative}`;
}

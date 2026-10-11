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

/**
 * DrvFs automount root assumed for every distro. WSL's default is `/mnt/`
 * (`[automount] root` in wsl.conf can change it, but the app does not read that
 * setting).
 */
const WSL_DRVFS_MOUNT_ROOT = "/mnt";

/**
 * Native Windows path behind a DrvFs automount location (`/mnt/c/Users/me` ->
 * `C:\Users\me`), or null when the Linux path is not under `<root>/<letter>`.
 *
 * Heuristic, and deliberately narrow: only a lowercase single-letter segment
 * directly under the automount root qualifies (WSL mounts drives as lowercase
 * letters, so `/mnt/C` or `/mnt/cc` never match). The mapping cannot see the
 * distro's mount table, so it stays wrong in two residual cases: a distro whose
 * `[automount] root` differs from the default (its drives are not recognised and
 * fall back to the UNC path), and a non-DrvFs volume the user mounted at
 * `/mnt/<letter>` (it would be read from the Windows drive of that letter).
 * The mapping is derived at read time and no state is persisted, so existing
 * rows need no migration.
 *
 * Host access to such a location through `\\wsl.localhost\<distro>\mnt\c\...`
 * loops Windows -> 9P -> DrvFs -> Windows and is refused (EPERM), so the host
 * must use the native path instead.
 */
export function wslDrvFsToWindowsPath(
  linuxPath: string,
  automountRoot: string = WSL_DRVFS_MOUNT_ROOT,
): string | null {
  const root = automountRoot.replace(/\/+$/, "");
  if (!linuxPath.startsWith(`${root}/`)) return null;
  const match = /^([a-z])(?:\/(.*))?$/.exec(linuxPath.slice(root.length + 1));
  if (!match) return null;
  const rest = (match[2] ?? "").split("/").filter(Boolean).join("\\");
  return `${match[1]!.toUpperCase()}:\\${rest}`;
}

/**
 * Host-side (Windows) filesystem path for an absolute Linux path inside a
 * distro: the native drive path for DrvFs automounts, the `\\wsl.localhost` UNC
 * path for everything else.
 */
export function wslLinuxToHostFsPath(distro: string, linuxPath: string): string {
  return wslDrvFsToWindowsPath(linuxPath) ?? toWslUncPath(distro, linuxPath);
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
 * - wsl     → `location.uncPath` (e.g. `\\wsl.localhost\Ubuntu\home\user\repo`),
 *             or the native drive path (`C:\...`) when `linuxPath` is a DrvFs
 *             automount (`/mnt/c/...`), derived at read time so persisted rows
 *             holding the refused UNC loop path are corrected without migration
 * - posix   → `location.path`
 */
export function getProjectFsPath(location: ProjectLocation): string {
  if (location.kind === "wsl") return getWslLocationHostFsPath(location);
  return location.path;
}

/** Host fs path of a WSL location; see {@link getProjectFsPath}. */
export function getWslLocationHostFsPath(
  location: Extract<ProjectLocation, { kind: "wsl" }>,
): string {
  return wslDrvFsToWindowsPath(location.linuxPath) ?? location.uncPath;
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

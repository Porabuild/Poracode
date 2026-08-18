import { homedir } from "node:os";
import { posix, win32 } from "node:path";
import { pathToFileURL } from "node:url";
import { RequestError } from "@agentclientprotocol/sdk";
import type { ProjectLocation } from "@/shared/contracts";
import { isHomeScopeLocation } from "@/shared/homeScope";
import { toWslUncPath } from "@/shared/wsl";

/**
 * Home-relative directories ACP agents may *read* even though they sit
 * outside the project. Grok (and other CLIs that speak ACP) discover
 * skills from these roots, then load `SKILL.md` through the client fs
 * bridge — without the carve-out the read is rejected as
 * "Path is outside the project" and the skill cannot run.
 *
 * Write stays denied: skill bodies are instructions, not session state.
 */
const ACP_SKILL_READ_DIRS = [
  ".agents/skills",
  ".agents/commands",
  ".grok/skills",
  ".grok/commands",
  ".grok/bundled/skills",
  ".claude/skills",
  ".claude/commands",
  ".cursor/skills",
  ".cursor/commands",
] as const;

/** CWD to pass into the ACP session (the agent's working directory). */
export function resolveSessionCwd(location: ProjectLocation): string {
  switch (location.kind) {
    case "windows":
      return location.path;
    case "wsl":
      return location.linuxPath;
    case "posix":
      return location.path;
  }
}

/** CWD for the spawned process on the host OS (must be a valid native path). */
export function resolveSpawnCwd(location: ProjectLocation): string | undefined {
  // WSL projects launch wsl.exe from Windows — the linux path doesn't exist
  // on the host FS. wsl.exe receives its cwd via --cd, so no spawn cwd needed.
  if (location.kind === "wsl") return undefined;
  return location.path;
}

export function basenameForProjectPath(location: ProjectLocation, filePath: string): string {
  switch (location.kind) {
    case "windows":
      return win32.basename(filePath);
    case "wsl":
    case "posix":
      return posix.basename(filePath);
  }
}

export function isWindowsAbsolutePath(filePath: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(filePath) || filePath.startsWith("\\\\");
}

export function resolveAcpResourcePath(location: ProjectLocation, rawPath: string): string {
  if (isWindowsAbsolutePath(rawPath)) {
    return rawPath;
  }
  switch (location.kind) {
    case "windows":
      return win32.join(location.path, rawPath);
    case "wsl":
      return rawPath.startsWith("/") ? rawPath : posix.join(location.linuxPath, rawPath);
    case "posix":
      return rawPath.startsWith("/") ? rawPath : posix.join(location.path, rawPath);
  }
}

function isProjectRelativePath(location: ProjectLocation, absolutePath: string): boolean {
  switch (location.kind) {
    case "windows": {
      const relative = win32.relative(location.path, absolutePath);
      return relative === "" || (!relative.startsWith("..") && !win32.isAbsolute(relative));
    }
    case "wsl": {
      const relative = posix.relative(location.linuxPath, absolutePath);
      return relative === "" || (!relative.startsWith("..") && !posix.isAbsolute(relative));
    }
    case "posix": {
      const relative = posix.relative(location.path, absolutePath);
      return relative === "" || (!relative.startsWith("..") && !posix.isAbsolute(relative));
    }
  }
}

export function resolveAcpProjectPath(location: ProjectLocation, rawPath: string): string {
  const absolutePath = resolveAcpResourcePath(location, rawPath);
  if (!isProjectRelativePath(location, absolutePath)) {
    throw RequestError.invalidParams({ message: `Path is outside the project: ${rawPath}` });
  }
  return absolutePath;
}

export function resolveAcpHostFsPath(location: ProjectLocation, rawPath: string): string {
  const absolutePath = resolveAcpProjectPath(location, rawPath);
  if (location.kind !== "wsl" || isWindowsAbsolutePath(absolutePath)) {
    return absolutePath;
  }
  const relative = posix.relative(location.linuxPath, absolutePath);
  return relative === ""
    ? location.uncPath
    : win32.join(location.uncPath, ...relative.split("/").filter(Boolean));
}

export function isAcpHomeScopeLocation(location: ProjectLocation): boolean {
  return isHomeScopeLocation(location);
}

export function resolveAcpReadableHostFsPath(
  location: ProjectLocation,
  rawPath: string,
  agentHomeDirs: readonly string[] = [],
): string {
  const absolutePath = resolveAcpResourcePath(location, rawPath);
  if (isProjectRelativePath(location, absolutePath)) {
    return resolveAcpHostFsPath(location, rawPath);
  }
  const normalizedPath = normalizeAcpPath(location, absolutePath);
  if (
    !isAcpHomeScopeLocation(location) &&
    !isAgentSkillReadPath(location, normalizedPath) &&
    !isAgentHomeDirPath(location, normalizedPath, agentHomeDirs)
  ) {
    throw RequestError.invalidParams({ message: `Path is outside the project: ${rawPath}` });
  }
  return toHostFsPathOutsideProject(location, normalizedPath);
}

/**
 * When an ACP agent asks for a project-relative skill path that is not
 * on disk (Grok stores `~/.agents/skills/foo` as `{cwd}/.agents/skills/foo`
 * after joining the catalog's relative root against the session cwd), map
 * it to the matching user-global skill file. Only well-known skill roots
 * are rewritten; regular project files are left alone.
 */
export function resolveAcpGlobalSkillFallbackHostFsPath(
  location: ProjectLocation,
  rawPath: string,
): string | undefined {
  const absolutePath = normalizeAcpPath(location, resolveAcpResourcePath(location, rawPath));
  if (!isProjectRelativePath(location, absolutePath)) return undefined;

  const projectRoot = location.kind === "wsl" ? location.linuxPath : location.path;
  const relative =
    location.kind === "windows"
      ? win32.relative(projectRoot, absolutePath)
      : posix.relative(projectRoot, absolutePath);
  const posixRelative = relative.replace(/\\/gu, "/");
  const matched = ACP_SKILL_READ_DIRS.find(
    (dir) => posixRelative === dir || posixRelative.startsWith(`${dir}/`),
  );
  if (!matched || posixRelative === matched) return undefined;

  const home = userHomePrefix(location);
  if (!home) return undefined;

  const fallback =
    location.kind === "windows"
      ? win32.join(home, ...posixRelative.split("/"))
      : posix.join(home, posixRelative);
  return toHostFsPathOutsideProject(location, fallback);
}

/**
 * Like {@link resolveAcpHostFsPath}, but with the provider's declared
 * home-relative carve-outs (`agentHomeDirs`) writable in addition to the
 * project root. Global skill directories stay read-only — they are
 * deliberately NOT honored here.
 */
export function resolveAcpWritableHostFsPath(
  location: ProjectLocation,
  rawPath: string,
  agentHomeDirs: readonly string[] = [],
): string {
  const absolutePath = resolveAcpResourcePath(location, rawPath);
  if (isProjectRelativePath(location, absolutePath)) {
    return resolveAcpHostFsPath(location, rawPath);
  }
  const normalizedPath = normalizeAcpPath(location, absolutePath);
  if (
    !isAcpHomeScopeLocation(location) &&
    !isAgentHomeDirPath(location, normalizedPath, agentHomeDirs)
  ) {
    throw RequestError.invalidParams({ message: `Path is outside the project: ${rawPath}` });
  }
  return toHostFsPathOutsideProject(location, normalizedPath);
}

function toHostFsPathOutsideProject(location: ProjectLocation, normalizedPath: string): string {
  if (location.kind === "wsl" && !isWindowsAbsolutePath(normalizedPath)) {
    return toWslUncPath(location.distro, normalizedPath);
  }
  return normalizedPath;
}

export function toAcpResourceUri(location: ProjectLocation, rawPath: string): string {
  const absolutePath = resolveAcpResourcePath(location, rawPath);
  if (isWindowsAbsolutePath(absolutePath)) {
    // Emit the legacy "file://C:/..." (two-slash) form for Windows absolute
    // paths instead of RFC-8089's "file:///C:/...". Gemini-CLI's ACP handler
    // slices off exactly "file://" and feeds the remainder into path.resolve
    // against the workspace cwd; with the standard three-slash form, the
    // leading "/" makes Windows treat "/C:/..." as drive-relative, producing
    // "C:\C:\..." and a "path not in workspace" rejection.
    return pathToFileURL(absolutePath).href.replace(/^file:\/\/\//, "file://");
  }
  switch (location.kind) {
    case "windows":
      return pathToFileURL(absolutePath).href;
    case "wsl":
    case "posix":
      return new URL(`file://${absolutePath.replace(/\\/g, "/")}`).href;
  }
}

export function guessMimeType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

export function sliceTextFileContent(
  content: string,
  line: number | null | undefined,
  limit: number | null | undefined,
): string {
  if (line == null && limit == null) return content;
  const startLine = Math.max(1, Math.trunc(line ?? 1));
  const maxLines =
    limit === undefined || limit === null ? undefined : Math.max(0, Math.trunc(limit));
  const lines = content.split(/\r?\n/u);
  const selected = lines.slice(
    startLine - 1,
    maxLines === undefined ? undefined : startLine - 1 + maxLines,
  );
  return selected.join("\n");
}

function isAgentSkillReadPath(location: ProjectLocation, absolutePath: string): boolean {
  return ACP_SKILL_READ_DIRS.some((dir) => isUserHomeRelativePath(location, absolutePath, dir));
}

function userHomePrefix(location: ProjectLocation): string | undefined {
  switch (location.kind) {
    case "windows": {
      const match = /^([A-Za-z]:[\\/]Users[\\/][^\\/]+)/i.exec(homedir());
      return match?.[1];
    }
    case "posix": {
      const home = homedir();
      return /^\/(?:home\/[^/]+|Users\/[^/]+|root)$/.test(home) ? home : undefined;
    }
    case "wsl": {
      const match = /^(\/(?:home\/[^/]+|Users\/[^/]+|root))(?:\/|$)/.exec(location.linuxPath);
      return match?.[1];
    }
  }
}

function isAgentHomeDirPath(
  location: ProjectLocation,
  absolutePath: string,
  agentHomeDirs: readonly string[],
): boolean {
  return agentHomeDirs.some((dir) => isUserHomeRelativePath(location, absolutePath, dir));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * True when `absolutePath` points strictly inside `<user home>/<homeRelativeDir>`
 * (posix-style relative dir, e.g. ".agents/skills" or ".kimi-code"). The home
 * root itself does not match — only files/dirs beneath it.
 */
function isUserHomeRelativePath(
  location: ProjectLocation,
  absolutePath: string,
  homeRelativeDir: string,
): boolean {
  const segments = homeRelativeDir.split("/").filter(Boolean).map(escapeRegExp);
  switch (location.kind) {
    case "windows": {
      const dirPattern = segments.join("[\\\\/]");
      const match = new RegExp(
        `^([A-Za-z]:[\\\\/]Users[\\\\/][^\\\\/]+[\\\\/]${dirPattern})(?:[\\\\/].*)?$`,
        "i",
      ).exec(absolutePath);
      if (!match) return false;
      const root = match[1]!;
      const relative = win32.relative(root, absolutePath);
      return relative !== "" && !relative.startsWith("..") && !win32.isAbsolute(relative);
    }
    case "wsl":
    case "posix": {
      const dirPattern = segments.join("/");
      const match = new RegExp(`^(/(?:home/[^/]+|Users/[^/]+|root)/${dirPattern})(?:/.*)?$`).exec(
        absolutePath,
      );
      if (!match) return false;
      const root = match[1]!;
      const relative = posix.relative(root, absolutePath);
      return relative !== "" && !relative.startsWith("..") && !posix.isAbsolute(relative);
    }
  }
}

function normalizeAcpPath(location: ProjectLocation, absolutePath: string): string {
  if (isWindowsAbsolutePath(absolutePath)) return win32.normalize(absolutePath);
  return location.kind === "windows"
    ? win32.normalize(absolutePath)
    : posix.normalize(absolutePath);
}

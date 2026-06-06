import { posix, win32 } from "node:path";
import { pathToFileURL } from "node:url";
import { RequestError } from "@agentclientprotocol/sdk";
import { toWslUncPath } from "@/shared/wsl";
import type { NonSshProjectLocation } from "../base";

/** CWD to pass into the ACP session (the agent's working directory). */
export function resolveSessionCwd(location: NonSshProjectLocation): string {
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
export function resolveSpawnCwd(location: NonSshProjectLocation): string | undefined {
  // WSL projects launch wsl.exe from Windows — the linux path doesn't exist
  // on the host FS. wsl.exe receives its cwd via --cd, so no spawn cwd needed.
  if (location.kind === "wsl") return undefined;
  return location.path;
}

export function basenameForProjectPath(location: NonSshProjectLocation, filePath: string): string {
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

export function resolveAcpResourcePath(location: NonSshProjectLocation, rawPath: string): string {
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

function isProjectRelativePath(location: NonSshProjectLocation, absolutePath: string): boolean {
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

export function resolveAcpProjectPath(location: NonSshProjectLocation, rawPath: string): string {
  const absolutePath = resolveAcpResourcePath(location, rawPath);
  if (!isProjectRelativePath(location, absolutePath)) {
    throw RequestError.invalidParams({ message: `Path is outside the project: ${rawPath}` });
  }
  return absolutePath;
}

export function resolveAcpHostFsPath(location: NonSshProjectLocation, rawPath: string): string {
  const absolutePath = resolveAcpProjectPath(location, rawPath);
  if (location.kind !== "wsl" || isWindowsAbsolutePath(absolutePath)) {
    return absolutePath;
  }
  const relative = posix.relative(location.linuxPath, absolutePath);
  return relative === ""
    ? location.uncPath
    : win32.join(location.uncPath, ...relative.split("/").filter(Boolean));
}

export function resolveAcpReadableHostFsPath(
  location: NonSshProjectLocation,
  rawPath: string,
): string {
  const absolutePath = resolveAcpResourcePath(location, rawPath);
  if (isProjectRelativePath(location, absolutePath)) {
    return resolveAcpHostFsPath(location, rawPath);
  }
  const normalizedPath = normalizeAcpPath(location, absolutePath);
  if (!isAgentSkillReadPath(location, normalizedPath)) {
    throw RequestError.invalidParams({ message: `Path is outside the project: ${rawPath}` });
  }
  if (location.kind === "wsl" && !isWindowsAbsolutePath(normalizedPath)) {
    return toWslUncPath(location.distro, normalizedPath);
  }
  return normalizedPath;
}

export function toAcpResourceUri(location: NonSshProjectLocation, rawPath: string): string {
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

function isAgentSkillReadPath(location: NonSshProjectLocation, absolutePath: string): boolean {
  switch (location.kind) {
    case "windows": {
      const match =
        /^([A-Za-z]:[\\/]Users[\\/][^\\/]+[\\/]\\.agents[\\/]skills)(?:[\\/].*)?$/i.exec(
          absolutePath,
        );
      if (!match) return false;
      const root = match[1]!;
      const relative = win32.relative(root, absolutePath);
      return relative !== "" && !relative.startsWith("..") && !win32.isAbsolute(relative);
    }
    case "wsl":
    case "posix": {
      const match = /^(\/(?:home\/[^/]+|Users\/[^/]+|root)\/\.agents\/skills)(?:\/.*)?$/.exec(
        absolutePath,
      );
      if (!match) return false;
      const root = match[1]!;
      const relative = posix.relative(root, absolutePath);
      return relative !== "" && !relative.startsWith("..") && !posix.isAbsolute(relative);
    }
  }
}

function normalizeAcpPath(location: NonSshProjectLocation, absolutePath: string): string {
  if (isWindowsAbsolutePath(absolutePath)) return win32.normalize(absolutePath);
  return location.kind === "windows"
    ? win32.normalize(absolutePath)
    : posix.normalize(absolutePath);
}

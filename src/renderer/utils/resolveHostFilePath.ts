import type { ProjectLocation } from "@/shared/contracts";
import { resolveAbsolutePath } from "./resolveAbsolutePath";
import { joinProjectPosixPath, toWslUncPath } from "@/shared/wsl";

function isHostAbsolutePath(path: string): boolean {
  return (
    path.startsWith("/") ||
    path.startsWith("\\\\") ||
    path.startsWith("//") ||
    /^[A-Za-z]:[\\/]/.test(path)
  );
}

/**
 * Resolve a project-relative or absolute path to a host-OS path that a
 * `file://` or `poracode-local://` URL can address (UNC for WSL linux paths).
 */
export function resolveHostFilePath(path: string, projectLocation?: ProjectLocation): string {
  if (!projectLocation) return path;

  if (projectLocation.kind === "wsl") {
    // Already a Windows/UNC host path (e.g. from a file picker).
    if (path.startsWith("\\\\") || path.startsWith("//") || /^[A-Za-z]:[\\/]/.test(path)) {
      return path;
    }
    const linuxPath = path.startsWith("/") ? path : joinProjectPosixPath(projectLocation, path);
    return toWslUncPath(projectLocation.distro, linuxPath);
  }

  if (isHostAbsolutePath(path)) return path;
  return resolveAbsolutePath(projectLocation, path);
}

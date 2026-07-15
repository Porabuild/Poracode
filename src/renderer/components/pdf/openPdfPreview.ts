import { readBridge } from "@/renderer/bridge";
import type { ProjectLocation } from "@/shared/contracts";
import { toFileUrl } from "@/shared/promptContent";
import { resolveAbsolutePath } from "@/renderer/utils/resolveAbsolutePath";
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
 * Resolve a project-relative or absolute path to a host-OS path for `file://`
 * (UNC for WSL linux paths).
 */
export function resolvePdfHostPath(path: string, projectLocation?: ProjectLocation): string {
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

/**
 * Open a local PDF in the in-app browser (Chromium PDF viewer).
 * Uses `browserCreateTab({ reveal: true })` so presentation matches link opens
 * (right panel vs overlay; floats above the file editor when needed).
 */
export function openPdfPreview(absolutePath: string, projectLocation?: ProjectLocation): void {
  const hostPath = resolvePdfHostPath(absolutePath, projectLocation);
  void readBridge()
    .browserCreateTab({ url: toFileUrl(hostPath), activate: true, reveal: true })
    .catch(() => {});
}

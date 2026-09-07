/**
 * Local image resolver for ACP sessions.
 *
 * Some ACP agents report an image result without inlining it: the tool result
 * either carries an image content block with only a `uri` (no base64 `data`),
 * or carries no image block at all and only names the file through the tool
 * call's `locations`. The canonical mapper has no filesystem access of its own
 * (it must stay pure), so the session layer injects this resolver and the
 * mapper calls it to turn such a reference into a renderable `data:` URL.
 *
 * Deliberately synchronous: the mapper runs inside notification dispatch and
 * has no await point. That is only safe because reads are capped hard by
 * extension allow-list and file size.
 */

import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ProjectLocation } from "@/shared/contracts";
import { toWslUncPath } from "@/shared/wsl";
import { isWindowsAbsolutePath } from "./sessionPaths";

/**
 * Raster image extensions we are willing to inline as `data:` URLs.
 *
 * Intentionally narrower than the shared `isImagePath`: `svg` is an executable
 * document format, not a raster bitmap, so it is excluded from this
 * read-from-disk-and-inline path even though the composer accepts it as an
 * attachment. Exotic formats (bmp/ico/avif) are omitted because they buy
 * nothing here and widen the read surface.
 */
const INLINE_IMAGE_MIME_BY_EXT: Readonly<Record<string, string>> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

/** Hard cap on the file size we are willing to read synchronously and inline. */
const MAX_INLINE_IMAGE_BYTES = 5 * 1024 * 1024;

interface CacheEntry {
  mtimeMs: number;
  size: number;
  dataUrl: string;
}

/**
 * Build a per-session `resolveLocalImage` hook.
 *
 * Returns `undefined` (never throws) for anything that is not a readable,
 * small, allow-listed raster image on this host's filesystem.
 */
export function createAcpLocalImageResolver(
  location: ProjectLocation,
): (pathOrFileUri: string) => string | undefined {
  const cache = new Map<string, CacheEntry>();
  return (pathOrFileUri: string): string | undefined => {
    try {
      const filePath = toLocalImagePath(pathOrFileUri);
      if (!filePath) return undefined;
      const mimeType = inlineImageMimeType(filePath);
      if (!mimeType) return undefined;
      const hostPath = toHostReadablePath(location, filePath);
      if (!hostPath) return undefined;
      const stats = statSync(hostPath);
      if (!stats.isFile()) return undefined;
      if (stats.size <= 0 || stats.size > MAX_INLINE_IMAGE_BYTES) return undefined;
      // Cache key is (path, mtime, size) so an edit in place invalidates the
      // previously inlined bytes instead of replaying a stale picture.
      const cached = cache.get(hostPath);
      if (cached && cached.mtimeMs === stats.mtimeMs && cached.size === stats.size) {
        return cached.dataUrl;
      }
      const dataUrl = `data:${mimeType};base64,${readFileSync(hostPath).toString("base64")}`;
      cache.set(hostPath, { mtimeMs: stats.mtimeMs, size: stats.size, dataUrl });
      return dataUrl;
    } catch {
      return undefined;
    }
  };
}

/** Accept only `file://` URIs and absolute filesystem paths. */
function toLocalImagePath(pathOrFileUri: string): string | undefined {
  const trimmed = pathOrFileUri.trim();
  if (trimmed.length === 0) return undefined;
  if (/^file:\/\//i.test(trimmed)) {
    // Tolerate the legacy two-slash Windows form ("file://C:/x.png") that some
    // ACP agents emit alongside RFC-8089's three-slash form.
    const normalized = /^file:\/\/[A-Za-z]:/.test(trimmed)
      ? trimmed.replace(/^file:\/\//, "file:///")
      : trimmed;
    try {
      return fileURLToPath(normalized);
    } catch {
      return undefined;
    }
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return undefined;
  if (!trimmed.startsWith("/") && !isWindowsAbsolutePath(trimmed)) return undefined;
  return trimmed;
}

function inlineImageMimeType(filePath: string): string | undefined {
  const ext = filePath.slice(filePath.lastIndexOf(".") + 1).toLowerCase();
  return INLINE_IMAGE_MIME_BY_EXT[ext];
}

/**
 * Map an agent-visible path onto a path this process can actually read.
 *
 * WSL projects report Linux paths that don't exist on the Windows host, so we
 * translate them through the same `\\wsl$\<distro>` UNC bridge the ACP fs
 * layer uses (`sessionPaths.resolveAcpHostFsPath`). When the host isn't
 * Windows there is no such bridge, so we skip rather than read the wrong
 * filesystem.
 */
function toHostReadablePath(location: ProjectLocation, filePath: string): string | undefined {
  if (location.kind !== "wsl" || isWindowsAbsolutePath(filePath)) return filePath;
  if (process.platform !== "win32") return undefined;
  return toWslUncPath(location.distro, filePath);
}

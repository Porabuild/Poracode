import { readFile, stat } from "node:fs/promises";
import type { ServerResponse } from "node:http";
import { extname, resolve } from "node:path";
import { RemoteHttpError } from "../auth";

/** Served image payloads are capped so a paired device can't pull huge files. */
const MAX_LOCAL_IMAGE_BYTES = 20 * 1024 * 1024;

/**
 * The remote image endpoint trades the `poracode-local` scheme's renderer
 * sandbox for a token-gated image read, so it serves image-ish extensions only
 * — unlike the in-app protocol handler, it must never fall back to arbitrary
 * files. Content-Types are keyed by this same set.
 */
const LOCAL_IMAGE_CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
};

/**
 * Serves a local image file to a paired remote client (`GET /api/files/image`).
 * Mirrors the desktop `poracode-local` protocol handler's native-path
 * semantics (a plain absolute native path, no WSL handling — see
 * `attachments/localFiles.ts`).
 */
export async function writeLocalImageFile(
  res: ServerResponse,
  rawPath: string | null,
): Promise<void> {
  if (!rawPath || rawPath.trim().length === 0 || rawPath.includes("\0")) {
    throw new RemoteHttpError("invalid_path", "An absolute image path is required.", 400);
  }
  if (!/^[A-Za-z]:[\\/]/.test(rawPath) && !rawPath.startsWith("/")) {
    throw new RemoteHttpError("invalid_path", "The image path must be absolute.", 400);
  }
  const contentType = LOCAL_IMAGE_CONTENT_TYPES[extname(rawPath).toLowerCase()];
  if (!contentType) {
    throw new RemoteHttpError("unsupported_media_type", "Only image files can be served.", 415);
  }
  const filePath = resolve(rawPath);
  let stats;
  try {
    stats = await stat(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new RemoteHttpError("image_not_found", "The image file does not exist.", 404);
    }
    throw error;
  }
  if (!stats.isFile()) {
    throw new RemoteHttpError("image_not_found", "The image path is not a file.", 404);
  }
  if (stats.size > MAX_LOCAL_IMAGE_BYTES) {
    throw new RemoteHttpError("image_too_large", "The image file is too large.", 413);
  }
  const data = await readFile(filePath);
  res.writeHead(200, {
    "content-type": contentType,
    "content-length": data.length,
    "cache-control": "private, max-age=300",
  });
  res.end(data);
}

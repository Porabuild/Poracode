/**
 * File-part helpers for the OpenCode canonical mapper.
 *
 * OpenCode surfaces produced files as `FilePart { mime, filename, url }`
 * parts on assistant messages, and as `attachments: FilePart[]` on completed
 * tool states. `url` may be a `file://` URL or a bounded base64 `data:` URL.
 * File URLs are never promoted directly into an `<img src>` (see the trust
 * note in the renderer's `imageViewSource`):
 * images resolve synchronously to self-contained `data:` URLs via a bounded,
 * best-effort read (same pattern as Codex's `readCodexImageViewDataUrl`),
 * while everything else surfaces as a file-reference row.
 */

import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ProjectLocation } from "@/shared/contracts";
import { toWslUncPath } from "@/shared/wsl";

/**
 * Upper bound for an inline image read. Beyond this the row still surfaces
 * with its file reference, but no `data:` bytes ride the event — keeps a
 * stray multi-hundred-megabyte artifact from stalling the mapper loop.
 */
export const OPENCODE_INLINE_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

export interface OpenCodeFileRef {
  /** Agent-reported path decoded from the part's `file://` URL. */
  path?: string;
  /**
   * Host-readable path for the supervisor's bounded image read. For WSL
   * sessions the agent path is distro-local, so this is the UNC translation;
   * for native sessions it equals `path`.
   */
  hostPath?: string;
  /** Bounded inline image supplied directly by OpenCode tool output. */
  dataUrl?: string;
  mime: string;
  filename: string;
  isImage: boolean;
}

export function isImageMime(mime: string): boolean {
  return mime.toLowerCase().startsWith("image/");
}

/**
 * Decode a `file://` URL to a filesystem path. Returns `undefined` for
 * non-file URLs (inline `data:`, remote `https:`, …) so callers fall back to
 * the reference-only payload instead of guessing.
 */
export function fileUrlToFsPath(url: string): string | undefined {
  if (!url.toLowerCase().startsWith("file:")) return undefined;
  try {
    return fileURLToPath(url);
  } catch {
    try {
      return decodeURIComponent(new URL(url).pathname);
    } catch {
      return undefined;
    }
  }
}

function boundedDataUrlBytes(url: string, mime: string): Buffer | undefined {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/i.exec(url);
  if (!match || match[1]?.toLowerCase() !== mime.toLowerCase()) return undefined;
  const encoded = match[2] ?? "";
  if (encoded.length % 4 !== 0) return undefined;
  const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0;
  const size = Math.floor((encoded.length * 3) / 4) - padding;
  return size > 0 && size <= OPENCODE_INLINE_IMAGE_MAX_BYTES
    ? Buffer.from(encoded, "base64")
    : undefined;
}

let attachmentDirectory: string | undefined;
const materializedAttachments = new Map<string, string>();

function materializeDataAttachment(url: string, filename: string, bytes: Buffer): string {
  const existing = materializedAttachments.get(url);
  if (existing) return existing;
  attachmentDirectory ??= mkdtempSync(join(tmpdir(), "poracode-opencode-attachments-"));
  const safeFilename = filename.replace(/[^A-Za-z0-9._-]/g, "_") || "attachment";
  const path = join(attachmentDirectory, `${materializedAttachments.size}-${safeFilename}`);
  writeFileSync(path, bytes, { flag: "wx" });
  materializedAttachments.set(url, path);
  return path;
}

function filenameOf(path: string, fallback: string): string {
  const base = path.split(/[\\/]/).pop()?.trim();
  return base && base.length > 0 ? base : fallback;
}

/**
 * Normalize an OpenCode file part (or tool attachment) into a renderer-safe
 * reference. Unknown shapes return `undefined` — the caller keeps the text
 * output rather than emitting a broken row.
 */
export function toOpenCodeFileRef(
  part: { mime?: unknown; filename?: unknown; url?: unknown },
  messageID: string,
  location?: ProjectLocation,
): OpenCodeFileRef | undefined {
  if (typeof part.mime !== "string" || part.mime.length === 0) return undefined;
  if (typeof part.url !== "string" || part.url.length === 0) return undefined;
  let path = fileUrlToFsPath(part.url);
  const dataBytes = path ? undefined : boundedDataUrlBytes(part.url, part.mime);
  if (!path && !dataBytes) return undefined;
  const filename =
    typeof part.filename === "string" && part.filename.trim().length > 0
      ? part.filename.trim()
      : path
        ? filenameOf(path, messageID)
        : messageID;
  const dataUrl = dataBytes && isImageMime(part.mime) ? part.url : undefined;
  if (!path && dataBytes && !dataUrl) {
    path = materializeDataAttachment(part.url, filename, dataBytes);
  }
  return {
    ...(path ? { path, hostPath: resolveHostPath(path, location) } : {}),
    ...(dataUrl ? { dataUrl } : {}),
    mime: part.mime,
    filename,
    isImage: isImageMime(part.mime),
  };
}

/**
 * Translate an agent-reported path into something the host can read.
 * Native paths pass through; distro-local WSL paths become UNC paths
 * (mirrors Codex's `readCodexImageViewDataUrl`).
 */
function resolveHostPath(path: string, location?: ProjectLocation): string {
  if (location?.kind === "wsl" && path.startsWith("/")) {
    return toWslUncPath(location.distro, path);
  }
  return path;
}

/**
 * Read an image file into a renderable `data:` URL — the only image form the
 * timeline renders inline. Bounded and best-effort: oversized or unreadable
 * files resolve to `undefined` and the caller keeps the file-reference row.
 */
export function readOpenCodeImageDataUrl(ref: OpenCodeFileRef): string | undefined {
  if (!ref.isImage) return undefined;
  if (ref.dataUrl) return ref.dataUrl;
  if (!ref.hostPath) return undefined;
  try {
    const size = statSync(ref.hostPath).size;
    if (!Number.isFinite(size) || size <= 0 || size > OPENCODE_INLINE_IMAGE_MAX_BYTES) {
      return undefined;
    }
    const bytes = readFileSync(ref.hostPath);
    if (bytes.length === 0) return undefined;
    return fileBytesToDataUrl(bytes, ref.mime);
  } catch {
    return undefined;
  }
}

/** Build a `data:` URL from raw bytes — the only image form the timeline renders inline. */
export function fileBytesToDataUrl(data: Uint8Array, mime: string): string {
  return `data:${mime};base64,${Buffer.from(data).toString("base64")}`;
}

/**
 * Resolve a completed tool state's `attachments: FilePart[]` into renderable
 * `data:` URLs for the canonical `images` channel and file locations for
 * non-image attachments. Unreadable or oversized attachments are skipped.
 */
export function resolveOpenCodeAttachments(
  attachments: unknown,
  messageID: string,
  location?: ProjectLocation,
): { images: string[]; locations: Array<{ path: string }> } {
  if (!Array.isArray(attachments)) return { images: [], locations: [] };
  const images: string[] = [];
  const locations: Array<{ path: string }> = [];
  for (const attachment of attachments) {
    if (!attachment || typeof attachment !== "object") continue;
    const ref = toOpenCodeFileRef(
      attachment as { mime?: unknown; filename?: unknown; url?: unknown },
      messageID,
      location,
    );
    if (!ref) continue;
    if (ref.path) locations.push({ path: ref.path });
    const dataUrl = readOpenCodeImageDataUrl(ref);
    if (dataUrl) images.push(dataUrl);
  }
  return { images, locations };
}

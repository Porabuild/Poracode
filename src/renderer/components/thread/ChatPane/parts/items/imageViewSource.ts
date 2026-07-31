/**
 * Resolve a renderable image out of an `image_view` tool-call payload.
 *
 * Agents that generate images (e.g. Codex's `imageGeneration`, Claude image
 * tools) carry the picture inline on the tool-call `result` — usually as raw
 * base64 PNG, sometimes as a `data:` URL or a `{ image | b64_json | ... }`
 * object. This module turns that into a single {@link ImageViewSource} the
 * renderer can drop straight into an `<img>` — or `null` when the payload has
 * no usable image yet (still running, errored, or genuinely not an image), in
 * which case the row falls back to the generic tool-call accordion.
 *
 * Security note: we deliberately resolve ONLY self-contained inline images
 * (`data:` URLs, magic-detected base64, raw `<svg>`). We never promote an
 * agent-supplied `http(s)://`, `file://`, `poracode-local://`, or filesystem
 * path into an `<img src>` — that would let a malicious/prompt-injected tool
 * result trigger an outbound request (tracking pixel / SSRF) or read a local
 * file on the user's machine simply because the user viewed the thread. Such
 * payloads fall back to the inert tool-call accordion.
 *
 * `imageViewRendersInline` is the cheap O(1) probe used on the hot timeline
 * selector path (grouping): it never allocates the multi-MB data URL — it only
 * inspects a short prefix. `resolveImageViewSource` does the full build and is
 * memoized per item by the component.
 */

import { msg } from "@lingui/core/macro";
import { i18n } from "@/renderer/i18n/i18n";
import {
  classifyInlineImageCandidate,
  findRenderableInlineImageCandidate,
  inlineImagePayloadRenders,
  type InlineImageClassification,
} from "@/shared/inlineImagePayload";
import { readImageDimensions } from "@/shared/imageDimensions";
import { findDisplayableImageRef, type RemoteImageRefValue } from "@/shared/remote";
import { resolveRemoteImageRefUrl } from "@/shared/imageRefDisplay";

export interface ImageViewSource {
  /** Renderable image URL. */
  src: string;
  /** Image MIME type, e.g. `"image/png"`. */
  mime: string;
  /** Lower-case file extension without the dot, e.g. `"png"`. */
  extension: string;
  /** Suggested file name for downloads, e.g. `"generated-image.png"`. */
  fileName: string;
  /** Accessible label / alt text — the prompt when available, else a generic label. */
  alt: string;
  /** Intrinsic dimensions when cheaply readable from the image header. */
  width?: number;
  height?: number;
  /**
   * Tiny blurred stand-in painted in the reserved slot while the full image
   * loads. Only present for host-held images, which are the ones that take a
   * round trip to arrive.
   */
  preview?: string;
}

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
  "image/svg+xml": "svg",
  "image/avif": "avif",
};

const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  avif: "image/avif",
};

/**
 * Will this `image_view` row render as a standalone inline image card (vs. fall
 * back to the generic tool-call accordion)? Mirrors {@link ImageView}'s render
 * decision so the grouping selector and the component never disagree: an image
 * is shown only when the payload carries a renderable image AND did not error.
 */
export function imageViewRendersInline(payload: unknown): boolean {
  // On remote clients the host replaces inline image bytes with a reference, so
  // the row must still be recognized as an image here or grouping would demote
  // it to a plain tool-call accordion.
  if (readStatus(payload) !== "error" && findDisplayableImageRef(payload)) return true;
  return inlineImagePayloadRenders(payload);
}

/** Full resolution: returns the `<img>`-ready source, or `null` when there's no image. */
export function resolveImageViewSource(payload: unknown): ImageViewSource | null {
  const ref = readStatus(payload) === "error" ? null : findDisplayableImageRef(payload);
  if (ref) return imageViewSourceFromRef(ref, payload);
  const found = findRenderableInlineImageCandidate(payload);
  if (!found) return null;
  const { value, classification } = found;
  const src = buildSrc(value, classification);
  if (!src) return null;
  const mime = classification.mime;
  const extension = EXTENSION_BY_MIME[mime] ?? "png";
  const promptText = readPromptText(payload);
  const alt = promptText ?? i18n._(msg`Generated image`);
  const dimensions = readImageDimensions(value, classification);
  return {
    src,
    mime,
    extension,
    fileName: buildFileName(promptText ?? "", extension),
    alt,
    ...dimensions,
  };
}

/**
 * Build an {@link ImageViewSource} for an image the host is holding on our
 * behalf. Returns null when nothing can resolve the reference to a URL (the
 * desktop shell, or a remote client without an active session) so the row falls
 * back to the inert tool-call accordion rather than rendering a broken image.
 *
 * `width`/`height` ride along on the reference precisely so the timeline can
 * reserve layout here without having fetched the image yet.
 */
function imageViewSourceFromRef(
  ref: RemoteImageRefValue,
  payload: unknown,
): ImageViewSource | null {
  const src = resolveRemoteImageRefUrl(ref);
  if (!src) return null;
  const extension = EXTENSION_BY_MIME[ref.mime] ?? "png";
  const promptText = readPromptText(payload);
  return {
    src,
    mime: ref.mime,
    extension,
    fileName: buildFileName(promptText ?? "", extension),
    alt: promptText ?? i18n._(msg`Generated image`),
    ...(ref.width !== undefined && ref.height !== undefined
      ? { width: ref.width, height: ref.height }
      : {}),
    ...(ref.preview ? { preview: ref.preview } : {}),
  };
}

/**
 * Build an {@link ImageViewSource} from a canonical assistant-message image
 * content block (`{ kind: "image", dataUrl, mimeType?, name? }`). Returns null
 * when the data URL isn't a recognizable inline image.
 */
export function imageViewSourceFromImageBlock(block: {
  dataUrl?: unknown;
  mimeType?: unknown;
  name?: unknown;
}): ImageViewSource | null {
  if (typeof block.dataUrl !== "string" || block.dataUrl.length === 0) return null;
  const classification = classifyInlineImageCandidate(block.dataUrl);
  if (!classification) return null;
  const src = buildSrc(block.dataUrl, classification);
  if (!src) return null;
  const mime =
    typeof block.mimeType === "string" && block.mimeType.startsWith("image/")
      ? block.mimeType
      : classification.mime;
  const extension = EXTENSION_BY_MIME[mime] ?? "png";
  const name =
    typeof block.name === "string" && block.name.trim().length > 0 ? block.name.trim() : undefined;
  const alt = name ?? i18n._(msg`Generated image`);
  const dimensions = readImageDimensions(block.dataUrl, classification);
  return {
    src,
    mime,
    extension,
    fileName: buildFileName(name ?? "", extension),
    alt,
    ...dimensions,
  };
}

/** Build the shared card metadata for an image already approved by markdown sanitization. */
export function imageViewSourceFromMarkdownImage({
  src,
  alt,
  width,
  height,
}: {
  src: string;
  alt: string;
  width?: unknown;
  height?: unknown;
}): ImageViewSource {
  const mime = readMarkdownImageMime(src);
  const extension = EXTENSION_BY_MIME[mime] ?? readMarkdownImageExtension(src) ?? "png";
  const fileName = readMarkdownImageFileName(src, extension) ?? buildFileName(alt, extension);
  const dimensions = readExplicitDimensions(width, height);
  return {
    src,
    mime,
    extension,
    fileName,
    alt,
    ...dimensions,
  };
}

function readMarkdownImageMime(src: string): string {
  const dataMime = /^data:([^;,]+)/i.exec(src)?.[1]?.toLowerCase();
  if (dataMime?.startsWith("image/")) return dataMime;
  const extension = readMarkdownImageExtension(src);
  return extension ? (MIME_BY_EXTENSION[extension] ?? "image/*") : "image/*";
}

function readMarkdownImageExtension(src: string): string | undefined {
  const path = stripUrlSuffix(src);
  const match = /\.([a-z0-9]+)$/i.exec(path);
  if (!match) return undefined;
  const extension = match[1]!.toLowerCase();
  if (!(extension in MIME_BY_EXTENSION)) return undefined;
  return extension === "jpeg" ? "jpg" : extension;
}

function readMarkdownImageFileName(src: string, extension: string): string | undefined {
  if (/^(?:data|blob):/i.test(src)) return undefined;
  const path = decodeUrlPath(stripUrlSuffix(src));
  const candidate = path.split(/[\\/]/).at(-1)?.trim();
  if (!candidate) return undefined;
  const invalidFileNameCharacters = '<>:"/\\|?*';
  const safeName = Array.from(candidate)
    .map((character) =>
      character.charCodeAt(0) < 32 || invalidFileNameCharacters.includes(character)
        ? "-"
        : character,
    )
    .join("");
  return safeName.includes(".") ? safeName : `${safeName}.${extension}`;
}

function stripUrlSuffix(src: string): string {
  return src.split(/[?#]/, 1)[0] ?? src;
}

function decodeUrlPath(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

function readExplicitDimensions(
  rawWidth: unknown,
  rawHeight: unknown,
): { width: number; height: number } | undefined {
  const width = typeof rawWidth === "number" ? rawWidth : Number(rawWidth);
  const height = typeof rawHeight === "number" ? rawHeight : Number(rawHeight);
  return Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0
    ? { width, height }
    : undefined;
}

function buildSrc(value: string, classification: InlineImageClassification): string | null {
  switch (classification.kind) {
    case "dataUrl":
      return value;
    case "rawSvg":
      return `data:image/svg+xml;utf8,${encodeURIComponent(value.trim())}`;
    case "base64": {
      const clean = value.replace(/\s+/g, "");
      return clean.length > 0 ? `data:${classification.mime};base64,${clean}` : null;
    }
  }
}

function readPromptText(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const record = payload as Record<string, unknown>;
  const args = record.args;
  if (args && typeof args === "object" && !Array.isArray(args)) {
    const argsRecord = args as Record<string, unknown>;
    for (const key of ["prompt", "text", "description", "caption", "query"]) {
      const value = argsRecord[key];
      if (typeof value === "string" && value.trim().length > 0) return value.trim();
    }
  }
  const title = record.title;
  if (typeof title === "string" && title.trim().length > 0) return title.trim();
  return undefined;
}

function buildFileName(alt: string, extension: string): string {
  const slug = alt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const base = slug.length > 0 ? slug : "generated-image";
  return `${base}.${extension}`;
}

/** Mirrors `inlineImagePayload`'s status check: an errored tool call shows the
 * accordion, never an image card. */
function readStatus(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const status = (payload as Record<string, unknown>).status;
  return typeof status === "string" ? status : undefined;
}

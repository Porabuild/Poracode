import {
  EXTENSION_BY_MIME,
  buildFileName,
  imageUrlMetadata,
} from "@/renderer/utils/imageUrlMetadata";
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
  normalizeInlineImageDataUrl,
  type InlineImageClassification,
} from "@/shared/inlineImagePayload";
import { readImageDimensions } from "@/shared/imageDimensions";
import {
  findDisplayableImageRef,
  readRemoteImageRef,
  type RemoteImageRefValue,
} from "@/shared/remote";
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
export function resolveImageViewSource(
  payload: unknown,
  remoteImageRefUrl?: (ref: RemoteImageRefValue) => string,
): ImageViewSource | null {
  const ref = readStatus(payload) === "error" ? null : findDisplayableImageRef(payload);
  if (ref) return imageViewSourceFromRef(ref, payload, remoteImageRefUrl);
  const found = findRenderableInlineImageCandidate(payload);
  if (!found) return null;
  const { value } = found;
  const built = buildSrc(value, found.classification);
  if (!built) return null;
  const mime = built.classification.mime;
  const extension = EXTENSION_BY_MIME[mime] ?? "png";
  const promptText = readPromptText(payload);
  const alt = promptText ?? i18n._(msg`Generated image`);
  const dimensions = readImageDimensions(built.src, built.classification);
  return {
    src: built.src,
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
  remoteImageRefUrl?: (ref: RemoteImageRefValue) => string,
): ImageViewSource | null {
  const src = remoteImageRefUrl?.(ref) || resolveRemoteImageRefUrl(ref);
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
export function imageViewSourceFromImageBlock(
  block: {
    dataUrl?: unknown;
    mimeType?: unknown;
    name?: unknown;
  },
  remoteImageRefUrl?: (ref: RemoteImageRefValue) => string,
): ImageViewSource | null {
  const ref = readRemoteImageRef(block.dataUrl);
  if (ref) {
    const src = remoteImageRefUrl?.(ref) || resolveRemoteImageRefUrl(ref);
    if (!src) return null;
    const extension = EXTENSION_BY_MIME[ref.mime] ?? "png";
    const name =
      typeof block.name === "string" && block.name.trim().length > 0
        ? block.name.trim()
        : undefined;
    return {
      src,
      mime: ref.mime,
      extension,
      fileName: buildFileName(name ?? "", extension),
      alt: name ?? i18n._(msg`Generated image`),
      ...(ref.width !== undefined && ref.height !== undefined
        ? { width: ref.width, height: ref.height }
        : {}),
      ...(ref.preview ? { preview: ref.preview } : {}),
    };
  }
  if (typeof block.dataUrl !== "string" || block.dataUrl.length === 0) return null;
  const guessed = classifyInlineImageCandidate(block.dataUrl);
  if (!guessed) return null;
  const built = buildSrc(block.dataUrl, guessed);
  if (!built) return null;
  // The format comes from the bytes, with the data-URL label as the only
  // fallback; a block's own `mimeType` is deliberately unused so the download
  // name cannot disagree with what the pixels actually are.
  const mime = built.classification.mime;
  const extension = EXTENSION_BY_MIME[mime] ?? "png";
  const name =
    typeof block.name === "string" && block.name.trim().length > 0 ? block.name.trim() : undefined;
  const alt = name ?? i18n._(msg`Generated image`);
  const dimensions = readImageDimensions(built.src, built.classification);
  return {
    src: built.src,
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
  const { mime, extension, fileName } = imageUrlMetadata(src, alt);
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

/**
 * Build the `<img>`-ready source, repairing a provider's inline payload so what
 * reaches `src` is something Chromium can decode. Returns null for anything that
 * cannot be repaired — a URL-safe alphabet under a `;base64` label, an empty
 * body, or bytes that are not an image at all — so the row falls back to the
 * inert accordion instead of painting a broken picture.
 *
 * The returned classification always describes the emitted `src` (a data URL)
 * rather than the incoming value, so downstream readers such as the header
 * dimension probe parse the right thing.
 */
function buildSrc(
  value: string,
  classification: InlineImageClassification,
): { src: string; classification: InlineImageClassification } | null {
  if (classification.kind === "rawSvg") {
    return {
      src: `data:image/svg+xml;utf8,${encodeURIComponent(value.trim())}`,
      classification: { kind: "dataUrl", mime: "image/svg+xml" },
    };
  }
  const normalized = normalizeInlineImageDataUrl(value, classification.mime);
  if (!normalized) return null;
  return {
    src: normalized.dataUrl,
    classification: { kind: "dataUrl", mime: normalized.mime },
  };
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

/** Mirrors `inlineImagePayload`'s status check: an errored tool call shows the
 * accordion, never an image card. */
function readStatus(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const status = (payload as Record<string, unknown>).status;
  return typeof status === "string" ? status : undefined;
}

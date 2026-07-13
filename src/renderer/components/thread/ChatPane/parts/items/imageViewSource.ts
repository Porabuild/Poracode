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
 * `imageViewHasRenderableImage` is the cheap O(1) probe used on the hot timeline
 * selector path (grouping): it never allocates the multi-MB data URL — it only
 * inspects a short prefix. `resolveImageViewSource` does the full build and is
 * memoized per item by the component.
 */

import { msg } from "@lingui/core/macro";
import { i18n } from "@/renderer/i18n/i18n";

export interface ImageViewSource {
  /** Renderable inline image URL: a `data:` URL (base64) or an svg `data:` URL. */
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
}

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
  "image/svg+xml": "svg",
};

/**
 * Base64 magic prefixes → MIME. Prefixes are long enough to be unambiguous so a
 * prefix match is a reliable "this string is an encoded image" signal without
 * decoding the (potentially multi-MB) body.
 */
const BASE64_IMAGE_SIGNATURES: ReadonlyArray<readonly [string, string]> = [
  ["iVBORw0KGgo", "image/png"],
  ["/9j/", "image/jpeg"],
  ["R0lGOD", "image/gif"],
  ["UklGR", "image/webp"], // RIFF container
  ["PHN2Zw", "image/svg+xml"], // "<svg"
  ["PD94bWwg", "image/svg+xml"], // "<?xml "
];

/** Object keys that may carry an inline image string on a tool result, in priority order. */
const RESULT_STRING_KEYS = [
  "dataUrl",
  "data_url",
  "image",
  "b64_json",
  "base64",
  "png",
  "data",
  "src",
  "content",
  "text",
] as const;

/** Object keys that may carry an array of image entries on a tool result. */
const RESULT_ARRAY_KEYS = ["images", "data", "content", "output"] as const;

interface Classification {
  /** How `src` should be built from the candidate string. */
  kind: "dataUrl" | "rawSvg" | "base64";
  mime: string;
}

/**
 * Cheap probe: does this payload resolve to a renderable image? Inspects only
 * short prefixes, never building a data URL — safe to call on the hot grouping
 * selector path.
 */
export function imageViewHasRenderableImage(payload: unknown): boolean {
  return findClassifiedCandidate(payload) !== null;
}

/**
 * Will this `image_view` row render as a standalone inline image card (vs. fall
 * back to the generic tool-call accordion)? Mirrors {@link ImageView}'s render
 * decision so the grouping selector and the component never disagree: an image
 * is shown only when the payload carries a renderable image AND did not error.
 */
export function imageViewRendersInline(payload: unknown): boolean {
  return readStatus(payload) !== "error" && imageViewHasRenderableImage(payload);
}

/** Full resolution: returns the `<img>`-ready source, or `null` when there's no image. */
export function resolveImageViewSource(payload: unknown): ImageViewSource | null {
  const found = findClassifiedCandidate(payload);
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

function findClassifiedCandidate(
  payload: unknown,
): { value: string; classification: Classification } | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  // `payload.images` is the explicit, provider-agnostic channel the agent
  // mappers populate with renderable `data:` URLs (ACP/Claude image content
  // blocks). Prefer it over sniffing `result`.
  if (Array.isArray(record.images)) {
    for (const value of record.images) {
      if (typeof value !== "string" || value.length === 0) continue;
      const classification = classifyCandidate(value);
      if (classification) return { value, classification };
    }
  }
  for (const value of collectResultCandidates(record.result)) {
    const classification = classifyCandidate(value);
    if (classification) return { value, classification };
  }
  return null;
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
  const classification = classifyCandidate(block.dataUrl);
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

function collectResultCandidates(result: unknown): string[] {
  if (typeof result === "string") return result.length > 0 ? [result] : [];
  if (!result || typeof result !== "object") return [];
  const record = result as Record<string, unknown>;
  const out: string[] = [];
  for (const key of RESULT_STRING_KEYS) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) out.push(value);
  }
  for (const key of RESULT_ARRAY_KEYS) {
    const value = record[key];
    if (!Array.isArray(value)) continue;
    for (const entry of value) {
      if (typeof entry === "string" && entry.length > 0) out.push(entry);
      else if (entry && typeof entry === "object") {
        const inner = entry as Record<string, unknown>;
        for (const innerKey of RESULT_STRING_KEYS) {
          const candidate = inner[innerKey];
          if (typeof candidate === "string" && candidate.length > 0) out.push(candidate);
        }
      }
    }
  }
  return out;
}

function classifyCandidate(value: string): Classification | null {
  const trimmedHead = value.slice(0, 16).trimStart();
  if (/^data:image\//i.test(trimmedHead)) {
    return { kind: "dataUrl", mime: parseDataUrlMime(value) };
  }
  if (/^<svg[\s>]/i.test(trimmedHead) || /^<\?xml/i.test(trimmedHead)) {
    return { kind: "rawSvg", mime: "image/svg+xml" };
  }
  for (const [prefix, mime] of BASE64_IMAGE_SIGNATURES) {
    if (value.startsWith(prefix)) return { kind: "base64", mime };
  }
  return null;
}

function buildSrc(value: string, classification: Classification): string | null {
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

function readImageDimensions(
  value: string,
  classification: Classification,
): { width: number; height: number } | undefined {
  if (classification.mime === "image/svg+xml") return readSvgDimensions(value, classification);
  const bytes = readBase64BytesPrefix(value, classification, 8192);
  if (!bytes) return undefined;
  switch (classification.mime) {
    case "image/png":
      return readPngDimensions(bytes);
    case "image/jpeg":
      return readJpegDimensions(bytes);
    case "image/gif":
      return readGifDimensions(bytes);
    case "image/webp":
      return readWebpDimensions(bytes);
    default:
      return undefined;
  }
}

function readBase64BytesPrefix(
  value: string,
  classification: Classification,
  byteCount: number,
): Uint8Array | undefined {
  const base64 =
    classification.kind === "dataUrl"
      ? readBase64DataUrlBody(value)
      : classification.kind === "base64"
        ? value
        : null;
  if (!base64) return undefined;
  const clean = base64.replace(/\s+/g, "");
  if (clean.length === 0) return undefined;
  const chars = Math.ceil(byteCount / 3) * 4;
  const slice = clean.slice(0, chars);
  const padded = slice.padEnd(Math.ceil(slice.length / 4) * 4, "=");
  try {
    const binary = atob(padded);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return undefined;
  }
}

function readBase64DataUrlBody(value: string): string | null {
  const commaIndex = value.indexOf(",");
  if (commaIndex < 0) return null;
  return value.slice(0, commaIndex).toLowerCase().includes(";base64")
    ? value.slice(commaIndex + 1)
    : null;
}

function readPngDimensions(bytes: Uint8Array) {
  if (
    bytes.length < 24 ||
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47 ||
    bytes[12] !== 0x49 ||
    bytes[13] !== 0x48 ||
    bytes[14] !== 0x44 ||
    bytes[15] !== 0x52
  ) {
    return undefined;
  }
  return readPositiveDimensions(readUint32BE(bytes, 16), readUint32BE(bytes, 20));
}

function readGifDimensions(bytes: Uint8Array) {
  if (
    bytes.length < 10 ||
    bytes[0] !== 0x47 ||
    bytes[1] !== 0x49 ||
    bytes[2] !== 0x46 ||
    bytes[3] !== 0x38
  ) {
    return undefined;
  }
  return readPositiveDimensions(readUint16LE(bytes, 6), readUint16LE(bytes, 8));
}

function readJpegDimensions(bytes: Uint8Array) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    if (marker === undefined) break;
    offset += 2;
    if (marker === 0xda || marker === 0xd9) break;
    if (offset + 2 > bytes.length) break;
    const length = readUint16BE(bytes, offset);
    if (length < 2 || offset + length > bytes.length) break;
    if (isJpegStartOfFrame(marker)) {
      return readPositiveDimensions(
        readUint16BE(bytes, offset + 5),
        readUint16BE(bytes, offset + 3),
      );
    }
    offset += length;
  }
  return undefined;
}

function readWebpDimensions(bytes: Uint8Array) {
  if (
    bytes.length < 30 ||
    bytes[0] !== 0x52 ||
    bytes[1] !== 0x49 ||
    bytes[2] !== 0x46 ||
    bytes[3] !== 0x46 ||
    bytes[8] !== 0x57 ||
    bytes[9] !== 0x45 ||
    bytes[10] !== 0x42 ||
    bytes[11] !== 0x50
  ) {
    return undefined;
  }
  const chunk = String.fromCharCode(bytes[12]!, bytes[13]!, bytes[14]!, bytes[15]!);
  if (chunk === "VP8X") {
    const width = 1 + bytes[24]! + (bytes[25]! << 8) + (bytes[26]! << 16);
    const height = 1 + bytes[27]! + (bytes[28]! << 8) + (bytes[29]! << 16);
    return readPositiveDimensions(width, height);
  }
  if (chunk === "VP8L") {
    const width = 1 + bytes[21]! + ((bytes[22]! & 0x3f) << 8);
    const height = 1 + ((bytes[22]! & 0xc0) >> 6) + (bytes[23]! << 2) + ((bytes[24]! & 0x0f) << 10);
    return readPositiveDimensions(width, height);
  }
  if (chunk === "VP8 " && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    const width = readUint16LE(bytes, 26) & 0x3fff;
    const height = readUint16LE(bytes, 28) & 0x3fff;
    return readPositiveDimensions(width, height);
  }
  return undefined;
}

function readSvgDimensions(value: string, classification: Classification) {
  const svg =
    classification.kind === "rawSvg"
      ? value
      : classification.kind === "dataUrl"
        ? readTextDataUrlBody(value)
        : null;
  if (!svg) return undefined;
  const width = readSvgLength(svg, "width");
  const height = readSvgLength(svg, "height");
  if (width && height) return { width, height };
  const viewBox = /\bviewBox\s*=\s*["']\s*[-.\d]+\s+[-.\d]+\s+([.\d]+)\s+([.\d]+)/i.exec(svg);
  if (!viewBox) return undefined;
  return readPositiveDimensions(Number(viewBox[1]), Number(viewBox[2]));
}

function readTextDataUrlBody(value: string): string | null {
  const commaIndex = value.indexOf(",");
  if (commaIndex < 0) return null;
  const body = value.slice(commaIndex + 1);
  if (value.slice(0, commaIndex).toLowerCase().includes(";base64")) {
    try {
      return atob(body);
    } catch {
      return null;
    }
  }
  try {
    return decodeURIComponent(body);
  } catch {
    return body;
  }
}

function readSvgLength(svg: string, attr: "width" | "height") {
  const match = new RegExp(`\\b${attr}\\s*=\\s*["']\\s*([.\\d]+)`, "i").exec(svg);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function isJpegStartOfFrame(marker: number) {
  return (
    marker === 0xc0 ||
    marker === 0xc1 ||
    marker === 0xc2 ||
    marker === 0xc3 ||
    marker === 0xc5 ||
    marker === 0xc6 ||
    marker === 0xc7 ||
    marker === 0xc9 ||
    marker === 0xca ||
    marker === 0xcb ||
    marker === 0xcd ||
    marker === 0xce ||
    marker === 0xcf
  );
}

function readPositiveDimensions(width: number, height: number) {
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
    ? { width, height }
    : undefined;
}

function readUint16BE(bytes: Uint8Array, offset: number) {
  return (bytes[offset]! << 8) + bytes[offset + 1]!;
}

function readUint16LE(bytes: Uint8Array, offset: number) {
  return bytes[offset]! + (bytes[offset + 1]! << 8);
}

function readUint32BE(bytes: Uint8Array, offset: number) {
  return (
    bytes[offset]! * 0x1000000 +
    ((bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!)
  );
}

function parseDataUrlMime(value: string): string {
  const match = /^\s*data:([^;,]+)[;,]/i.exec(value);
  const mime = match?.[1]?.toLowerCase();
  return mime && mime.startsWith("image/") ? mime : "image/png";
}

function readStatus(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const status = (payload as Record<string, unknown>).status;
  return typeof status === "string" ? status : undefined;
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

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
 * agent-supplied `http(s)://`, `file://`, `lightcode-local://`, or filesystem
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
  const alt = readPromptText(payload) ?? "";
  return { src, mime, extension, fileName: buildFileName(alt, extension), alt };
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
  const alt =
    typeof block.name === "string" && block.name.trim().length > 0 ? block.name.trim() : "";
  return { src, mime, extension, fileName: buildFileName(alt, extension), alt };
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

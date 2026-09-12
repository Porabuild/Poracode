const BASE64_IMAGE_SIGNATURES: ReadonlyArray<readonly [string, string]> = [
  ["iVBORw0KGgo", "image/png"],
  ["/9j/", "image/jpeg"],
  ["R0lGOD", "image/gif"],
  ["UklGR", "image/webp"],
  ["PHN2Zw", "image/svg+xml"],
  ["PD94bWwg", "image/svg+xml"],
];

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

const RESULT_ARRAY_KEYS = ["images", "data", "content", "output"] as const;

export interface InlineImageClassification {
  kind: "dataUrl" | "rawSvg" | "base64";
  mime: string;
}

export interface InlineImageCandidate {
  value: string;
  classification: InlineImageClassification;
}

/** Where an inline image sits inside a payload, as a walkable key/index path. */
export type InlineImagePath = ReadonlyArray<string | number>;

export interface InlineImageLocation extends InlineImageCandidate {
  /** e.g. `["images", 0]` or `["result", "content", 2, "data"]`. */
  path: InlineImagePath;
}

export function inlineImagePayloadRenders(payload: unknown): boolean {
  return readStatus(payload) !== "error" && findRenderableInlineImageCandidate(payload) !== null;
}

export function findRenderableInlineImageCandidate(payload: unknown): InlineImageCandidate | null {
  // `firstOnly` keeps this the cheap O(1) probe the timeline grouping path
  // relies on: it stops at the first match and never walks the rest.
  const [first] = collectInlineImageLocations(payload, true);
  return first ? { value: first.value, classification: first.classification } : null;
}

/**
 * Every inline image in `payload`, with the path needed to address it again
 * later. Ordered exactly as {@link findRenderableInlineImageCandidate} searches
 * (`images[]` before `result`), so the first entry is always the one the
 * renderer would display.
 *
 * Used by the remote transport to replace inline image bytes with host-minted
 * references, and by the endpoint that resolves such a reference back to bytes.
 */
export function collectInlineImageLocations(
  payload: unknown,
  firstOnly = false,
): InlineImageLocation[] {
  const found: InlineImageLocation[] = [];
  if (!payload || typeof payload !== "object") return found;
  const record = payload as Record<string, unknown>;

  const push = (value: string, path: InlineImagePath): boolean => {
    const classification = classifyInlineImageCandidate(value);
    if (!classification) return false;
    found.push({ value, classification, path });
    return firstOnly;
  };

  if (Array.isArray(record.images)) {
    for (const [index, value] of record.images.entries()) {
      if (typeof value !== "string" || value.length === 0) continue;
      if (push(value, ["images", index])) return found;
    }
  }
  for (const candidate of collectResultCandidates(record.result)) {
    if (push(candidate.value, ["result", ...candidate.path])) return found;
  }
  return found;
}

/** Reads the value at an {@link InlineImagePath}, or undefined if absent. */
export function readAtInlineImagePath(root: unknown, path: InlineImagePath): unknown {
  let current: unknown = root;
  for (const part of path) {
    if (current === null || current === undefined) return undefined;
    if (typeof part === "number") {
      if (!Array.isArray(current)) return undefined;
      current = current[part];
      continue;
    }
    if (typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * The payload locations the renderer will actually *display* an image from, in
 * priority order, regardless of what type of value currently sits there.
 *
 * Deliberately value-type-agnostic so the host and the client agree on one
 * definition of "displayable": the host replaces inline bytes with a reference,
 * and the client looks for a reference in exactly these places. Keeping this
 * narrow matters — images buried elsewhere in a tool result (an MCP
 * `screenshot.url`, say) are not rendered today, and must not start rendering
 * just because the transport swapped their bytes for a reference.
 */
export function enumerateDisplayImageCandidatePaths(payload: unknown): InlineImagePath[] {
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  const paths: InlineImagePath[] = [];
  if (Array.isArray(record.images)) {
    for (let index = 0; index < record.images.length; index += 1) {
      paths.push(["images", index]);
    }
  }
  const result = record.result;
  if (typeof result === "string") {
    paths.push(["result"]);
  } else if (result && typeof result === "object") {
    const resultRecord = result as Record<string, unknown>;
    for (const key of RESULT_STRING_KEYS) {
      if (key in resultRecord) paths.push(["result", key]);
    }
    for (const key of RESULT_ARRAY_KEYS) {
      const value = resultRecord[key];
      if (!Array.isArray(value)) continue;
      for (let index = 0; index < value.length; index += 1) {
        paths.push(["result", key, index]);
        const entry = value[index];
        if (entry && typeof entry === "object" && !Array.isArray(entry)) {
          for (const innerKey of RESULT_STRING_KEYS) {
            if (innerKey in (entry as Record<string, unknown>)) {
              paths.push(["result", key, index, innerKey]);
            }
          }
        }
      }
    }
  }
  return paths;
}

/** Guards the deep walk against pathological nesting. */
const MAX_DEEP_WALK_DEPTH = 12;

/**
 * Every inline image anywhere in the payload, however deeply nested.
 *
 * Broader than {@link collectInlineImageLocations}, which only reports the
 * locations the UI renders from. Used by the remote transport, because bytes the
 * UI will never show are pure waste on the wire — in practice this is where
 * screenshot-carrying MCP results hide most of their weight.
 */
export function collectInlineImageLocationsDeep(payload: unknown): InlineImageLocation[] {
  const found: InlineImageLocation[] = [];
  const walk = (value: unknown, path: InlineImagePath, depth: number): void => {
    if (depth > MAX_DEEP_WALK_DEPTH) return;
    if (typeof value === "string") {
      const classification = classifyInlineImageCandidate(value);
      if (classification) found.push({ value, classification, path });
      return;
    }
    if (Array.isArray(value)) {
      for (const [index, entry] of value.entries()) walk(entry, [...path, index], depth + 1);
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      walk(entry, [...path, key], depth + 1);
    }
  };
  walk(payload, [], 0);
  return found;
}

export function classifyInlineImageCandidate(value: string): InlineImageClassification | null {
  const trimmedHead = value.slice(0, 16).trimStart();
  if (/^data:image\//i.test(trimmedHead)) {
    // A `data:` URL with nothing after the comma renders as a broken picture, so
    // it is not an inline image. The scan must stay allocation-free — `slice`
    // here would copy the multi-MB body on every grouping probe, and this probe
    // is contractually prefix-only (see `resolveImageViewSource`). Bodies that
    // fail base64 validation in a narrower way (a cut-off alphabet, bad
    // padding) still probe positive and are dropped by the renderer, which
    // parks the row on its own accordion rather than a media slot.
    const comma = value.indexOf(",");
    if (comma < 0) return null;
    const afterComma = /\S/g;
    afterComma.lastIndex = comma + 1;
    if (!afterComma.test(value)) return null;
    return { kind: "dataUrl", mime: parseDataUrlMime(value) };
  }
  if (sniffTextImageMime(trimmedHead)) {
    return { kind: "rawSvg", mime: "image/svg+xml" };
  }
  for (const [prefix, mime] of BASE64_IMAGE_SIGNATURES) {
    if (value.startsWith(prefix)) return { kind: "base64", mime };
  }
  return null;
}

/** Base64 characters needed to decode the longest header the sniffer reads. */
const SNIFF_BASE64_CHARS = 44;
const STANDARD_BASE64_BODY = /^[A-Za-z0-9+/]+={0,2}$/;
/** Whole 4-character groups with exact padding: needs no repair at all. */
const CANONICAL_BASE64_BODY = /^(?:[A-Za-z0-9+/]{4})+(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export interface NormalizedInlineImage {
  /** A data URL Chromium is guaranteed to attempt to decode. */
  dataUrl: string;
  /** MIME type read from the image's own header bytes. */
  mime: string;
}

/**
 * Repair a provider-supplied inline image into a data URL the renderer can trust.
 *
 * An `<img src>` is all-or-nothing on the base64 alphabet: Chromium decodes a
 * `;base64` body strictly, so a `data:` URL that declares `base64` but carries
 * the URL-safe alphabet (`-`/`_`, padding stripped), embedded whitespace, or an
 * empty body renders as a broken picture rather than the near-miss the string
 * suggests. Agents hand these strings over verbatim — anything running on Node
 * can produce `Buffer.toString("base64url")`, and a tool result may carry no
 * MIME type at all — so the boundary that builds the payload has to normalize
 * what it stores and the renderer must not promote what it cannot repair.
 *
 * The declared MIME is never trusted: the format is read back out of the image's
 * own header bytes, so the copy/download filename follows the actual pixels
 * instead of the label the agent guessed.
 *
 * Accepts either a `data:` URL or a bare base64/base64url string. Returns
 * `null` when the bytes are not a recognizable image — unless a declared MIME
 * type names a format the header sniffer does not know, which stays
 * displayable (AVIF, HEIC) — so callers can drop the entry and fall back to an
 * inert row rather than paint a broken image.
 */
export function normalizeInlineImageDataUrl(
  value: string,
  declaredMimeType?: string,
): NormalizedInlineImage | null {
  const dataUrl = splitDataUrl(value);
  if (dataUrl && !dataUrl.base64) {
    // Non-base64 payloads (`;utf8,`, percent-encoded) are already in the form
    // the browser expects; the sniffer and then the URL's own label settle the
    // MIME. The label is trusted here because the previous builder passed such
    // URLs through verbatim — dropping them now would delete rendered images.
    const mime = sniffTextImageMime(dataUrl.body) ?? dataUrl.mimeLabel ?? declaredMimeType;
    return mime?.startsWith("image/") ? { dataUrl: value.trim(), mime } : null;
  }
  const normalized = normalizeBase64Body(dataUrl ? dataUrl.body : value);
  if (!normalized) return null;
  const mime = sniffImageMime(normalized.bytes) ?? declaredMimeType;
  if (!mime?.startsWith("image/")) return null;
  // Emitting the canonical URL would copy the body a second time, and hot
  // callers run this on every render pass — hand back the input when it
  // already has exactly the form the build would produce.
  if (dataUrl && dataUrl.head === `data:${mime};base64` && normalized.text === dataUrl.body) {
    return { dataUrl: value.trim(), mime };
  }
  return { dataUrl: `data:${mime};base64,${normalized.text}`, mime };
}

interface SplitDataUrl {
  /** The URL up to the first comma — a short prefix, e.g. `data:image/png;base64`. */
  readonly head: string;
  readonly body: string;
  readonly base64: boolean;
  readonly mimeLabel: string | null;
}

function splitDataUrl(value: string): SplitDataUrl | null {
  const trimmed = value.trimStart();
  if (!/^data:/i.test(trimmed)) return null;
  const comma = trimmed.indexOf(",");
  if (comma < 0) return null;
  const head = trimmed.slice(0, comma);
  const label = /^data:([^;,]+)/i.exec(head)?.[1];
  return {
    head,
    body: trimmed.slice(comma + 1),
    base64: /;base64$/i.test(head),
    mimeLabel: label?.toLowerCase() ?? null,
  };
}

function normalizeBase64Body(
  body: string,
): { readonly text: string; readonly bytes: Uint8Array } | null {
  // Canonical bodies — everything stored since the normalizer landed — need
  // one regex scan and the header decode, with zero full-size copies; hot
  // callers run this several times per render pass.
  if (CANONICAL_BASE64_BODY.test(body)) {
    const bytes = decodeBase64Prefix(body);
    return bytes ? { text: body, bytes } : null;
  }
  const compact = body.replace(/\s+/g, "");
  if (compact.length === 0) return null;
  const standard = compact.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
  if (standard.length % 4 === 1) return null;
  const padded = standard + "=".repeat((4 - (standard.length % 4)) % 4);
  if (!STANDARD_BASE64_BODY.test(padded)) return null;
  const bytes = decodeBase64Prefix(padded);
  return bytes ? { text: padded, bytes } : null;
}

function decodeBase64Prefix(padded: string): Uint8Array | null {
  try {
    const binary = atob(padded.slice(0, SNIFF_BASE64_CHARS));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return null;
  }
}

function sniffImageMime(bytes: Uint8Array): string | null {
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return "image/gif";
  }
  if (
    bytes.length >= 12 &&
    readAscii(bytes, 0, 4) === "RIFF" &&
    readAscii(bytes, 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return sniffTextImageMime(readAscii(bytes, 0, Math.min(bytes.length, 64)));
}

function sniffTextImageMime(head: string): string | null {
  const trimmed = head.trimStart();
  if (/^<svg[\s>]/i.test(trimmed) || /^<\?xml/i.test(trimmed)) return "image/svg+xml";
  return null;
}

function readAscii(bytes: Uint8Array, start: number, end: number): string {
  let out = "";
  for (let index = start; index < end && index < bytes.length; index += 1) {
    out += String.fromCharCode(bytes[index]!);
  }
  return out;
}

interface ResultCandidate {
  readonly value: string;
  /** Path relative to `result`. Empty when `result` is itself the image string. */
  readonly path: InlineImagePath;
}

function collectResultCandidates(result: unknown): ResultCandidate[] {
  if (typeof result === "string") return result.length > 0 ? [{ value: result, path: [] }] : [];
  if (!result || typeof result !== "object") return [];
  const record = result as Record<string, unknown>;
  const candidates: ResultCandidate[] = [];
  for (const key of RESULT_STRING_KEYS) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) candidates.push({ value, path: [key] });
  }
  for (const key of RESULT_ARRAY_KEYS) {
    const value = record[key];
    if (!Array.isArray(value)) continue;
    for (const [index, entry] of value.entries()) {
      if (typeof entry === "string" && entry.length > 0) {
        candidates.push({ value: entry, path: [key, index] });
      } else if (entry && typeof entry === "object") {
        const inner = entry as Record<string, unknown>;
        for (const innerKey of RESULT_STRING_KEYS) {
          const candidate = inner[innerKey];
          if (typeof candidate === "string" && candidate.length > 0) {
            candidates.push({ value: candidate, path: [key, index, innerKey] });
          }
        }
      }
    }
  }
  return candidates;
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

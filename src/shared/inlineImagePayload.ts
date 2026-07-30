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

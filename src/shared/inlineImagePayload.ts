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

export function inlineImagePayloadRenders(payload: unknown): boolean {
  return readStatus(payload) !== "error" && findRenderableInlineImageCandidate(payload) !== null;
}

export function findRenderableInlineImageCandidate(payload: unknown): InlineImageCandidate | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  if (Array.isArray(record.images)) {
    for (const value of record.images) {
      if (typeof value !== "string" || value.length === 0) continue;
      const classification = classifyInlineImageCandidate(value);
      if (classification) return { value, classification };
    }
  }
  for (const value of collectResultCandidates(record.result)) {
    const classification = classifyInlineImageCandidate(value);
    if (classification) return { value, classification };
  }
  return null;
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

function collectResultCandidates(result: unknown): string[] {
  if (typeof result === "string") return result.length > 0 ? [result] : [];
  if (!result || typeof result !== "object") return [];
  const record = result as Record<string, unknown>;
  const candidates: string[] = [];
  for (const key of RESULT_STRING_KEYS) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) candidates.push(value);
  }
  for (const key of RESULT_ARRAY_KEYS) {
    const value = record[key];
    if (!Array.isArray(value)) continue;
    for (const entry of value) {
      if (typeof entry === "string" && entry.length > 0) {
        candidates.push(entry);
      } else if (entry && typeof entry === "object") {
        const inner = entry as Record<string, unknown>;
        for (const innerKey of RESULT_STRING_KEYS) {
          const candidate = inner[innerKey];
          if (typeof candidate === "string" && candidate.length > 0) {
            candidates.push(candidate);
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

const MIN_WINDOWED_LENGTH = 8_192;
const FULL_RECHECK_CHARS = 32_768;
const BOUNDARY_CHARS = 64;

function hasFormatting(text: string): boolean {
  return /[\r\n`*_~$\\<>#|/&@.]/u.test(text) || text.includes("](") || text.includes("![");
}

/** Keep links, paths, code, math, and other formatting on the Markdown renderer. */
export function shouldUseChunkedPlainText(text: string): boolean {
  return text.length >= MIN_WINDOWED_LENGTH && !hasFormatting(text);
}

export interface PlainStreamInspection {
  length: number;
  prefix: string;
  boundary: string;
  plain: boolean;
}

/**
 * Canonical text deltas are append-only in the common case. Inspect only the
 * new suffix between periodic full checks so a long stream does not scan and
 * flatten its entire accumulated string on every delta. A changed boundary,
 * shorter/replaced text, or completed item always gets a full check.
 */
export function inspectPlainStream(
  text: string,
  previous: PlainStreamInspection | null,
  isStreaming: boolean,
): PlainStreamInspection {
  const length = text.length;
  const prefix = text.slice(0, BOUNDARY_CHARS);
  const boundary = text.slice(Math.max(0, length - BOUNDARY_CHARS));
  const append =
    previous !== null &&
    length > previous.length &&
    prefix === previous.prefix &&
    text.slice(Math.max(0, previous.length - BOUNDARY_CHARS), previous.length) ===
      previous.boundary;
  const fullCheck =
    !append ||
    !isStreaming ||
    (previous !== null && previous.length < MIN_WINDOWED_LENGTH) ||
    Math.floor(length / FULL_RECHECK_CHARS) !==
      Math.floor((previous?.length ?? 0) / FULL_RECHECK_CHARS);
  const plain = fullCheck
    ? shouldUseChunkedPlainText(text)
    : previous!.plain && !hasFormatting(text.slice(Math.max(0, previous!.length - 2)));
  return { length, prefix, boundary, plain };
}

export const PLAIN_TEXT_WINDOW_CHARS = MIN_WINDOWED_LENGTH;
/** Large formatted items use a raw bounded viewport before full-row layout grows unbounded. */
export const MAX_RICH_TEXT_CHARS = 65_536;

/** Return a bounded window without cutting an astral Unicode character in half. */
export function plainTextWindow(text: string, requestedEnd: number) {
  const end = Math.min(text.length, Math.max(0, requestedEnd));
  let start = Math.max(0, end - PLAIN_TEXT_WINDOW_CHARS);
  const first = text.charCodeAt(start);
  if (start > 0 && first >= 0xdc00 && first <= 0xdfff) start -= 1;
  return { start, end, text: text.slice(start, end) };
}

/**
 * Existing durable runtime-stream policy, shared with the renderer's local
 * retention projection. Counts and limits are UTF-16 code units, not bytes.
 * The notice is serialized history content; its wording is a compatibility
 * contract rather than a new renderer UI label.
 */
export const HEAD_CHARS = 256_000;
export const TAIL_CHARS = 4_000_000;

const NOTICE_PREFIX = "[... poracode elided ";
const NOTICE_SUFFIX = " characters of earlier output ...]";

export function utf16SafeSliceEnd(text: string, end: number): number {
  if (
    end > 0 &&
    end < text.length &&
    text.charCodeAt(end - 1) >= 0xd800 &&
    text.charCodeAt(end - 1) <= 0xdbff &&
    text.charCodeAt(end) >= 0xdc00 &&
    text.charCodeAt(end) <= 0xdfff
  ) {
    return end - 1;
  }
  return end;
}

/** The notice shown in place of dropped output, with no surrounding line breaks. */
export function elisionNotice(elidedChars: number): string {
  return `${NOTICE_PREFIX}${elidedChars}${NOTICE_SUFFIX}`;
}

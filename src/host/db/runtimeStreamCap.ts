/**
 * How much of a runtime item's streamed content is retained, and how the
 * retained head and tail are joined back together for readers.
 *
 * Streamed content is stored append-only (see `runtimeStreamStore.ts`): a head
 * on the item row plus chunk rows for everything after it.
 *
 * What is kept is the head (the command echo, how the run started) and the tail
 * (what it is doing now, how it ended). Those are what a transcript is read
 * for; the middle of a 45 MB build log is not.
 */

/**
 * Characters kept from the start of a stream. Streamed content stores this head
 * on the item row and freezes it, so it is written at most once.
 */
export const HEAD_CHARS = 256_000;

/**
 * Characters kept after the head. Streamed content keeps this window as
 * append-only chunk rows, where trimming is a row delete rather than a blob
 * rewrite — so the bound here is about what is reasonable to hydrate into the
 * renderer, not about what is affordable to write.
 */
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

/** Drop a trailing partial line so the notice can start on its own line. */
function withoutTrailingPartialLine(text: string): string {
  if (text.length === 0 || text.endsWith("\n")) return text;
  const lastBreak = text.lastIndexOf("\n");
  return lastBreak < 0 ? text : text.slice(0, lastBreak + 1);
}

/** Drop a leading partial line so retained output resumes at a line start. */
function withoutLeadingPartialLine(text: string): string {
  if (text.length === 0) return text;
  const firstBreak = text.indexOf("\n");
  return firstBreak < 0 ? text : text.slice(firstBreak + 1);
}

/**
 * Join a retained head and tail with the elision notice between them.
 *
 * The window is measured in characters, so both ends can land mid-line. Snap to
 * line boundaries and give the notice a line of its own: a notice wedged inside
 * a log line reads like corrupted output. Text with no line breaks at all (one
 * enormous line) is joined as-is rather than thrown away.
 *
 * Shared by the append-only store and the whole-value cap so a transcript reads
 * the same however its middle was dropped.
 */
export function joinWithElision(head: string, tail: string, elidedChars: number): string {
  if (elidedChars <= 0) return `${head}${tail}`;
  const alignedHead = withoutTrailingPartialLine(head);
  const alignedTail = withoutLeadingPartialLine(tail);
  const lead = alignedHead.length === 0 || alignedHead.endsWith("\n") ? "" : "\n";
  return `${alignedHead}${lead}${elisionNotice(elidedChars)}\n${alignedTail}`;
}

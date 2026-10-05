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

import { elisionNotice } from "../../shared/runtimeStreamRetentionPolicy";

export {
  HEAD_CHARS,
  TAIL_CHARS,
  elisionNotice,
  utf16SafeSliceEnd,
} from "../../shared/runtimeStreamRetentionPolicy";

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

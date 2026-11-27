import { utf16SafeSliceEnd } from "./runtimeStreamRetentionPolicy";
import { TerminalColumnHistory, type TerminalColumnChange } from "./terminalColumnHistory";

interface TerminalTranscriptSegment {
  fromCursor: number;
  data: string;
  columns: number | null;
}

/** Partition a retained transcript at recorded PTY widths without changing its raw UTF-16. */
export function segmentTerminalTranscript(
  data: string,
  fromCursor: number,
  columnChanges?: readonly TerminalColumnChange[],
): TerminalTranscriptSegment[] {
  if (!columnChanges?.length || data.length === 0) {
    return [{ fromCursor, data, columns: null }];
  }

  const toCursor = fromCursor + data.length;
  const history = new TerminalColumnHistory();
  history.recordChanges(fromCursor, toCursor, columnChanges);
  const segments: TerminalTranscriptSegment[] = [];
  let start = 0;
  let columns: number | null = null;
  for (const change of history.snapshot(fromCursor, toCursor)) {
    const offset = change.fromCursor - fromCursor;
    // The scalar uses the width of its first code unit when a marker splits a pair.
    const boundary = utf16SafeSliceEnd(data, offset) === offset ? offset : offset + 1;
    if (boundary > start) {
      segments.push({ fromCursor: fromCursor + start, data: data.slice(start, boundary), columns });
    }
    start = boundary;
    columns = change.columns;
  }
  if (start < data.length) {
    segments.push({ fromCursor: fromCursor + start, data: data.slice(start), columns });
  }
  return segments;
}

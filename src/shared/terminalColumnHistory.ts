export const MIN_TERMINAL_COLS = 20;
export const MAX_TERMINAL_COLS = 400;
const MAX_RETAINED_SPANS = 1024;

// A retained span can have an unknown range before it, plus an unknown tail.
export const MAX_TERMINAL_COLUMN_CHANGES = 2 * MAX_RETAINED_SPANS + 1;

export interface TerminalColumnChange {
  fromCursor: number;
  columns: number | null;
}

interface ColumnSpan extends TerminalColumnChange {
  toCursor: number;
}

export function knownTerminalColumns(value: number | undefined): number | null {
  return value !== undefined &&
    Number.isInteger(value) &&
    value >= MIN_TERMINAL_COLS &&
    value <= MAX_TERMINAL_COLS
    ? value
    : null;
}

function assertCursor(cursor: number): void {
  if (!Number.isSafeInteger(cursor) || cursor < 0) {
    throw new RangeError("Terminal column history requires nonnegative safe integer cursors.");
  }
}

/** Column widths observed with accepted PTY output in one terminal generation. */
export class TerminalColumnHistory {
  private readonly spans: ColumnSpan[] = [];

  constructor(private readonly maxSpans = MAX_RETAINED_SPANS) {
    if (!Number.isSafeInteger(maxSpans) || maxSpans < 1 || maxSpans > MAX_RETAINED_SPANS) {
      throw new RangeError("Invalid terminal column history span limit.");
    }
  }

  record(fromCursor: number, toCursor: number, columns: number | null): void {
    assertCursor(fromCursor);
    assertCursor(toCursor);
    const previous = this.spans.at(-1);
    if (toCursor <= fromCursor || (previous && fromCursor < previous.toCursor)) {
      throw new RangeError("Terminal column history requires nonempty, append-only ranges.");
    }
    if (columns !== null && knownTerminalColumns(columns) === null) {
      throw new RangeError("Invalid terminal column count.");
    }

    if (previous && previous.toCursor === fromCursor && previous.columns === columns) {
      previous.toCursor = toCursor;
      return;
    }
    this.spans.push({ fromCursor, toCursor, columns });
    if (this.spans.length > this.maxSpans) this.spans.shift();
  }

  /**
   * Convert absolute ordered width markers (e.g. a snapshot's `columnChanges`)
   * into spans covering `[fromCursor, toCursor)`. A marker's width applies from
   * its `fromCursor` until the next marker, so the last marker at or before
   * `fromCursor` supplies the width at the left clip. Only known widths are
   * recorded — unknown regions stay gaps. The whole marker list is validated
   * before storage changes: malformed order or an invalid column count leaves
   * the range widthless rather than partially applied.
   */
  recordChanges(
    fromCursor: number,
    toCursor: number,
    changes: readonly TerminalColumnChange[] | undefined,
  ): void {
    assertCursor(fromCursor);
    assertCursor(toCursor);
    if (toCursor < fromCursor) {
      throw new RangeError("Invalid terminal column history range.");
    }
    if (toCursor === fromCursor || !changes || changes.length === 0) return;

    let ordered = true;
    let previousCursor = -1;
    for (const change of changes) {
      if (
        !Number.isSafeInteger(change.fromCursor) ||
        change.fromCursor < 0 ||
        change.fromCursor < previousCursor ||
        (change.columns !== null && knownTerminalColumns(change.columns) === null)
      ) {
        ordered = false;
        break;
      }
      previousCursor = change.fromCursor;
    }
    if (!ordered) return;

    let index = 0;
    let columns: number | null = null;
    while (index < changes.length && changes[index]!.fromCursor <= fromCursor) {
      columns = changes[index]!.columns;
      index += 1;
    }
    let spanStart = fromCursor;
    const recordSpan = (end: number) => {
      if (columns !== null && end > spanStart) {
        this.record(spanStart, end, columns);
      }
    };
    for (; index < changes.length; index += 1) {
      const marker = changes[index]!;
      if (marker.fromCursor >= toCursor) break;
      recordSpan(marker.fromCursor);
      spanStart = marker.fromCursor;
      columns = marker.columns;
    }
    recordSpan(toCursor);
  }

  snapshot(fromCursor: number, toCursor: number): TerminalColumnChange[] {
    assertCursor(fromCursor);
    assertCursor(toCursor);
    if (toCursor < fromCursor) throw new RangeError("Invalid terminal column history range.");
    if (toCursor === fromCursor) return [];

    const changes: TerminalColumnChange[] = [];
    let coveredThrough = fromCursor;
    const push = (cursor: number, columns: number | null) => {
      if (changes.at(-1)?.columns !== columns) changes.push({ fromCursor: cursor, columns });
    };
    for (const span of this.spans) {
      if (span.toCursor <= fromCursor) continue;
      if (span.fromCursor >= toCursor) break;
      const start = Math.max(fromCursor, span.fromCursor);
      if (start > coveredThrough) push(coveredThrough, null);
      push(start, span.columns);
      coveredThrough = Math.min(toCursor, span.toCursor);
    }
    if (coveredThrough < toCursor) push(coveredThrough, null);
    return changes;
  }
}

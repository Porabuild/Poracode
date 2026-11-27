import { describe, expect, it } from "vitest";
import { terminalSnapshotSchema } from "./contracts/thread";
import {
  MAX_TERMINAL_COLUMN_CHANGES,
  TerminalColumnHistory,
  knownTerminalColumns,
} from "./terminalColumnHistory";
import { TranscriptBuffer } from "./transcriptBuffer";

describe("TerminalColumnHistory", () => {
  it("retains width transitions across repeated output at the same width", () => {
    const history = new TerminalColumnHistory(2);
    history.record(0, 334, 48);
    for (let cursor = 334; cursor < 400; cursor += 1) {
      history.record(cursor, cursor + 1, 100);
    }
    expect(history.snapshot(320, 360)).toEqual([
      { fromCursor: 320, columns: 48 },
      { fromCursor: 334, columns: 100 },
    ]);
  });

  it("leaves gaps and evicted geometry unknown", () => {
    const history = new TerminalColumnHistory(2);
    history.record(0, 5, 48);
    history.record(5, 9, 100);
    history.record(11, 15, 60);
    expect(history.snapshot(3, 16)).toEqual([
      { fromCursor: 3, columns: null },
      { fromCursor: 5, columns: 100 },
      { fromCursor: 9, columns: null },
      { fromCursor: 11, columns: 60 },
      { fromCursor: 15, columns: null },
    ]);
    const nextGeneration = new TerminalColumnHistory();
    expect(nextGeneration.snapshot(0, 5)).toEqual([{ fromCursor: 0, columns: null }]);
  });

  it("restricts geometry to supported PTY columns", () => {
    expect(knownTerminalColumns(20)).toBe(20);
    expect(knownTerminalColumns(400)).toBe(400);
    for (const invalid of [undefined, 1, 401, 48.5, NaN]) {
      expect(knownTerminalColumns(invalid)).toBeNull();
    }
  });

  it("keeps legacy bytes and clips recorded geometry at absolute UTF-16 offsets", () => {
    const buffer = new TranscriptBuffer(5);
    buffer.append("legacy");
    expect(buffer.readColumnChanges(1, 6)).toBeUndefined();
    buffer.append("🐱!", { fromCursor: 6, columns: 48 });
    buffer.append("ok", { fromCursor: 9, columns: 100 });
    expect(buffer.readTail(5)).toBe("🐱!ok");
    expect(buffer.readColumnChanges(6, 11)).toEqual([
      { fromCursor: 6, columns: 48 },
      { fromCursor: 9, columns: 100 },
    ]);
  });

  it("accepts fieldless legacy snapshots and keeps annotated snapshots readable by the old shape", () => {
    const legacy = {
      generation: "legacy",
      fromCursor: 0,
      toCursor: 4,
      data: "done",
      processState: "exited",
      terminalSize: { cols: 80, rows: 24 },
    };
    expect(terminalSnapshotSchema.parse(legacy)).toEqual(legacy);
    const annotated = { ...legacy, columnChanges: [{ fromCursor: 0, columns: 80 }] };
    expect(terminalSnapshotSchema.parse(annotated)).toEqual(annotated);
    expect(terminalSnapshotSchema.omit({ columnChanges: true }).parse(annotated)).toEqual(legacy);
  });

  it("converts absolute ordered markers into spans and clips at the left edge", () => {
    const history = new TerminalColumnHistory();
    history.recordChanges(2, 10, [
      { fromCursor: 0, columns: 48 },
      { fromCursor: 4, columns: null },
      { fromCursor: 6, columns: 100 },
    ]);
    // The marker at 0 supplies the width at the left clip; the null marker
    // leaves 4..6 unknown; the last marker's width runs to the range end.
    expect(history.snapshot(2, 10)).toEqual([
      { fromCursor: 2, columns: 48 },
      { fromCursor: 4, columns: null },
      { fromCursor: 6, columns: 100 },
    ]);
  });

  it("treats absent or malformed marker lists as widthless without partial writes", () => {
    for (const changes of [
      undefined,
      [],
      [
        { fromCursor: 0, columns: 48 },
        { fromCursor: 5, columns: 100 },
        { fromCursor: 3, columns: 60 },
      ],
      [{ fromCursor: 0, columns: 5 }],
      [{ fromCursor: 1.5, columns: 48 }],
    ]) {
      const history = new TerminalColumnHistory();
      history.recordChanges(0, 10, changes);
      expect(history.snapshot(0, 10)).toEqual([{ fromCursor: 0, columns: null }]);
    }
    const history = new TerminalColumnHistory();
    expect(() => history.recordChanges(6, 5, [{ fromCursor: 0, columns: 48 }])).toThrow(RangeError);
    history.recordChanges(5, 5, [{ fromCursor: 0, columns: 48 }]);
    expect(history.snapshot(0, 5)).toEqual([{ fromCursor: 0, columns: null }]);
  });

  it("keeps the largest retained history within the snapshot schema bound", () => {
    const history = new TerminalColumnHistory();
    for (let cursor = 1; cursor < MAX_TERMINAL_COLUMN_CHANGES; cursor += 2) {
      history.record(cursor, cursor + 1, 48);
    }
    const columnChanges = history.snapshot(0, MAX_TERMINAL_COLUMN_CHANGES);
    expect(columnChanges).toHaveLength(MAX_TERMINAL_COLUMN_CHANGES);
    expect(
      terminalSnapshotSchema.safeParse({
        generation: "resized",
        fromCursor: 0,
        toCursor: MAX_TERMINAL_COLUMN_CHANGES,
        data: "x".repeat(MAX_TERMINAL_COLUMN_CHANGES),
        processState: "running",
        terminalSize: { cols: 48, rows: 24 },
        columnChanges,
      }).success,
    ).toBe(true);
  });
});

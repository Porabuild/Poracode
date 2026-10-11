import { describe, expect, it, vi } from "vitest";
import { cursorOutputTail } from "./cursorOutputTail";
import { readRunResult } from "./runResult";
import { readReleasedRunResult } from "./runResult.boundedCursor.testFixtures";
import type { PreparedSubagentRun } from "./spawnPlan";

type Edit = Parameters<typeof readRunResult>[0]["cursorOutputEdits"][number];

function record(raw: string, edits: Edit[]): Parameters<typeof readRunResult>[0] {
  return {
    status: "completed",
    output: "display",
    cursorOutput: raw,
    cursorOutputEdits: edits,
    attemptResults: [],
    attemptIndex: 0,
    pendingRequestIds: new Set(),
    report: undefined,
    error: undefined,
    plan: { attempts: [{}] } as PreparedSubagentRun,
  };
}

function measureStrings<T>(read: () => T) {
  const originalJoin = Array.prototype.join;
  const originalSlice = String.prototype.slice;
  const metrics = { joinCalls: 0, joinInputChars: 0, joinResultChars: 0, sliceResultChars: 0 };
  const join = vi
    .spyOn(Array.prototype, "join")
    .mockImplementation(function (this: unknown[], separator) {
      for (const text of this) {
        if (typeof text === "string") metrics.joinInputChars += text.length;
      }
      const result = originalJoin.call(this, separator);
      metrics.joinCalls++;
      metrics.joinResultChars += result.length;
      return result;
    });
  const slice = vi
    .spyOn(String.prototype, "slice")
    .mockImplementation(function (this: string, start, end) {
      const result = originalSlice.call(this, start, end);
      metrics.sliceResultChars += result.length;
      return result;
    });
  try {
    return { result: read(), metrics };
  } finally {
    join.mockRestore();
    slice.mockRestore();
  }
}

describe("bounded corrected cursor tail", () => {
  it("matches complete frozen suffixes at every UTF-16 boundary and small cap", () => {
    const raw = "p😀e\u0301\ud800-\udfffxyz";
    const edits: Edit[] = [
      { key: "same", start: 2, end: 6, replacement: "first😀" },
      { key: "zero", start: 2, end: 2, replacement: "Z" },
      { key: "other", start: 1, end: 4, replacement: "" },
      { key: "same", start: 8, end: 10, replacement: "later" },
      { key: "tie", start: 2, end: 7, replacement: "e\u0301\udfff" },
    ];
    function* permutations(remaining: Edit[]): Generator<Edit[]> {
      if (remaining.length === 0) yield [];
      for (let index = 0; index < remaining.length; index++) {
        for (const rest of permutations(remaining.filter((_, position) => position !== index))) {
          yield [remaining[index]!, ...rest];
        }
      }
    }
    for (const ordering of permutations(edits)) {
      const value = record(raw, ordering);
      for (let offset = -2; offset <= raw.length + 2; offset++) {
        if (offset === 0) continue; // Beginning reads use the display projection.
        const complete = readReleasedRunResult(value, { afterOutputChars: offset }).output;
        for (const cap of [1, 2, 3, 4, 8, 32]) {
          expect(cursorOutputTail(raw, ordering, offset, cap)).toEqual({
            tail: complete.slice(-cap),
            totalChars: complete.length,
          });
        }
      }
    }
  });

  it("marks an empty first qualifying replacement emitted, even before a later expansion", () => {
    const edits: Edit[] = [
      { key: "same", start: 1, end: 3, replacement: "" },
      { key: "same", start: 4, end: 6, replacement: "later".repeat(10_000) },
    ];
    expect(cursorOutputTail("!ab-cd", edits, 1, 2)).toEqual({ tail: "-", totalChars: 1 });
    expect(cursorOutputTail("!ab-cd", edits, 3, 2)).toEqual({ tail: "er", totalChars: 50_001 });
  });

  it.each([1, 1_000, 16_000])(
    "materializes only the retained %i-unit payload across large raw and replacement spans",
    (cap) => {
      const raw = "!" + "d".repeat(500_000) + "z".repeat(500_000);
      const replacement = "😀" + "R".repeat(499_999);
      const edits = [{ key: "answer", start: 1, end: 500_001, replacement }];
      const { result, metrics } = measureStrings(() => cursorOutputTail(raw, edits, 1, cap));
      expect(result).toEqual({ tail: "z".repeat(cap), totalChars: 1_000_001 });
      expect(metrics).toEqual({
        joinCalls: 1,
        joinInputChars: cap,
        joinResultChars: cap,
        sliceResultChars: cap,
      });
    },
  );

  it("joins only the retained tiny fragments while counting every corrected unit", () => {
    const raw = "!" + "d".repeat(20_000);
    const edits = Array.from({ length: 20_000 }, (_, index) => ({
      key: `${index}`,
      start: index + 1,
      end: index + 2,
      replacement: index % 3 === 0 ? "" : index % 3 === 1 ? "😀" : "x",
    }));
    const complete = edits.map((edit) => edit.replacement).join("");
    const { result, metrics } = measureStrings(() => cursorOutputTail(raw, edits, 1, 17));
    expect(result).toEqual({ tail: complete.slice(-17), totalChars: complete.length });
    expect(metrics).toEqual({
      joinCalls: 1,
      joinInputChars: 17,
      joinResultChars: 17,
      sliceResultChars: 17,
    });
  });

  it.each([
    ["running", 1_000],
    ["completed", 16_000],
  ] as const)("bounds the entire %s result read without a second tail slice", (status, cap) => {
    const value = record("!d", [
      { key: "answer", start: 1, end: 2, replacement: "😀" + "q".repeat(cap - 1) },
    ]);
    value.status = status;
    const expected = readReleasedRunResult(value, { afterOutputChars: 1 });
    const { result, metrics } = measureStrings(() => readRunResult(value, { afterOutputChars: 1 }));
    expect(result).toEqual(expected);
    expect(result.output).toBe(
      `[…1 earlier chars omitted — pass full_output=true for the complete output]\n\ude00${"q".repeat(cap - 1)}`,
    );
    expect(result.total_output_chars).toBe(2);
    expect(metrics).toEqual({
      joinCalls: 1,
      joinInputChars: cap,
      joinResultChars: cap,
      sliceResultChars: cap,
    });
  });

  it("reports the whole suffix length even when it fits the cap", () => {
    const { result, metrics } = measureStrings(() => cursorOutputTail("!abc", [], 1, 10));
    expect(result).toEqual({ tail: "abc", totalChars: 3 });
    expect(metrics).toEqual({
      joinCalls: 0,
      joinInputChars: 0,
      joinResultChars: 0,
      sliceResultChars: 3,
    });
  });

  it("reads an unedited raw suffix with one capped slice and no join", () => {
    const value = record("!" + "d".repeat(1_048_576), []);
    value.status = "running";
    const expected = readReleasedRunResult(value, { afterOutputChars: 1 });
    const { result, metrics } = measureStrings(() => readRunResult(value, { afterOutputChars: 1 }));
    expect(result).toStrictEqual(expected);
    expect(metrics).toEqual({
      joinCalls: 0,
      joinInputChars: 0,
      joinResultChars: 0,
      sliceResultChars: 1_000,
    });
  });

  it("returns end cursors without sorting, including zero-length edits at the end", () => {
    const raw = "a😀";
    const edits = [
      { key: "at-end", start: raw.length, end: raw.length, replacement: "Z" },
      { key: "whole", start: 0, end: raw.length, replacement: "whole" },
    ];
    for (const corrections of [[], edits]) {
      const value = record(raw, corrections);
      for (const offset of [raw.length, raw.length + 1, Number.MAX_VALUE]) {
        const expected = readReleasedRunResult(value, { afterOutputChars: offset });
        const sort = vi.spyOn(Array.prototype, "sort");
        let observed;
        let sortCalls;
        try {
          observed = measureStrings(() => readRunResult(value, { afterOutputChars: offset }));
          sortCalls = sort.mock.calls.length;
        } finally {
          sort.mockRestore();
        }
        expect(observed.result).toStrictEqual(expected);
        expect(sortCalls).toBe(0);
        expect(observed.metrics).toEqual({
          joinCalls: 0,
          joinInputChars: 0,
          joinResultChars: 0,
          sliceResultChars: 0,
        });
      }
    }
  });

  it("reads new raw text after a previous end cursor without caching the empty result", () => {
    const value = record("abc", [
      { key: "zero", start: 3, end: 3, replacement: "Z" },
      { key: "old", start: 1, end: 3, replacement: "old" },
    ]);
    expect(readRunResult(value, { afterOutputChars: 3 }).output).toBe("");
    value.cursorOutput += "😀tail";
    expect(readRunResult(value, { afterOutputChars: 3 })).toStrictEqual(
      readReleasedRunResult(value, { afterOutputChars: 3 }),
    );
    expect(readRunResult(value, { afterOutputChars: 3 }).output).toBe("😀tail");
  });

  it("bounds repeated old-cursor reads across a million corrected units", () => {
    const edits = Array.from({ length: 512 }, (_, index) => ({
      key: `item:${index}`,
      start: 1 + index * 2_048,
      end: 1 + (index + 1) * 2_048,
      replacement: "R".repeat(2_048),
    })).reverse();
    const value = record("!" + "d".repeat(1_048_576), edits);
    for (const status of ["running", "completed"] as const) {
      value.status = status;
      const cap = status === "running" ? 1_000 : 16_000;
      const expected = readReleasedRunResult(value, { afterOutputChars: 1 });
      for (let index = 0; index < 4; index++) {
        const { result, metrics } = measureStrings(() =>
          readRunResult(value, { afterOutputChars: 1 }),
        );
        expect(result).toStrictEqual(expected);
        expect(metrics).toEqual({
          joinCalls: 1,
          joinInputChars: cap,
          joinResultChars: cap,
          sliceResultChars: cap,
        });
      }
    }
  });

  it("declines numeric domains outside the proved forward-span contract", () => {
    const normal = { key: "answer", start: 1, end: 3, replacement: "R" };
    for (const offset of [NaN, Infinity, -Infinity, 0.25, -0.25]) {
      expect(cursorOutputTail("abcd", [normal], offset, 2)).toBeUndefined();
      expect(cursorOutputTail("abcd", [], offset, 2)).toBeUndefined();
    }
    for (const patch of [
      { start: NaN },
      { end: NaN },
      { start: Infinity },
      { end: Infinity },
      { start: -Infinity },
      { end: -Infinity },
      { start: 1.5 },
      { end: 2.5 },
      { start: -1 },
      { end: 5 },
      { start: 3, end: 2 },
    ]) {
      expect(cursorOutputTail("abcd", [{ ...normal, ...patch }], 1, 2)).toBeUndefined();
    }
    for (const cap of [0, -1, 0.5, NaN, Infinity]) {
      expect(cursorOutputTail("abcd", [normal], 1, cap)).toBeUndefined();
    }
  });
});

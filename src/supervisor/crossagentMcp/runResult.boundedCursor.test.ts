import { describe, expect, it } from "vitest";
import { readRunResult } from "./runResult";
import { readReleasedRunResult } from "./runResult.boundedCursor.testFixtures";
import type { PreparedSubagentRun } from "./spawnPlan";
import { SubagentTranscript } from "./SubagentTranscript";
import type { SubagentWaitOptions } from "./types";

type RunRecord = Parameters<typeof readRunResult>[0];
type Edit = RunRecord["cursorOutputEdits"][number];
const statuses = ["running", "completed", "failed", "cancelled"] as const;

function record(extra: Partial<RunRecord> = {}): RunRecord {
  return {
    status: "running",
    output: "current😀\ud800",
    cursorOutput: "p😀e\u0301\ud800-\udfffxyz",
    cursorOutputEdits: [],
    attemptResults: [
      {
        attempt: 1,
        provider: "fixture",
        model: "fixture",
        status: "failed",
        output: "prior:" + "p".repeat(2_200),
        error: "startup",
        may_have_side_effects: false,
      },
      {
        attempt: 3,
        provider: "fixture",
        model: "fixture",
        status: "completed",
        output: "current-in-attempts",
      },
      {
        attempt: 2,
        provider: "fixture",
        model: "fixture",
        status: "cancelled",
        output: "second😀",
      },
    ],
    attemptIndex: 2,
    pendingRequestIds: new Set(["request-a", "request-b"]),
    report: { error: "fixture report" },
    error: { message: "fixture failure", may_have_side_effects: true },
    plan: { attempts: [{}, {}, {}] } as PreparedSubagentRun,
    ...extra,
  };
}

function assertParity(value: RunRecord, options?: SubagentWaitOptions) {
  expect(readRunResult(value, options)).toStrictEqual(readReleasedRunResult(value, options));
}

describe("bounded cursor result parity with the frozen reader", () => {
  it("preserves complete result objects for UTF-16 boundaries, overlaps and tied starts", () => {
    const editSets: Edit[][] = [
      [],
      [{ key: "expanded", start: 1, end: 3, replacement: "replacement😀\udfff" }],
      [{ key: "empty", start: 1, end: 8, replacement: "" }],
      [
        { key: "same", start: 7, end: 10, replacement: "later" },
        { key: "tie", start: 2, end: 6, replacement: "T" },
        { key: "same", start: 1, end: 3, replacement: "first" },
        { key: "overlap", start: 2, end: 8, replacement: "😀" },
      ],
      [
        { key: "empty", start: 1, end: 3, replacement: "" },
        { key: "empty", start: 7, end: 10, replacement: "must not be emitted" },
        { key: "__proto__", start: 4, end: 5, replacement: "e\u0301" },
        { key: "constructor", start: 4, end: 7, replacement: "\ud800" },
      ],
      [
        { key: "zero", start: 2, end: 2, replacement: "Z" },
        { key: "positive", start: 2, end: 5, replacement: "X" },
      ],
      [
        { key: "positive", start: 2, end: 5, replacement: "X" },
        { key: "zero", start: 2, end: 2, replacement: "Z" },
      ],
    ];
    for (const edits of editSets) {
      const value = record({ cursorOutputEdits: edits });
      const originalOrder = edits.map((edit) => ({ ...edit }));
      for (const status of statuses) {
        value.status = status;
        for (let offset = -2; offset <= value.cursorOutput.length + 2; offset++) {
          for (const options of [
            { afterOutputChars: offset },
            { outputMode: "progress", afterOutputChars: offset },
            { outputMode: "quiet", afterOutputChars: offset },
            { fullOutput: true, afterOutputChars: offset },
            { fullOutput: true, currentAttemptOnly: true, afterOutputChars: offset },
          ] satisfies SubagentWaitOptions[]) {
            assertParity(value, options);
            assertParity(value, options); // A caller may repeatedly reuse an old cursor.
          }
        }
      }
      expect(edits).toEqual(originalOrder);
    }
  });

  it("preserves stable equal-start order and does not emit already skipped replacements", () => {
    const zero = { key: "zero", start: 2, end: 2, replacement: "Z" };
    const positive = { key: "positive", start: 2, end: 3, replacement: "X" };
    for (const [edits, expected] of [
      [[zero, positive], "bZX"],
      [[positive, zero], "bX"],
    ] as const) {
      const value = record({ cursorOutput: "abc", cursorOutputEdits: [...edits] });
      assertParity(value, { afterOutputChars: 1 });
      expect(readRunResult(value, { afterOutputChars: 1 }).output).toBe(expected);
      expect(readRunResult(value, { afterOutputChars: 3 }).output).toBe("");
    }
  });

  it.each(statuses)(
    "keeps %s cap boundaries, expansion, shrinkage and raw cursor metadata",
    (status) => {
      const cap = status === "running" ? 1_000 : 16_000;
      for (const replacement of [
        "",
        "x",
        "x".repeat(cap - 1),
        "x".repeat(cap),
        "😀" + "x".repeat(cap - 1),
      ]) {
        const value = record({
          status,
          cursorOutput: "!" + "d".repeat(cap * 2),
          cursorOutputEdits: [{ key: "answer", start: 1, end: cap * 2 + 1, replacement }],
        });
        for (const offset of [-1, 1, 2, cap, cap * 2, cap * 2 + 1, cap * 2 + 2]) {
          assertParity(value, { afterOutputChars: offset });
          expect(readRunResult(value, { afterOutputChars: offset }).total_output_chars).toBe(
            value.cursorOutput.length,
          );
        }
      }
      for (const length of [cap - 1, cap, cap + 1]) {
        assertParity(record({ status, cursorOutput: "!" + "r".repeat(length) }), {
          afterOutputChars: 1,
        });
      }
    },
  );

  it("keeps the legacy numeric behavior for fractional, nonfinite and invalid-range inputs", () => {
    const ordinary: Edit = { key: "first", start: 1, end: 4, replacement: "😀" };
    const invalid: Partial<Edit>[] = [
      { start: NaN },
      { end: NaN },
      { start: Infinity },
      { end: Infinity },
      { start: -Infinity },
      { end: -Infinity },
      { start: -2 },
      { end: -1 },
      { start: 1.25 },
      { end: 2.25 },
      { start: 3, end: 2 },
      { end: 50 },
      { start: Number.MAX_SAFE_INTEGER },
    ];
    const offsets = [
      NaN,
      Infinity,
      -Infinity,
      -0,
      -0.25,
      0.25,
      1,
      2.25,
      -3,
      40,
      Number.MAX_VALUE,
      -Number.MAX_VALUE,
    ];
    for (const patch of [{}, ...invalid]) {
      const value = record({
        cursorOutput: "a😀bc\udfffdef",
        cursorOutputEdits: [
          { ...ordinary, ...patch },
          { key: "second", start: 5, end: 8, replacement: "second" },
          { key: "first", start: 8, end: 9, replacement: "later" },
        ],
      });
      for (const status of statuses) {
        value.status = status;
        for (const offset of offsets) {
          expect(readRunResult(value, { afterOutputChars: offset })).toStrictEqual(
            readReleasedRunResult(value, { afterOutputChars: offset }),
          );
          assertParity(value, { afterOutputChars: offset, outputMode: "quiet" });
        }
      }
    }
    const unedited = record({ cursorOutputEdits: [] });
    for (const offset of offsets) {
      expect(readRunResult(unedited, { afterOutputChars: offset })).toStrictEqual(
        readReleasedRunResult(unedited, { afterOutputChars: offset }),
      );
    }
  });

  it("preserves beginning/display/history, full output and compact envelope branches", () => {
    const reports: RunRecord["report"][] = [
      undefined,
      { error: "fixture report" },
      {
        result: {
          version: 1,
          outcome: "completed",
          summary: "fixture",
          changes: [],
          checks: [],
          findings: [],
          risks: [],
          evidence: [],
        },
      },
    ];
    const options: Array<SubagentWaitOptions | undefined> = [
      undefined,
      {},
      { afterOutputChars: 0 },
      { afterOutputChars: -0 },
      { afterOutputChars: 1 },
      { afterOutputChars: 1, currentAttemptOnly: true },
      { outputMode: "quiet" },
      { outputMode: "quiet", afterOutputChars: 1 },
      { outputMode: "progress", afterOutputChars: 1 },
      { fullOutput: true },
      { fullOutput: true, currentAttemptOnly: true },
      { fullOutput: true, outputMode: "quiet", afterOutputChars: 1 },
    ];
    for (const status of statuses) {
      for (const report of reports) {
        for (const attempts of [[{}], [{}, {}, {}]]) {
          for (const resultMode of [undefined, "compact"] as const) {
            const value = record({
              status,
              report,
              output: "D".repeat(18_000),
              cursorOutput: "!d",
              cursorOutputEdits: [
                { key: "answer", start: 1, end: 2, replacement: "R".repeat(20_000) },
              ],
              plan: { attempts, ...(resultMode ? { resultMode } : {}) } as PreparedSubagentRun,
            });
            for (const option of options) assertParity(value, option);
          }
        }
      }
    }
    const onlyDisplay = record({
      cursorOutput: "",
      cursorOutputEdits: [],
      output: "authoritative only",
    });
    for (const option of options) assertParity(onlyDisplay, option);
    expect(readRunResult(onlyDisplay, { afterOutputChars: 1 }).output).toBe("");
    expect(readRunResult(onlyDisplay, { fullOutput: true, currentAttemptOnly: true }).output).toBe(
      "authoritative only",
    );
  });

  it("observes mutable correction array order and scalar mutations between repeated reads", () => {
    const first = { key: "first", start: 2, end: 2, replacement: "Z" };
    const second = { key: "second", start: 2, end: 3, replacement: "X" };
    const edits = [first, second];
    const value = record({ cursorOutput: "abcdef", cursorOutputEdits: edits });
    const check = () => {
      for (let offset = -1; offset <= 7; offset++)
        assertParity(value, { afterOutputChars: offset });
      expect(value.cursorOutputEdits).toBe(edits);
    };
    check();
    edits.reverse();
    check();
    first.replacement = "";
    check();
    second.key = "first";
    check();
    second.start = 1;
    check();
    second.end = 6;
    check();
    edits.push({ key: "third", start: 4, end: 6, replacement: "😀" });
    check();
    edits.splice(0, 1);
    check();
  });

  it("keeps reused ids across attempts, multiple revisions and final segment release", () => {
    const transcript = new SubagentTranscript();
    const value = record();
    Object.defineProperties(value, {
      output: { get: () => transcript.output },
      cursorOutput: { get: () => transcript.cursorOutput },
      cursorOutputEdits: { get: () => transcript.cursorOutputEdits },
    });
    const check = () => {
      for (const status of statuses) {
        value.status = status;
        for (let offset = -1; offset <= transcript.cursorOutput.length + 1; offset++) {
          assertParity(value, { afterOutputChars: offset });
          assertParity(value, { afterOutputChars: offset });
        }
        for (const options of [
          undefined,
          { fullOutput: true },
          { fullOutput: true, currentAttemptOnly: true },
          { outputMode: "quiet", afterOutputChars: 1 },
        ] satisfies Array<SubagentWaitOptions | undefined>) {
          assertParity(value, options);
        }
      }
    };
    for (let attempt = 0; attempt < 3; attempt++) {
      value.attemptIndex = attempt;
      transcript.replace("display-only", "authoritative😀", attempt);
      transcript.append("zero", "");
      transcript.append("a", "😀");
      transcript.append("b", "b");
      transcript.append("a", "c\udfff");
      transcript.replace("a", "expanded😀e\u0301", attempt);
      transcript.replace("b", "", attempt);
      transcript.replace("a", "new", attempt);
      check();
      transcript.append("a", "d\ud800");
      transcript.append("b", "e\u0301");
      transcript.replace("a", attempt % 2 ? "" : "later😀", attempt);
      check();
      transcript.resetAttempt();
      check();
    }
    const corrections = transcript.cursorOutputEdits;
    transcript.releaseSegments(transcript.output);
    expect(transcript.cursorOutputEdits).toEqual(corrections);
    check();
  });
});

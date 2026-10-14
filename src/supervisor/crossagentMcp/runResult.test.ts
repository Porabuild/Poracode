import { describe, expect, it } from "vitest";
import { readRunResult } from "./runResult";
import type { PreparedSubagentRun } from "./spawnPlan";
import type { SubagentWaitOptions } from "./types";

function record(): Parameters<typeof readRunResult>[0] {
  return {
    status: "completed",
    output: "final",
    cursorOutput: "old:draft",
    cursorOutputEdits: [{ start: 4, end: 9, key: "answer", replacement: "final" }],
    attemptResults: [
      { attempt: 1, provider: "fixture", model: "fixture", status: "failed", output: "old:" },
      { attempt: 2, provider: "fixture", model: "fixture", status: "completed", output: "final" },
    ],
    attemptIndex: 1,
    pendingRequestIds: new Set(),
    report: undefined,
    error: undefined,
    // This reader consumes only the number of resolved attempts, not adapters.
    plan: { attempts: [{}, {}] } as PreparedSubagentRun,
  };
}

describe("run result projections", () => {
  const cases: Array<[string, SubagentWaitOptions | undefined, string]> = [
    ["ordinary current output", undefined, "final"],
    ["full fallback history", { fullOutput: true }, "old:final"],
    ["full current attempt", { fullOutput: true, currentAttemptOnly: true }, "final"],
    ["cursor from beginning", { afterOutputChars: 0 }, "old:final"],
    ["cursor inside corrected text", { afterOutputChars: 5 }, "final"],
    ["cursor after all text", { afterOutputChars: 9 }, ""],
  ];
  it.each(cases)("preserves %s without exposing superseded text", (_name, options, output) => {
    const result = readRunResult(record(), options);
    expect(result.output).toBe(output);
    expect(result.attempts?.map((attempt) => attempt.output)).toEqual(["old:", "final"]);
    expect(result.total_output_chars).toBe(options?.afterOutputChars !== undefined ? 9 : undefined);
  });
  it("quiet running reads preserve the unread cursor and pending requests", () => {
    const value = record();
    value.status = "running";
    value.pendingRequestIds.add("request");
    expect(readRunResult(value, { outputMode: "quiet", afterOutputChars: 3 })).toMatchObject({
      output: "",
      total_output_chars: 3,
      pending_requests: 1,
      attempts: [{ output: "" }, { output: "" }],
    });
    expect(readRunResult(value, { outputMode: "quiet", fullOutput: true }).output).toBe(
      "old:final",
    );
  });
});

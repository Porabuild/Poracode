import { describe, expect, it } from "vitest";
import { DEFAULT_WAIT_TIMEOUT_MS, MAX_WAIT_TIMEOUT_MS } from "./SubagentRunManager";
import { jsonResult, parseWaitOptions, parseWaitTimeoutMs, runToolResult } from "./toolResult";

describe("parseWaitTimeoutMs", () => {
  it("reads timeout_s, clamped to [0, cap]", () => {
    expect(parseWaitTimeoutMs({ timeout_s: 30 })).toBe(30_000);
    expect(parseWaitTimeoutMs({ timeout_s: 9_999 })).toBe(MAX_WAIT_TIMEOUT_MS);
    expect(parseWaitTimeoutMs({ timeout_s: -5 })).toBe(0);
  });

  it("accepts the timeout_seconds and timeout_ms aliases agents guess in practice", () => {
    expect(parseWaitTimeoutMs({ timeout_seconds: 180 })).toBe(180_000);
    expect(parseWaitTimeoutMs({ timeout_ms: 90_000 })).toBe(90_000);
    expect(parseWaitTimeoutMs({ timeout_ms: 999_000 })).toBe(MAX_WAIT_TIMEOUT_MS);
    // The documented field always wins over an alias.
    expect(parseWaitTimeoutMs({ timeout_s: 10, timeout_ms: 50_000 })).toBe(10_000);
  });

  it("falls back to the default when no usable timeout field is present", () => {
    expect(parseWaitTimeoutMs({})).toBe(DEFAULT_WAIT_TIMEOUT_MS);
    expect(parseWaitTimeoutMs({ timeout_s: "soon" })).toBe(DEFAULT_WAIT_TIMEOUT_MS);
    expect(parseWaitTimeoutMs({ timeout_s: Number.NaN })).toBe(DEFAULT_WAIT_TIMEOUT_MS);
  });
});

describe("parseWaitOptions", () => {
  it("uses a caller-owned output cursor and lets full_output override it", () => {
    expect(parseWaitOptions({})).toEqual({
      outputMode: "quiet",
      fullOutput: false,
      afterOutputChars: 0,
    });
    expect(parseWaitOptions({ after_output_chars: 25 })).toEqual({
      outputMode: "quiet",
      fullOutput: false,
      afterOutputChars: 25,
    });
    expect(
      parseWaitOptions(
        { after_output_chars: 25, after_output_chars_by_run: { a: 100, b: 20 } },
        "b",
      ),
    ).toEqual({ outputMode: "quiet", fullOutput: false, afterOutputChars: 20 });
    expect(parseWaitOptions({ after_output_chars: -4 })).toEqual({
      outputMode: "quiet",
      fullOutput: false,
      afterOutputChars: 0,
    });
    expect(parseWaitOptions({ full_output: true, after_output_chars: 25 })).toEqual({
      fullOutput: true,
    });
  });
});

describe("output mode parsing", () => {
  it.each([null, 1, true, "silent"])(
    "rejects invalid mode %j even with full output",
    (output_mode) => {
      expect(() => parseWaitOptions({ output_mode, full_output: true })).toThrow(
        "output_mode must be quiet or progress",
      );
    },
  );
  it("preserves quiet batch cursors and gives full output precedence", () => {
    expect(
      parseWaitOptions({ output_mode: "quiet", after_output_chars_by_run: { a: 17 } }, "a"),
    ).toEqual({ outputMode: "quiet", fullOutput: false, afterOutputChars: 17 });
    expect(parseWaitOptions({ output_mode: "quiet", full_output: true })).toEqual({
      fullOutput: true,
    });
    expect(parseWaitOptions({ output_mode: "progress" })).toEqual({
      outputMode: "progress",
      fullOutput: false,
      afterOutputChars: 0,
    });
  });
});

describe("compact wire serialization", () => {
  it("preserves multiline evidence, Unicode and control cues without JSON indentation", () => {
    const value = {
      run_id: "run",
      status: "running" as const,
      output: "Evidence: café\nline two",
      total_output_chars: 23,
    };
    const response = runToolResult(value);
    expect(JSON.parse(response.content[0]!.text)).toEqual(value);
    expect(response.content[0]!.text).not.toContain("\n");
    expect(response.content).toHaveLength(2);
    expect(response.content[1]!.text).toContain("wait_for_agent");
    expect(JSON.parse(jsonResult({ error: "bad\nvalue" }).content[0]!.text)).toEqual({
      error: "bad\nvalue",
    });
  });
});

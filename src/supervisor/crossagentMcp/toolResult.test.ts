import { describe, expect, it } from "vitest";
import { DEFAULT_WAIT_TIMEOUT_MS, MAX_WAIT_TIMEOUT_MS } from "./SubagentRunManager";
import { parseWaitOptions, parseWaitTimeoutMs } from "./toolResult";

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
    expect(parseWaitOptions({})).toEqual({ fullOutput: false, afterOutputChars: 0 });
    expect(parseWaitOptions({ after_output_chars: 25 })).toEqual({
      fullOutput: false,
      afterOutputChars: 25,
    });
    expect(
      parseWaitOptions(
        { after_output_chars: 25, after_output_chars_by_run: { a: 100, b: 20 } },
        "b",
      ),
    ).toEqual({ fullOutput: false, afterOutputChars: 20 });
    expect(parseWaitOptions({ after_output_chars: -4 })).toEqual({
      fullOutput: false,
      afterOutputChars: 0,
    });
    expect(parseWaitOptions({ full_output: true, after_output_chars: 25 })).toEqual({
      fullOutput: true,
    });
  });
});

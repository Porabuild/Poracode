import { describe, expect, it } from "vitest";
import { aggregateClaudeCost } from "./cost";

const NOW = Date.parse("2026-05-29T00:00:00Z");
const SINCE = NOW - 30 * 86_400_000;
const TS = "2026-05-28T12:00:00Z";

function line(obj: unknown): string {
  return JSON.stringify(obj);
}

describe("aggregateClaudeCost", () => {
  it("sums tokens per model, dedups by message:request, prices at list rates", () => {
    const a = line({
      type: "assistant",
      requestId: "r1",
      timestamp: TS,
      message: {
        id: "m1",
        model: "claude-sonnet-4-5",
        usage: { input_tokens: 1000, output_tokens: 2000, cache_read_input_tokens: 500 },
      },
    });
    const dup = a; // same message:request → ignored
    const b = line({
      type: "assistant",
      requestId: "r2",
      timestamp: TS,
      message: { id: "m2", model: "claude-opus-4-8", usage: { input_tokens: 1_000_000 } },
    });
    const noise = line({ type: "user", message: {} });

    const est = aggregateClaudeCost([`${a}\n${dup}\n${b}\n${noise}`], {
      sinceMs: SINCE,
      nowMs: NOW,
    });
    expect(est).toBeDefined();
    expect(est?.tokens.input).toBe(1_001_000);
    expect(est?.tokens.output).toBe(2000);
    expect(est?.tokens.cacheRead).toBe(500);
    expect(est?.tokens.total).toBe(1_003_500);
    // opus input 1M * $15/1M = $15, the largest contributor
    expect(est?.topModel).toBe("claude-opus-4-8");
    expect(est?.cost.estimated).toBe(true);
    expect(est?.cost.currency).toBe("USD");
    expect(est?.cost.amount).toBeGreaterThan(15);
  });

  it("excludes entries outside the window and returns undefined when empty", () => {
    const old = line({
      type: "assistant",
      requestId: "r",
      timestamp: "2020-01-01T00:00:00Z",
      message: { id: "m", model: "claude-sonnet", usage: { input_tokens: 100 } },
    });
    expect(aggregateClaudeCost([old], { sinceMs: SINCE, nowMs: NOW })).toBeUndefined();
    expect(aggregateClaudeCost([""], { sinceMs: 0, nowMs: NOW })).toBeUndefined();
  });
});

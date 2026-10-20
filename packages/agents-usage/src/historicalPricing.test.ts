import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { historicalTokenEstimate, HISTORICAL_PRICES } from "./historicalPricing";

const tokens = { input: 1_000_000, output: 100_000, cacheRead: 500_000, cacheWrite: 0 };
const now = Date.parse("2026-10-16T12:00:00Z");
const model = "claude-sonnet-4-6";

describe("dated historical estimates", () => {
  it("loads the focused pricing export in native Node database workers", () => {
    expect(
      execFileSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          "import { historicalTokenEstimate } from '@poracode/agents-usage/historical-pricing'; console.log(typeof historicalTokenEstimate)",
        ],
        { encoding: "utf8" },
      ).trim(),
    ).toBe("function");
  });

  it("uses disjoint input/output/cache categories and exact model IDs", () => {
    expect(historicalTokenEstimate(model, tokens, now)?.amount).toBeCloseTo(4.65);
    expect(historicalTokenEstimate("claude-sonnet-future", tokens, now)).toBeUndefined();
    expect(historicalTokenEstimate("sonnet", tokens, now)).toBeUndefined();
    expect(historicalTokenEstimate(model, { total: 1_600_000 }, now)).toBeUndefined();
  });

  it("does not apply a newly reviewed rate to older usage", () => {
    expect(
      historicalTokenEstimate(model, tokens, Date.parse("2026-10-15T23:59:59Z")),
    ).toBeUndefined();
    const prior = HISTORICAL_PRICES.find((price) => price.model === model)!;
    const updated = { ...prior, id: "future", effectiveFrom: "2026-11-01", input: 6 };
    const prices = [updated, prior];
    expect(historicalTokenEstimate(model, tokens, now, prices)?.pricing.id).toBe(prior.id);
    expect(
      historicalTokenEstimate(model, tokens, Date.parse("2026-11-01"), prices)?.amount,
    ).toBeCloseTo(7.65);
  });

  it("requires cache TTL and prices 5m and 1h writes separately", () => {
    const writes = { ...tokens, cacheWrite: 1_000_000 };
    expect(historicalTokenEstimate(model, writes, now)).toBeUndefined();
    expect(
      historicalTokenEstimate(model, { ...writes, cacheWrite1h: 400_000 }, now)?.amount,
    ).toBeCloseTo(9.3);
    expect(
      historicalTokenEstimate(model, { ...writes, cacheWrite1h: 2_000_000 }, now),
    ).toBeUndefined();
    expect(
      historicalTokenEstimate("gpt-5.3-codex", { ...writes, cacheWrite1h: 0 }, now),
    ).toBeUndefined();
  });

  it.each([
    "claude-sonnet-4-20250514",
    "claude-sonnet-4-5-20250929",
    "claude-opus-4-20250514",
    "claude-opus-4-1-20250805",
    "claude-opus-4-5-20251101",
    "claude-haiku-4-5-20251001",
  ])("does not extrapolate %s beyond its reviewed prompt-size band", (legacyModel) => {
    const atLimit = {
      input: 100_000,
      output: 1_000,
      cacheRead: 50_000,
      cacheWrite: 50_000,
      cacheWrite1h: 20_000,
    };
    const estimate = historicalTokenEstimate(legacyModel, atLimit, now);
    expect(estimate).toBeDefined();
    expect(estimate?.pricing).not.toHaveProperty("maxInputTokens");
    expect(
      historicalTokenEstimate(legacyModel, { ...atLimit, cacheRead: 50_001 }, now),
    ).toBeUndefined();
    expect(
      historicalTokenEstimate(legacyModel, { ...atLimit, input: 100_001 }, now),
    ).toBeUndefined();
    expect(
      historicalTokenEstimate(legacyModel, { ...atLimit, cacheWrite: 50_001 }, now),
    ).toBeUndefined();
  });

  it("keeps full-context standard rates for qualified models and checks exact cache math", () => {
    const usage = {
      input: 750_000,
      output: 10_000,
      cacheRead: 100_000,
      cacheWrite: 50_000,
      cacheWrite1h: 20_000,
    };
    expect(historicalTokenEstimate(model, usage, now)?.amount).toBeCloseTo(2.6625, 12);
    expect(
      historicalTokenEstimate(
        "gpt-5.3-codex",
        { input: 110_000, output: 20_000, cacheRead: 50_000, cacheWrite: 0 },
        now,
      )?.amount,
    ).toBeCloseTo(0.48125, 12);
  });

  it("retains a real zero estimate without confusing it with unknown pricing", () => {
    expect(
      historicalTokenEstimate(model, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, now)
        ?.amount,
    ).toBe(0);
  });
});

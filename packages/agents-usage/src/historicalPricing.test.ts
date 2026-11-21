import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import {
  estimateCacheSavingsUsd,
  estimateCategoryCosts,
  historicalTokenEstimate,
  HISTORICAL_PRICES,
} from "./historicalPricing";

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

  it("normalizes provider-prefixed, bracket-variant, and Cursor effort model IDs without guessing unknown names", () => {
    const nov21 = Date.parse("2026-11-21T12:00:00Z");
    expect(historicalTokenEstimate("anthropic/claude-opus-4-6", tokens, nov21)?.pricing.model).toBe(
      "claude-opus-4-6",
    );
    expect(historicalTokenEstimate("claude-opus-4-6[1m]", tokens, nov21)?.pricing.model).toBe(
      "claude-opus-4-6",
    );
    expect(
      historicalTokenEstimate("claude-opus-4-6-thinking-high", tokens, nov21)?.pricing.model,
    ).toBe("claude-opus-4-6");
    expect(
      historicalTokenEstimate("xai/grok-4[effort=high,fast=true]", tokens, nov21)?.pricing.model,
    ).toBe("grok-4");
    expect(historicalTokenEstimate("google/gemini-2.5-flash", tokens, nov21)?.pricing.model).toBe(
      "gemini-2.5-flash",
    );
    expect(
      historicalTokenEstimate("opencode-go/deepseek-reasoner", tokens, nov21)?.pricing.model,
    ).toBe("deepseek-reasoner");
    expect(historicalTokenEstimate("cursor-grok-4-high-fast", tokens, nov21)?.pricing.model).toBe(
      "grok-4",
    );
    expect(historicalTokenEstimate("anthropic/sonnet", tokens, nov21)).toBeUndefined();
    expect(historicalTokenEstimate("<synthetic>", tokens, nov21)).toBeUndefined();
    expect(historicalTokenEstimate("openai/gpt-99-unknown", tokens, nov21)).toBeUndefined();
  });

  it("prices long-context tiers for Gemini models when prompt exceeds 200k tokens", () => {
    const nov21 = Date.parse("2026-11-21T12:00:00Z");
    const shortUsage = { input: 150_000, output: 10_000, cacheRead: 50_000, cacheWrite: 0 };
    const longUsage = { input: 150_001, output: 10_000, cacheRead: 50_000, cacheWrite: 0 };

    const shortEstimate = historicalTokenEstimate("gemini-2.5-pro", shortUsage, nov21)!;
    const longEstimate = historicalTokenEstimate("gemini-2.5-pro", longUsage, nov21)!;
    expect(shortEstimate.pricing.id).toBe("gemini-2.5-pro:2026-11-21");
    expect(shortEstimate.amount).toBeCloseTo(
      (150_000 * 1.25 + 10_000 * 10 + 50_000 * 0.125) / 1_000_000,
      12,
    );
    expect(longEstimate.pricing.id).toBe("gemini-2.5-pro:2026-11-21:long-context");
    expect(longEstimate.amount).toBeCloseTo(
      (150_001 * 2.5 + 10_000 * 15 + 50_000 * 0.25) / 1_000_000,
      12,
    );
  });

  it("enforces the 200k prompt-size cap on unpinned Anthropic 4.0/4.1/4.5 aliases and avoids stale base fallback", () => {
    const nov21 = Date.parse("2026-11-21T12:00:00Z");
    expect(
      historicalTokenEstimate(
        "anthropic/claude-sonnet-4-5[1m]",
        { input: 200_001, output: 1_000, cacheRead: 0, cacheWrite: 0 },
        nov21,
      ),
    ).toBeUndefined();
    expect(
      historicalTokenEstimate(
        "anthropic/claude-sonnet-4-5",
        { input: 200_000, output: 1_000, cacheRead: 0, cacheWrite: 0 },
        nov21,
      )?.pricing.model,
    ).toBe("claude-sonnet-4-5");

    // Distinct suffixed model must not fall back to an earlier base model's snapshot.
    const baseEarlier = {
      ...HISTORICAL_PRICES.find((p) => p.model === "grok-4")!,
      effectiveFrom: "2026-10-01",
    };
    const fastLater = {
      ...HISTORICAL_PRICES.find((p) => p.model === "grok-4-fast")!,
      effectiveFrom: "2026-11-21",
    };
    expect(
      historicalTokenEstimate("grok-4-fast", tokens, Date.parse("2026-11-01T00:00:00Z"), [
        baseEarlier,
        fastLater,
      ]),
    ).toBeUndefined();
  });

  it("computes per-category costs and cache savings accurately", () => {
    const price = HISTORICAL_PRICES.find((p) => p.model === "claude-sonnet-4-6")!;
    const cat = estimateCategoryCosts(price, {
      input: 1_000_000,
      output: 100_000,
      cacheRead: 500_000,
      cacheWrite: 1_000_000,
      cacheWrite1h: 400_000,
    });
    expect(cat.input).toBeCloseTo(3, 12);
    expect(cat.output).toBeCloseTo(1.5, 12);
    expect(cat.cacheRead).toBeCloseTo(0.15, 12);
    expect(cat.cacheWrite).toBeCloseTo((600_000 * 3.75 + 400_000 * 6) / 1_000_000, 12);
    expect(estimateCacheSavingsUsd(price, { cacheRead: 500_000 })).toBeCloseTo(1.35, 12);
    expect(estimateCacheSavingsUsd(price, { cacheRead: 0 })).toBe(0);
    expect(estimateCacheSavingsUsd({ input: 0.5, cacheRead: 1 }, { cacheRead: 500_000 })).toBe(0);
  });
});

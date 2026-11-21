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
    expect(
      historicalTokenEstimate('["deepseek-official","deepseek-flash"]', tokens, nov21)?.pricing
        .model,
    ).toBe("deepseek-flash");
    expect(
      historicalTokenEstimate("us.anthropic.claude-sonnet-4-6-v1:0", tokens, nov21)?.pricing.model,
    ).toBe("claude-sonnet-4-6");
    expect(
      historicalTokenEstimate("github-copilot/gpt-5.4-mini", tokens, nov21)?.pricing.model,
    ).toBe("gpt-5.4-mini");
    expect(
      historicalTokenEstimate("antigravity/gemini-3.6-flash-medium", tokens, nov21)?.pricing.model,
    ).toBe("gemini-3.6-flash");
    expect(historicalTokenEstimate("mistral/mistral-large-4", tokens, nov21)?.pricing.model).toBe(
      "mistral-large-4",
    );
    expect(
      historicalTokenEstimate("minimax/MiniMax-M3.1-Flash", tokens, nov21)?.pricing.model,
    ).toBe("minimax-m3.1-flash");
    expect(historicalTokenEstimate("anthropic/sonnet", tokens, nov21)).toBeUndefined();
    expect(historicalTokenEstimate("<synthetic>", tokens, nov21)).toBeUndefined();
    expect(historicalTokenEstimate("openai/gpt-99-unknown", tokens, nov21)).toBeUndefined();
  });

  it("prices long-context tiers for Gemini, Grok, and MiniMax models", () => {
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

    const grokShort = historicalTokenEstimate("grok-4.7", shortUsage, nov21)!;
    const grokLong = historicalTokenEstimate("grok-4.7", longUsage, nov21)!;
    expect(grokShort.amount).toBeCloseTo((150_000 * 2 + 10_000 * 6 + 50_000 * 0.5) / 1_000_000, 12);
    expect(grokLong.pricing.id).toBe("grok-4.7:2026-11-21:long-context");
    expect(grokLong.amount).toBeCloseTo((150_001 * 4 + 10_000 * 12 + 50_000 * 1) / 1_000_000, 12);

    // Grok Build Fast is its own reviewed row (2x standard / 1.5x long), never
    // the base model's rate; other models' fast siblings stay unpriced.
    const fastShort = historicalTokenEstimate("grok-4.7-build-fast", shortUsage, nov21)!;
    const fastLong = historicalTokenEstimate("grok-4.7-build-fast", longUsage, nov21)!;
    expect(fastShort.pricing.id).toBe("grok-4.7-build-fast:2026-11-21");
    expect(fastShort.amount).toBeCloseTo((150_000 * 4 + 10_000 * 12 + 50_000 * 1) / 1_000_000, 12);
    expect(fastLong.pricing.id).toBe("grok-4.7-build-fast:2026-11-21:long-context");
    expect(fastLong.amount).toBeCloseTo((150_001 * 6 + 10_000 * 18 + 50_000 * 1.5) / 1_000_000, 12);
    expect(historicalTokenEstimate("grok-4.6-build-fast", shortUsage, nov21)).toBeUndefined();

    const mmShort = historicalTokenEstimate(
      "minimax-m3",
      { input: 512_000, output: 10_000, cacheRead: 0, cacheWrite: 0 },
      nov21,
    )!;
    const mmLong = historicalTokenEstimate(
      "minimax-m3",
      { input: 512_001, output: 10_000, cacheRead: 0, cacheWrite: 0 },
      nov21,
    )!;
    expect(mmShort.pricing.id).toBe("minimax-m3:2026-11-21");
    expect(mmLong.pricing.id).toBe("minimax-m3:2026-11-21:long-context");
    expect(mmLong.amount).toBeCloseTo((512_001 * 0.6 + 10_000 * 2.4) / 1_000_000, 12);
  });

  it("prices the Codex default gpt-5.5 at its reviewed short-context list rate", () => {
    const nov21 = Date.parse("2026-11-21T12:00:00Z");
    expect(historicalTokenEstimate("gpt-5.5", tokens, nov21)?.amount).toBeCloseTo(
      (1_000_000 * 5 + 100_000 * 30 + 500_000 * 0.5) / 1_000_000,
      12,
    );
    expect(historicalTokenEstimate("gpt-5.5-pro", tokens, nov21)?.amount).toBeCloseTo(
      (1_000_000 * 30 + 100_000 * 180) / 1_000_000,
      12,
    );
    expect(historicalTokenEstimate("gpt-5.4-pro", tokens, nov21)?.amount).toBeCloseTo(
      (1_000_000 * 30 + 100_000 * 180) / 1_000_000,
      12,
    );
    expect(historicalTokenEstimate("gpt-5.5", tokens, Date.parse("2026-11-20"))).toBeUndefined();
  });

  it("prices GPT-6.2 and Claude Fable 5.2 from launch day, and Gemini 4 Neon from its review day", () => {
    const solTokens = { input: 1_000_000, output: 100_000, cacheRead: 500_000, cacheWrite: 0 };
    const sol = historicalTokenEstimate(
      "gpt-6.2-sol",
      solTokens,
      Date.parse("2026-11-17T00:00:00Z"),
    );
    expect(sol?.pricing.effectiveFrom).toBe("2026-11-17");
    expect(sol?.pricing.reviewedAt).toBe("2026-11-21");
    expect(sol?.amount).toBeCloseTo((1_000_000 * 2 + 100_000 * 10 + 500_000 * 0.1) / 1_000_000, 12);
    expect(
      historicalTokenEstimate("gpt-6.2-sol", solTokens, Date.parse("2026-11-16T23:00:00Z")),
    ).toBeUndefined();
    expect(
      historicalTokenEstimate("gpt-6.2-astra", solTokens, Date.parse("2026-11-17T12:00:00Z"))
        ?.amount,
    ).toBeCloseTo((1_000_000 * 8 + 100_000 * 40 + 500_000 * 0.4) / 1_000_000, 12);

    const fableTokens = {
      input: 1_000_000,
      output: 100_000,
      cacheRead: 500_000,
      cacheWrite: 40_000,
      cacheWrite1h: 10_000,
    };
    expect(
      historicalTokenEstimate("claude-fable-5-2", fableTokens, Date.parse("2026-11-09T00:00:00Z"))
        ?.amount,
    ).toBeCloseTo(
      (1_000_000 * 8 + 100_000 * 40 + 500_000 * 0.2 + 30_000 * 10 + 10_000 * 16) / 1_000_000,
      12,
    );
    expect(
      historicalTokenEstimate("claude-fable-5-2", fableTokens, Date.parse("2026-11-08T00:00:00Z")),
    ).toBeUndefined();
    expect(
      historicalTokenEstimate(
        "claude-fable-5-2",
        { input: 1_000_000, output: 100_000, cacheRead: 500_000, cacheWrite: 40_000 },
        Date.parse("2026-11-09T00:00:00Z"),
      ),
    ).toBeUndefined();

    expect(
      historicalTokenEstimate("gemini-4-neon", solTokens, Date.parse("2026-11-21T00:00:00Z"))
        ?.amount,
    ).toBeCloseTo((1_000_000 * 3 + 100_000 * 15 + 500_000 * 0.15) / 1_000_000, 12);
    expect(
      historicalTokenEstimate("gemini-4-neon", solTokens, Date.parse("2026-11-20T00:00:00Z")),
    ).toBeUndefined();
    expect(
      historicalTokenEstimate("gemini-4-neon-high", solTokens, Date.parse("2026-11-21T00:00:00Z"))
        ?.pricing.model,
    ).toBe("gemini-4-neon");
  });

  it("prices current multi-provider flagship models including cache writes on Kimi K3 and Qwen 3.8", () => {
    const nov21 = Date.parse("2026-11-21T12:00:00Z");
    expect(
      historicalTokenEstimate(
        "kimi-k3.1-pro",
        { input: 100_000, output: 20_000, cacheRead: 50_000, cacheWrite: 30_000 },
        nov21,
      )?.amount,
    ).toBeCloseTo((100_000 * 2 + 20_000 * 10 + 50_000 * 0.2 + 30_000 * 2) / 1_000_000, 12);
    expect(
      historicalTokenEstimate(
        "qwen3.8-max",
        { input: 100_000, output: 20_000, cacheRead: 50_000, cacheWrite: 30_000 },
        nov21,
      )?.amount,
    ).toBeCloseTo((100_000 * 2 + 20_000 * 6 + 50_000 * 0.25 + 30_000 * 2.5) / 1_000_000, 12);
    expect(historicalTokenEstimate("gemini-4-argon", tokens, nov21)?.amount).toBeCloseTo(
      (1_000_000 * 2 + 100_000 * 10 + 500_000 * 0.1) / 1_000_000,
      12,
    );
    expect(historicalTokenEstimate("glm-5.3", tokens, nov21)?.amount).toBeCloseTo(
      (1_000_000 * 1.4 + 100_000 * 4.4 + 500_000 * 0.26) / 1_000_000,
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

  it("uses the OpenRouter catalog when no first-party snapshot names the model", () => {
    const nov21 = Date.parse("2026-11-21T12:00:00Z");
    const priced = historicalTokenEstimate(
      "opencode-go/qwen4-max",
      { input: 100_000, output: 20_000, cacheRead: 50_000, cacheWrite: 30_000 },
      nov21,
    );
    expect(priced?.pricing.model).toBe("qwen/qwen4-max");
    expect(priced?.pricing.source).toBe("https://openrouter.ai/qwen/qwen4-max");
    expect(priced?.amount).toBeCloseTo(
      (100_000 * 1.425 + 20_000 * 4.275 + 50_000 * 0.07125 + 30_000 * 1.78125) / 1_000_000,
      12,
    );
    expect(
      historicalTokenEstimate(
        "qwen4-max",
        { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
        Date.parse("2026-11-20T00:00:00Z"),
      ),
    ).toBeUndefined();
    expect(historicalTokenEstimate("gpt-6.2-sol", tokens, nov21)?.pricing.id).toBe(
      "gpt-6.2-sol:2026-11-21",
    );
    expect(historicalTokenEstimate("openai/gpt-99-unknown", tokens, nov21)).toBeUndefined();

    const haikuShort = historicalTokenEstimate(
      "claude-haiku-5.5",
      { input: 90_000, output: 10_000, cacheRead: 0, cacheWrite: 0 },
      nov21,
    );
    const haikuLong = historicalTokenEstimate(
      "claude-haiku-5.5",
      { input: 100_001, output: 10_000, cacheRead: 0, cacheWrite: 0 },
      nov21,
    );
    expect(haikuShort?.pricing.id).toBe("openrouter:anthropic/claude-haiku-5.5:2026-11-21");
    expect(haikuShort?.amount).toBeCloseTo((90_000 * 0.1 + 10_000 * 0.5) / 1_000_000, 12);
    expect(haikuLong?.pricing.id).toBe(
      "openrouter:anthropic/claude-haiku-5.5:2026-11-21:long-context",
    );
    expect(haikuLong?.amount).toBeCloseTo((100_001 * 0.5 + 10_000 * 2.5) / 1_000_000, 12);
  });
});

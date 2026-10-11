import { describe, expect, it } from "vitest";
import { i18n } from "@/renderer/i18n/i18n";
import { aggregateModelPriceTerms, formatModelPriceHint } from "../modelDescription";
import { formatDevinModelPricing } from "./modelPricing";
const regular = "$5 / 1M Input · $0.5 / 1M Cached input · $25 / 1M Output";
const fast = "$10 / 1M Input · $1 / 1M Cached input · $50 / 1M Output";
const fusionFree = "$10 / 1M Input · $0.25 / 1M Cached input · $50 / 1M Output · Sidekick: Free";
const fusionPaid =
  "$10 / 1M Input · $0.25 / 1M Cached input · $50 / 1M Output · $0.2 / 1M Sidekick input · $0.02 / 1M Sidekick cached input · $1.2 / 1M Sidekick output";
describe("Devin compact model pricing", () => {
  it("keeps input/output ordering and excludes cached-input prices from the inline pair", () => {
    expect(formatDevinModelPricing(regular)?.hint).toBe("$5 / $25 · 1M");
  });
  it("includes all variant prices in compact ranges", () => {
    expect(formatDevinModelPricing(`${fast}\n${regular}`)?.hint).toBe("$5–10 / $25–50 · 1M");
  });
  it("exposes parsed terms so shared aggregates can stay honest", () => {
    expect(formatDevinModelPricing(regular)?.price).toEqual({
      inputMin: 5,
      inputMax: 5,
      outputMin: 25,
      outputMax: 25,
      free: false,
    });
    expect(formatDevinModelPricing(`${fast}\n${regular}`)?.price).toEqual({
      inputMin: 5,
      inputMax: 10,
      outputMin: 25,
      outputMax: 50,
      free: false,
    });
  });
  it("renders a free tier as localized Free, not $0/$0, and folds it into paid ranges", () => {
    const free = formatDevinModelPricing("Free");
    expect(free?.hint).toBe("Free");
    expect(free?.hint).not.toMatch(/\$/);
    expect(free?.price).toMatchObject({ free: true, inputMin: 0, outputMin: 0 });
    expect(formatDevinModelPricing(`Free\n${regular}`)?.hint).toBe("$0–5 / $0–25 · 1M");
    expect(formatDevinModelPricing(`Free\n${regular}`)?.price).toMatchObject({ free: false });
  });
  it.each(["", "Low cost", `${regular}\nUnknown`, "$5 / 1M Output · $25 / 1M Input"])(
    "does not invent rates for incomplete or changed provider text: %s",
    (description) => {
      expect(formatDevinModelPricing(description)).toBeUndefined();
    },
  );
});

describe("Devin sidekick price components", () => {
  it("shows the exact sidekick price beside the lead rates without summing the streams", () => {
    const free = formatDevinModelPricing(fusionFree);
    expect(free?.hint).toBe("Lead: $10 / $50 · 1M · Sidekick: Free");
    // Distinct token streams stay distinct: lead rates are not inflated by the
    // sidekick rates, and the streams carry the existing localized labels.
    expect(free?.price).toMatchObject({
      inputMin: 10,
      inputMax: 10,
      outputMin: 50,
      outputMax: 50,
      free: false,
    });
    expect(i18n._(free?.price?.label!)).toBe("Lead");
    expect(free?.price?.components).toHaveLength(1);
    expect(free?.price?.components?.[0]?.terms).toEqual({
      inputMin: 0,
      inputMax: 0,
      outputMin: 0,
      outputMax: 0,
      free: true,
    });
    expect(i18n._(free?.price?.components?.[0]?.label!)).toBe("Sidekick");
  });
  it("parses paid sidekick rates into their own component terms", () => {
    const paid = formatDevinModelPricing(fusionPaid);
    expect(paid?.hint).toBe("Lead: $10 / $50 · 1M · Sidekick: $0.2 / $1.2");
    expect(paid?.price).toMatchObject({
      inputMin: 10,
      outputMin: 50,
      free: false,
    });
    expect(paid?.price?.components?.[0]?.terms).toEqual({
      inputMin: 0.2,
      inputMax: 0.2,
      outputMin: 1.2,
      outputMax: 1.2,
      free: false,
    });
  });
  it.each([
    [`${regular} · Sidekick: Cheap`, "changed sidekick value"],
    [`${regular} · Sidekick: $1 / 1M input`, "malformed sidekick rates"],
    [`${regular} · Bonus: Free`, "unknown appendix"],
    [`${regular} · Sidekick: Free · Extra`, "appendix after sidekick"],
    [`${regular}\n${fusionFree}`, "variants mixing priced and sidekick streams"],
    ["$10 / 1M Sidekick input · $1.2 / 1M Sidekick output", "sidekick rates without lead rates"],
  ])("returns nothing for %s (%s)", (description) => {
    expect(formatDevinModelPricing(description)).toBeUndefined();
  });
});

// Pinned native catalog costs for every model pair the devin GUI surface
// accepts (123 ids), captured verbatim from the actual catalog on 2026-10-08
// (checkpoint-aa native model catalog × gui-accepted-models contract fixture).
// Conformance against these real strings guards the parser against format drift.
const pinnedNativeCosts: Record<string, string> = {
  adaptive: "$0.5 / 1M Input \u00b7 $0.1 / 1M Cached input \u00b7 $2 / 1M Output",
  "swe-2-high": "",
  "swe-1-7-lightning-medium":
    "$2.5 / 1M Input \u00b7 $1 / 1M Cached input \u00b7 $12.5 / 1M Output",
  "claude-fable-5-1-medium": "$10 / 1M Input \u00b7 $0.25 / 1M Cached input \u00b7 $50 / 1M Output",
  "claude-opus-5-5-medium": "$4 / 1M Input \u00b7 $0.2 / 1M Cached input \u00b7 $20 / 1M Output",
  "gpt-6-astra-medium": "$10 / 1M Input \u00b7 $1 / 1M Cached input \u00b7 $50 / 1M Output",
  "gpt-6-sol-medium": "$2 / 1M Input \u00b7 $0.2 / 1M Cached input \u00b7 $10 / 1M Output",
  "gpt-6-luna-medium": "$0.1 / 1M Input \u00b7 $0.01 / 1M Cached input \u00b7 $0.5 / 1M Output",
  "kimi-k3-high": "$3 / 1M Input \u00b7 $0.3 / 1M Cached input \u00b7 $15 / 1M Output",
  "glm-5-2": "$1.4 / 1M Input \u00b7 $0.26 / 1M Cached input \u00b7 $4.4 / 1M Output",
  "glm-5-2-1m": "$1.4 / 1M Input \u00b7 $0.26 / 1M Cached input \u00b7 $4.4 / 1M Output",
  "glm-5-3-max": "$1.4 / 1M Input \u00b7 $0.26 / 1M Cached input \u00b7 $4.4 / 1M Output",
  "claude-sonnet-5-5-medium": "$2 / 1M Input \u00b7 $0.1 / 1M Cached input \u00b7 $10 / 1M Output",
  "gemini-3-8-flash-medium":
    "$0.75 / 1M Input \u00b7 $0.08 / 1M Cached input \u00b7 $3.75 / 1M Output",
  "claude-opus-4-7-medium": "$5 / 1M Input \u00b7 $0.5 / 1M Cached input \u00b7 $25 / 1M Output",
  "claude-opus-4-8-medium": "$5 / 1M Input \u00b7 $0.5 / 1M Cached input \u00b7 $25 / 1M Output",
  "claude-opus-5-medium": "$5 / 1M Input \u00b7 $0.5 / 1M Cached input \u00b7 $25 / 1M Output",
  "claude-5-fable-medium": "$10 / 1M Input \u00b7 $1 / 1M Cached input \u00b7 $50 / 1M Output",
  "claude-sonnet-5-medium": "$2 / 1M Input \u00b7 $0.2 / 1M Cached input \u00b7 $10 / 1M Output",
  "claude-haiku-5-5-medium":
    "$0.1 / 1M Input \u00b7 $0.01 / 1M Cached input \u00b7 $0.5 / 1M Output",
  "gemini-3-5-flash-medium": "$1.5 / 1M Input \u00b7 $0.15 / 1M Cached input \u00b7 $9 / 1M Output",
  "gemini-3-6-flash-medium":
    "$1.5 / 1M Input \u00b7 $0.15 / 1M Cached input \u00b7 $7.5 / 1M Output",
  "gemini-3-7-flash-medium":
    "$0.75 / 1M Input \u00b7 $0.08 / 1M Cached input \u00b7 $3.75 / 1M Output",
  "gpt-5-6-sol-medium": "$4 / 1M Input \u00b7 $0.4 / 1M Cached input \u00b7 $20 / 1M Output",
  "gpt-5-6-terra-medium": "$2 / 1M Input \u00b7 $0.2 / 1M Cached input \u00b7 $12 / 1M Output",
  "gpt-5-6-luna-medium": "$0.2 / 1M Input \u00b7 $0.02 / 1M Cached input \u00b7 $1.2 / 1M Output",
  "gpt-6-1-sol-medium": "$2 / 1M Input \u00b7 $0.1 / 1M Cached input \u00b7 $10 / 1M Output",
  "grok-4-5-medium": "$2 / 1M Input \u00b7 $0.3 / 1M Cached input \u00b7 $6 / 1M Output",
  "grok-4-6-medium": "$2 / 1M Input \u00b7 $0.3 / 1M Cached input \u00b7 $6 / 1M Output",
  "grok-4-7-medium": "$2 / 1M Input \u00b7 $0.5 / 1M Cached input \u00b7 $6 / 1M Output",
  "inkling-medium": "$1.4 / 1M Input \u00b7 $0.26 / 1M Cached input \u00b7 $4.4 / 1M Output",
  "glm-5-3-flash-max": "$0.15 / 1M Input \u00b7 $0.03 / 1M Cached input \u00b7 $0.5 / 1M Output",
  "deepseek-v4-flash-high":
    "$0.14 / 1M Input \u00b7 $0.03 / 1M Cached input \u00b7 $0.28 / 1M Output",
  "deepseek-v4-1-flash-high":
    "$0.22 / 1M Input \u00b7 $0.01 / 1M Cached input \u00b7 $0.66 / 1M Output",
  "swe-1-7-medium": "$0.5 / 1M Input \u00b7 $0.2 / 1M Cached input \u00b7 $2.5 / 1M Output",
  "fusion-claude-fable-5-1-medium-sidekick-swe-2-medium":
    "$10 / 1M Input \u00b7 $0.25 / 1M Cached input \u00b7 $50 / 1M Output \u00b7 Sidekick: Free",
  "fusion-gpt-5-6-sol-high-sidekick-swe-2-medium":
    "$4 / 1M Input \u00b7 $0.4 / 1M Cached input \u00b7 $20 / 1M Output \u00b7 Sidekick: Free",
  "fusion-claude-opus-5-high-sidekick-swe-2-medium":
    "$5 / 1M Input \u00b7 $0.5 / 1M Cached input \u00b7 $25 / 1M Output \u00b7 Sidekick: Free",
  "fusion-claude-opus-5-5-high-sidekick-swe-2-medium":
    "$4 / 1M Input \u00b7 $0.2 / 1M Cached input \u00b7 $20 / 1M Output \u00b7 Sidekick: Free",
  "fusion-claude-sonnet-5-5-high-sidekick-swe-2-medium":
    "$2 / 1M Input \u00b7 $0.1 / 1M Cached input \u00b7 $10 / 1M Output \u00b7 Sidekick: Free",
  "fusion-gpt-6-astra-high-sidekick-swe-2-medium":
    "$10 / 1M Input \u00b7 $1 / 1M Cached input \u00b7 $50 / 1M Output \u00b7 Sidekick: Free",
  "fusion-gpt-6-sol-high-sidekick-swe-2-medium":
    "$2 / 1M Input \u00b7 $0.2 / 1M Cached input \u00b7 $10 / 1M Output \u00b7 Sidekick: Free",
  "fusion-gpt-6-1-sol-high-sidekick-swe-2-medium":
    "$2 / 1M Input \u00b7 $0.1 / 1M Cached input \u00b7 $10 / 1M Output \u00b7 Sidekick: Free",
  "fusion-claude-fable-5-1-medium-sidekick-gpt-5-6-luna-high":
    "$10 / 1M Input \u00b7 $0.25 / 1M Cached input \u00b7 $50 / 1M Output \u00b7 $0.2 / 1M Sidekick input \u00b7 $0.02 / 1M Sidekick cached input \u00b7 $1.2 / 1M Sidekick output",
  "fusion-gpt-5-6-sol-high-sidekick-gpt-5-6-luna-high":
    "$4 / 1M Input \u00b7 $0.4 / 1M Cached input \u00b7 $20 / 1M Output \u00b7 $0.2 / 1M Sidekick input \u00b7 $0.02 / 1M Sidekick cached input \u00b7 $1.2 / 1M Sidekick output",
  "fusion-claude-opus-5-high-sidekick-gpt-5-6-luna-high":
    "$5 / 1M Input \u00b7 $0.5 / 1M Cached input \u00b7 $25 / 1M Output \u00b7 $0.2 / 1M Sidekick input \u00b7 $0.02 / 1M Sidekick cached input \u00b7 $1.2 / 1M Sidekick output",
  "fusion-claude-opus-5-5-high-sidekick-gpt-5-6-luna-high":
    "$4 / 1M Input \u00b7 $0.2 / 1M Cached input \u00b7 $20 / 1M Output \u00b7 $0.2 / 1M Sidekick input \u00b7 $0.02 / 1M Sidekick cached input \u00b7 $1.2 / 1M Sidekick output",
  "fusion-claude-sonnet-5-5-high-sidekick-gpt-5-6-luna-high":
    "$2 / 1M Input \u00b7 $0.1 / 1M Cached input \u00b7 $10 / 1M Output \u00b7 $0.2 / 1M Sidekick input \u00b7 $0.02 / 1M Sidekick cached input \u00b7 $1.2 / 1M Sidekick output",
  "fusion-gpt-6-astra-high-sidekick-gpt-5-6-luna-high":
    "$10 / 1M Input \u00b7 $1 / 1M Cached input \u00b7 $50 / 1M Output \u00b7 $0.2 / 1M Sidekick input \u00b7 $0.02 / 1M Sidekick cached input \u00b7 $1.2 / 1M Sidekick output",
  "fusion-gpt-6-sol-high-sidekick-gpt-5-6-luna-high":
    "$2 / 1M Input \u00b7 $0.2 / 1M Cached input \u00b7 $10 / 1M Output \u00b7 $0.2 / 1M Sidekick input \u00b7 $0.02 / 1M Sidekick cached input \u00b7 $1.2 / 1M Sidekick output",
  "fusion-gpt-6-1-sol-high-sidekick-gpt-5-6-luna-high":
    "$2 / 1M Input \u00b7 $0.1 / 1M Cached input \u00b7 $10 / 1M Output \u00b7 $0.2 / 1M Sidekick input \u00b7 $0.02 / 1M Sidekick cached input \u00b7 $1.2 / 1M Sidekick output",
  "fusion-claude-fable-5-1-medium-sidekick-gpt-6-luna-high":
    "$10 / 1M Input \u00b7 $0.25 / 1M Cached input \u00b7 $50 / 1M Output \u00b7 $0.1 / 1M Sidekick input \u00b7 $0.01 / 1M Sidekick cached input \u00b7 $0.5 / 1M Sidekick output",
  "fusion-gpt-5-6-sol-high-sidekick-gpt-6-luna-high":
    "$4 / 1M Input \u00b7 $0.4 / 1M Cached input \u00b7 $20 / 1M Output \u00b7 $0.1 / 1M Sidekick input \u00b7 $0.01 / 1M Sidekick cached input \u00b7 $0.5 / 1M Sidekick output",
  "fusion-claude-opus-5-high-sidekick-gpt-6-luna-high":
    "$5 / 1M Input \u00b7 $0.5 / 1M Cached input \u00b7 $25 / 1M Output \u00b7 $0.1 / 1M Sidekick input \u00b7 $0.01 / 1M Sidekick cached input \u00b7 $0.5 / 1M Sidekick output",
  "fusion-claude-opus-5-5-high-sidekick-gpt-6-luna-high":
    "$4 / 1M Input \u00b7 $0.2 / 1M Cached input \u00b7 $20 / 1M Output \u00b7 $0.1 / 1M Sidekick input \u00b7 $0.01 / 1M Sidekick cached input \u00b7 $0.5 / 1M Sidekick output",
  "fusion-claude-sonnet-5-5-high-sidekick-gpt-6-luna-high":
    "$2 / 1M Input \u00b7 $0.1 / 1M Cached input \u00b7 $10 / 1M Output \u00b7 $0.1 / 1M Sidekick input \u00b7 $0.01 / 1M Sidekick cached input \u00b7 $0.5 / 1M Sidekick output",
  "fusion-gpt-6-astra-high-sidekick-gpt-6-luna-high":
    "$10 / 1M Input \u00b7 $1 / 1M Cached input \u00b7 $50 / 1M Output \u00b7 $0.1 / 1M Sidekick input \u00b7 $0.01 / 1M Sidekick cached input \u00b7 $0.5 / 1M Sidekick output",
  "fusion-gpt-6-sol-high-sidekick-gpt-6-luna-high":
    "$2 / 1M Input \u00b7 $0.2 / 1M Cached input \u00b7 $10 / 1M Output \u00b7 $0.1 / 1M Sidekick input \u00b7 $0.01 / 1M Sidekick cached input \u00b7 $0.5 / 1M Sidekick output",
  "fusion-gpt-6-1-sol-high-sidekick-gpt-6-luna-high":
    "$2 / 1M Input \u00b7 $0.1 / 1M Cached input \u00b7 $10 / 1M Output \u00b7 $0.1 / 1M Sidekick input \u00b7 $0.01 / 1M Sidekick cached input \u00b7 $0.5 / 1M Sidekick output",
  "fusion-claude-fable-5-1-medium-sidekick-glm-5-2":
    "$10 / 1M Input \u00b7 $0.25 / 1M Cached input \u00b7 $50 / 1M Output \u00b7 $1.4 / 1M Sidekick input \u00b7 $0.26 / 1M Sidekick cached input \u00b7 $4.4 / 1M Sidekick output",
  "fusion-gpt-5-6-sol-high-sidekick-glm-5-2":
    "$4 / 1M Input \u00b7 $0.4 / 1M Cached input \u00b7 $20 / 1M Output \u00b7 $1.4 / 1M Sidekick input \u00b7 $0.26 / 1M Sidekick cached input \u00b7 $4.4 / 1M Sidekick output",
  "fusion-claude-opus-5-high-sidekick-glm-5-2":
    "$5 / 1M Input \u00b7 $0.5 / 1M Cached input \u00b7 $25 / 1M Output \u00b7 $1.4 / 1M Sidekick input \u00b7 $0.26 / 1M Sidekick cached input \u00b7 $4.4 / 1M Sidekick output",
  "fusion-claude-opus-5-5-high-sidekick-glm-5-2":
    "$4 / 1M Input \u00b7 $0.2 / 1M Cached input \u00b7 $20 / 1M Output \u00b7 $1.4 / 1M Sidekick input \u00b7 $0.26 / 1M Sidekick cached input \u00b7 $4.4 / 1M Sidekick output",
  "fusion-claude-sonnet-5-5-high-sidekick-glm-5-2":
    "$2 / 1M Input \u00b7 $0.1 / 1M Cached input \u00b7 $10 / 1M Output \u00b7 $1.4 / 1M Sidekick input \u00b7 $0.26 / 1M Sidekick cached input \u00b7 $4.4 / 1M Sidekick output",
  "fusion-gpt-6-astra-high-sidekick-glm-5-2":
    "$10 / 1M Input \u00b7 $1 / 1M Cached input \u00b7 $50 / 1M Output \u00b7 $1.4 / 1M Sidekick input \u00b7 $0.26 / 1M Sidekick cached input \u00b7 $4.4 / 1M Sidekick output",
  "fusion-gpt-6-sol-high-sidekick-glm-5-2":
    "$2 / 1M Input \u00b7 $0.2 / 1M Cached input \u00b7 $10 / 1M Output \u00b7 $1.4 / 1M Sidekick input \u00b7 $0.26 / 1M Sidekick cached input \u00b7 $4.4 / 1M Sidekick output",
  "fusion-gpt-6-1-sol-high-sidekick-glm-5-2":
    "$2 / 1M Input \u00b7 $0.1 / 1M Cached input \u00b7 $10 / 1M Output \u00b7 $1.4 / 1M Sidekick input \u00b7 $0.26 / 1M Sidekick cached input \u00b7 $4.4 / 1M Sidekick output",
  "fusion-claude-fable-5-1-medium-sidekick-gpt-5-6-sol-high":
    "$10 / 1M Input \u00b7 $0.25 / 1M Cached input \u00b7 $50 / 1M Output \u00b7 $4 / 1M Sidekick input \u00b7 $0.4 / 1M Sidekick cached input \u00b7 $20 / 1M Sidekick output",
  "fusion-claude-opus-5-high-sidekick-gpt-5-6-sol-high":
    "$5 / 1M Input \u00b7 $0.5 / 1M Cached input \u00b7 $25 / 1M Output \u00b7 $4 / 1M Sidekick input \u00b7 $0.4 / 1M Sidekick cached input \u00b7 $20 / 1M Sidekick output",
  "fusion-claude-opus-5-5-high-sidekick-gpt-5-6-sol-high":
    "$4 / 1M Input \u00b7 $0.2 / 1M Cached input \u00b7 $20 / 1M Output \u00b7 $4 / 1M Sidekick input \u00b7 $0.4 / 1M Sidekick cached input \u00b7 $20 / 1M Sidekick output",
  "fusion-claude-sonnet-5-5-high-sidekick-gpt-5-6-sol-high":
    "$2 / 1M Input \u00b7 $0.1 / 1M Cached input \u00b7 $10 / 1M Output \u00b7 $4 / 1M Sidekick input \u00b7 $0.4 / 1M Sidekick cached input \u00b7 $20 / 1M Sidekick output",
  "fusion-gpt-6-astra-high-sidekick-gpt-5-6-sol-high":
    "$10 / 1M Input \u00b7 $1 / 1M Cached input \u00b7 $50 / 1M Output \u00b7 $4 / 1M Sidekick input \u00b7 $0.4 / 1M Sidekick cached input \u00b7 $20 / 1M Sidekick output",
  "fusion-gpt-6-sol-high-sidekick-gpt-5-6-sol-high":
    "$2 / 1M Input \u00b7 $0.2 / 1M Cached input \u00b7 $10 / 1M Output \u00b7 $4 / 1M Sidekick input \u00b7 $0.4 / 1M Sidekick cached input \u00b7 $20 / 1M Sidekick output",
  "fusion-gpt-6-1-sol-high-sidekick-gpt-5-6-sol-high":
    "$2 / 1M Input \u00b7 $0.1 / 1M Cached input \u00b7 $10 / 1M Output \u00b7 $4 / 1M Sidekick input \u00b7 $0.4 / 1M Sidekick cached input \u00b7 $20 / 1M Sidekick output",
  "fusion-claude-fable-5-1-medium-sidekick-swe-2-high":
    "$10 / 1M Input \u00b7 $0.25 / 1M Cached input \u00b7 $50 / 1M Output \u00b7 Sidekick: Free",
  "fusion-gpt-5-6-sol-high-sidekick-swe-2-high":
    "$4 / 1M Input \u00b7 $0.4 / 1M Cached input \u00b7 $20 / 1M Output \u00b7 Sidekick: Free",
  "fusion-claude-opus-5-high-sidekick-swe-2-high":
    "$5 / 1M Input \u00b7 $0.5 / 1M Cached input \u00b7 $25 / 1M Output \u00b7 Sidekick: Free",
  "fusion-claude-opus-5-5-high-sidekick-swe-2-high":
    "$4 / 1M Input \u00b7 $0.2 / 1M Cached input \u00b7 $20 / 1M Output \u00b7 Sidekick: Free",
  "fusion-claude-sonnet-5-5-high-sidekick-swe-2-high":
    "$2 / 1M Input \u00b7 $0.1 / 1M Cached input \u00b7 $10 / 1M Output \u00b7 Sidekick: Free",
  "fusion-gpt-6-astra-high-sidekick-swe-2-high":
    "$10 / 1M Input \u00b7 $1 / 1M Cached input \u00b7 $50 / 1M Output \u00b7 Sidekick: Free",
  "fusion-gpt-6-sol-high-sidekick-swe-2-high":
    "$2 / 1M Input \u00b7 $0.2 / 1M Cached input \u00b7 $10 / 1M Output \u00b7 Sidekick: Free",
  "fusion-gpt-6-1-sol-high-sidekick-swe-2-high":
    "$2 / 1M Input \u00b7 $0.1 / 1M Cached input \u00b7 $10 / 1M Output \u00b7 Sidekick: Free",
  "fusion-claude-fable-5-1-medium-sidekick-claude-sonnet-5-5-medium":
    "$10 / 1M Input \u00b7 $0.25 / 1M Cached input \u00b7 $50 / 1M Output \u00b7 $2 / 1M Sidekick input \u00b7 $0.1 / 1M Sidekick cached input \u00b7 $10 / 1M Sidekick output",
  "fusion-gpt-5-6-sol-high-sidekick-claude-sonnet-5-5-medium":
    "$4 / 1M Input \u00b7 $0.4 / 1M Cached input \u00b7 $20 / 1M Output \u00b7 $2 / 1M Sidekick input \u00b7 $0.1 / 1M Sidekick cached input \u00b7 $10 / 1M Sidekick output",
  "fusion-claude-opus-5-high-sidekick-claude-sonnet-5-5-medium":
    "$5 / 1M Input \u00b7 $0.5 / 1M Cached input \u00b7 $25 / 1M Output \u00b7 $2 / 1M Sidekick input \u00b7 $0.1 / 1M Sidekick cached input \u00b7 $10 / 1M Sidekick output",
  "fusion-claude-opus-5-5-high-sidekick-claude-sonnet-5-5-medium":
    "$4 / 1M Input \u00b7 $0.2 / 1M Cached input \u00b7 $20 / 1M Output \u00b7 $2 / 1M Sidekick input \u00b7 $0.1 / 1M Sidekick cached input \u00b7 $10 / 1M Sidekick output",
  "fusion-gpt-6-astra-high-sidekick-claude-sonnet-5-5-medium":
    "$10 / 1M Input \u00b7 $1 / 1M Cached input \u00b7 $50 / 1M Output \u00b7 $2 / 1M Sidekick input \u00b7 $0.1 / 1M Sidekick cached input \u00b7 $10 / 1M Sidekick output",
  "fusion-gpt-6-sol-high-sidekick-claude-sonnet-5-5-medium":
    "$2 / 1M Input \u00b7 $0.2 / 1M Cached input \u00b7 $10 / 1M Output \u00b7 $2 / 1M Sidekick input \u00b7 $0.1 / 1M Sidekick cached input \u00b7 $10 / 1M Sidekick output",
  "fusion-gpt-6-1-sol-high-sidekick-claude-sonnet-5-5-medium":
    "$2 / 1M Input \u00b7 $0.1 / 1M Cached input \u00b7 $10 / 1M Output \u00b7 $2 / 1M Sidekick input \u00b7 $0.1 / 1M Sidekick cached input \u00b7 $10 / 1M Sidekick output",
  "fusion-claude-fable-5-1-medium-sidekick-claude-haiku-5-5-medium":
    "$10 / 1M Input \u00b7 $0.25 / 1M Cached input \u00b7 $50 / 1M Output \u00b7 $0.1 / 1M Sidekick input \u00b7 $0.01 / 1M Sidekick cached input \u00b7 $0.5 / 1M Sidekick output",
  "fusion-gpt-5-6-sol-high-sidekick-claude-haiku-5-5-medium":
    "$4 / 1M Input \u00b7 $0.4 / 1M Cached input \u00b7 $20 / 1M Output \u00b7 $0.1 / 1M Sidekick input \u00b7 $0.01 / 1M Sidekick cached input \u00b7 $0.5 / 1M Sidekick output",
  "fusion-claude-opus-5-high-sidekick-claude-haiku-5-5-medium":
    "$5 / 1M Input \u00b7 $0.5 / 1M Cached input \u00b7 $25 / 1M Output \u00b7 $0.1 / 1M Sidekick input \u00b7 $0.01 / 1M Sidekick cached input \u00b7 $0.5 / 1M Sidekick output",
  "fusion-claude-opus-5-5-high-sidekick-claude-haiku-5-5-medium":
    "$4 / 1M Input \u00b7 $0.2 / 1M Cached input \u00b7 $20 / 1M Output \u00b7 $0.1 / 1M Sidekick input \u00b7 $0.01 / 1M Sidekick cached input \u00b7 $0.5 / 1M Sidekick output",
  "fusion-claude-sonnet-5-5-high-sidekick-claude-haiku-5-5-medium":
    "$2 / 1M Input \u00b7 $0.1 / 1M Cached input \u00b7 $10 / 1M Output \u00b7 $0.1 / 1M Sidekick input \u00b7 $0.01 / 1M Sidekick cached input \u00b7 $0.5 / 1M Sidekick output",
  "fusion-gpt-6-astra-high-sidekick-claude-haiku-5-5-medium":
    "$10 / 1M Input \u00b7 $1 / 1M Cached input \u00b7 $50 / 1M Output \u00b7 $0.1 / 1M Sidekick input \u00b7 $0.01 / 1M Sidekick cached input \u00b7 $0.5 / 1M Sidekick output",
  "fusion-gpt-6-sol-high-sidekick-claude-haiku-5-5-medium":
    "$2 / 1M Input \u00b7 $0.2 / 1M Cached input \u00b7 $10 / 1M Output \u00b7 $0.1 / 1M Sidekick input \u00b7 $0.01 / 1M Sidekick cached input \u00b7 $0.5 / 1M Sidekick output",
  "fusion-gpt-6-1-sol-high-sidekick-claude-haiku-5-5-medium":
    "$2 / 1M Input \u00b7 $0.1 / 1M Cached input \u00b7 $10 / 1M Output \u00b7 $0.1 / 1M Sidekick input \u00b7 $0.01 / 1M Sidekick cached input \u00b7 $0.5 / 1M Sidekick output",
  "claude-opus-4-6": "$5 / 1M Input \u00b7 $0.5 / 1M Cached input \u00b7 $25 / 1M Output",
  "claude-opus-4-6-thinking": "$5 / 1M Input \u00b7 $0.5 / 1M Cached input \u00b7 $25 / 1M Output",
  "claude-opus-4-6-1m": "$5 / 1M Input \u00b7 $0.5 / 1M Cached input \u00b7 $25 / 1M Output",
  "claude-opus-4-6-thinking-1m":
    "$5 / 1M Input \u00b7 $0.5 / 1M Cached input \u00b7 $25 / 1M Output",
  "gpt-5-4-none": "$2.5 / 1M Input \u00b7 $0.25 / 1M Cached input \u00b7 $15 / 1M Output",
  "gpt-5-5-low": "$5 / 1M Input \u00b7 $0.5 / 1M Cached input \u00b7 $30 / 1M Output",
  "gpt-5-4-mini-low": "$0.75 / 1M Input \u00b7 $0.08 / 1M Cached input \u00b7 $4.5 / 1M Output",
  "claude-sonnet-4-6": "$3 / 1M Input \u00b7 $0.3 / 1M Cached input \u00b7 $15 / 1M Output",
  "claude-sonnet-4-6-thinking":
    "$3 / 1M Input \u00b7 $0.3 / 1M Cached input \u00b7 $15 / 1M Output",
  "claude-sonnet-4-6-1m": "$3 / 1M Input \u00b7 $0.3 / 1M Cached input \u00b7 $15 / 1M Output",
  "claude-sonnet-4-6-thinking-1m":
    "$3 / 1M Input \u00b7 $0.3 / 1M Cached input \u00b7 $15 / 1M Output",
  MODEL_GPT_5_2_LOW: "$1.75 / 1M Input \u00b7 $0.17 / 1M Cached input \u00b7 $14 / 1M Output",
  MODEL_CLAUDE_4_5_OPUS: "$5 / 1M Input \u00b7 $0.5 / 1M Cached input \u00b7 $25 / 1M Output",
  MODEL_CLAUDE_4_5_OPUS_THINKING:
    "$5 / 1M Input \u00b7 $0.5 / 1M Cached input \u00b7 $25 / 1M Output",
  MODEL_PRIVATE_11: "$1 / 1M Input \u00b7 $0.1 / 1M Cached input \u00b7 $5 / 1M Output",
  MODEL_CHAT_GPT_4_1_2025_04_14:
    "$2 / 1M Input \u00b7 $0.5 / 1M Cached input \u00b7 $8 / 1M Output",
  MODEL_PRIVATE_12: "$1.25 / 1M Input \u00b7 $0.12 / 1M Cached input \u00b7 $10 / 1M Output",
  "gpt-5-3-codex-medium": "$1.75 / 1M Input \u00b7 $0.17 / 1M Cached input \u00b7 $14 / 1M Output",
  "kimi-k2-6": "$0.95 / 1M Input \u00b7 $0.16 / 1M Cached input \u00b7 $4 / 1M Output",
  "kimi-k2-7": "$0.95 / 1M Input \u00b7 $0.19 / 1M Cached input \u00b7 $4 / 1M Output",
  "nemotron-3-ultra-high": "$0.6 / 1M Input \u00b7 $0.12 / 1M Cached input \u00b7 $2.4 / 1M Output",
  "swe-1-6": "$0.5 / 1M Input \u00b7 $0.2 / 1M Cached input \u00b7 $2.5 / 1M Output",
  "swe-1-6-fast": "$0.5 / 1M Input \u00b7 $0.2 / 1M Cached input \u00b7 $2.5 / 1M Output",
  "gemini-3-1-pro-low": "$2 / 1M Input \u00b7 $0.2 / 1M Cached input \u00b7 $12 / 1M Output",
  MODEL_GOOGLE_GEMINI_3_0_FLASH_MINIMAL:
    "$0.5 / 1M Input \u00b7 $0.05 / 1M Cached input \u00b7 $3 / 1M Output",
  "deepseek-v4-pro-high":
    "$1.32 / 1M Input \u00b7 $0.04 / 1M Cached input \u00b7 $3.96 / 1M Output",
};

describe("Devin pricing against the pinned native catalog", () => {
  const parsePinned = () =>
    Object.entries(pinnedNativeCosts).map(([id, cost]) => ({
      id,
      parsed: formatDevinModelPricing(cost),
    }));

  it("parses every accepted pair's real cost text, leaving only empty inventories unparsed", () => {
    const parsed = parsePinned();
    expect(parsed).toHaveLength(123);
    const unparsed = parsed.filter((row) => !row.parsed).map((row) => row.id);
    // The two sidekick-only rows publish no cost inventory at all.
    expect(unparsed).toEqual(["swe-2-high"]);
  });

  it("parses every accepted Fusion pair into a labeled lead price plus a Sidekick component", () => {
    const fusion = parsePinned().filter(
      (row) => row.id.startsWith("fusion-") && row.parsed !== undefined,
    );
    expect(fusion).toHaveLength(62);
    for (const row of fusion) {
      expect(row.parsed?.hint).toMatch(/^Lead: \$[\d.]+ \/ \$[\d.]+ · 1M · Sidekick: /);
      expect(row.parsed?.price?.components).toHaveLength(1);
    }
    const freeSidekicks = fusion.filter(
      (row) => row.parsed?.price?.components?.[0]?.terms.free === true,
    );
    expect(freeSidekicks).toHaveLength(16);
    expect(freeSidekicks.every((row) => row.parsed?.hint?.endsWith("Sidekick: Free"))).toBe(true);
    expect(fusion.length - freeSidekicks.length).toBe(46);
  });

  it("parses accepted non-Fusion pairs as plain input/output prices", () => {
    const plain = parsePinned().filter(
      (row) => !row.id.startsWith("fusion-") && row.parsed !== undefined,
    );
    expect(plain).toHaveLength(60);
    for (const row of plain) {
      expect(row.parsed?.hint).toMatch(/^\$[\d.]+ \/ \$[\d.]+ · 1M$/);
      expect(row.parsed?.price?.components).toBeUndefined();
    }
  });

  it("aggregates all accepted Fusion members into one honest component range", () => {
    const hints = Object.entries(pinnedNativeCosts)
      .filter(([id]) => id.startsWith("fusion-"))
      .map(([, cost]) => formatDevinModelPricing(cost));
    // Every member parsed, so the collapsed family row can show the union of
    // both streams through the shared aggregation seam.
    const terms = aggregateModelPriceTerms(hints);
    expect(terms).toMatchObject({
      inputMin: 2,
      inputMax: 10,
      outputMin: 10,
      outputMax: 50,
      free: false,
    });
    expect(terms?.components?.[0]?.terms).toMatchObject({
      inputMin: 0,
      inputMax: 4,
      outputMin: 0,
      outputMax: 20,
      free: false,
    });
    expect(formatModelPriceHint(terms!)).toBe("Lead: $2–10 / $10–50 · 1M · Sidekick: $0–4 / $0–20");
  });
});

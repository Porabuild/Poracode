import { describe, expect, it } from "vitest";
import { formatDevinModelPricing } from "./modelPricing";
const regular = "$5 / 1M Input · $0.5 / 1M Cached input · $25 / 1M Output";
const fast = "$10 / 1M Input · $1 / 1M Cached input · $50 / 1M Output";
describe("Devin compact model pricing", () => {
  it("keeps input/output ordering and excludes cached-input prices from the inline pair", () => {
    expect(formatDevinModelPricing(regular)?.hint).toBe("$5 / $25 · 1M");
  });
  it("includes all variant prices in compact ranges", () => {
    expect(formatDevinModelPricing(`${fast}\n${regular}`)?.hint).toBe("$5–10 / $25–50 · 1M");
  });
  it("includes free variants rather than presenting a paid-only range", () => {
    expect(formatDevinModelPricing(`Free\n${regular}`)?.hint).toBe("$0–5 / $0–25 · 1M");
    expect(formatDevinModelPricing("Free")?.hint).toBe("$0 / $0 · 1M");
  });
  it.each(["", "Low cost", `${regular}\nUnknown`, "$5 / 1M Output · $25 / 1M Input"])(
    "does not invent rates for incomplete or changed provider text: %s",
    (description) => {
      expect(formatDevinModelPricing(description)).toBeUndefined();
    },
  );
});

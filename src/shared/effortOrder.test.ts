import { describe, expect, it } from "vitest";
import { sortEffortsByCanonicalOrder } from "./effortOrder";

describe("sortEffortsByCanonicalOrder", () => {
  it("orders a scrambled ladder weakest to strongest", () => {
    expect(sortEffortsByCanonicalOrder(["xhigh", "low", "medium", "none"])).toEqual([
      "none",
      "low",
      "medium",
      "xhigh",
    ]);
  });

  it("keeps an already canonical ladder untouched", () => {
    const efforts = ["none", "minimal", "low", "medium", "high", "xhigh", "max"];
    expect(sortEffortsByCanonicalOrder(efforts)).toEqual(efforts);
  });

  it("ranks extra-high spellings with xhigh", () => {
    expect(sortEffortsByCanonicalOrder(["max", "extra-high", "low"])).toEqual([
      "low",
      "extra-high",
      "max",
    ]);
  });

  it("appends unknown levels after the ladder in discovery order", () => {
    expect(sortEffortsByCanonicalOrder(["turbo", "high", "on", "low"])).toEqual([
      "low",
      "high",
      "turbo",
      "on",
    ]);
  });

  it("does not mutate the input", () => {
    const efforts = ["high", "low"];
    sortEffortsByCanonicalOrder(efforts);
    expect(efforts).toEqual(["high", "low"]);
  });

  it("handles empty and single-element lists", () => {
    expect(sortEffortsByCanonicalOrder([])).toEqual([]);
    expect(sortEffortsByCanonicalOrder(["high"])).toEqual(["high"]);
  });

  it("preserves discovery order when every level is unknown", () => {
    expect(sortEffortsByCanonicalOrder(["turbo", "ludicrous", "on"])).toEqual([
      "turbo",
      "ludicrous",
      "on",
    ]);
  });

  it("normalizes case and surrounding whitespace before ranking", () => {
    expect(sortEffortsByCanonicalOrder([" HIGH ", "low", "Extra-High"])).toEqual([
      "low",
      " HIGH ",
      "Extra-High",
    ]);
  });
});

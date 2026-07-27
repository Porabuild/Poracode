import { describe, expect, it } from "vitest";
import { fitUsageRail, railSlots } from "./usageRailFit";

describe("railSlots", () => {
  // Literal widths so the expectations pin observable behaviour rather than
  // restating the formula: circles are 28px, laid out with a 10px row gap.
  it.each([
    [0, 0],
    [27, 0],
    [28, 1],
    [65, 1],
    [66, 2],
    [180, 5],
  ])("fits %i px into %i slots", (width, expected) => {
    expect(railSlots(width)).toBe(expected);
  });
});

describe("fitUsageRail", () => {
  it.each([
    // [slots, total, shown] — one slot pays for the "+N" chip when short.
    [6, 6, 6],
    [5, 6, 4],
    [1, 3, 0],
    [0, 5, 5], // unmeasured row: draw everything
    [4, 0, 0],
  ])("draws %i slots of %i providers as %i circles", (slots, total, shown) => {
    expect(fitUsageRail(slots, total)).toBe(shown);
  });
});

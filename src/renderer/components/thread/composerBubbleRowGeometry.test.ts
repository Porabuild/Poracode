import { describe, expect, it } from "vitest";
import { shouldDisplaceCenteredControl } from "./composerBubbleRowGeometry";

describe("shouldDisplaceCenteredControl", () => {
  const row = { rowLeft: 0, rowWidth: 400, controlWidth: 28 };

  it("keeps the control centered when no bubbles are mounted", () => {
    expect(shouldDisplaceCenteredControl({ ...row, bubblesLeft: null })).toBe(false);
  });

  it("keeps the control centered while bubbles stay clear of it", () => {
    // Control spans 186..214; a bubble starting at 221 leaves the 6px gap.
    expect(shouldDisplaceCenteredControl({ ...row, bubblesLeft: 221 })).toBe(false);
  });

  it("moves the control to its own row once bubbles reach its edge", () => {
    expect(shouldDisplaceCenteredControl({ ...row, bubblesLeft: 219 })).toBe(true);
    expect(shouldDisplaceCenteredControl({ ...row, bubblesLeft: 10 })).toBe(true);
  });

  it("uses the row's own left offset", () => {
    expect(
      shouldDisplaceCenteredControl({
        rowLeft: 100,
        rowWidth: 400,
        controlWidth: 28,
        bubblesLeft: 321,
      }),
    ).toBe(false);
    expect(
      shouldDisplaceCenteredControl({
        rowLeft: 100,
        rowWidth: 400,
        controlWidth: 28,
        bubblesLeft: 319,
      }),
    ).toBe(true);
  });
});

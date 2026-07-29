import { describe, expect, it } from "vitest";
import {
  chatInlineImageClass,
  chatInlineImageMaxHeight,
  reserveInlineImageSlot,
} from "./chatImageClass";

describe("reserveInlineImageSlot", () => {
  it("derives the box the loaded image will settle on", () => {
    expect(reserveInlineImageSlot(369, 800)).toEqual({
      width: `min(369px, calc(${chatInlineImageMaxHeight} * 369 / 800))`,
      aspectRatio: "369 / 800",
      height: "auto",
    });
  });

  it("uses no percentage term, which would collapse the box to 0x0", () => {
    // The card is shrink-to-fit, so a `100%` width has no definite containing
    // block and the element measures 0x0 until the bytes land. Measured in Chrome.
    expect(reserveInlineImageSlot(369, 800)?.width).not.toContain("100%");
  });

  it("reserves nothing without usable dimensions", () => {
    expect(reserveInlineImageSlot(undefined, undefined)).toBeUndefined();
    expect(reserveInlineImageSlot(369, undefined)).toBeUndefined();
    expect(reserveInlineImageSlot(0, 800)).toBeUndefined();
    expect(reserveInlineImageSlot(-1, 800)).toBeUndefined();
  });

  it("stays in step with the class that caps the height", () => {
    // If these drift, the reserved box and the painted box disagree and the
    // transcript reflows on load — the exact bug this guards.
    expect(chatInlineImageClass).toContain(`max-h-[${chatInlineImageMaxHeight}]`);
  });
});

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

  it("keeps the height cap as a statically discoverable Tailwind utility", () => {
    // If these drift, the reserved box and the painted box disagree and the
    // transcript reflows on load. Keep the whole class literal static in source
    // as well: Tailwind does not discover an arbitrary utility assembled by
    // template interpolation in the renderer build.
    expect(chatInlineImageClass).toBe(
      `block max-h-[${chatInlineImageMaxHeight}] w-auto max-w-full object-contain`,
    );
  });
});

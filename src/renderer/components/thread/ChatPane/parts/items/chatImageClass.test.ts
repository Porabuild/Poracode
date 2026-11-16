import { describe, expect, it } from "vitest";
import {
  chatInlineImageClass,
  chatInlineImageMaxHeight,
  reserveInlineImageSlot,
  resolveInlineImageDimensions,
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

describe("resolveInlineImageDimensions", () => {
  it("preserves full-resolution metadata when downscaled variant shares the same aspect ratio", () => {
    expect(resolveInlineImageDimensions(2360, 1640, 960, 667)).toEqual({
      width: 2360,
      height: 1640,
    });
  });

  it("transposes pre-upgrade unrotated metadata when EXIF-oriented pixels load", () => {
    expect(resolveInlineImageDimensions(1640, 2360, 960, 667)).toEqual({
      width: 2360,
      height: 1640,
    });
  });

  it("falls back to natural dimensions when source metadata is missing or mismatched", () => {
    expect(resolveInlineImageDimensions(undefined, undefined, 960, 540)).toEqual({
      width: 960,
      height: 540,
    });
    expect(resolveInlineImageDimensions(800, 600, 1200, 400)).toEqual({
      width: 1200,
      height: 400,
    });
  });
});

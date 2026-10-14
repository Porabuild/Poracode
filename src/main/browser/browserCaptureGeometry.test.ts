import { describe, expect, it } from "vitest";
import { browserCaptureClip } from "./browserCaptureGeometry";

describe("browserCaptureClip", () => {
  const rect = { x: 100, y: 200, width: 80, height: 40 };
  const viewport = { scale: 1, offsetLeft: 0, offsetTop: 0 };

  it.each([
    [0.75, { x: 75, y: 150, width: 60, height: 30 }],
    [1.5, { x: 150, y: 300, width: 120, height: 60 }],
  ])("captures the painted bounds at emulation scale %s", (scale, expected) => {
    expect(browserCaptureClip(rect, viewport, 1, scale)).toEqual(expected);
  });

  it("composes page zoom with a panned and scaled mobile viewport", () => {
    expect(
      browserCaptureClip(rect, { scale: 2, offsetLeft: 20, offsetTop: 50 }, 1.25, 0.8),
    ).toEqual({ x: 160, y: 300, width: 160, height: 80 });
  });

  it("keeps fractional edges and crops offscreen parts", () => {
    expect(
      browserCaptureClip({ x: -0.5, y: 1.5, width: 10, height: 10 }, viewport, 1, 0.75),
    ).toEqual({ x: 0, y: 1, width: 8, height: 8 });
  });
});

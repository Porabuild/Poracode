import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveTerminalColor } from "./terminalColors";

// These fixtures are EMPIRICALLY MEASURED from a real renderer (Electron 41 /
// Chromium 140), because the resolver's correctness hinges on quirks a hand-
// written mock would get wrong — the bug this guards against was a mock that
// *assumed* `oklch()` serializes to hex. It does not:
//   - `fillStyle` echoes modern color spaces back unchanged: `oklch(...)` stays
//     `oklch(...)`, `color-mix(in oklab, ...)` becomes `oklab(...)`, wide-gamut
//     `color(...)` stays `color(...)`. None are xterm-safe.
//   - Opaque `rgb()`/`hsl()`/named colors serialize to `#hex`; `rgba()` stays a
//     legacy `rgba()`. Those are xterm-safe and returned verbatim.
//   - Only the pixel-readback path (getImageData) collapses a modern color space
//     to concrete sRGB bytes.
// Each fixture pairs an input with `serialize` (what `fillStyle` echoes — absent
// ⇒ unparseable, so the setter ignores it) and `raster` (the sRGB pixel a 1×1
// fill produces). One entry per color keeps the two readings from drifting apart.
const FIXTURES: Record<string, { serialize: string; raster: [number, number, number, number] }> = {
  "#000000": { serialize: "#000000", raster: [0, 0, 0, 255] },
  "#ffffff": { serialize: "#ffffff", raster: [255, 255, 255, 255] },
  "#abc": { serialize: "#aabbcc", raster: [170, 187, 204, 255] },
  "#1d4c89": { serialize: "#1d4c89", raster: [29, 76, 137, 255] },
  "rgba(148, 191, 255, 0.24)": {
    serialize: "rgba(148, 191, 255, 0.24)",
    raster: [146, 192, 255, 61],
  },
  "oklch(0.9911 0 0)": { serialize: "oklch(0.9911 0 0)", raster: [252, 252, 252, 255] },
  "oklch(0.2 0.004 286)": { serialize: "oklch(0.2 0.004 286)", raster: [22, 22, 24, 255] },
  "oklch(0.975 0.003 286)": { serialize: "oklch(0.975 0.003 286)", raster: [246, 246, 249, 255] },
  "oklch(0.77 0.08 244)": { serialize: "oklch(0.77 0.08 244)", raster: [136, 186, 228, 255] },
  "color-mix(in oklab, #ffffff 50%, #000000)": {
    serialize: "oklab(0.499997 0.0000227839 0.0000100434)",
    raster: [99, 99, 99, 255],
  },
  "color(srgb 1 0.5 0)": { serialize: "color(srgb 1 0.5 0)", raster: [255, 128, 0, 255] },
};

let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;

beforeAll(() => {
  originalGetContext = HTMLCanvasElement.prototype.getContext;
  let serialized = "#000000";
  let rawForRaster = "#000000";
  let pixel: [number, number, number, number] = [0, 0, 0, 255];
  const ctx = {
    get fillStyle() {
      return serialized;
    },
    set fillStyle(value: string) {
      const key = String(value).trim().toLowerCase();
      const fixture = FIXTURES[key];
      // Unknown ⇒ unparseable; the real setter keeps the previous value.
      if (fixture === undefined) return;
      serialized = fixture.serialize;
      rawForRaster = key;
    },
    clearRect() {},
    fillRect() {
      pixel = FIXTURES[rawForRaster]?.raster ?? [0, 0, 0, 255];
    },
    getImageData() {
      return { data: Uint8ClampedArray.from(pixel) };
    },
  };
  // @ts-expect-error -- partial mock; only the members the resolver touches.
  HTMLCanvasElement.prototype.getContext = () => ctx;
});

afterAll(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
});

describe("resolveTerminalColor", () => {
  it("rasterizes oklch() down to an xterm-safe sRGB hex", () => {
    // Regression: xterm cannot parse "oklch(...)", and Chromium's fillStyle
    // echoes it back unchanged — so it MUST be rasterized, not passed through.
    expect(resolveTerminalColor("oklch(0.9911 0 0)")).toBe("#fcfcfc");
    expect(resolveTerminalColor("oklch(0.2 0.004 286)")).toBe("#161618");
    expect(resolveTerminalColor("oklch(0.975 0.003 286)")).toBe("#f6f6f9");
    expect(resolveTerminalColor("oklch(0.77 0.08 244)")).toBe("#88bae4");
  });

  it("rasterizes color-mix(in oklab, ...) down to an xterm-safe sRGB hex", () => {
    // Serializes to oklab(...), which xterm also cannot parse.
    expect(resolveTerminalColor("color-mix(in oklab, #ffffff 50%, #000000)")).toBe("#636363");
  });

  it("rasterizes a wide-gamut color() down to clamped sRGB", () => {
    expect(resolveTerminalColor("color(srgb 1 0.5 0)")).toBe("#ff8000");
  });

  it("passes through and normalizes plain hex colors", () => {
    expect(resolveTerminalColor("#abc")).toBe("#aabbcc");
    expect(resolveTerminalColor("#1d4c89")).toBe("#1d4c89");
  });

  it("passes through rgba() verbatim, preserving exact alpha", () => {
    // Fast path: the serialization is already xterm-safe, so we keep it rather
    // than rasterizing (round-tripping alpha through a pixel is lossy).
    expect(resolveTerminalColor("rgba(148, 191, 255, 0.24)")).toBe("rgba(148, 191, 255, 0.24)");
  });

  it("returns null for an empty value so callers fall back", () => {
    expect(resolveTerminalColor("")).toBeNull();
  });

  it("returns null for unparseable values (e.g. an unsubstituted var())", () => {
    expect(resolveTerminalColor("var(--snow)")).toBeNull();
    expect(resolveTerminalColor("notacolor")).toBeNull();
  });

  it("never returns a value containing modern color syntax", () => {
    for (const input of [
      "oklch(0.77 0.08 244)",
      "oklch(0.2 0.004 286)",
      "color-mix(in oklab, #ffffff 50%, #000000)",
    ]) {
      const resolved = resolveTerminalColor(input);
      expect(resolved).not.toBeNull();
      expect(resolved).toMatch(/^(#[0-9a-f]{3,8}|rgba?\()/i);
      expect(resolved).not.toContain("oklch");
      expect(resolved).not.toContain("oklab");
      expect(resolved).not.toContain("color-mix");
      expect(resolved).not.toContain("color(");
    }
  });
});

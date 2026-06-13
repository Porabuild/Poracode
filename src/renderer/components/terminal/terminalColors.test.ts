import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveTerminalColor } from "./terminalColors";

// Emulate a browser's CanvasRenderingContext2D.fillStyle: a parseable color is
// stored in a normalized form, while an unparseable value is silently ignored
// (the previous value is kept) — the exact behavior resolveTerminalColor relies
// on. Modern color syntaxes the real engine converts to sRGB hex are mapped to a
// fixed hex; a wide-gamut `color(srgb ...)` parses but stays in that format.
function emulateBrowserParse(input: string): string | null {
  const v = input.trim().toLowerCase();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(v)) {
    if (v.length === 4) {
      return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
    }
    return v;
  }
  if (/^rgb\(/.test(v)) return v.replace(/\s+/g, "").replace("rgb(", "rgb(");
  if (/^rgba\(/.test(v)) return v.replace(/\s+/g, "");
  // oklch()/oklab()/color-mix(...) are in-gamut here → engine yields sRGB hex.
  if (/^(oklch|oklab|color-mix)\(/.test(v)) return "#3a6ea5";
  // Wide-gamut color() parses but cannot be downgraded to hex/rgb.
  if (/^color\(/.test(v)) return v;
  return null; // unparseable: "notacolor", "var(--x)", etc.
}

let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;

beforeAll(() => {
  originalGetContext = HTMLCanvasElement.prototype.getContext;
  let stored = "#000000";
  const ctx = {
    get fillStyle() {
      return stored;
    },
    set fillStyle(value: string) {
      const parsed = emulateBrowserParse(value);
      if (parsed !== null) stored = parsed;
    },
  };
  // @ts-expect-error -- partial mock; only fillStyle is exercised.
  HTMLCanvasElement.prototype.getContext = () => ctx;
});

afterAll(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext;
});

describe("resolveTerminalColor", () => {
  it("converts oklch() to an xterm-safe hex string", () => {
    // The crash that motivated this: xterm cannot parse "oklch(0.9911 0 0)".
    expect(resolveTerminalColor("oklch(0.9911 0 0)")).toBe("#3a6ea5");
  });

  it("converts color-mix(in oklab, ...) to an xterm-safe hex string", () => {
    expect(resolveTerminalColor("color-mix(in oklab, #ffffff 50%, #000000)")).toBe("#3a6ea5");
  });

  it("passes through and normalizes plain hex colors", () => {
    expect(resolveTerminalColor("#abc")).toBe("#aabbcc");
    expect(resolveTerminalColor("#1d4c89")).toBe("#1d4c89");
  });

  it("passes through rgb()/rgba() colors", () => {
    expect(resolveTerminalColor("rgba(148, 191, 255, 0.24)")).toBe("rgba(148,191,255,0.24)");
  });

  it("returns null for an empty value so callers fall back", () => {
    expect(resolveTerminalColor("")).toBeNull();
  });

  it("returns null for unparseable values (e.g. an unsubstituted var())", () => {
    expect(resolveTerminalColor("var(--snow)")).toBeNull();
    expect(resolveTerminalColor("notacolor")).toBeNull();
  });

  it("returns null for a parseable-but-xterm-unsafe wide-gamut color()", () => {
    // Guards against handing xterm a format its parser still cannot read.
    expect(resolveTerminalColor("color(srgb 1 0.5 0)")).toBeNull();
  });

  it("never returns a value containing modern color syntax", () => {
    for (const input of [
      "oklch(0.77 0.08 244)",
      "oklch(0.19 0.004 286)",
      "color-mix(in oklab, oklch(0.2 0.004 286) 50%, #000000)",
    ]) {
      const resolved = resolveTerminalColor(input);
      expect(resolved).not.toBeNull();
      expect(resolved).toMatch(/^(#[0-9a-f]{3,8}|rgba?\()/i);
      expect(resolved).not.toContain("oklch");
      expect(resolved).not.toContain("oklab");
      expect(resolved).not.toContain("color-mix");
    }
  });
});

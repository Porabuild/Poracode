// xterm's WebGL/canvas glyph renderer parses theme colors with its own minimal
// CSS parser that only understands `#hex` and `rgb()/rgba()`. The app's CSS
// custom properties are authored with modern color syntax — `oklch(...)` for the
// base themes and `color-mix(in oklab, ...)` for presets — which xterm cannot
// parse and which crashes the glyph rasterizer with
// "Unexpected fillStyle color format". These helpers let the browser resolve any
// CSS color string down to an xterm-safe `#hex`/`rgba()` value via a 2D canvas
// context.

let colorResolverCtx: CanvasRenderingContext2D | null = null;

function getColorResolverCtx(): CanvasRenderingContext2D | null {
  // Retry until a context is available rather than caching a null result, so a
  // transient failure (or a test that installs a canvas mock after first use)
  // doesn't permanently disable resolution.
  if (!colorResolverCtx && typeof document !== "undefined") {
    colorResolverCtx = document.createElement("canvas").getContext("2d");
  }
  return colorResolverCtx;
}

/**
 * Resolve an arbitrary CSS color string (`oklch(...)`, `color-mix(...)`, hex,
 * `rgb()`, named, ...) to a hex or `rgb(a)` string that xterm's color parser can
 * understand. Returns `null` when the value is empty, unparseable, or resolves
 * to a format xterm still wouldn't understand (e.g. a wide-gamut
 * `color(srgb ...)`), so callers can fall back to a known-safe color.
 */
export function resolveTerminalColor(value: string): string | null {
  if (!value) return null;
  const ctx = getColorResolverCtx();
  if (!ctx) return null;
  // The fillStyle setter silently ignores values it cannot parse, keeping the
  // previous value. Probe with two different sentinels: a parseable value yields
  // the same result regardless of the sentinel, while an unparseable value
  // echoes back each distinct sentinel.
  ctx.fillStyle = "#000000";
  ctx.fillStyle = value;
  const first = ctx.fillStyle;
  ctx.fillStyle = "#ffffff";
  ctx.fillStyle = value;
  const second = ctx.fillStyle;
  if (first !== second) return null;
  return /^#[0-9a-f]{3,8}$/i.test(first) || /^rgba?\(/i.test(first) ? first : null;
}

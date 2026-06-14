// xterm's WebGL/canvas glyph renderer parses theme colors with its own minimal
// CSS parser that only understands `#hex` and `rgb()/rgba()`. The app's CSS
// custom properties are authored with modern color syntax — `oklch(...)` for the
// base themes and `color-mix(in oklab, ...)` for presets — which xterm cannot
// parse and which crashes the glyph rasterizer with
// "Unexpected fillStyle color format". These helpers let the browser resolve any
// CSS color string down to an xterm-safe `#hex`/`rgba()` value.
//
// Resolution can't lean on the canvas `fillStyle` round-trip alone: modern
// Chromium (verified on Electron 41 / Chromium 140) serializes `fillStyle` back
// in the *authored* color space, so `oklch(...)` echoes `oklch(...)` and
// `color-mix(in oklab, ...)` echoes `oklab(...)` — neither xterm-safe. (Opaque
// `rgb()`/`hsl()`/named colors *do* serialize to `#hex`, and `rgba()` to a legacy
// `rgba()`.) So we take the serialization when it's already safe, and otherwise
// rasterize a single pixel and read back its concrete sRGB bytes via
// `getImageData` — the one path that always collapses any color space to plain
// sRGB. Callers fall back to fixed light/dark values when this returns `null`.

import { toHex } from "@/renderer/theme/colorMath";

let colorResolverCtx: CanvasRenderingContext2D | null = null;

function getColorResolverCtx(): CanvasRenderingContext2D | null {
  // Retry until a context is available rather than caching a null result, so a
  // transient failure (or a test that installs a canvas mock after first use)
  // doesn't permanently disable resolution.
  if (!colorResolverCtx && typeof document !== "undefined") {
    // `willReadFrequently` keeps the canvas CPU-backed so the rasterize path's
    // `getImageData` readback doesn't pay a GPU round-trip.
    colorResolverCtx = document
      .createElement("canvas")
      .getContext("2d", { willReadFrequently: true });
  }
  return colorResolverCtx;
}

/**
 * Rasterize a known-parseable color to a 1×1 pixel and read it back as a plain
 * sRGB `#hex` (opaque) or `rgba()` (translucent) string. `clearRect` first so a
 * translucent fill composites over transparent, not over the previous pixel.
 * Returns `null` if the readback fails (e.g. a tainted/unavailable context).
 */
function rasterizeColor(ctx: CanvasRenderingContext2D, value: string): string | null {
  try {
    ctx.fillStyle = value;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillRect(0, 0, 1, 1);
    const [r = 0, g = 0, b = 0, a = 255] = ctx.getImageData(0, 0, 1, 1).data;
    if (a === 255) {
      return toHex([r, g, b]);
    }
    // Round alpha to 3 decimals so the 0–255 → 0–1 division doesn't leak float noise.
    return `rgba(${r}, ${g}, ${b}, ${Number((a / 255).toFixed(3))})`;
  } catch {
    return null;
  }
}

/**
 * Resolve an arbitrary CSS color string (`oklch(...)`, `color-mix(...)`, hex,
 * `rgb()`, named, ...) to a hex or `rgb(a)` string that xterm's color parser can
 * understand. Returns `null` when the value is empty or unparseable, so callers
 * can fall back to a known-safe color.
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
  // Fast path: the serialization is already xterm-safe (hex / rgb / rgba). Use
  // it verbatim so translucent `rgba()` keeps its exact channels (rasterizing
  // round-trips alpha lossily). Otherwise it's a modern color space xterm can't
  // read — rasterize the verified-parseable value down to sRGB.
  if (/^#[0-9a-f]{3,8}$/i.test(first) || /^rgba?\(/i.test(first)) return first;
  return rasterizeColor(ctx, value);
}

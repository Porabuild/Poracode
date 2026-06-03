/**
 * Minimal, dependency-free color math for theme derivation.
 *
 * Used to compute secondary ("muted") text at build time with a guaranteed
 * WCAG contrast floor — something CSS `color-mix` cannot enforce, since the
 * achievable contrast depends on the specific foreground/background pair.
 * Operates on `#rgb` / `#rrggbb` hex (all theme anchors are hex).
 */

export type Rgb = [number, number, number];

export function parseHex(hex: string): Rgb {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const n = Number.parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function toHex(rgb: Rgb): string {
  const c = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(rgb[0])}${c(rgb[1])}${c(rgb[2])}`;
}

function channelLuminance(value: number): number {
  const s = value / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(rgb: Rgb): number {
  return (
    0.2126 * channelLuminance(rgb[0]) +
    0.7152 * channelLuminance(rgb[1]) +
    0.0722 * channelLuminance(rgb[2])
  );
}

/** WCAG 2.1 contrast ratio (1–21) between two hex colors. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(parseHex(a));
  const lb = relativeLuminance(parseHex(b));
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** Linear sRGB blend; `t` is the weight of `a` (1 → a, 0 → b). */
export function mixHex(a: string, b: string, t: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  return toHex([
    ca[0] * t + cb[0] * (1 - t),
    ca[1] * t + cb[1] * (1 - t),
    ca[2] * t + cb[2] * (1 - t),
  ]);
}

export interface ContrastTarget {
  /** Background the muted color must remain readable against. */
  color: string;
  /** Minimum WCAG contrast ratio against `color`. */
  floor: number;
}

export interface MutedDerivation {
  hex: string;
  /** Blend weight of fg used (higher = closer to fg). */
  fraction: number;
}

/**
 * Returns the *dimmest* blend of `fg` toward the first background that still
 * clears every target's contrast floor — keeping muted text as recessive as
 * the palette allows without dropping below readable. If the floors can't be
 * met within `maxFraction`, returns the `maxFraction` blend (best effort; the
 * cap preserves a visible gap from the foreground).
 */
export function deriveMutedColor(
  fg: string,
  targets: ContrastTarget[],
  opts: { minFraction: number; maxFraction: number; step?: number },
): MutedDerivation {
  const blendTo = targets[0]!.color;
  const step = opts.step ?? 0.01;
  for (let t = opts.minFraction; t <= opts.maxFraction + 1e-9; t += step) {
    const hex = mixHex(fg, blendTo, t);
    if (targets.every((target) => contrastRatio(hex, target.color) >= target.floor)) {
      return { hex, fraction: t };
    }
  }
  return { hex: mixHex(fg, blendTo, opts.maxFraction), fraction: opts.maxFraction };
}

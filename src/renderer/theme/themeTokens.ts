/**
 * Theme token derivation.
 *
 * A theme preset is authored as a handful of anchor colors (`ThemeSpec`); the
 * full set of app CSS custom properties is derived from them here via
 * `color-mix` so palettes stay internally consistent and cheap to author. The
 * derived values intentionally mirror the relationships baked into the base
 * theme in `styles.css` (secondary/tertiary surfaces step toward the
 * foreground, the scrollbar is a translucent muted, etc.).
 *
 * Authoring anchors in plain hex (the canonical color each editor theme ships)
 * keeps the catalog faithful to the upstream themes; only layout-neutral color
 * tokens are themed, so radius, spacing, fonts, and semantic status colors
 * (success/warning/danger) stay on the base values.
 */

import { deriveMutedColor, mixHex } from "./colorMath";

export type ThemeVariantVars = Record<string, string>;

export interface ThemeSpec {
  /** Editor/content background (the largest surface). */
  bg: string;
  /** Panel/card surface (sidebars, popovers, composer). Slightly off `bg`. */
  surface: string;
  /** Primary text color. */
  fg: string;
  /** Accent / primary action color. */
  accent: string;
  /** Text rendered on top of `accent`. */
  accentFg: string;
  /** Hairline border / separator base color. */
  border: string;
  /** Optional explicit sidebar background. Defaults to `surface`. */
  sidebar?: string;
  /** Optional explicit content-area background. Defaults to `bg`. */
  content?: string;
}

/**
 * Secondary ("muted") text is derived by blending `fg` toward `bg` rather than
 * taken from each editor theme's comment color. Editor comment colors are tuned
 * to recede behind code and fail as readable UI text (e.g. One's `#5c6370` is
 * ~2.3:1 on its background). The blend is pushed only as far as needed to clear
 * a WCAG contrast floor, so muted stays recessive while matching the base
 * Poracode theme's readability (~4.5–6:1) for every palette, and still
 * inherits each theme's tint because `fg` / `bg` are themed.
 *
 * The strict floor applies to the content background (where settings
 * descriptions and primary body copy sit); panels (surface) and the sidebar
 * get a relaxed floor so muted lands dimmer there — keeping a clear visual gap
 * from the active foreground without over-brightening it.
 */
const MUTED_BG_FLOOR = 4.5;
const MUTED_PANEL_FLOOR = 4.0;
const MUTED_MIN_FRACTION = 0.3;
const MUTED_MAX_FRACTION = 0.85;
/** Placeholder text sits this much dimmer (toward bg) than muted. */
const PLACEHOLDER_DROP = 0.14;

/**
 * Every CSS custom property this module sets on the document root. Switching to
 * the base theme clears exactly these so the `.light` / `.dark` rules in
 * `styles.css` take over again.
 */
export const MANAGED_THEME_VARS = [
  "--background",
  "--foreground",
  "--surface",
  "--surface-secondary",
  "--surface-tertiary",
  "--overlay",
  "--muted",
  "--scrollbar",
  "--default",
  "--accent",
  "--accent-foreground",
  "--field-background",
  "--field-foreground",
  "--field-placeholder",
  "--field-border",
  "--segment",
  "--border",
  "--separator",
  "--sidebar-background",
  "--content-background",
  "--composer-surface",
] as const;

const mix = (a: string, aPct: number, b: string): string =>
  `color-mix(in oklab, ${a} ${aPct}%, ${b} ${100 - aPct}%)`;

/** Blend `color` with transparency (a translucent tint of itself). */
const fade = (color: string, pct: number): string =>
  `color-mix(in oklab, ${color} ${pct}%, transparent)`;

export function buildVariant(spec: ThemeSpec, mode: "light" | "dark"): ThemeVariantVars {
  const { bg, surface, fg, accent, accentFg, border } = spec;
  const sidebar = spec.sidebar ?? surface;
  const content = spec.content ?? bg;

  // Derive readable secondary text from fg→bg with a contrast floor. Placeholder
  // sits a step dimmer than muted; the scrollbar is a translucent muted.
  const muted = deriveMutedColor(
    fg,
    [
      { color: bg, floor: MUTED_BG_FLOOR },
      { color: surface, floor: MUTED_PANEL_FLOOR },
      { color: sidebar, floor: MUTED_PANEL_FLOOR },
    ],
    { minFraction: MUTED_MIN_FRACTION, maxFraction: MUTED_MAX_FRACTION },
  );
  const placeholder = mixHex(
    fg,
    bg,
    Math.max(MUTED_MIN_FRACTION, muted.fraction - PLACEHOLDER_DROP),
  );

  return {
    "--background": bg,
    "--foreground": fg,
    "--surface": surface,
    "--surface-secondary": mix(surface, 92, fg),
    "--surface-tertiary": mix(surface, 85, fg),
    "--overlay": mix(surface, 93, fg),
    "--muted": muted.hex,
    "--scrollbar": fade(muted.hex, 60),
    // Neutral fill for secondary/tertiary buttons, selects, chips, toggle and
    // checkbox/radio controls. Stepped toward fg so the controls separate from
    // the panel — more in light (where surfaces cluster near white and would
    // otherwise swallow the fill, ~1.35:1 vs page) than in dark, where
    // over-stepping would lighten the fill into the (light) accent label.
    "--default": mix(surface, mode === "light" ? 82 : 86, fg),
    "--accent": accent,
    "--accent-foreground": accentFg,
    "--field-background": mix(surface, 95, fg),
    "--field-foreground": fg,
    "--field-placeholder": placeholder,
    "--field-border": fade(border, 70),
    "--segment": surface,
    "--border": border,
    "--separator": fade(border, 75),
    "--sidebar-background": sidebar,
    "--content-background": content,
    "--composer-surface": mix(surface, 90, fg),
  };
}

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

import type { ThemePalette } from "@/shared/customThemes";
import { contrastRatio, deriveMutedColor, mixHex } from "./colorMath";

export type ThemeVariantVars = Record<string, string>;

export type ThemeSpec = ThemePalette;

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

/**
 * Translucent foreground tint strength for editable fields (`--field-background`).
 * Because the fill composites over whatever container sits behind the input,
 * fields stay calm on the plain content canvas (matching `--content-surface-fill`)
 * and automatically step brighter (dark) or darker (light) inside cards, panels,
 * modals, popovers, and drawers without per-container CSS overrides.
 */
export const FIELD_TINT_PCT = {
  dark: 6.5,
  light: 7.5,
} as const;

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
  "--content-surface-fill",
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
  "--sidebar-panel-background",
  "--sidebar-row-hover",
  "--sidebar-row-active",
  "--sidebar-row-active-override",
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
  // Encoded sRGB, also used by the native transcript. Identical content roles
  // need an opaque fill even on translucent sidebars and compact layouts.
  const tintedPanel = mixHex(fg, surface, mode === "light" ? 0.085 : 0.06);
  // Reserve room for both readable metadata and a visibly stronger primary label.
  const readablePanel = contrastRatio(fg, tintedPanel) >= 9 ? tintedPanel : surface;
  const panel = mode === "dark" ? mixHex("#000000", readablePanel, 0.05) : readablePanel;
  // Docked sidebar backdrop: the color the sidebar panel paints over, shared by
  // --sidebar-panel-background and the selected row below.
  const sidebarBackdrop = spec.sidebarFill ? sidebar : content;
  // Dark selection prefers the derived raised panel, but some palettes leave
  // that panel closer to the backdrop than a faint foreground wash; fall back
  // to the 7.5% wash there so the selected fill stays stronger than hover.
  // Explicit authored fills still win.
  const minimumSidebarActive = mixHex(fg, sidebarBackdrop, 0.075);
  const darkSidebarActive =
    contrastRatio(sidebarBackdrop, panel) < contrastRatio(sidebarBackdrop, minimumSidebarActive)
      ? minimumSidebarActive
      : panel;
  const overlayApprox = mixHex(fg, surface, mode === "light" ? 0.07 : 0.02);
  const fieldTintPct = FIELD_TINT_PCT[mode];
  const fieldTintFraction = fieldTintPct / 100;
  // Main composer sits directly on the content canvas and occludes scrolling
  // chat messages, so it uses the opaque content-surface fill (matching cards
  // and user messages) rather than the translucent form-field wash.
  const composer = spec.composer ?? panel;

  // Check metadata against its reading surfaces and hints against the composited
  // field fills on plain canvas, cards/panels, overlays, and the composer.
  const muted = deriveMutedColor(
    fg,
    [
      { color: bg, floor: MUTED_BG_FLOOR },
      { color: content, floor: MUTED_BG_FLOOR },
      { color: surface, floor: MUTED_PANEL_FLOOR },
      { color: panel, floor: MUTED_BG_FLOOR },
      { color: sidebar, floor: MUTED_PANEL_FLOOR },
    ],
    { minFraction: MUTED_MIN_FRACTION, maxFraction: MUTED_MAX_FRACTION },
  );
  const placeholder = deriveMutedColor(
    fg,
    [
      { color: mixHex(fg, content, fieldTintFraction), floor: 5 },
      { color: mixHex(fg, panel, fieldTintFraction), floor: 5 },
      { color: mixHex(fg, overlayApprox, fieldTintFraction), floor: 5 },
      { color: composer, floor: 5 },
    ],
    { minFraction: MUTED_MIN_FRACTION, maxFraction: 1 },
  ).hex;

  return {
    "--background": bg,
    "--foreground": fg,
    "--surface": surface,
    "--content-surface-fill": panel,
    "--surface-secondary": mix(surface, 92, fg),
    "--surface-tertiary": mix(surface, 85, fg),
    // Floating chrome (modals, menus, popovers). In dark themes it drops to
    // just above the surface so translucent fields step up cleanly on it;
    // light overlays stay pale while editable fields step toward the dark foreground.
    "--overlay": mode === "light" ? mix(surface, 93, fg) : mix(surface, 98, fg),
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
    // Translucent foreground wash: stays calm on the plain canvas and automatically
    // steps brighter (dark) or darker (light) over any raised surface behind it.
    "--field-background": fade(fg, fieldTintPct),
    "--field-foreground": fg,
    "--field-placeholder": placeholder,
    "--field-border": fade(border, 70),
    "--segment": surface,
    "--border": border,
    "--separator": fade(border, 75),
    "--sidebar-background": sidebar,
    "--sidebar-panel-background": sidebarBackdrop,
    // A translucent hover wash keeps the sidebar material visible.
    "--sidebar-row-hover": fade(fg, mode === "light" ? 6 : 3.5),
    // Resolve the selected fill here; referring back to --row-active would
    // cycle when a sidebar scopes --row-active to this token. Dark prefers the
    // raised panel (or the 7.5% fallback above); an explicit selected-row
    // color still takes precedence. Light stays a wash.
    "--sidebar-row-active":
      spec.sidebarRowActive ?? (mode === "light" ? fade(fg, 11) : darkSidebarActive),
    // Explicit authored fills also take precedence over the glass-sidebar wash.
    "--sidebar-row-active-override": spec.sidebarRowActive ?? "",
    "--content-background": content,
    "--composer-surface": composer,
  };
}

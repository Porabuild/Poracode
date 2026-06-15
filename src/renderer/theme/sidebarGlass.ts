import { isWindows } from "@/renderer/bridge";

/**
 * User-tunable frosting for the translucent ("liquid glass") sidebar.
 *
 * The sidebar paints `var(--sidebar-glass-tint)` over the OS blur material; the
 * tint is `content-background` at a partial alpha. A higher alpha is more
 * frosted (the sidebar holds its theme color), a lower one shows more of the
 * blurred backdrop. The Appearance slider overrides that alpha per light/dark.
 *
 * Windows-only at apply time: DWM acrylic blurs whatever sits behind the window,
 * so the backdrop can wash the sidebar out and the override matters most there.
 * macOS vibrancy composites its own adaptive material and keeps the styles.css
 * default. An unset (null) override leaves the per-platform default in
 * styles.css authoritative.
 */

type Appearance = "light" | "dark";

const CSS_VAR = "--sidebar-glass-tint";

/**
 * Default mix percentage per appearance on Windows. Mirrors the
 * `html[data-platform="win32"]` `--sidebar-glass-tint` rules in styles.css —
 * keep the two in sync. Used to seed the slider when there is no override.
 */
export const WINDOWS_GLASS_TINT_DEFAULT: Record<Appearance, number> = {
  light: 65,
  dark: 85,
};

/** The `color-mix()` expression for a frosting percentage (0–100). */
export function sidebarGlassTintExpr(pct: number): string {
  return `color-mix(in oklab, var(--content-background) ${pct}%, transparent)`;
}

/**
 * Apply (or clear) the user's sidebar frosting override as an inline custom
 * property on the document root. Inline wins over the styles.css defaults;
 * clearing falls back to them. No-op off Windows so macOS vibrancy is untouched.
 */
export function applySidebarGlassTint(
  root: HTMLElement,
  override: number | null,
  enabled: boolean,
): void {
  if (enabled && isWindows() && override != null) {
    root.style.setProperty(CSS_VAR, sidebarGlassTintExpr(override));
  } else {
    root.style.removeProperty(CSS_VAR);
  }
}

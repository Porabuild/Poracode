import type { ThemePalette } from "@/shared/customThemes";
import { hexColorSchema, themePaletteSchema } from "@/shared/customThemes";
import { buildVariant } from "./themeTokens";
import { contrastRatio } from "./colorMath";

/** WCAG AA threshold for normal text; compare raw ratios, never rounded values.
 * https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
 */
export const TEXT_CONTRAST_MINIMUM = 4.5;

function ratio(text: string, background: string): number | null {
  if (!hexColorSchema.safeParse(text).success || !hexColorSchema.safeParse(background).success)
    return null;
  return contrastRatio(text, background);
}

/** Solid surfaces only: the translucent sidebar depends on the material behind it. */
export function themeTextContrast(palette: ThemePalette, mode: "light" | "dark") {
  const parsed = themePaletteSchema.safeParse(palette);
  const muted = parsed.success ? buildVariant(parsed.data, mode)["--muted"]! : null;
  const content = palette.content ?? palette.bg;
  return {
    content: ratio(palette.fg, content),
    surface: ratio(palette.fg, palette.surface),
    sidebar: ratio(palette.fg, palette.sidebar ?? palette.surface),
    muted: muted === null ? null : ratio(muted, content),
    composer: palette.composer ? ratio(palette.fg, palette.composer) : null,
    sidebarRowActive: palette.sidebarRowActive ? ratio(palette.fg, palette.sidebarRowActive) : null,
    accent: ratio(palette.accentFg, palette.accent),
  };
}

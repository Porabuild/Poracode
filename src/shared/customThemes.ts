import { z } from "zod";

/** Versioned authoring format shared by settings, cache bootstrap and JSON files. */
export const CUSTOM_THEME_VERSION = 1;
export const MAX_CUSTOM_THEMES = 100;
export const MAX_THEME_JSON_LENGTH = 32_768;
export const hexColorSchema = z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);

export const themePaletteSchema = z.object({
  /** Editor/content background (the largest surface). */
  bg: hexColorSchema,
  /** Panel/card surface; other fills are derived from this anchor. */
  surface: hexColorSchema,
  /** Primary text color. */
  fg: hexColorSchema,
  /** Primary action color. */
  accent: hexColorSchema,
  /** Text drawn on the accent. */
  accentFg: hexColorSchema,
  /** Hairline border/separator base color. */
  border: hexColorSchema,
  /** Side chrome background; defaults to surface. */
  sidebar: hexColorSchema.optional(),
  /** Main content background; defaults to bg. */
  content: hexColorSchema.optional(),
  /** Prompt input fill; defaults to surface stepped toward fg. */
  composer: hexColorSchema.optional(),
  /** Give the docked sidebar its own fill instead of the content background. */
  sidebarFill: z.boolean().optional(),
  /** Selected sidebar row fill; defaults to the shared foreground wash. */
  sidebarRowActive: hexColorSchema.optional(),
});

export type ThemePalette = z.infer<typeof themePaletteSchema>;
export const themeDocumentSchema = z.object({
  version: z.literal(CUSTOM_THEME_VERSION),
  label: z.string().trim().min(1).max(80),
  light: themePaletteSchema,
  dark: themePaletteSchema,
});
export type ThemeDocument = z.infer<typeof themeDocumentSchema>;
export const customThemeSchema = themeDocumentSchema.extend({
  // Separate namespace: authored themes cannot replace a bundled preset.
  id: z.string().regex(/^custom:[a-z0-9-]{1,80}$/),
});
export type CustomTheme = z.infer<typeof customThemeSchema>;

/** Old settings have no themes. Discard invalid/future records independently. */
export function normalizeCustomThemes(value: unknown): CustomTheme[] {
  if (!Array.isArray(value)) return [];
  const result: CustomTheme[] = [];
  const seen = new Set<string>();
  for (const item of value.slice(0, MAX_CUSTOM_THEMES)) {
    const parsed = customThemeSchema.safeParse(item);
    if (!parsed.success || seen.has(parsed.data.id)) continue;
    seen.add(parsed.data.id);
    result.push(parsed.data);
  }
  return result;
}

export const customThemesSchema = z.preprocess(
  normalizeCustomThemes,
  z.array(customThemeSchema).max(MAX_CUSTOM_THEMES),
);

export function parseThemeDocument(json: string): ThemeDocument | null {
  if (json.length > MAX_THEME_JSON_LENGTH) return null;
  try {
    const parsed = themeDocumentSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function serializeThemeDocument(theme: ThemeDocument): string {
  return JSON.stringify(themeDocumentSchema.parse(theme), null, 2);
}

// Locales offered by the marketing site. Kept in lockstep with the desktop
// app's catalogs (src/renderer/locales) so the two surfaces speak the same
// languages. `label` is each language's own endonym (shown in the selector).
export const LOCALES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "pt-BR", label: "Português (BR)" },
  { code: "ru", label: "Русский" },
  { code: "uk", label: "Українська" },
  { code: "pl", label: "Polski" },
  { code: "tr", label: "Türkçe" },
  { code: "vi", label: "Tiếng Việt" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "zh-CN", label: "简体中文" },
] as const;

export type Locale = (typeof LOCALES)[number]["code"];

export const LOCALE_CODES = LOCALES.map((l) => l.code) as Locale[];

export const DEFAULT_LOCALE: Locale = "en";

export function isLocale(value: string | null | undefined): value is Locale {
  return value != null && LOCALE_CODES.includes(value as Locale);
}

/**
 * Map a browser language tag (e.g. "pt", "pt-PT", "zh-Hans-CN") to one of our
 * supported locales: try an exact match first, then the primary-language
 * subtag, then fall back to English.
 */
export function resolveBrowserLocale(input: string | null | undefined): Locale {
  if (!input) return DEFAULT_LOCALE;
  const lower = input.toLowerCase();
  const exact = LOCALE_CODES.find((c) => c.toLowerCase() === lower);
  if (exact) return exact;
  const prefix = lower.split("-")[0];
  const byPrefix = LOCALE_CODES.find((c) => c.toLowerCase().split("-")[0] === prefix);
  return byPrefix ?? DEFAULT_LOCALE;
}

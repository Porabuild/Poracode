/**
 * Canonical locale lists + resolution shared by the settings schema (main +
 * renderer) and the renderer i18n runtime. Keeping the lists here means adding a
 * language is a one-line change in a single place (plus the `.po` catalog and
 * `lingui.config.ts`).
 *
 * `resolveLocale` is pure (no DOM access) so it is unit-testable in the node
 * environment; callers pass the preferred-language list explicitly.
 */

/** Locales we actually ship catalogs for. */
export const SUPPORTED_LOCALES = [
  "en",
  "es",
  "ru",
  "uk",
  "zh-CN",
  "ja",
  "pt-BR",
  "de",
  "fr",
  "ko",
  "pl",
  "vi",
  "tr",
] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/** Source locale — its catalog mirrors the message source text. */
export const SOURCE_LOCALE: SupportedLocale = "en";

/**
 * Values the `locale` setting may hold. `"system"` follows the OS/browser
 * preferred language at runtime (resolved by {@link resolveLocale}), mirroring
 * how `themeMode: "system"` follows the OS color scheme.
 */
export const LOCALE_SETTING_VALUES = ["system", ...SUPPORTED_LOCALES] as const;
export type LocaleSetting = (typeof LOCALE_SETTING_VALUES)[number];

/**
 * English display names for each supported locale. Used to instruct one-shot
 * models which language to write generated content in (commit messages, PR
 * summaries, thread titles). English names — not native — because the directive
 * is embedded inside an otherwise-English instruction prompt.
 */
export const LOCALE_ENGLISH_NAMES: Record<SupportedLocale, string> = {
  en: "English",
  es: "Spanish",
  ru: "Russian",
  uk: "Ukrainian",
  "zh-CN": "Simplified Chinese",
  ja: "Japanese",
  "pt-BR": "Brazilian Portuguese",
  de: "German",
  fr: "French",
  ko: "Korean",
  pl: "Polish",
  vi: "Vietnamese",
  tr: "Turkish",
};

/**
 * Values the AI-content language setting may hold. `"match-app"` follows the
 * resolved UI {@link LocaleSetting}; any other value pins a specific output
 * language regardless of the interface language.
 */
export const AI_LANGUAGE_VALUES = ["match-app", ...SUPPORTED_LOCALES] as const;
export type AiContentLanguage = (typeof AI_LANGUAGE_VALUES)[number];

export function isSupportedLocale(value: string): value is SupportedLocale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

const SUPPORTED_LOCALES_BY_NORMALIZED_TAG = new Map(
  SUPPORTED_LOCALES.map((locale) => [locale.toLowerCase(), locale]),
);

function findSupportedLocaleForLanguageTag(tag: string): SupportedLocale | undefined {
  const normalized = tag.trim().replaceAll("_", "-").toLowerCase();
  const exactMatch = SUPPORTED_LOCALES_BY_NORMALIZED_TAG.get(normalized);
  if (exactMatch) {
    return exactMatch;
  }

  const base = normalized.split("-")[0];
  if (!base) {
    return undefined;
  }

  const baseMatch = SUPPORTED_LOCALES_BY_NORMALIZED_TAG.get(base);
  if (baseMatch) {
    return baseMatch;
  }

  let regionalMatch: SupportedLocale | undefined;
  for (const locale of SUPPORTED_LOCALES) {
    if (locale.toLowerCase().split("-")[0] !== base) {
      continue;
    }
    if (regionalMatch) {
      return undefined;
    }
    regionalMatch = locale;
  }
  return regionalMatch;
}

/**
 * Resolve a `locale` setting to a concrete supported locale.
 *
 * - An explicit supported locale is returned as-is.
 * - `"system"` (or any unexpected value) walks `preferredLanguages` (e.g.
 *   `navigator.languages`, BCP-47 tags like `"uk-UA"`), matching exact
 *   regional tags first, then base language, and falls back to
 *   {@link SOURCE_LOCALE} when nothing matches.
 */
export function resolveLocale(
  setting: LocaleSetting,
  preferredLanguages: readonly string[],
): SupportedLocale {
  if (setting !== "system" && isSupportedLocale(setting)) {
    return setting;
  }

  for (const tag of preferredLanguages) {
    const locale = findSupportedLocaleForLanguageTag(tag);
    if (locale) {
      return locale;
    }
  }

  return SOURCE_LOCALE;
}

/**
 * Resolve an AI-content language preference to the English name of the language
 * the model should write generated content in — or `undefined` when the target
 * resolves to the English {@link SOURCE_LOCALE}. Returning `undefined` lets
 * callers omit the directive entirely, so the default (English) prompt is left
 * byte-for-byte unchanged.
 *
 * `"match-app"` follows the UI `locale` setting (which itself may be
 * `"system"`, resolved against `preferredLanguages`).
 */
export function resolveAiLanguageName(
  setting: AiContentLanguage,
  appLocale: LocaleSetting,
  preferredLanguages: readonly string[],
): string | undefined {
  const locale = setting === "match-app" ? resolveLocale(appLocale, preferredLanguages) : setting;
  if (locale === SOURCE_LOCALE) {
    return undefined;
  }
  return LOCALE_ENGLISH_NAMES[locale];
}

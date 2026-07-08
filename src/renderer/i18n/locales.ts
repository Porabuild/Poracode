import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import {
  AI_LANGUAGE_VALUES,
  LOCALE_SETTING_VALUES,
  type AiContentLanguage,
  type LocaleSetting,
} from "@/shared/locale";

export {
  AI_LANGUAGE_VALUES,
  LOCALE_SETTING_VALUES,
  SUPPORTED_LOCALES,
  SOURCE_LOCALE,
  isSupportedLocale,
  resolveLocale,
  resolveAiLanguageName,
  type AiContentLanguage,
  type LocaleSetting,
  type SupportedLocale,
} from "@/shared/locale";

/**
 * Display label for each locale-setting value. Native names are intentionally
 * left untranslated (a language is best shown in its own language); only the
 * "System" label is translatable since it describes a behavior, not a language.
 */
const LOCALE_SETTING_LABELS: Record<LocaleSetting, string | MessageDescriptor> = {
  system: msg`System`,
  en: "English",
  es: "Español",
  ru: "Русский",
  uk: "Українська",
  "zh-CN": "简体中文",
  ja: "日本語",
  "pt-BR": "Português (Brasil)",
  de: "Deutsch",
  fr: "Français",
  ko: "한국어",
  pl: "Polski",
  vi: "Tiếng Việt",
  tr: "Türkçe",
};

/**
 * Options for the language `Select`. `label` may be a lazy `MessageDescriptor`
 * (for "System") or a plain native string; resolve descriptors at render time
 * with `useLingui()._(...)` — see GeneralSettings.
 */
export const localeOptions: ReadonlyArray<{
  id: LocaleSetting;
  label: string | MessageDescriptor;
}> = LOCALE_SETTING_VALUES.map((id) => ({ id, label: LOCALE_SETTING_LABELS[id] }));

/**
 * Defined at module level (not inline in the `.map` below) so the Lingui macro
 * can statically extract it.
 */
const MATCH_APP_LABEL = msg`Match app language`;

/**
 * Options for the AI-content language `Select` (commit/PR text). `"match-app"`
 * follows the UI language; the rest reuse the native locale labels. Resolve
 * descriptors at render time like {@link localeOptions}.
 */
export const aiLanguageOptions: ReadonlyArray<{
  id: AiContentLanguage;
  label: string | MessageDescriptor;
}> = AI_LANGUAGE_VALUES.map((id) => ({
  id,
  label: id === "match-app" ? MATCH_APP_LABEL : LOCALE_SETTING_LABELS[id],
}));

/** Preferred languages from the browser/Electron renderer, newest API first. */
export function detectOSLocale(): readonly string[] {
  if (typeof navigator === "undefined") {
    return [];
  }
  if (Array.isArray(navigator.languages) && navigator.languages.length > 0) {
    return navigator.languages;
  }
  return navigator.language ? [navigator.language] : [];
}

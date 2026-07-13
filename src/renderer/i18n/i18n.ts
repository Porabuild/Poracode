import { i18n } from "@lingui/core";
import type { useLingui } from "@lingui/react/macro";
import { SOURCE_LOCALE, type LocaleSetting, type SupportedLocale } from "@/shared/locale";
import { messages as sourceMessages } from "../locales/en/messages.po";
import { detectOSLocale, resolveLocale } from "./locales";
// Side-effect import: installs the locale-aware resolver for the shared
// `@/shared/messages` catalog (which stays macro-free for the supervisor).
import "./sharedMessages";

// Load + activate the source locale synchronously at module load so macros
// resolve on the very first render — no flash of empty UI before a catalog
// loads. Other locales are imported on demand by `dynamicActivate`.
i18n.load(SOURCE_LOCALE, sourceMessages);
i18n.activate(SOURCE_LOCALE);

const loaded = new Set<SupportedLocale>([SOURCE_LOCALE]);

/**
 * Load (once) and activate a locale's compiled catalog. The Vite plugin turns
 * the `.po` import into a runtime message module. Safe to call repeatedly and
 * with the already-active locale.
 */
export async function dynamicActivate(locale: SupportedLocale): Promise<void> {
  if (!loaded.has(locale)) {
    const { messages } = await import(`../locales/${locale}/messages.po`);
    i18n.load(locale, messages);
    loaded.add(locale);
  }
  i18n.activate(locale);
}

// Mirrors the localStorage key in sharedSettingsStore. Read directly here so the
// pre-mount bootstrap doesn't have to import (and eagerly hydrate) the store —
// the same approach `bootstrapAppThemeFromCache` takes for the theme.
const SHARED_SETTINGS_CACHE_KEY = "poracode-shared-settings";

// Ceiling on how long the pre-mount catalog load may delay first paint. A local
// bundled chunk loads in single-digit ms; this only bounds the pathological case
// where the chunk fetch hangs (vs. errors, which the catch handles), so a wedged
// load can never block the app from mounting. On timeout we paint in the source
// locale and the provider effect finishes activating the real catalog post-mount.
const CATALOG_BOOT_TIMEOUT_MS = 1500;

/**
 * Resolve the cached `locale` setting and activate its catalog *before* React
 * mounts, so a non-English user's first paint is already translated instead of
 * flashing the source ("en") locale while the provider effect loads the catalog
 * asynchronously. The locale analog of `bootstrapAppThemeFromCache`: the
 * provider effect re-resolves from the authoritative settings and wins if the
 * cache was stale. Defensive — never rejects and is time-bounded, so neither a
 * failed nor a hung catalog load can wedge boot; the app stays usable in the
 * source locale either way.
 *
 * Unlike the theme, this can't run in the index.html pre-paint script: non-`en`
 * catalogs are async chunks, so the earliest seam that can await one is here.
 */
export async function bootstrapAppLocaleFromCache(): Promise<void> {
  try {
    const raw =
      typeof localStorage === "undefined" ? null : localStorage.getItem(SHARED_SETTINGS_CACHE_KEY);
    const cached = raw ? (JSON.parse(raw) as { locale?: unknown }) : null;
    const setting: LocaleSetting =
      typeof cached?.locale === "string" ? (cached.locale as LocaleSetting) : "system";
    await Promise.race([
      dynamicActivate(resolveLocale(setting, detectOSLocale())),
      new Promise<void>((resolve) => setTimeout(resolve, CATALOG_BOOT_TIMEOUT_MS)),
    ]);
  } catch {
    // Non-fatal; the source locale stays active and the provider effect
    // re-resolves the real setting after mount.
  }
}

/** The `t` translator returned by `useLingui()`; thread through helpers to stay locale-reactive. */
export type TranslateFn = ReturnType<typeof useLingui>["t"];

export { i18n };

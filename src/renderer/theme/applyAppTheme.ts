/**
 * Applies a theme preset's variant to the document root as inline CSS custom
 * properties. Inline properties win over the `.light` / `.dark` rules in
 * styles.css, so the base ("Poracode") theme is expressed by *clearing* the
 * managed properties — letting styles.css stay the source of truth — rather
 * than by re-setting equivalent values.
 */

import { resolveThemeMode } from "@/shared/themeMode";
import type { ThemeMode } from "@/shared/contracts";
import { DEFAULT_THEME_ID, getThemePreset } from "./themePresets";
import { MANAGED_THEME_VARS } from "./themeTokens";

type Appearance = "light" | "dark";

export function applyAppTheme(root: HTMLElement, appearance: Appearance, themeId: string): void {
  if (themeId === DEFAULT_THEME_ID) {
    for (const key of MANAGED_THEME_VARS) {
      root.style.removeProperty(key);
    }
    return;
  }

  const preset = getThemePreset(themeId);
  const vars = appearance === "dark" ? preset.dark : preset.light;
  for (const key of MANAGED_THEME_VARS) {
    // An empty value clears the declaration, letting the .light/.dark base win.
    root.style.setProperty(key, vars[key] ?? "");
  }
}

// Mirrors the localStorage key in sharedSettingsStore. Read directly here so the
// pre-paint bootstrap doesn't have to import (and eagerly hydrate) the store.
const SHARED_SETTINGS_CACHE_KEY = "poracode-shared-settings";

// Resolved appearance + background, read by the inline pre-paint script in
// index.html so the first frame matches the active theme. Keep the key in sync.
const BOOT_CACHE_KEY = "poracode-boot";

/**
 * Persists the resolved appearance + background so the next launch's pre-paint
 * bootstrap (index.html) can match the active theme before the renderer mounts.
 */
export function persistThemeBoot(appearance: Appearance, themeId: string): void {
  try {
    const preset = getThemePreset(themeId);
    const background = (appearance === "dark" ? preset.dark : preset.light)["--background"];
    localStorage.setItem(BOOT_CACHE_KEY, JSON.stringify({ appearance, bg: background }));
  } catch {
    // Non-fatal; the bootstrap falls back to themeMode + system preference.
  }
}

/** Whether the OS currently prefers a dark color scheme (defaults to dark). */
export function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return true;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Synchronously applies the cached appearance + theme to the document root
 * before React mounts, so a non-default theme doesn't flash the base palette on
 * launch. The authoritative settings load (provider effect) re-applies and wins
 * if the cache was stale. Defensive: never throws into the boot path.
 */
export function bootstrapAppThemeFromCache(): void {
  try {
    const raw = localStorage.getItem(SHARED_SETTINGS_CACHE_KEY);
    if (!raw) return;
    const cached = JSON.parse(raw) as { themeMode?: unknown; themePreset?: unknown };
    const mode: ThemeMode =
      cached.themeMode === "light" || cached.themeMode === "system" ? cached.themeMode : "dark";
    const themeId = typeof cached.themePreset === "string" ? cached.themePreset : DEFAULT_THEME_ID;
    const appearance = resolveThemeMode(mode, systemPrefersDark());

    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(appearance);
    root.dataset.theme = appearance;
    applyAppTheme(root, appearance, themeId);
  } catch {
    // Ignore malformed cache; the provider effect applies real settings shortly.
  }
}

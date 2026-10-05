import { contrastRatio } from "./colorMath";
import { afterEach, describe, expect, it } from "vitest";
import { type CustomTheme } from "@/shared/customThemes";
import { THEME_SPECS, getThemePreset } from "./themePresets";
import { buildVariant, MANAGED_THEME_VARS } from "./themeTokens";
import { applyAppTheme, bootstrapAppThemeFromCache, persistThemeBoot } from "./applyAppTheme";

const theme: CustomTheme = {
  ...THEME_SPECS[0]!,
  version: 1,
  id: "custom:sample",
  label: "Personal palette",
  dark: {
    ...THEME_SPECS[0]!.dark,
    bg: "#101010",
    composer: "#141414",
    sidebar: "#000000",
    sidebarFill: true,
    sidebarRowActive: "#1a1a1a",
  },
};
afterEach(() => {
  localStorage.clear();
  for (const key of MANAGED_THEME_VARS) document.documentElement.style.removeProperty(key);
});

describe("custom theme application", () => {
  it("resolves custom palettes and applies their explicit surface controls", () => {
    const vars = getThemePreset(theme.id, [theme]).dark;
    expect(vars["--composer-surface"]).toBe("#141414");
    expect(vars["--sidebar-panel-background"]).toBe("#000000");
    expect(vars["--sidebar-row-active"]).toBe("#1a1a1a");
    const root = document.createElement("div");
    applyAppTheme(root, "dark", theme.id, [theme]);
    expect(root.style.getPropertyValue("--background")).toBe("#101010");
    applyAppTheme(root, "light", theme.id, [theme]);
    expect(root.style.getPropertyValue("--background")).toBe(theme.light.bg);
  });
  it("clears all overrides when a deleted or unknown custom theme is selected", () => {
    const root = document.createElement("div");
    applyAppTheme(root, "dark", theme.id, [theme]);
    applyAppTheme(root, "dark", theme.id, []);
    for (const key of MANAGED_THEME_VARS) expect(root.style.getPropertyValue(key)).toBe("");
  });
  it("preserves the previous derived composer and content/sidebar relationship", () => {
    const vars = buildVariant(THEME_SPECS[0]!.dark, "dark");
    expect(vars["--composer-surface"]).toContain("color-mix");
    expect(vars["--sidebar-panel-background"]).toBe(THEME_SPECS[0]!.dark.content);
    // A literal wash avoids --row-active -> --sidebar-row-active -> --row-active cycles.
    expect(vars["--sidebar-row-active"]).not.toContain("var(--row-active)");
  });
  it("restores a saved theme before mount and caches its background for the next launch", () => {
    localStorage.setItem(
      "poracode-shared-settings",
      JSON.stringify({ themeMode: "dark", themePreset: theme.id, customThemes: [theme] }),
    );
    bootstrapAppThemeFromCache();
    expect(document.documentElement.style.getPropertyValue("--background")).toBe("#101010");
    persistThemeBoot("dark", theme.id, [theme]);
    expect(JSON.parse(localStorage.getItem("poracode-boot")!)).toEqual({
      appearance: "dark",
      bg: "#101010",
    });
  });
  it("boots from the previous cache shape and ignores corrupt new palettes", () => {
    localStorage.setItem(
      "poracode-shared-settings",
      JSON.stringify({ themeMode: "dark", themePreset: "github" }),
    );
    bootstrapAppThemeFromCache();
    expect(document.documentElement.style.getPropertyValue("--background")).toBe("#0d1117");
    localStorage.setItem(
      "poracode-shared-settings",
      JSON.stringify({
        themeMode: "dark",
        themePreset: theme.id,
        customThemes: [{ ...theme, dark: {} }],
      }),
    );
    bootstrapAppThemeFromCache();
    expect(document.documentElement.style.getPropertyValue("--background")).toBe("");
  });
});

describe("custom content readability", () => {
  it.each([
    { mode: "dark" as const, bg: "#202020", surface: "#262626", fg: "#e0e0e0", content: "#3c3c3c" },
    {
      mode: "light" as const,
      bg: "#ffffff",
      surface: "#ffffff",
      fg: "#222222",
      content: "#e4e4e4",
    },
  ])("derives muted text against the actual $mode content background", ({ mode, ...palette }) => {
    const vars = buildVariant({ ...theme[mode], ...palette }, mode);
    expect(contrastRatio(vars["--muted"]!, palette.content)).toBeGreaterThanOrEqual(4.5);
  });
});

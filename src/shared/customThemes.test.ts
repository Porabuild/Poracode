import { describe, expect, it } from "vitest";
import {
  customThemeSchema,
  normalizeCustomThemes,
  parseThemeDocument,
  serializeThemeDocument,
  type CustomTheme,
} from "./customThemes";
import { defaultSharedSettings, normalizeSharedSettings } from "./settings";

const palette = {
  bg: "#111111",
  surface: "#222222",
  fg: "#ffffff",
  accent: "#346bf1",
  accentFg: "#fff",
  border: "#333",
};
const theme: CustomTheme = {
  version: 1,
  id: "custom:test",
  label: "My palette",
  light: palette,
  dark: { ...palette, composer: "#000", sidebarFill: true, sidebarRowActive: "#123" },
};

describe("custom theme compatibility", () => {
  it("loads the released settings shape without losing the selected preset", () => {
    const { customThemes: _customThemes, ...released } = defaultSharedSettings;
    const settings = normalizeSharedSettings({ ...released, themePreset: "github" });
    expect(settings.themePreset).toBe("github");
    expect(settings.customThemes).toEqual([]);
  });
  it("round-trips authoring files without their installation id", () => {
    const json = serializeThemeDocument(theme);
    expect(JSON.parse(json)).not.toHaveProperty("id");
    expect(parseThemeDocument(json)).toEqual({
      version: 1,
      label: theme.label,
      light: theme.light,
      dark: theme.dark,
    });
  });
  it("preserves valid themes when invalid or future records are present", () => {
    expect(
      normalizeCustomThemes([
        theme,
        { ...theme, id: "custom:future", version: 2 },
        { ...theme, id: "github" },
        theme,
      ]),
    ).toEqual([theme]);
    expect(normalizeSharedSettings({ customThemes: [theme] }).customThemes).toEqual([theme]);
  });
  it.each(["red", "#12", "#ggg", "url(https://example.com)", "var(--foreground)"])(
    "rejects non-hex color %s",
    (color) => {
      expect(
        customThemeSchema.safeParse({ ...theme, dark: { ...palette, bg: color } }).success,
      ).toBe(false);
    },
  );
  it("rejects malformed, oversized and unsupported authoring files", () => {
    expect(parseThemeDocument("{")).toBeNull();
    expect(parseThemeDocument(" ".repeat(32769))).toBeNull();
    expect(parseThemeDocument(JSON.stringify({ ...theme, version: 2 }))).toBeNull();
    expect(parseThemeDocument(JSON.stringify({ ...theme, label: " " }))).toBeNull();
    expect(
      parseThemeDocument(JSON.stringify({ ...theme, dark: { ...palette, sidebarFill: "yes" } })),
    ).toBeNull();
  });
});

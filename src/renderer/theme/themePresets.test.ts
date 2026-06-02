import { describe, expect, it } from "vitest";
import { applyAppTheme } from "./applyAppTheme";
import { contrastRatio } from "./colorMath";
import { APP_THEME_PRESETS, DEFAULT_THEME_ID, getThemePreset } from "./themePresets";
import { MANAGED_THEME_VARS } from "./themeTokens";

// Floors mirror themeTokens: text stays readable on the content background
// (strict), while muted on panels (surface/sidebar) gets a relaxed floor so it
// lands dimmer there and keeps a clear gap from the active foreground.
const BG_FLOOR = 4.5;
const PANEL_FLOOR = 4.0;
// Muted must also stay visibly dimmer than the active foreground (hierarchy);
// foregrounds in low-contrast palettes are brightened/darkened to hold this.
const MUTED_FG_GAP_FLOOR = 1.9;

describe("theme presets", () => {
  it("includes the base default theme first", () => {
    expect(APP_THEME_PRESETS[0]?.id).toBe(DEFAULT_THEME_ID);
  });

  it("has unique ids and a label for every preset", () => {
    const ids = APP_THEME_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const preset of APP_THEME_PRESETS) {
      expect(preset.label.length).toBeGreaterThan(0);
    }
  });

  it("defines every managed variable in both variants", () => {
    for (const preset of APP_THEME_PRESETS) {
      for (const variant of [preset.light, preset.dark]) {
        const missing = MANAGED_THEME_VARS.filter((key) => !variant[key]);
        expect(missing).toEqual([]);
      }
    }
  });

  it("falls back to the default preset for unknown ids", () => {
    expect(getThemePreset("does-not-exist").id).toBe(DEFAULT_THEME_ID);
  });

  // Guards the core fix: muted secondary text and the foreground must stay
  // readable in every theme/variant, matching the base Lightcode contrast.
  it("keeps muted and foreground text above the contrast floor", () => {
    const failures: string[] = [];
    for (const preset of APP_THEME_PRESETS) {
      for (const mode of ["light", "dark"] as const) {
        const v = preset[mode];
        const bg = v["--background"]!;
        const surface = v["--surface"]!;
        const sidebar = v["--sidebar-background"]!;
        const muted = v["--muted"]!;
        const fg = v["--foreground"]!;
        const checks: [string, string, string, number][] = [
          ["muted/bg", muted, bg, BG_FLOOR],
          ["muted/surface", muted, surface, PANEL_FLOOR],
          ["muted/sidebar", muted, sidebar, PANEL_FLOOR],
          ["fg/bg", fg, bg, BG_FLOOR],
          ["fg/surface", fg, surface, BG_FLOOR],
        ];
        for (const [pair, a, b, floor] of checks) {
          const ratio = contrastRatio(a, b);
          if (ratio < floor) {
            failures.push(`${preset.id}/${mode} ${pair} ${ratio.toFixed(2)} < ${floor}`);
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });

  // Guards the second fix: muted must read as clearly dimmer than the active
  // foreground, otherwise inactive and selected text look the same.
  it("keeps muted visibly dimmer than the foreground", () => {
    const failures: string[] = [];
    for (const preset of APP_THEME_PRESETS) {
      for (const mode of ["light", "dark"] as const) {
        const v = preset[mode];
        const gap = contrastRatio(v["--foreground"]!, v["--muted"]!);
        if (gap < MUTED_FG_GAP_FLOOR) {
          failures.push(`${preset.id}/${mode} gap ${gap.toFixed(2)} < ${MUTED_FG_GAP_FLOOR}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });
});

describe("applyAppTheme", () => {
  it("sets the variant's anchor color and follows appearance", () => {
    const el = document.createElement("div");
    applyAppTheme(el, "dark", "github");
    expect(el.style.getPropertyValue("--accent")).toBe("#2f81f7");
    expect(el.style.getPropertyValue("--background")).toBe("#0d1117");

    applyAppTheme(el, "light", "github");
    expect(el.style.getPropertyValue("--accent")).toBe("#0969da");
    expect(el.style.getPropertyValue("--background")).toBe("#ffffff");
  });

  it("clears managed overrides for the base default theme", () => {
    const el = document.createElement("div");
    applyAppTheme(el, "dark", "github");
    expect(el.style.getPropertyValue("--accent")).not.toBe("");

    applyAppTheme(el, "dark", DEFAULT_THEME_ID);
    for (const key of MANAGED_THEME_VARS) {
      expect(el.style.getPropertyValue(key)).toBe("");
    }
  });
});

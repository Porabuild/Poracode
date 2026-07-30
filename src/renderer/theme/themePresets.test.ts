import { describe, expect, it } from "vitest";
import { applyAppTheme } from "./applyAppTheme";
import { contrastRatio, mixHex, toHex } from "./colorMath";
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
const UI_BOUNDARY_FLOOR = 3.0;
const UI_FILL_FLOOR = 1.25;

const semanticTokens = {
  light: {
    success: "oklch(0.45 0.16 150)",
    warning: "oklch(0.5 0.14 78)",
    danger: "oklch(0.48 0.2 25)",
    prMerged: "oklch(0.5 0.18 292)",
    gitBranch: "oklch(0.5 0.13 265)",
  },
  dark: {
    success: "oklch(0.7329 0.1935 150.81)",
    warning: "oklch(0.8203 0.1388 76.34)",
    danger: "oklch(0.64 0.2 24.63)",
    prMerged: "oklch(0.7 0.17 292)",
  },
} as const;

function oklchToHex(input: string): string {
  const match = input.match(/oklch\(([\d.]+)%?\s+([\d.]+)\s+([\d.]+)/);
  if (!match) throw new Error(`Unsupported color: ${input}`);
  const l = Number(match[1]) / (input.includes("%") ? 100 : 1);
  const c = Number(match[2]);
  const h = (Number(match[3]) * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return toHex([
    linearToSrgb(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_) * 255,
    linearToSrgb(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_) * 255,
    linearToSrgb(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_) * 255,
  ]);
}

function linearToSrgb(value: number): number {
  const v = Math.min(1, Math.max(0, value));
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
}

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

  it("maps the pre-rebrand legacy theme id to the current preset", () => {
    expect(getThemePreset("lightcode-legacy").id).toBe("poracode-legacy");
  });

  // Guards the core fix: muted secondary text and the foreground must stay
  // readable in every theme/variant, matching the base Poracode contrast.
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

  it("keeps interactive colors readable across every theme", () => {
    // Semantic status colors are fixed oklch literals (not derived per preset),
    // so convert them to hex once per mode rather than inside the preset loop.
    const semanticHex = {
      light: {
        success: oklchToHex(semanticTokens.light.success),
        warning: oklchToHex(semanticTokens.light.warning),
        danger: oklchToHex(semanticTokens.light.danger),
        prMerged: oklchToHex(semanticTokens.light.prMerged),
        gitBranch: oklchToHex(semanticTokens.light.gitBranch),
      },
      dark: {
        success: oklchToHex(semanticTokens.dark.success),
        warning: oklchToHex(semanticTokens.dark.warning),
        danger: oklchToHex(semanticTokens.dark.danger),
        prMerged: oklchToHex(semanticTokens.dark.prMerged),
      },
    } as const;

    const failures: string[] = [];
    for (const preset of APP_THEME_PRESETS) {
      for (const mode of ["light", "dark"] as const) {
        const v = preset[mode];
        const surface = v["--surface"]!;
        const content = v["--content-background"]!;
        const fg = v["--foreground"]!;
        const accent = v["--accent"]!;
        const sem = semanticHex[mode];
        // git-branch is a fixed tone in light; in dark it's the themed --muted.
        const gitBranch = mode === "light" ? semanticHex.light.gitBranch : v["--muted"]!;

        // Tertiary fill. In light, styles.css .button--tertiary darkens
        // --content-background (where these controls render) toward black by a fixed
        // fraction — foreground-independent, so it lands at a uniform contrast across
        // presets instead of over-darkening themes with a dark foreground (the
        // toward-fg approach made Poracode light read heavy). Measured against
        // --content-background. In dark we keep HeroUI's stock --default fill: it
        // sits quieter on the panel (below UI_FILL_FLOOR for a couple of dark
        // presets) but reads as intended, so the floor is enforced light only.
        const buttonBg = mode === "light" ? mixHex("#000000", content, 0.11) : v["--default"]!;
        const buttonHover = mode === "light" ? mixHex("#000000", content, 0.16) : v["--default"]!;
        // Soft-accent label (--color-accent-soft-foreground): styles.css deepens
        // HeroUI's raw --accent toward fg so explicitly accent-tinted controls
        // such as selected toggles, badges, chips, and calendar states stay
        // legible on both accent-soft and neutral fills.
        const softLabel = mixHex(accent, fg, 0.65);
        const accentSoftFill = mixHex(accent, surface, 0.15);
        const defaultFill = mixHex(fg, surface, mode === "light" ? 0.18 : 0.14);

        const checks: [string, string, string, number][] = [
          ["success/content", sem.success, content, UI_BOUNDARY_FLOOR],
          ["warning/content", sem.warning, content, UI_BOUNDARY_FLOOR],
          ["danger/content", sem.danger, content, UI_BOUNDARY_FLOOR],
          ["pr-merged/content", sem.prMerged, content, UI_BOUNDARY_FLOOR],
          ["git-branch/content", gitBranch, content, UI_BOUNDARY_FLOOR],
          // Fill floor is light-only (dark uses the quieter stock fill), measured
          // against --content-background where the tool panels/overlays render.
          ...(mode === "light"
            ? ([
                ["tertiary bg/content", buttonBg, content, UI_FILL_FLOOR],
                ["tertiary hover/content", buttonHover, content, UI_FILL_FLOOR],
              ] as [string, string, string, number][])
            : []),
          ["tertiary text/bg", fg, buttonBg, BG_FLOOR],
          ["tertiary text/hover", fg, buttonHover, BG_FLOOR],
          ["soft-accent label/accent-soft", softLabel, accentSoftFill, UI_BOUNDARY_FLOOR],
          ["soft-accent label/default", softLabel, defaultFill, UI_BOUNDARY_FLOOR],
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

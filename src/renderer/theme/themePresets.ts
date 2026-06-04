/**
 * Catalog of selectable app themes.
 *
 * Each preset ships a `light` and `dark` variant; the active variant follows
 * the user's appearance mode (system / light / dark), so e.g. Catppuccin is
 * Latte in light and Mocha in dark. Palettes are adapted from the popular
 * VS Code / Cursor / editor themes of the same name and remapped onto
 * Lightcode's token set — the app keeps its own layout, radius, and typography.
 *
 * `THEME_SPECS` holds the authored anchor colors (the source of truth, also
 * consumed by the contrast test); `APP_THEME_PRESETS` is the derived token set.
 * Secondary ("muted") text is derived from fg→bg rather than each theme's
 * comment color so contrast stays readable everywhere (see `themeTokens`). To
 * add a theme, append one `THEME_SPECS` entry.
 */

import { buildVariant, type ThemeSpec, type ThemeVariantVars } from "./themeTokens";

export interface AppThemeSpec {
  id: string;
  label: string;
  light: ThemeSpec;
  dark: ThemeSpec;
}

export interface AppThemePreset {
  id: string;
  label: string;
  light: ThemeVariantVars;
  dark: ThemeVariantVars;
}

export const DEFAULT_THEME_ID = "default";

export const THEME_SPECS: AppThemeSpec[] = [
  // Lightcode base. Mirrors the `.light` / `.dark` values in styles.css and is
  // used only for the gallery preview — at runtime the base theme clears all
  // overrides so styles.css stays the source of truth (see applyAppTheme).
  {
    id: DEFAULT_THEME_ID,
    label: "Lightcode",
    // sRGB hex of the styles.css oklch values (anchors must be hex so muted can
    // be contrast-derived). Preview-only — runtime clears overrides for default.
    light: {
      bg: "#f1f1f4",
      surface: "#fafafb",
      fg: "#18181b",
      accent: "#478cc4",
      accentFg: "#ffffff",
      border: "#cacace",
      sidebar: "#ececef",
      content: "#f6f6f9",
      terminal: "#f4f4f6",
    },
    dark: {
      bg: "#141416",
      surface: "#1a1a1c",
      fg: "#fcfcfc",
      accent: "#88bae4",
      accentFg: "#111113",
      border: "#303033",
      sidebar: "#1a1a1c",
      content: "#161618",
      terminal: "#0c0c0e",
    },
  },

  // Catppuccin — Latte / Mocha.
  {
    id: "catppuccin",
    label: "Catppuccin",
    light: {
      bg: "#eff1f5",
      surface: "#ffffff",
      // Darkened from canonical #4c4f69 so muted text reads as clearly dimmer.
      fg: "#3d3f54",
      accent: "#8839ef",
      accentFg: "#ffffff",
      border: "#bcc0cc",
      sidebar: "#e6e9ef",
      terminal: "#dce0e8",
    },
    dark: {
      bg: "#1e1e2e",
      surface: "#27273a",
      // Brightened from canonical #cdd6f4 to widen the muted/active gap.
      fg: "#d2daf5",
      accent: "#cba6f7",
      accentFg: "#1e1e2e",
      border: "#313244",
      sidebar: "#181825",
      terminal: "#181825",
    },
  },

  // GitHub — Light / Dark (default).
  {
    id: "github",
    label: "GitHub",
    light: {
      bg: "#ffffff",
      surface: "#f6f8fa",
      fg: "#1f2328",
      accent: "#0969da",
      accentFg: "#ffffff",
      border: "#d0d7de",
      sidebar: "#f6f8fa",
      content: "#ffffff",
      terminal: "#f6f8fa",
    },
    dark: {
      bg: "#0d1117",
      surface: "#161b22",
      fg: "#e6edf3",
      accent: "#2f81f7",
      accentFg: "#ffffff",
      border: "#30363d",
      sidebar: "#0d1117",
      terminal: "#010409",
    },
  },

  // Atom One — Light / Dark.
  {
    id: "one",
    label: "One",
    light: {
      bg: "#fafafa",
      surface: "#ffffff",
      fg: "#383a42",
      accent: "#4078f2",
      accentFg: "#ffffff",
      border: "#e5e5e6",
      sidebar: "#eaeaeb",
      terminal: "#f0f0f0",
    },
    dark: {
      bg: "#282c34",
      surface: "#2c313a",
      // Brightened from canonical #abb2bf to widen the muted/active gap.
      fg: "#dee0e6",
      accent: "#61afef",
      accentFg: "#282c34",
      border: "#3b4048",
      sidebar: "#21252b",
      terminal: "#21252b",
    },
  },

  // Dracula — Alucard (light) / Dracula (dark).
  {
    id: "dracula",
    label: "Dracula",
    light: {
      bg: "#fffbeb",
      surface: "#ffffff",
      fg: "#1f1f1f",
      accent: "#644ac9",
      accentFg: "#ffffff",
      border: "#d4cfc0",
      sidebar: "#f3eedd",
      terminal: "#f3eedd",
    },
    dark: {
      bg: "#282a36",
      surface: "#343746",
      fg: "#f8f8f2",
      accent: "#bd93f9",
      accentFg: "#282a36",
      border: "#44475a",
      sidebar: "#21222c",
      terminal: "#21222c",
    },
  },

  // Nord — Snow Storm (light) / Polar Night (dark).
  {
    id: "nord",
    label: "Nord",
    light: {
      bg: "#eceff4",
      surface: "#ffffff",
      fg: "#2e3440",
      accent: "#5e81ac",
      accentFg: "#ffffff",
      border: "#d8dee9",
      sidebar: "#e5e9f0",
      terminal: "#e5e9f0",
    },
    dark: {
      bg: "#2e3440",
      surface: "#3b4252",
      // Brightened from canonical #d8dee9 to widen the muted/active gap.
      fg: "#eff2f6",
      accent: "#88c0d0",
      accentFg: "#2e3440",
      border: "#434c5e",
      sidebar: "#2b303b",
      terminal: "#272c36",
    },
  },

  // Tokyo Night — Day / Night.
  {
    id: "tokyo-night",
    label: "Tokyo Night",
    light: {
      bg: "#e1e2e7",
      surface: "#ffffff",
      // Darkened from canonical #343b58 so muted text reads as clearly dimmer.
      fg: "#303651",
      accent: "#2e7de9",
      accentFg: "#ffffff",
      border: "#c4c8da",
      sidebar: "#d6d8df",
      terminal: "#d6d8df",
    },
    dark: {
      bg: "#1a1b26",
      surface: "#1f2335",
      // Brightened from canonical #c0caf5 to widen the muted/active gap.
      fg: "#cdd5f7",
      accent: "#7aa2f7",
      accentFg: "#1a1b26",
      border: "#292e42",
      sidebar: "#16161e",
      terminal: "#16161e",
    },
  },

  // Gruvbox — Light / Dark (medium).
  {
    id: "gruvbox",
    label: "Gruvbox",
    light: {
      bg: "#fbf1c7",
      surface: "#f9f5d7",
      fg: "#3c3836",
      accent: "#d65d0e",
      accentFg: "#fbf1c7",
      border: "#d5c4a1",
      sidebar: "#ebdbb2",
      terminal: "#ebdbb2",
    },
    dark: {
      bg: "#282828",
      surface: "#32302f",
      // Brightened from canonical #ebdbb2 to widen the muted/active gap.
      fg: "#f0e5c7",
      accent: "#fe8019",
      accentFg: "#282828",
      border: "#504945",
      sidebar: "#1d2021",
      terminal: "#1d2021",
    },
  },

  // Solarized — Light / Dark. fg pulled well past the canonical (famously
  // low-contrast) base0/base01 so muted text both clears the readability floor
  // and stays clearly dimmer than the active foreground.
  {
    id: "solarized",
    label: "Solarized",
    light: {
      bg: "#fdf6e3",
      surface: "#eee8d5",
      fg: "#2e3c41",
      accent: "#268bd2",
      accentFg: "#fdf6e3",
      border: "#ddd6c1",
      sidebar: "#eee8d5",
      terminal: "#eee8d5",
    },
    dark: {
      bg: "#002b36",
      surface: "#073642",
      fg: "#e3e8e8",
      accent: "#268bd2",
      accentFg: "#002b36",
      border: "#0a4a5a",
      sidebar: "#002028",
      terminal: "#002028",
    },
  },

  // Rosé Pine — Dawn / Moon.
  {
    id: "rose-pine",
    label: "Rosé Pine",
    light: {
      bg: "#faf4ed",
      surface: "#fffaf3",
      // Darkened from canonical #575279 so muted text reads as clearly dimmer.
      fg: "#423e5c",
      accent: "#907aa9",
      accentFg: "#ffffff",
      border: "#dfdad9",
      sidebar: "#f2e9e1",
      terminal: "#f2e9e1",
    },
    dark: {
      bg: "#232136",
      surface: "#2a273f",
      fg: "#e0def4",
      accent: "#c4a7e7",
      accentFg: "#232136",
      border: "#44415a",
      sidebar: "#1f1d2e",
      terminal: "#1f1d2e",
    },
  },

  // Everforest — Light / Dark (medium).
  {
    id: "everforest",
    label: "Everforest",
    light: {
      bg: "#fdf6e3",
      surface: "#f4f0d9",
      // Darkened past canonical #5c6a72 so muted text clears the readability
      // floor and stays clearly dimmer than the active foreground.
      fg: "#374147",
      // Deepened from the canonical #8da101 olive so accent button/link text is
      // legible (the light olive sat at ~2.6:1).
      accent: "#677700",
      accentFg: "#ffffff",
      border: "#e0dcc7",
      sidebar: "#efebd4",
      terminal: "#efebd4",
    },
    dark: {
      bg: "#2d353b",
      surface: "#343f44",
      // Brightened from canonical #d3c6aa to widen the muted/active gap.
      fg: "#eee8dd",
      accent: "#a7c080",
      accentFg: "#2d353b",
      border: "#475258",
      sidebar: "#272e33",
      terminal: "#272e33",
    },
  },

  // Monokai — adapted light / classic dark.
  {
    id: "monokai",
    label: "Monokai",
    light: {
      bg: "#fbfbf8",
      surface: "#ffffff",
      fg: "#2c2b29",
      accent: "#e0156d",
      accentFg: "#ffffff",
      border: "#e4e3da",
      sidebar: "#f1f1ea",
      terminal: "#f1f1ea",
    },
    dark: {
      bg: "#272822",
      surface: "#2f302a",
      fg: "#f8f8f2",
      accent: "#f92672",
      accentFg: "#ffffff",
      border: "#3e3d32",
      sidebar: "#1d1e19",
      terminal: "#1d1e19",
    },
  },
];

export const APP_THEME_PRESETS: AppThemePreset[] = THEME_SPECS.map((spec) => ({
  id: spec.id,
  label: spec.label,
  light: buildVariant(spec.light, "light"),
  dark: buildVariant(spec.dark, "dark"),
}));

const PRESETS_BY_ID = new Map(APP_THEME_PRESETS.map((entry) => [entry.id, entry]));

export function getThemePreset(id: string): AppThemePreset {
  return PRESETS_BY_ID.get(id) ?? PRESETS_BY_ID.get(DEFAULT_THEME_ID)!;
}

/** `{ id, label }` options for a Select, in catalog order. */
export const APP_THEME_OPTIONS = APP_THEME_PRESETS.map((entry) => ({
  id: entry.id,
  label: entry.label,
}));

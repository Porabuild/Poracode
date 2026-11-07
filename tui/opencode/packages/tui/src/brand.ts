// poracode: product identity and terminal theme anchors.
export const BRAND = {
  name: "Poracode",
  website: "https://poracode.com/",
  defaultTheme: "poracode",
  updatesEnabled: false,
  palette: {
    light: {
      background: "#f1f1f4",
      foreground: "#18181b",
      muted: "#68686f",
      surface: "#fafafb",
      raised: "#f0f0f2",
      menu: "#fbfcfd",
      accent: "#5f6cd9",
      accentForeground: "#ffffff",
      border: "#cacace",
      borderSubtle: "#d7d7da",
      scrollbar: "#b6b7be",
      success: "#106630",
      warning: "#835b06",
      danger: "#ac1922",
      info: "#5f6cd9",
      diffAdded: "#d2ded9",
      diffRemoved: "#e7d3d7",
    },
    dark: {
      background: "#070709",
      foreground: "#fafafa",
      muted: "#9a9fa5",
      surface: "#0e0e14",
      raised: "#1a1a1e",
      menu: "#121216",
      accent: "#8892ef",
      accentForeground: "#0a0a12",
      border: "#24242e",
      borderSubtle: "#2d2d31",
      scrollbar: "#3a3a48",
      success: "#17c964",
      warning: "#f5a524",
      danger: "#ed4a4a",
      info: "#8892ef",
      diffAdded: "#0b321d",
      diffRemoved: "#3a1617",
    },
  },
} as const;

const themeLabels: Record<string, string> = {
  poracode: BRAND.name,
  opencode: "Poracode Classic",
  opencode2: "Poracode Preview",
};

export function displayThemeName(name: string) {
  return themeLabels[name] ?? name;
}

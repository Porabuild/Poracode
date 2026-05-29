export const themeOptions = [
  { id: "system", label: "System" },
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
] as const;

export const terminalPositionOptions = [
  { id: "right", label: "Right" },
  { id: "bottom", label: "Bottom" },
] as const;

export const threadRemoveActionOptions = [
  { id: "archive", label: "Archive" },
  { id: "delete", label: "Delete" },
] as const;

export const newThreadModeOptions = [
  { id: "page", label: "Page" },
  { id: "panel", label: "Panel" },
] as const;

export const gitReviewModeOptions = [
  { id: "panel", label: "Panel" },
  { id: "page", label: "Page" },
] as const;

export const scrollSpeedOptions = Array.from({ length: 10 }, (_, i) => ({
  id: String(i + 1),
  label: `${i + 1}x`,
})) as readonly { id: string; label: string }[];

export const fontSizeOptions = Array.from({ length: 13 }, (_, i) => ({
  id: String(i + 8),
  label: `${i + 8}px`,
})) as readonly { id: string; label: string }[];

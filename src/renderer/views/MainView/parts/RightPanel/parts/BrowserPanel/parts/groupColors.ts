import type { BrowserTabGroupColor } from "@/shared/ipc";

/** Hex for each tab-group color (Chrome-like palette). */
export const GROUP_COLORS: Record<BrowserTabGroupColor, string> = {
  gray: "#9aa0a6",
  blue: "#3b82f6",
  red: "#ef4444",
  yellow: "#eab308",
  green: "#22c55e",
  cyan: "#06b6d4",
  purple: "#7d6cf6",
  orange: "#f97316",
};

/** Swatch order shown in the group context menu. */
export const GROUP_COLOR_ORDER: BrowserTabGroupColor[] = [
  "gray",
  "blue",
  "red",
  "yellow",
  "green",
  "cyan",
  "purple",
  "orange",
];

export function groupColor(color: BrowserTabGroupColor): string {
  return GROUP_COLORS[color] ?? GROUP_COLORS.gray;
}

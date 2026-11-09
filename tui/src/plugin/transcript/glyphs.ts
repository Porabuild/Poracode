import type { CommandIntentKind } from "../../desktop/presentation";

/**
 * Terminal stand-ins for the desktop's Lucide icons, keyed by icon name, so a
 * row reads with the same icon vocabulary in both clients.
 */
const ICON_GLYPHS: Record<string, string> = {
  Bot: "❖",
  Brain: "✻",
  Check: "✓",
  CircleAlert: "✗",
  Clock: "◷",
  Download: "↓",
  Eye: "◉",
  FileEdit: "✎",
  FilePen: "✎",
  FilePlus: "+",
  FolderSearch: "≡",
  GitBranch: "⎇",
  Globe: "◎",
  Image: "▨",
  ImageIcon: "▨",
  Layers: "≋",
  Package: "▣",
  Pencil: "✎",
  Plug: "◇",
  SearchCode: "✱",
  Sparkles: "✦",
  Terminal: "$",
  Trash2: "⌫",
  Wrench: "◈",
};

export const GLYPH = {
  agent: ICON_GLYPHS.Bot!,
  compaction: ICON_GLYPHS.Layers!,
  edit: ICON_GLYPHS.Pencil!,
  error: ICON_GLYPHS.CircleAlert!,
  fileChange: ICON_GLYPHS.FileEdit!,
  handoff: "⇄",
  running: "◌",
  thought: ICON_GLYPHS.Brain!,
  web: ICON_GLYPHS.Globe!,
  workflow: ICON_GLYPHS.GitBranch!,
} as const;

/** Lucide components carry their icon name as `displayName`. */
export function iconGlyph(icon: unknown) {
  const name =
    icon && (typeof icon === "object" || typeof icon === "function")
      ? (icon as { displayName?: unknown }).displayName
      : undefined;
  return (typeof name === "string" && ICON_GLYPHS[name]) || ICON_GLYPHS.Wrench!;
}

/** The desktop's `COMMAND_INTENT_ICONS`, as glyphs. */
export const COMMAND_GLYPHS: Record<CommandIntentKind, string> = {
  view: ICON_GLYPHS.Eye!,
  search: ICON_GLYPHS.SearchCode!,
  git: ICON_GLYPHS.GitBranch!,
  check: ICON_GLYPHS.Check!,
  install: ICON_GLYPHS.Package!,
  package: ICON_GLYPHS.Package!,
  list: ICON_GLYPHS.FolderSearch!,
  command: ICON_GLYPHS.Terminal!,
};

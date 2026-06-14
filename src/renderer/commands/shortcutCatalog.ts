import type { KeybindingEntry } from "@/shared/keybindings";
import { bindingForPlatform, formatKeybinding, type PlatformName } from "./keybindingMatcher";
import type { AppCommand } from "./registry";

export const SHORTCUT_CONTEXTS = [
  { id: "all", label: "All" },
  { id: "global", label: "Global" },
  { id: "composer", label: "Composer" },
  { id: "panel", label: "Panel" },
  { id: "editor", label: "Editor" },
  { id: "terminal", label: "Terminal" },
  { id: "browser", label: "Browser" },
  { id: "project", label: "Project" },
  { id: "thread", label: "Thread" },
] as const;

export type ShortcutContext = (typeof SHORTCUT_CONTEXTS)[number]["id"];

export interface ShortcutRow {
  id: string;
  title: string;
  description: string;
  group: string;
  contexts: ShortcutContext[];
  keys: string[];
  searchText: string;
}

interface LocalShortcut {
  id: string;
  title: string;
  description: string;
  group: string;
  when?: string;
  keys: string[];
}

export const LOCAL_SHORTCUTS: readonly LocalShortcut[] = [
  {
    id: "composer.send",
    title: "Send message",
    description: "Composer",
    group: "Composer",
    when: "composerFocus",
    keys: ["Enter"],
  },
  {
    id: "composer.new-line",
    title: "New line",
    description: "Composer",
    group: "Composer",
    when: "composerFocus",
    keys: ["Shift+Enter"],
  },
  {
    id: "composer.toggle-work-plan",
    title: "Toggle Work or Plan",
    description: "Composer controls",
    group: "Composer",
    when: "composerFocus",
    keys: ["Shift+Tab"],
  },
  {
    id: "composer.cycle-effort",
    title: "Cycle reasoning effort",
    description: "Composer controls",
    group: "Composer",
    when: "composerFocus",
    keys: ["Mod+T"],
  },
  {
    id: "composer.toggle-fast",
    title: "Toggle Fast mode",
    description: "Composer controls",
    group: "Composer",
    when: "composerFocus",
    keys: ["Mod+F"],
  },
  {
    id: "composer.cycle-permission",
    title: "Cycle permission mode",
    description: "Composer controls",
    group: "Composer",
    when: "composerFocus",
    keys: ["Mod+P"],
  },
  {
    id: "composer.open-model-picker",
    title: "Open model picker",
    description: "Composer controls",
    group: "Composer",
    when: "composerFocus",
    keys: ["Mod+M"],
  },
  {
    id: "terminal.copy",
    title: "Copy selection",
    description: "Terminal",
    group: "Terminal",
    when: "terminalFocus",
    keys: ["Mod+C"],
  },
  {
    id: "terminal.paste",
    title: "Paste",
    description: "Terminal",
    group: "Terminal",
    when: "terminalFocus",
    keys: ["Mod+V"],
  },
  {
    id: "browser.reload",
    title: "Reload browser page",
    description: "Browser",
    group: "Browser",
    when: "browserFocus",
    keys: ["Mod+R", "F5"],
  },
  {
    id: "browser.hard-reload",
    title: "Force reload browser page",
    description: "Browser",
    group: "Browser",
    when: "browserFocus",
    keys: ["Mod+Shift+R", "Shift+F5"],
  },
  {
    id: "overlay.close",
    title: "Close overlay",
    description: "Panels and overlays",
    group: "Lightcode",
    when: "panelFocus",
    keys: ["Escape"],
  },
  {
    id: "git.submit-form",
    title: "Submit Git form",
    description: "Commit, PR, and review composers",
    group: "Git",
    when: "panelFocus",
    keys: ["Mod+Enter"],
  },
];

export function buildShortcutRows(
  commands: AppCommand[],
  keybindings: readonly KeybindingEntry[],
  platform: PlatformName,
): ShortcutRow[] {
  const bindingsByCommand = new Map<string, KeybindingEntry[]>();
  for (const binding of keybindings) {
    const existing = bindingsByCommand.get(binding.command);
    if (existing) existing.push(binding);
    else bindingsByCommand.set(binding.command, [binding]);
  }

  const knownCommandIds = new Set(commands.map((command) => command.id));
  const commandRows = commands.map((command) => {
    const bindings = bindingsByCommand.get(command.id) ?? [];
    const contexts = contextsForCommand(command, bindings);
    const bound = formatBindings(bindings, platform);
    const keys =
      bound.length > 0
        ? bound
        : (command.keys ?? []).map((key) => formatKeybinding(key, platform) || key);
    return rowWithSearchText({
      id: command.id,
      title: command.title,
      description: command.subtitle ?? command.group,
      group: command.group,
      contexts,
      keys,
    });
  });

  const customRows = keybindings
    .filter((binding) => !knownCommandIds.has(binding.command))
    .map((binding) =>
      rowWithSearchText({
        id: `custom:${binding.command}:${binding.key ?? binding.mac ?? binding.windows ?? binding.linux ?? ""}`,
        title: binding.command,
        description: "Custom",
        group: "Custom",
        contexts: contextsForWhen(binding.when, "Custom", binding.command),
        keys: formatBindings([binding], platform),
      }),
    );

  const localRows = LOCAL_SHORTCUTS.map((shortcut) =>
    rowWithSearchText({
      ...shortcut,
      contexts: contextsForWhen(shortcut.when, shortcut.group, shortcut.id),
      keys: shortcut.keys.map((key) => formatKeybinding(key, platform) || key),
    }),
  );

  return [...commandRows, ...customRows, ...localRows].sort((a, b) => {
    const groupCompare = a.group.localeCompare(b.group);
    return groupCompare === 0 ? a.title.localeCompare(b.title) : groupCompare;
  });
}

export function countRowsForContext(
  rows: readonly ShortcutRow[],
  context: ShortcutContext,
): number {
  return rows.filter((row) => row.contexts.includes(context)).length;
}

export function labelForContext(context: ShortcutContext): string {
  return SHORTCUT_CONTEXTS.find((item) => item.id === context)?.label ?? context;
}

function rowWithSearchText(row: Omit<ShortcutRow, "searchText">): ShortcutRow {
  return {
    ...row,
    searchText: [
      row.title,
      row.description,
      row.group,
      row.keys.join(" "),
      row.contexts.map(labelForContext).join(" "),
    ]
      .join(" ")
      .toLowerCase(),
  };
}

function formatBindings(bindings: readonly KeybindingEntry[], platform: PlatformName): string[] {
  const formatted = new Set<string>();
  for (const binding of bindings) {
    const raw = bindingForPlatform(binding, platform);
    const key = formatKeybinding(raw, platform);
    if (key) formatted.add(key);
  }
  return [...formatted];
}

function contextsForCommand(
  command: AppCommand,
  bindings: readonly KeybindingEntry[],
): ShortcutContext[] {
  const when = [command.when, ...bindings.map((binding) => binding.when)]
    .filter((item): item is string => Boolean(item))
    .join(" ");
  return contextsForWhen(when, command.group, command.id);
}

function contextsForWhen(
  when: string | undefined,
  group: string,
  commandId: string,
): ShortcutContext[] {
  const text = `${when ?? ""} ${group} ${commandId}`.toLowerCase();
  const contexts = new Set<ShortcutContext>();

  if (!when || text.includes("!inputfocus")) contexts.add("global");
  if (hasPositiveToken(text, "composerfocus") || hasPositiveToken(text, "inputfocus")) {
    contexts.add("composer");
  }
  if (
    hasPositiveToken(text, "panelfocus") ||
    commandId === "files.open" ||
    commandId === "git.open"
  ) {
    contexts.add("panel");
  }
  if (
    hasPositiveToken(text, "editorfocus") ||
    hasPositiveToken(text, "editoropen") ||
    group === "Editor"
  ) {
    contexts.add("editor");
  }
  if (
    hasPositiveToken(text, "terminalfocus") ||
    hasPositiveToken(text, "terminalopen") ||
    group === "Terminal"
  ) {
    contexts.add("terminal");
  }
  if (hasPositiveToken(text, "browserfocus") || group === "Browser") contexts.add("browser");
  if (hasPositiveToken(text, "hasproject") || group === "Project" || group === "Scripts") {
    contexts.add("project");
  }
  if (
    hasPositiveToken(text, "threadview") ||
    hasPositiveToken(text, "hasthread") ||
    group === "Thread"
  ) {
    contexts.add("thread");
  }

  return contexts.size > 0 ? [...contexts] : ["global"];
}

function hasPositiveToken(text: string, token: string): boolean {
  const matcher = new RegExp(`(^|[^a-z0-9_.-])${token}([^a-z0-9_.-]|$)`, "g");
  for (const match of text.matchAll(matcher)) {
    const prefixLength = match[1]?.length ?? 0;
    const tokenStart = (match.index ?? 0) + prefixLength;
    const previous = text.slice(0, tokenStart).trimEnd().at(-1);
    if (previous !== "!") return true;
  }
  return false;
}

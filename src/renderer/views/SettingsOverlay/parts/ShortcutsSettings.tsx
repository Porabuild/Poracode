import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import type { KeybindingEntry } from "@/shared/keybindings";
import { readBridge } from "@/renderer/bridge";
import { Input, LightballTabs, type LightballTab } from "@/renderer/components/common";
import { useKeybindingStore } from "@/renderer/commands/keybindingStore";
import { bindingForPlatform, formatKeybinding } from "@/renderer/commands/keybindingMatcher";
import { buildCommandRegistry, type AppCommand } from "@/renderer/commands/registry";
import type { PlatformName } from "@/renderer/commands/keybindingMatcher";
import { SettingsPage } from "./SettingsForm";

const SHORTCUT_CONTEXTS = [
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

type ShortcutContext = (typeof SHORTCUT_CONTEXTS)[number]["id"];

interface ShortcutRow {
  id: string;
  title: string;
  description: string;
  group: string;
  contexts: ShortcutContext[];
  keys: string[];
  searchText: string;
}

interface BuiltInShortcut {
  id: string;
  title: string;
  description: string;
  group: string;
  contexts: ShortcutContext[];
  keys: string[];
}

const BUILT_IN_SHORTCUTS: BuiltInShortcut[] = [
  {
    id: "composer.send",
    title: "Send message",
    description: "Composer",
    group: "Composer",
    contexts: ["composer"],
    keys: ["Enter"],
  },
  {
    id: "composer.new-line",
    title: "New line",
    description: "Composer",
    group: "Composer",
    contexts: ["composer"],
    keys: ["Shift+Enter"],
  },
  {
    id: "composer.toggle-work-plan",
    title: "Toggle Work or Plan",
    description: "Composer controls",
    group: "Composer",
    contexts: ["composer"],
    keys: ["Shift+Tab"],
  },
  {
    id: "composer.cycle-effort",
    title: "Cycle reasoning effort",
    description: "Composer controls",
    group: "Composer",
    contexts: ["composer"],
    keys: ["Mod+T"],
  },
  {
    id: "composer.toggle-fast",
    title: "Toggle Fast mode",
    description: "Composer controls",
    group: "Composer",
    contexts: ["composer"],
    keys: ["Mod+F"],
  },
  {
    id: "composer.cycle-permission",
    title: "Cycle permission mode",
    description: "Composer controls",
    group: "Composer",
    contexts: ["composer"],
    keys: ["Mod+P"],
  },
  {
    id: "composer.open-model-picker",
    title: "Open model picker",
    description: "Composer controls",
    group: "Composer",
    contexts: ["composer"],
    keys: ["Mod+M"],
  },
  {
    id: "terminal.copy",
    title: "Copy selection",
    description: "Terminal",
    group: "Terminal",
    contexts: ["terminal"],
    keys: ["Mod+C"],
  },
  {
    id: "terminal.paste",
    title: "Paste",
    description: "Terminal",
    group: "Terminal",
    contexts: ["terminal"],
    keys: ["Mod+V"],
  },
  {
    id: "browser.reload",
    title: "Reload browser page",
    description: "Browser",
    group: "Browser",
    contexts: ["browser", "panel"],
    keys: ["Mod+R", "F5"],
  },
  {
    id: "browser.hard-reload",
    title: "Force reload browser page",
    description: "Browser",
    group: "Browser",
    contexts: ["browser", "panel"],
    keys: ["Mod+Shift+R"],
  },
  {
    id: "editor.close-tab",
    title: "Close editor tab",
    description: "Editor",
    group: "Editor",
    contexts: ["editor"],
    keys: ["Mod+W"],
  },
  {
    id: "review.submit-comment",
    title: "Submit PR comment",
    description: "Review composer",
    group: "Git",
    contexts: ["panel", "project"],
    keys: ["Mod+Enter"],
  },
];

export function ShortcutsSettings() {
  const [query, setQuery] = useState("");
  const [activeContext, setActiveContext] = useState<ShortcutContext>("all");
  const keybindings = useKeybindingStore((state) => state.keybindings);
  const loaded = useKeybindingStore((state) => state.loaded);
  const loadKeybindings = useKeybindingStore((state) => state.load);
  const platform = readBridge().platform;

  useEffect(() => {
    if (loaded) return;
    void loadKeybindings().catch((error) => {
      console.error("[renderer] failed to load keybindings:", error);
    });
  }, [loadKeybindings, loaded]);

  const rows = buildShortcutRows(buildCommandRegistry(), keybindings, platform);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleRows = rows.filter((row) => {
    if (activeContext !== "all" && !row.contexts.includes(activeContext)) return false;
    if (!normalizedQuery) return true;
    return row.searchText.includes(normalizedQuery);
  });
  const tabs: LightballTab<ShortcutContext>[] = SHORTCUT_CONTEXTS.map((context) => ({
    id: context.id,
    label: context.label,
    trailing: context.id === "all" ? rows.length : countRowsForContext(rows, context.id),
  }));

  return (
    <SettingsPage title="Shortcuts" bodyClassName="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted" />
        <Input
          aria-label="Search shortcuts"
          className="w-full pl-9"
          placeholder="Search shortcuts"
          value={query}
          variant="secondary"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <LightballTabs
        ariaLabel="Shortcut contexts"
        active={activeContext}
        className="max-w-full overflow-x-auto"
        tabs={tabs}
        onChange={setActiveContext}
        shape="rounded"
      />

      <div className="overflow-hidden rounded-md border border-[color:var(--border)]">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(128px,190px)] gap-3 border-b border-[color:var(--border)] bg-foreground/[0.03] px-4 py-2 text-[11px] font-semibold uppercase text-muted">
          <span>Command</span>
          <span>Keybinding</span>
        </div>
        {visibleRows.length > 0 ? (
          visibleRows.map((row) => <ShortcutRowView key={row.id} row={row} />)
        ) : (
          <div className="px-4 py-8 text-center text-sm text-muted">No shortcuts found</div>
        )}
      </div>
    </SettingsPage>
  );
}

function ShortcutRowView(props: { row: ShortcutRow }) {
  const { row } = props;
  const contexts = row.contexts.filter((context) => context !== "all");
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(128px,190px)] gap-3 border-b border-[color:var(--border)] px-4 py-3 last:border-b-0">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-foreground">{row.title}</div>
        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted">
          <span className="truncate">{row.description}</span>
          {contexts.map((context) => (
            <span
              key={context}
              className="rounded border border-[color:var(--border)] px-1.5 py-0.5 text-[10px] uppercase text-muted/80"
            >
              {labelForContext(context)}
            </span>
          ))}
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 self-center">
        {row.keys.length > 0 ? (
          row.keys.map((key) => (
            <span
              key={key}
              className="rounded-md bg-foreground/[0.08] px-1.5 py-0.5 font-mono text-[11px] text-foreground/90"
            >
              {key}
            </span>
          ))
        ) : (
          <span className="text-xs text-muted">Unassigned</span>
        )}
      </div>
    </div>
  );
}

function buildShortcutRows(
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
    const keys = formatBindings(bindings, platform);
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

  const builtInRows = BUILT_IN_SHORTCUTS.map((shortcut) =>
    rowWithSearchText({
      ...shortcut,
      keys: shortcut.keys.map((key) => formatKeybinding(key, platform) || key),
    }),
  );

  return [...commandRows, ...customRows, ...builtInRows].sort((a, b) => {
    const groupCompare = a.group.localeCompare(b.group);
    return groupCompare === 0 ? a.title.localeCompare(b.title) : groupCompare;
  });
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

function countRowsForContext(rows: readonly ShortcutRow[], context: ShortcutContext): number {
  return rows.filter((row) => row.contexts.includes(context)).length;
}

function labelForContext(context: ShortcutContext): string {
  return SHORTCUT_CONTEXTS.find((item) => item.id === context)?.label ?? context;
}

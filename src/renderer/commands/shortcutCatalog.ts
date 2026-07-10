import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import type { KeybindingEntry } from "@/shared/keybindings";
import { DEFAULT_KEYBINDINGS, QUICK_COMPOSER_COMMAND_ID } from "@/shared/keybindings";
import { COMPOSER_CONTROL_COMMANDS } from "./composerCommands";
import { bindingForPlatform, formatKeybinding, type PlatformName } from "./keybindingMatcher";
import type { AppCommand } from "./registry";

export type ResolveLabel = (value: string | MessageDescriptor) => string;

export const SHORTCUT_CONTEXTS = [
  { id: "all", label: msg`All` },
  { id: "global", label: msg`Global` },
  { id: "composer", label: msg`Composer` },
  { id: "panel", label: msg`Panel` },
  { id: "editor", label: msg`Editor` },
  { id: "terminal", label: msg`Terminal` },
  { id: "browser", label: msg`Browser` },
  { id: "project", label: msg`Project` },
  { id: "thread", label: msg`Thread` },
] as const;

export type ShortcutContext = (typeof SHORTCUT_CONTEXTS)[number]["id"];

/**
 * Sections that split the flat shortcut list into groups. Each row belongs to
 * exactly one section (derived from its canonical group token), so — unlike
 * {@link SHORTCUT_CONTEXTS}, where a row can match several contexts — sections
 * never duplicate a command. `groups` lists the canonical (English) group
 * tokens that map into the section. Order here is the render/nav order.
 */
export const SHORTCUT_SECTIONS = [
  { id: "composer", label: msg`Composer`, groups: ["Composer"] },
  { id: "editor", label: msg`Editor`, groups: ["Editor"] },
  { id: "terminal", label: msg`Terminal`, groups: ["Terminal"] },
  { id: "browser", label: msg`Browser`, groups: ["Browser"] },
  { id: "git", label: msg`Git`, groups: ["Git"] },
  { id: "project", label: msg`Project`, groups: ["Project"] },
  { id: "thread", label: msg`Thread`, groups: ["Thread"] },
  { id: "scripts", label: msg`Scripts`, groups: ["Scripts"] },
  { id: "general", label: msg`General`, groups: ["Poracode"] },
  { id: "custom", label: msg`Custom`, groups: ["Custom"] },
] as const;

export type ShortcutSection = (typeof SHORTCUT_SECTIONS)[number]["id"];

export interface ShortcutRow {
  id: string;
  title: string;
  description: string;
  group: string;
  section: ShortcutSection;
  contexts: ShortcutContext[];
  keys: string[];
  searchText: string;
  /**
   * The command id a binding would target. Present for rows backed by the
   * keybinding system (registry commands + custom bindings); `null` for built-in
   * shortcuts that live in component handlers and can't be rebound.
   */
  commandId: string | null;
  /** Whether the user can add/remove/reset this row's keybindings. */
  editable: boolean;
  /** The raw keybinding-file entries backing this row (for the editor). */
  bindings: KeybindingEntry[];
  /** The shipped default entries for this command, used by reset-to-default. */
  defaultBindings: KeybindingEntry[];
  /**
   * `when` clause to copy onto a newly recorded binding so it inherits the
   * command's input-safety guards (e.g. `!inputFocus`). `null` ⇒ rely on the
   * command's own `when`.
   */
  whenTemplate: string | null;
}

interface LocalShortcut {
  id: string;
  title: MessageDescriptor;
  description: MessageDescriptor;
  /**
   * Canonical (English) grouping token. Never displayed — it only feeds context
   * detection in {@link contextsForWhen} and row sorting, so it stays
   * locale-independent. The displayed strings are `title` and `description`.
   */
  group: string;
  when?: string;
  keys: string[];
}

export const LOCAL_SHORTCUTS: readonly LocalShortcut[] = [
  {
    id: "composer.send",
    title: msg`Send message`,
    description: msg`Composer`,
    group: "Composer",
    when: "composerFocus",
    keys: ["Enter"],
  },
  {
    id: "composer.new-line",
    title: msg`New line`,
    description: msg`Composer`,
    group: "Composer",
    when: "composerFocus",
    keys: ["Shift+Enter"],
  },
  {
    id: "terminal.copy",
    title: msg`Copy selection`,
    description: msg`Terminal`,
    group: "Terminal",
    when: "terminalFocus",
    keys: ["Mod+C"],
  },
  {
    id: "terminal.paste",
    title: msg`Paste`,
    description: msg`Terminal`,
    group: "Terminal",
    when: "terminalFocus",
    keys: ["Mod+V"],
  },
  {
    id: "browser.reload",
    title: msg`Reload browser page`,
    description: msg`Browser`,
    group: "Browser",
    when: "browserFocus",
    keys: ["Mod+R", "F5"],
  },
  {
    id: "browser.hard-reload",
    title: msg`Force reload browser page`,
    description: msg`Browser`,
    group: "Browser",
    when: "browserFocus",
    keys: ["Mod+Shift+R", "Shift+F5"],
  },
  {
    id: "browser.back",
    title: msg`Back`,
    description: msg`Go back in navigation history`,
    group: "Browser",
    when: "browserFocus",
    keys: ["Mod+["],
  },
  {
    id: "browser.forward",
    title: msg`Forward`,
    description: msg`Go forward in navigation history`,
    group: "Browser",
    when: "browserFocus",
    keys: ["Mod+]"],
  },
  {
    id: "overlay.close",
    title: msg`Close overlay`,
    description: msg`Panels and overlays`,
    group: "Poracode",
    when: "panelFocus",
    keys: ["Escape"],
  },
  {
    id: "git.submit-form",
    title: msg`Submit Git form`,
    description: msg`Commit, PR, and review composers`,
    group: "Git",
    when: "panelFocus",
    keys: ["Mod+Enter"],
  },
];

const SYSTEM_SHORTCUTS = [
  {
    id: QUICK_COMPOSER_COMMAND_ID,
    title: msg`Toggle Quick Composer`,
    description: msg`Global`,
  },
] as const;

const DEFAULT_BINDINGS_BY_COMMAND = new Map<string, KeybindingEntry[]>();
for (const binding of DEFAULT_KEYBINDINGS.keybindings) {
  const existing = DEFAULT_BINDINGS_BY_COMMAND.get(binding.command);
  if (existing) existing.push(binding);
  else DEFAULT_BINDINGS_BY_COMMAND.set(binding.command, [binding]);
}

export function buildShortcutRows(
  commands: AppCommand[],
  keybindings: readonly KeybindingEntry[],
  platform: PlatformName,
  resolve: ResolveLabel,
): ShortcutRow[] {
  const bindingsByCommand = new Map<string, KeybindingEntry[]>();
  for (const binding of keybindings) {
    const existing = bindingsByCommand.get(binding.command);
    if (existing) existing.push(binding);
    else bindingsByCommand.set(binding.command, [binding]);
  }

  // Treat composer-control ids as "known" so their store entries don't also
  // surface as generic custom rows — they get their own editable rows below.
  const knownCommandIds = new Set([
    ...commands.map((command) => command.id),
    ...COMPOSER_CONTROL_COMMANDS.map((command) => command.id),
    ...SYSTEM_SHORTCUTS.map((command) => command.id),
  ]);
  const commandRows = commands
    .filter((command) => command.showInShortcuts !== false)
    .map((command) => {
      const bindings = bindingsByCommand.get(command.id) ?? [];
      const defaultBindings = DEFAULT_BINDINGS_BY_COMMAND.get(command.id) ?? [];
      const group = resolve(command.group);
      // Context and section detection match canonical English group tokens (e.g.
      // `group === "Editor"`), so feed them the source label — not the translated
      // `group` above, which would never match `===` in a non-English locale.
      const canonicalGroup = canonicalLabel(command.group);
      const contexts = contextsForCommand(command, bindings, canonicalGroup);
      const bound = formatBindings(bindings, platform);
      const keys =
        bound.length > 0
          ? bound
          : (command.keys ?? []).map((key) => formatKeybinding(key, platform) || key);
      return rowWithSearchText(
        {
          id: command.id,
          title: resolve(command.title),
          description: resolve(command.subtitle ?? command.group),
          group,
          section: sectionForGroup(canonicalGroup),
          contexts,
          keys,
          commandId: command.id,
          editable: true,
          bindings,
          defaultBindings,
          whenTemplate: bindings[0]?.when ?? defaultBindings[0]?.when ?? null,
        },
        resolve,
      );
    });

  const customRows = keybindings
    .filter((binding) => !knownCommandIds.has(binding.command))
    .filter((binding) => !isProjectScriptCommandId(binding.command))
    .map((binding) =>
      rowWithSearchText(
        {
          id: `custom:${binding.command}:${binding.key ?? binding.mac ?? binding.windows ?? binding.linux ?? ""}`,
          title: binding.command,
          description: resolve(msg`Custom`),
          group: "Custom",
          section: "custom",
          contexts: contextsForWhen(binding.when, "Custom", binding.command),
          keys: formatBindings([binding], platform),
          commandId: binding.command,
          editable: true,
          bindings: [binding],
          defaultBindings: [],
          whenTemplate: binding.when ?? null,
        },
        resolve,
      ),
    );

  // Composer controls and system (global) shortcuts are rebindable (store-backed)
  // but dispatched outside the command registry — the focused composer handles
  // the former, the main process the latter — so build their editable rows here.
  const buildRebindableRow = (
    command: {
      id: string;
      title: string | MessageDescriptor;
      description: string | MessageDescriptor;
    },
    extra: (context: {
      bindings: KeybindingEntry[];
      defaultBindings: KeybindingEntry[];
    }) => Pick<ShortcutRow, "group" | "section" | "contexts" | "whenTemplate">,
  ): ShortcutRow => {
    const bindings = bindingsByCommand.get(command.id) ?? [];
    const defaultBindings = DEFAULT_BINDINGS_BY_COMMAND.get(command.id) ?? [];
    const bound = formatBindings(bindings, platform);
    const keys = bound.length > 0 ? bound : formatBindings(defaultBindings, platform);
    return rowWithSearchText(
      {
        id: command.id,
        title: resolve(command.title),
        description: resolve(command.description),
        keys,
        commandId: command.id,
        editable: true,
        bindings,
        defaultBindings,
        ...extra({ bindings, defaultBindings }),
      },
      resolve,
    );
  };

  const composerRows = COMPOSER_CONTROL_COMMANDS.map((command) =>
    buildRebindableRow(command, ({ bindings, defaultBindings }) => ({
      group: resolve(msg`Composer`),
      section: "composer",
      contexts: contextsForWhen("composerFocus", "Composer", command.id),
      whenTemplate: bindings[0]?.when ?? defaultBindings[0]?.when ?? "composerFocus",
    })),
  );

  const systemRows = SYSTEM_SHORTCUTS.map((command) =>
    buildRebindableRow(command, () => ({
      group: "Poracode",
      section: "general",
      contexts: ["global"],
      whenTemplate: null,
    })),
  );

  const localRows = LOCAL_SHORTCUTS.map((shortcut) =>
    rowWithSearchText(
      {
        id: shortcut.id,
        title: resolve(shortcut.title),
        description: resolve(shortcut.description),
        group: shortcut.group,
        section: sectionForGroup(shortcut.group),
        contexts: contextsForWhen(shortcut.when, shortcut.group, shortcut.id),
        keys: shortcut.keys.map((key) => formatKeybinding(key, platform) || key),
        commandId: null,
        editable: false,
        bindings: [],
        defaultBindings: [],
        whenTemplate: null,
      },
      resolve,
    ),
  );

  return [...commandRows, ...customRows, ...composerRows, ...systemRows, ...localRows].sort(
    (a, b) => {
      const groupCompare = a.group.localeCompare(b.group);
      return groupCompare === 0 ? a.title.localeCompare(b.title) : groupCompare;
    },
  );
}

export function labelForContext(context: ShortcutContext): string | MessageDescriptor {
  return SHORTCUT_CONTEXTS.find((item) => item.id === context)?.label ?? context;
}

export function isProjectScriptCommandId(commandId: string): boolean {
  return /^script\..+\.run$/.test(commandId);
}

const SECTION_BY_GROUP = new Map<string, ShortcutSection>();
for (const section of SHORTCUT_SECTIONS) {
  for (const group of section.groups) SECTION_BY_GROUP.set(group.toLowerCase(), section.id);
}

/** Map a canonical (English) group token to its section. Unknown groups fall
 * into "general" so a newly added command is never silently dropped. */
function sectionForGroup(group: string): ShortcutSection {
  return SECTION_BY_GROUP.get(group.trim().toLowerCase()) ?? "general";
}

export interface ShortcutSectionGroup {
  id: ShortcutSection;
  label: string | MessageDescriptor;
  rows: ShortcutRow[];
}

/**
 * Bucket rows into {@link SHORTCUT_SECTIONS} order, dropping empty sections and
 * sorting each section's rows by title. Feed it the already-filtered rows so the
 * section nav and list reflect the active search.
 */
export function groupRowsBySection(rows: readonly ShortcutRow[]): ShortcutSectionGroup[] {
  return SHORTCUT_SECTIONS.map((section) => ({
    id: section.id,
    label: section.label,
    rows: rows
      .filter((row) => row.section === section.id)
      .sort((a, b) => a.title.localeCompare(b.title)),
  })).filter((section) => section.rows.length > 0);
}

function rowWithSearchText(
  row: Omit<ShortcutRow, "searchText">,
  resolve: ResolveLabel,
): ShortcutRow {
  return {
    ...row,
    searchText: [
      row.title,
      row.description,
      row.group,
      row.keys.join(" "),
      row.contexts.map((context) => resolve(labelForContext(context))).join(" "),
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

/**
 * The canonical (English) source text of a label, independent of the active
 * locale. `contextsForWhen` matches group tokens with `===` against English
 * literals, so it must receive the source string rather than the translated
 * display label — otherwise context detection silently fails in non-English
 * locales. A `MessageDescriptor` carries its source as `message` (and, under
 * this catalog's message-as-id scheme, `id`); plain strings are already source.
 */
function canonicalLabel(value: string | MessageDescriptor): string {
  if (typeof value === "string") return value;
  return value.message ?? String(value.id ?? "");
}

function contextsForCommand(
  command: AppCommand,
  bindings: readonly KeybindingEntry[],
  group: string,
): ShortcutContext[] {
  const when = [command.when, ...bindings.map((binding) => binding.when)]
    .filter((item): item is string => Boolean(item))
    .join(" ");
  return contextsForWhen(when, group, command.id);
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

import { z } from "zod";

export const keybindingEntrySchema = z.object({
  command: z.string().min(1),
  key: z.string().min(1).optional(),
  mac: z.string().min(1).optional(),
  windows: z.string().min(1).optional(),
  linux: z.string().min(1).optional(),
  when: z.string().min(1).optional(),
  args: z.unknown().optional(),
});
export type KeybindingEntry = z.infer<typeof keybindingEntrySchema>;

export const keybindingsFileSchema = z.object({
  version: z.literal(1).default(1),
  keybindings: z.array(keybindingEntrySchema).default([]),
});
export type KeybindingsFile = z.infer<typeof keybindingsFileSchema>;

export interface KeybindingsConfig {
  path: string;
  file: KeybindingsFile;
}

const NOT_TYPING =
  "!inputFocus && !editorFocus && !terminalFocus && !composerFocus && !panelFocus && !browserFocus";

/**
 * Composer-control commands. Unlike the rest of {@link DEFAULT_KEYBINDINGS},
 * these are not dispatched by the global keyboard hook — the focused composer's
 * local `onInterceptKey` handler resolves the pressed chord against the store
 * and runs the matching action (it needs the composer's live controls). They
 * still live in keybindings.json so they're user-rebindable from the Shortcuts
 * settings. {@link COMPOSER_CONTROL_COMMAND_IDS} drives the additive migration
 * that backfills these entries into pre-existing keybinding files.
 */
export const COMPOSER_CONTROL_COMMAND_IDS = [
  "composer.toggle-work-plan",
  "composer.cycle-effort",
  "composer.toggle-fast",
  "composer.cycle-permission",
  "composer.open-model-picker",
  "composer.start-dictation",
] as const;

/**
 * Command ids whose default bindings are backfilled into pre-existing keybinding
 * files (additive migration in `keybindingsFile`). Only safe for ids that never
 * shipped a default binding before this list adopted them — no user file could
 * hold an entry for them, so the backfill can never resurrect a deliberately
 * cleared binding. Includes {@link COMPOSER_CONTROL_COMMAND_IDS} plus the
 * `thread.new`/`thread.new.panel` shortcuts, `sidebar.toggle`, `files.toggle`,
 * `thread.rename`, `thread.next`/`thread.previous`, `project.add`, `find.open`,
 * `browser.toggle`, `browser.tab.new`, `tab.next`/`tab.previous`, and
 * `thread.recent.next`/`thread.recent.previous`, which gained their first
 * defaults here.
 */
export const BACKFILL_COMMAND_IDS = [
  ...COMPOSER_CONTROL_COMMAND_IDS,
  "thread.new",
  "thread.new.panel",
  "sidebar.toggle",
  "files.toggle",
  "thread.rename",
  "thread.next",
  "thread.previous",
  "project.add",
  "find.open",
  "browser.toggle",
  "browser.tab.new",
  "tab.next",
  "tab.previous",
  "thread.recent.next",
  "thread.recent.previous",
] as const;

/**
 * `composer.toggle-fast` originally shipped on Ctrl+F / ⌘F. That chord now
 * belongs to the surface-wide {@link DEFAULT_KEYBINDINGS} `find.open` (Find /
 * Ctrl+F), so the default Fast-mode toggle moved to Ctrl+Shift+F / ⌘⇧F. The
 * keybindings-file migration rekeys any pre-existing entry that still matches
 * the old default; entries the user customized to something else are left
 * untouched. See `keybindingsFile.migrateToggleFastOffFind`.
 */
export const TOGGLE_FAST_LEGACY_DEFAULT = { key: "Ctrl+F", mac: "Meta+F" } as const;
export const TOGGLE_FAST_DEFAULT = { key: "Ctrl+Shift+F", mac: "Meta+Shift+F" } as const;

export const DEFAULT_KEYBINDINGS: KeybindingsFile = {
  version: 1,
  keybindings: [
    {
      command: "palette.open",
      key: "Ctrl+Shift+P",
      mac: "Meta+Shift+P",
    },
    {
      command: "palette.open",
      key: "Ctrl+K",
      mac: "Meta+K",
    },
    {
      command: "settings.open",
      key: "Ctrl+,",
      mac: "Meta+,",
    },
    {
      command: "find.open",
      key: "Ctrl+F",
      mac: "Meta+F",
    },
    {
      command: "sidebar.toggle",
      key: "Ctrl+B",
      mac: "Meta+B",
      when: NOT_TYPING,
    },
    {
      command: "files.open",
      key: "Ctrl+P",
      mac: "Meta+P",
      when: NOT_TYPING,
    },
    {
      command: "files.toggle",
      key: "Ctrl+Shift+E",
      mac: "Meta+Shift+E",
      when: "hasProject",
    },
    {
      command: "thread.search.open",
      key: "Ctrl+G",
      mac: "Meta+G",
      when: NOT_TYPING,
    },
    {
      command: "git.open",
      key: "Ctrl+Shift+G",
      mac: "Meta+Shift+G",
      when: "hasProject",
    },
    {
      command: "project.add",
      key: "Ctrl+O",
      mac: "Meta+O",
    },
    {
      command: "terminal.toggle",
      key: "Ctrl+`",
      when: "hasProject",
    },
    {
      command: "pane.close",
      key: "Ctrl+W",
      mac: "Meta+W",
      when: `threadView && ${NOT_TYPING}`,
    },
    {
      command: "editor.save",
      key: "Ctrl+S",
      mac: "Meta+S",
      when: "editorFocus",
    },
    {
      command: "thread.archive",
      key: "Ctrl+Shift+A",
      mac: "Meta+Shift+A",
      when: "hasThread && (sidebarFocus || panelFocus)",
    },
    {
      command: "thread.new",
      key: "Ctrl+N",
      mac: "Meta+N",
      when: "hasProject",
    },
    {
      command: "thread.new",
      key: "Ctrl+Shift+O",
      mac: "Meta+Shift+O",
      when: "hasProject",
    },
    {
      command: "thread.new.panel",
      key: "Ctrl+Alt+N",
      mac: "Meta+Alt+N",
      when: "hasProject",
    },
    {
      command: "browser.focus-address-bar",
      key: "Ctrl+L",
      mac: "Meta+L",
      when: "browserFocus",
    },
    {
      command: "browser.toggle",
      key: "Ctrl+Shift+B",
      mac: "Meta+Shift+B",
      when: NOT_TYPING,
    },
    {
      command: "browser.tab.new",
      key: "Ctrl+T",
      mac: "Meta+T",
      when: "browserFocus",
    },
    {
      command: "thread.star",
      key: "Ctrl+Alt+P",
      mac: "Meta+Alt+P",
      when: "((hasThread && (sidebarFocus || panelFocus)) || draftView) && !inputFocus && !editorFocus && !terminalFocus && !composerFocus && !browserFocus",
    },
    {
      command: "thread.rename",
      key: "Ctrl+Alt+R",
      mac: "Meta+Alt+R",
      when: "hasThread && (sidebarFocus || panelFocus)",
    },
    {
      command: "thread.next",
      key: "Ctrl+Shift+]",
      mac: "Meta+Shift+]",
      when: "hasThread && !editorFocus && !terminalFocus && !browserFocus",
    },
    {
      command: "thread.next",
      key: "Ctrl+PageDown",
      mac: "Meta+PageDown",
      when: "hasThread && !editorFocus && !terminalFocus && !browserFocus",
    },
    {
      command: "thread.previous",
      key: "Ctrl+Shift+[",
      mac: "Meta+Shift+[",
      when: "hasThread && !editorFocus && !terminalFocus && !browserFocus",
    },
    {
      command: "thread.previous",
      key: "Ctrl+PageUp",
      mac: "Meta+PageUp",
      when: "hasThread && !editorFocus && !terminalFocus && !browserFocus",
    },
    // Recently-viewed (MRU) chat switching. Ctrl+Tab is also tab.next's chord, but
    // in the disjoint editor/terminal scope; here it stays free in the chat shell.
    // Cmd+Tab is the macOS app switcher, so these stay on Ctrl even on mac.
    {
      command: "thread.recent.next",
      key: "Ctrl+Tab",
      mac: "Ctrl+Tab",
      when: "hasThread && !editorFocus && !terminalFocus && !browserFocus",
    },
    {
      command: "thread.recent.previous",
      key: "Ctrl+Shift+Tab",
      mac: "Ctrl+Shift+Tab",
      when: "hasThread && !editorFocus && !terminalFocus && !browserFocus",
    },
    // Tab navigation within the focused surface (editor or terminal). These reuse
    // thread.next/previous's bracket and page chords, which those commands cede
    // inside the editor/terminal (see their `when`), and add Ctrl+Tab /
    // Ctrl+Shift+Tab. Cmd+Tab is the macOS app switcher, so the Tab chords stay on
    // Ctrl even on mac.
    {
      command: "tab.next",
      key: "Ctrl+Tab",
      mac: "Ctrl+Tab",
      when: "editorFocus || terminalFocus",
    },
    {
      command: "tab.next",
      key: "Ctrl+Shift+]",
      mac: "Meta+Shift+]",
      when: "editorFocus || terminalFocus",
    },
    {
      command: "tab.next",
      key: "Ctrl+PageDown",
      mac: "Meta+PageDown",
      when: "editorFocus || terminalFocus",
    },
    {
      command: "tab.previous",
      key: "Ctrl+Shift+Tab",
      mac: "Ctrl+Shift+Tab",
      when: "editorFocus || terminalFocus",
    },
    {
      command: "tab.previous",
      key: "Ctrl+Shift+[",
      mac: "Meta+Shift+[",
      when: "editorFocus || terminalFocus",
    },
    {
      command: "tab.previous",
      key: "Ctrl+PageUp",
      mac: "Meta+PageUp",
      when: "editorFocus || terminalFocus",
    },
    {
      command: "composer.toggle-work-plan",
      key: "Shift+Tab",
      when: "composerFocus",
    },
    {
      command: "composer.cycle-effort",
      key: "Ctrl+T",
      mac: "Meta+T",
      when: "composerFocus",
    },
    {
      command: "composer.toggle-fast",
      ...TOGGLE_FAST_DEFAULT,
      when: "composerFocus",
    },
    {
      command: "composer.cycle-permission",
      key: "Ctrl+P",
      mac: "Meta+P",
      when: "composerFocus",
    },
    {
      command: "composer.open-model-picker",
      key: "Ctrl+M",
      mac: "Meta+M",
      when: "composerFocus",
    },
    {
      command: "composer.start-dictation",
      key: "Ctrl+Shift+D",
      mac: "Meta+Shift+D",
      when: "composerFocus",
    },
  ],
};

export function serializeDefaultKeybindings(): string {
  return `${JSON.stringify(DEFAULT_KEYBINDINGS, null, 2)}\n`;
}

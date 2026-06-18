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
      command: "files.open",
      key: "Ctrl+P",
      mac: "Meta+P",
      when: NOT_TYPING,
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
  ],
};

export function serializeDefaultKeybindings(): string {
  return `${JSON.stringify(DEFAULT_KEYBINDINGS, null, 2)}\n`;
}

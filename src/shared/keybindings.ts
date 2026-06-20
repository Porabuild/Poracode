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

export const DEFAULT_KEYBINDINGS: KeybindingsFile = {
  version: 1,
  keybindings: [
    {
      command: "palette.open",
      key: "Ctrl+Shift+P",
      mac: "Meta+Shift+P",
    },
    {
      command: "thread.search.open",
      key: "Ctrl+P",
      mac: "Meta+P",
      when: "!inputFocus && !editorFocus && !terminalFocus",
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
      when: "threadView && !inputFocus && !editorFocus && !terminalFocus",
    },
    {
      command: "editor.save",
      key: "Ctrl+S",
      mac: "Meta+S",
      when: "editorFocus",
    },
    {
      command: "star.toggle",
      key: "Ctrl+Alt+P",
      mac: "Meta+Alt+P",
      when: "(hasThread || draftView) && !inputFocus && !editorFocus && !terminalFocus",
    },
  ],
};

export function serializeDefaultKeybindings(): string {
  return `${JSON.stringify(DEFAULT_KEYBINDINGS, null, 2)}\n`;
}

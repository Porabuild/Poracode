import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";

/**
 * Keyboard tips the news line can teach. Each names an app command; a tip is
 * shown only while that command has a key binding (showing the user's current
 * keys), and "Try it" runs it when the command is available here.
 */
export interface NewsTip {
  commandId: string;
  message: MessageDescriptor;
}

export const NEWS_TIPS: readonly NewsTip[] = [
  { commandId: "palette.open", message: msg`Run any command from the command palette` },
  { commandId: "files.open", message: msg`Jump to any file in your project` },
  { commandId: "thread.new.panel", message: msg`Open a new thread side by side` },
  { commandId: "terminal.toggle", message: msg`Show or hide the terminal panel` },
  { commandId: "git.open", message: msg`Review your changes in the Git panel` },
  { commandId: "browser.toggle", message: msg`Open the built-in browser next to your chat` },
];

import type { TerminalReplayGate } from "./terminalReplayGate";
import type { FitAddon } from "@xterm/addon-fit";
import type { SearchAddon } from "@xterm/addon-search";
import type { Terminal } from "@xterm/xterm";
import type { Thread } from "@/shared/contracts";

export interface XtermPersistState {
  keepAlivePaneIds: readonly string[];
  threads: readonly Pick<Thread, "id" | "archived" | "done" | "presentationMode">[];
}

export function shouldPersistXtermInstance(terminalId: string, state: XtermPersistState): boolean {
  if (!state.keepAlivePaneIds.includes(terminalId)) return false;
  const thread = state.threads.find((candidate) => candidate.id === terminalId);
  return (
    thread !== undefined && !thread.archived && !thread.done && thread.presentationMode !== "gui"
  );
}

/**
 * Emdash-style xterm ownership: the Terminal instance outlives the React
 * surface that last attached it. Pane switch / Home parks the same screen
 * node; the next mount reattaches instead of replaying PTY bytes.
 */
export interface CachedXtermInstance {
  terminal: Terminal;
  fit: FitAddon;
  search: SearchAddon;
  screen: HTMLElement;
  /** False when the previous surface unmounted before its history read finished. */
  hydrated: boolean;
  replayGate?: TerminalReplayGate;
}

const instances = new Map<string, CachedXtermInstance>();

export function takeXtermInstance(terminalId: string): CachedXtermInstance | undefined {
  const instance = instances.get(terminalId);
  if (!instance) return undefined;
  instances.delete(terminalId);
  return instance;
}

export function stashXtermInstance(terminalId: string, instance: CachedXtermInstance): void {
  const previous = instances.get(terminalId);
  if (previous && previous !== instance) {
    previous.screen.remove();
    previous.replayGate?.dispose();
    previous.terminal.dispose();
  }
  instances.set(terminalId, instance);
}

export function createXtermScreen(): HTMLElement {
  const screen = document.createElement("div");
  screen.dataset.poracodeXtermScreen = "";
  screen.style.width = "100%";
  screen.style.height = "100%";
  return screen;
}

/** Test helper — not used in production. */
export function resetXtermInstanceCacheForTests(): void {
  for (const instance of instances.values()) {
    instance.screen.remove();
    instance.replayGate?.dispose();
    instance.terminal.dispose();
  }
  instances.clear();
}

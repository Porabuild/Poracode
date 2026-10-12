import { create } from "zustand";
import type { SideChatBootstrap } from "@/shared/ipc/sideChat";
import { retainAuxiliaryThreadId } from "@/renderer/state/auxiliaryThreadWindows";
import { usePanelStore } from "@/renderer/state/panelStore";

let release: (() => void) | undefined;
export const useSideChatPanelStore = create<{ entry: SideChatBootstrap | null }>(() => ({
  entry: null,
}));

/** Native ownership is the authority across panel/window moves and reloads. */
export function applySideChatPanel(entry: SideChatBootstrap | null): void {
  const previous = useSideChatPanelStore.getState().entry;
  if (previous?.existingThreadId !== entry?.existingThreadId) {
    release?.();
    release = entry?.existingThreadId ? retainAuxiliaryThreadId(entry.existingThreadId) : undefined;
  }
  useSideChatPanelStore.setState({ entry });
  if (entry?.id !== previous?.id || (!previous && entry)) {
    usePanelStore.setState({
      sideChatPanelOpen: entry !== null,
      ...(entry ? { rightPanelTab: "sideChat" as const } : {}),
    });
  }
}

/** Keep unsent panel text across hide/show without one IPC call per keystroke. */
export function updateSideChatPanelDraft(id: string | undefined, prompt: string): void {
  const entry = useSideChatPanelStore.getState().entry;
  if (entry && entry.id === id)
    useSideChatPanelStore.setState({ entry: { ...entry, prompt, autoStart: false } });
}

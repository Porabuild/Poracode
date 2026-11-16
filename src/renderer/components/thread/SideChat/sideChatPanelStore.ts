import { create } from "zustand";
import type { SideChatBootstrap } from "@/shared/ipc/sideChat";
import { retainAuxiliaryThreadId } from "@/renderer/state/auxiliaryThreadWindows";
import { usePanelStore } from "@/renderer/state/panelStore";

const releases = new Map<string, () => void>();
export const useSideChatPanelStore = create<{
  entry: SideChatBootstrap | null;
  entries: Record<string, SideChatBootstrap>;
  detachedIds: ReadonlySet<string>;
}>(() => ({
  entry: null,
  entries: {},
  detachedIds: new Set(),
}));

/** Native ownership is the authority across panel/window moves and reloads. */
export function applySideChatPanel(
  entry: SideChatBootstrap | null,
  panels?: SideChatBootstrap[],
  detachedIds?: string[],
): void {
  const previous = useSideChatPanelStore.getState().entry;
  const entries = panels
    ? Object.fromEntries(panels.map((panel) => [panel.source.id, panel]))
    : entry
      ? { ...useSideChatPanelStore.getState().entries, [entry.source.id]: entry }
      : {};
  const ids = new Set(
    Object.values(entries).flatMap((panel) =>
      panel.existingThreadId ? [panel.existingThreadId] : [],
    ),
  );
  for (const [id, release] of releases) {
    if (!ids.has(id)) {
      release();
      releases.delete(id);
    }
  }
  for (const id of ids) if (!releases.has(id)) releases.set(id, retainAuxiliaryThreadId(id));
  useSideChatPanelStore.setState({ entry, entries, detachedIds: new Set(detachedIds ?? []) });
  if (entry?.id !== previous?.id || (!previous && entry)) {
    usePanelStore.setState({
      sideChatPanelOpen: entry !== null,
      ...(entry ? { rightPanelTab: "sideChat" as const } : {}),
    });
  }
}

/** Keep unsent panel text and optimistic thread bindings across hide/show without one IPC call per keystroke. */
export function updateSideChatPanelDraft(
  id: string | undefined,
  prompt: string,
  selection?: SideChatBootstrap["selection"],
  segments?: SideChatBootstrap["segments"],
  existingThreadId?: string,
): void {
  const state = useSideChatPanelStore.getState();
  const entry = state.entry;
  if (entry && entry.id === id) {
    if (existingThreadId && !releases.has(existingThreadId)) {
      releases.set(existingThreadId, retainAuxiliaryThreadId(existingThreadId));
    }
    const next: SideChatBootstrap = {
      ...entry,
      prompt,
      autoStart: false,
      ...(selection ? { selection } : {}),
      ...(segments ? { segments } : {}),
      ...(existingThreadId ? { existingThreadId } : {}),
    };
    useSideChatPanelStore.setState({
      entry: next,
      entries: { ...state.entries, [entry.source.id]: next },
    });
  }
}

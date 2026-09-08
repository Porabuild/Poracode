import { create } from "zustand";

/**
 * Per-thread DOM slot inside the composer bubble row where floating chat
 * controls (the scroll-to-bottom circle) render so they share one row with the
 * composer bubbles. The row publishes its slot while mounted; a missing entry
 * means "no bubble row" and the control falls back to floating over the pane.
 */
interface ComposerBubbleSlotState {
  byThread: Record<string, HTMLElement>;
  setSlot: (threadId: string, el: HTMLElement | null) => void;
}

export const useComposerBubbleSlotStore = create<ComposerBubbleSlotState>((set) => ({
  byThread: {},
  setSlot: (threadId, el) =>
    set((state) => {
      const prev = state.byThread[threadId];
      if (el) {
        if (prev === el) return {};
        return { byThread: { ...state.byThread, [threadId]: el } };
      }
      if (!prev) return {};
      const next = { ...state.byThread };
      delete next[threadId];
      return { byThread: next };
    }),
}));

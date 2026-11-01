import { create } from "zustand";

/**
 * Per-thread DOM slots inside the composer bubble row. `control` is the
 * centered scroll-to-bottom circle; `status` is the leading live-status pill.
 * The row publishes its slots while mounted; a missing entry means "no bubble
 * row" and the pane keeps its fallback placement.
 */
export type ComposerBubbleSlotKind = "control" | "status";

interface ComposerBubbleSlotState {
  control: Record<string, HTMLElement>;
  status: Record<string, HTMLElement>;
  setSlot: (kind: ComposerBubbleSlotKind, threadId: string, el: HTMLElement | null) => void;
}

export const useComposerBubbleSlotStore = create<ComposerBubbleSlotState>((set) => ({
  control: {},
  status: {},
  setSlot: (kind, threadId, el) =>
    set((state) => {
      const prev = state[kind][threadId];
      if (el) {
        if (prev === el) return {};
        const slots = { ...state[kind], [threadId]: el };
        return kind === "control" ? { control: slots } : { status: slots };
      }
      if (!prev) return {};
      const slots = { ...state[kind] };
      delete slots[threadId];
      return kind === "control" ? { control: slots } : { status: slots };
    }),
}));

import { create } from "zustand";

/**
 * Per-thread DOM slots inside the composer bubble row. `control` is the
 * centered scroll-to-bottom circle; `status` is the leading live-status pill.
 * The row publishes its slots while mounted; a missing entry means "no bubble
 * row" and the pane keeps its fallback placement.
 *
 * `endInset` is the row's measured floating band (its height plus the gap
 * above the composer). The transcript reserves it at the scroll end so the
 * last row can never come to rest under the bubbles.
 */
export type ComposerBubbleSlotKind = "control" | "status";

interface ComposerBubbleSlotState {
  control: Record<string, HTMLElement>;
  status: Record<string, HTMLElement>;
  endInset: Record<string, number>;
  setSlot: (kind: ComposerBubbleSlotKind, threadId: string, el: HTMLElement | null) => void;
  setEndInset: (threadId: string, px: number) => void;
}

export const useComposerBubbleSlotStore = create<ComposerBubbleSlotState>((set) => ({
  control: {},
  status: {},
  endInset: {},
  setEndInset: (threadId, px) =>
    set((state) => {
      if ((state.endInset[threadId] ?? 0) === px) return {};
      const endInset = { ...state.endInset };
      if (px > 0) endInset[threadId] = px;
      else delete endInset[threadId];
      return { endInset };
    }),
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

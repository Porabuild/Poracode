import { create } from "zustand";

interface ContinueInProviderStore {
  /** Thread whose handoff dialog should open once its pane is mounted. */
  requestedThreadId: string | null;
  request: (threadId: string) => void;
  clear: (threadId: string) => void;
}

/**
 * Bridges the sidebar's "Continue in..." menu entry to the thread pane, which
 * owns the dialog. The menu can only open the thread; the pane picks the
 * request up on mount and opens the dialog itself.
 */
export const useContinueInProviderStore = create<ContinueInProviderStore>()((set) => ({
  requestedThreadId: null,
  request: (threadId) => set({ requestedThreadId: threadId }),
  clear: (threadId) =>
    set((state) => (state.requestedThreadId === threadId ? { requestedThreadId: null } : {})),
}));

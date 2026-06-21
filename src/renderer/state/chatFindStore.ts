import { create } from "zustand";
import { createFindCursorSlice, type FindCursorState } from "./findCursorSlice";

/**
 * State for the in-chat Find bar. Only one chat find session is active at a time
 * (tied to the focused pane's thread). The bar UI and the match controller both
 * read this store; the controller reports the match count back via
 * {@link FindCursorState.setMatchCount} after scanning the thread's items, and the
 * bar drives `currentIndex` through next/prev.
 */
export interface ChatFindState extends FindCursorState {
  /** Thread the find bar is currently open for, or null when closed. */
  activeThreadId: string | null;
  open: (threadId: string) => void;
  close: () => void;
}

export const useChatFindStore = create<ChatFindState>((set) => ({
  ...createFindCursorSlice<ChatFindState>(set),
  activeThreadId: null,
  open: (threadId) =>
    set((state) => ({ activeThreadId: threadId, openToken: state.openToken + 1 })),
  close: () => set((state) => (state.activeThreadId === null ? {} : { activeThreadId: null })),
}));

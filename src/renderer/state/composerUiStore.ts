import { create } from "zustand";
import type { ThreadPresentationMode } from "@/shared/contracts";

/**
 * Live composer UI state per thread, published by the mounted composer so other
 * surfaces (notably the browser element picker, which lives far from the
 * composer in the component tree) can read the *rendered* presentation mode and
 * collapsed state without re-deriving them. Entries exist only while a thread's
 * composer is mounted; a missing entry means "no live composer" and callers
 * should fall back to their default behavior.
 */
export interface ComposerUiInfo {
  presentation: ThreadPresentationMode;
  /** Whether the (terminal-native) composer is currently collapsed/hidden. */
  collapsed: boolean;
}

interface ComposerUiState {
  byThread: Record<string, ComposerUiInfo>;
  setComposerUi: (threadId: string, info: ComposerUiInfo) => void;
  clearComposerUi: (threadId: string) => void;
}

export const useComposerUiStore = create<ComposerUiState>((set) => ({
  byThread: {},
  setComposerUi: (threadId, info) =>
    set((state) => {
      const prev = state.byThread[threadId];
      if (prev && prev.presentation === info.presentation && prev.collapsed === info.collapsed) {
        return {};
      }
      return { byThread: { ...state.byThread, [threadId]: info } };
    }),
  clearComposerUi: (threadId) =>
    set((state) => {
      if (!(threadId in state.byThread)) return {};
      const next = { ...state.byThread };
      delete next[threadId];
      return { byThread: next };
    }),
}));

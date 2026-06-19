import { create } from "zustand";
import { createFindCursorSlice, type FindCursorState } from "./findCursorSlice";

/**
 * Find state for the Git diff viewer. Unlike the chat (virtualized, so matches
 * are counted from item data), the diff is fully rendered in the DOM, so the
 * controller counts matches directly from the rendered text and reports the
 * total back via {@link FindCursorState.setMatchCount}.
 */
export interface GitFindState extends FindCursorState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useGitFindStore = create<GitFindState>((set) => ({
  ...createFindCursorSlice<GitFindState>(set),
  isOpen: false,
  open: () => set((state) => ({ isOpen: true, openToken: state.openToken + 1 })),
  close: () => set((state) => (state.isOpen ? { isOpen: false } : {})),
}));

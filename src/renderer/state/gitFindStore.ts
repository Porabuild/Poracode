import { create } from "zustand";
import { createFindCursorSlice, type FindCursorState } from "./findCursorSlice";

/**
 * Find state for the Git diff viewer. The controller searches patch data for
 * deferred sections and rendered text for single-file views, then reports the
 * total via {@link FindCursorState.setMatchCount}.
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

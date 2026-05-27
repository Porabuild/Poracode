import type { DraftContent, PendingDraftWorktreeSelection } from "./types";
import type { SliceCreator } from "./shared";

export interface DraftSlice {
  draftContents: Record<string, DraftContent>;
  pendingDraftWorktreeSelections: Record<string, PendingDraftWorktreeSelection>;
  saveDraftContent: (projectId: string, content: DraftContent) => void;
  clearDraftContent: (projectId: string) => void;
  setPendingDraftWorktreeSelection: (
    projectId: string,
    selection: PendingDraftWorktreeSelection,
  ) => void;
  clearPendingDraftWorktreeSelection: (projectId: string) => void;
}

export const createDraftSlice: SliceCreator<DraftSlice> = (set) => ({
  draftContents: {},
  pendingDraftWorktreeSelections: {},
  saveDraftContent: (projectId, content) =>
    set((state) => ({
      draftContents: { ...state.draftContents, [projectId]: content },
    })),
  clearDraftContent: (projectId) =>
    set((state) => {
      if (!(projectId in state.draftContents)) return {};
      const { [projectId]: _, ...rest } = state.draftContents;
      return { draftContents: rest };
    }),
  setPendingDraftWorktreeSelection: (projectId, selection) =>
    set((state) => ({
      pendingDraftWorktreeSelections: {
        ...state.pendingDraftWorktreeSelections,
        [projectId]: selection,
      },
    })),
  clearPendingDraftWorktreeSelection: (projectId) =>
    set((state) => {
      if (!(projectId in state.pendingDraftWorktreeSelections)) return {};
      const { [projectId]: _, ...rest } = state.pendingDraftWorktreeSelections;
      return { pendingDraftWorktreeSelections: rest };
    }),
});

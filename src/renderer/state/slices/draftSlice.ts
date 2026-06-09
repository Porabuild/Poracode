import type { DraftContent, PendingDraftWorktreeSelection } from "./types";
import type { SliceCreator } from "./shared";

/**
 * A one-shot request to insert text into a project's draft composer. Carried
 * separately from `draftContents` because it must apply whether the composer is
 * mounting fresh OR already open — subscribing components consume it and clear
 * it. `nonce` makes repeated identical seeds distinct so the consuming effect
 * re-fires.
 */
export interface PendingComposerSeed {
  text: string;
  nonce: number;
}

export interface DraftSlice {
  draftContents: Record<string, DraftContent>;
  pendingDraftWorktreeSelections: Record<string, PendingDraftWorktreeSelection>;
  pendingComposerSeeds: Record<string, PendingComposerSeed>;
  saveDraftContent: (projectId: string, content: DraftContent) => void;
  clearDraftContent: (projectId: string) => void;
  setPendingDraftWorktreeSelection: (
    projectId: string,
    selection: PendingDraftWorktreeSelection,
  ) => void;
  clearPendingDraftWorktreeSelection: (projectId: string) => void;
  setComposerSeed: (projectId: string, text: string) => void;
  clearComposerSeed: (projectId: string) => void;
}

export const createDraftSlice: SliceCreator<DraftSlice> = (set) => ({
  draftContents: {},
  pendingDraftWorktreeSelections: {},
  pendingComposerSeeds: {},
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
  setComposerSeed: (projectId, text) =>
    set((state) => {
      const trimmed = text.trim();
      if (!trimmed) return {};
      const prevNonce = state.pendingComposerSeeds[projectId]?.nonce ?? 0;
      return {
        pendingComposerSeeds: {
          ...state.pendingComposerSeeds,
          [projectId]: { text: trimmed, nonce: prevNonce + 1 },
        },
      };
    }),
  clearComposerSeed: (projectId) =>
    set((state) => {
      if (!(projectId in state.pendingComposerSeeds)) return {};
      const { [projectId]: _, ...rest } = state.pendingComposerSeeds;
      return { pendingComposerSeeds: rest };
    }),
});

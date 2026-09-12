import type { BuiltInMcpServerId } from "@/shared/contracts";
import type { DraftContent, PendingDraftWorktreeSelection } from "./types";
import type { SliceCreator } from "./shared";
import { composerDraftStorage } from "../composerDraftStorage";

export interface ComposerSeedOptions {
  bindLeadingSkill?: boolean;
  leadingSkillPluginId?: string;
  enableMcpServerIds?: readonly BuiltInMcpServerId[];
}

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
  bindLeadingSkill?: boolean;
  leadingSkillPluginId?: string;
  enableMcpServerIds?: BuiltInMcpServerId[];
}

export interface DraftSlice {
  draftContents: Record<string, DraftContent>;
  /**
   * Unsent content for launched threads. Remote IDs include the owning server.
   * Client-local checkpoints also preserve active drafts across reloads.
   */
  threadDraftContents: Record<string, DraftContent>;
  pendingDraftWorktreeSelections: Record<string, PendingDraftWorktreeSelection>;
  pendingComposerSeeds: Record<string, PendingComposerSeed>;
  draftContentDiscardRequests: Record<string, true>;
  saveDraftContent: (projectId: string, content: DraftContent) => void;
  clearDraftContent: (projectId: string) => void;
  discardDraftContent: (projectId: string) => void;
  consumeDraftContentDiscard: (projectId: string) => boolean;
  saveThreadDraftContent: (threadId: string, content: DraftContent) => void;
  clearThreadDraftContent: (threadId: string) => void;
  setPendingDraftWorktreeSelection: (
    projectId: string,
    selection: PendingDraftWorktreeSelection,
  ) => void;
  clearPendingDraftWorktreeSelection: (projectId: string) => void;
  setComposerSeed: (projectId: string, text: string, options?: ComposerSeedOptions) => void;
  clearComposerSeed: (projectId: string) => void;
}

export const createDraftSlice: SliceCreator<DraftSlice> = (set) => ({
  draftContents: composerDraftStorage()?.load("project") ?? {},
  threadDraftContents: composerDraftStorage()?.load("thread") ?? {},
  pendingDraftWorktreeSelections: {},
  pendingComposerSeeds: {},
  draftContentDiscardRequests: {},
  saveDraftContent: (projectId, content) => {
    composerDraftStorage()?.save("project", projectId, content);
    set((state) => ({
      draftContents: { ...state.draftContents, [projectId]: content },
    }));
  },
  clearDraftContent: (projectId) => {
    composerDraftStorage()?.remove("project", projectId);
    set((state) => {
      if (!(projectId in state.draftContents)) return {};
      const { [projectId]: _, ...rest } = state.draftContents;
      return { draftContents: rest };
    });
  },
  discardDraftContent: (projectId) => {
    composerDraftStorage()?.remove("project", projectId);
    set((state) => {
      const { [projectId]: _draft, ...draftContents } = state.draftContents;
      return {
        draftContents,
        draftContentDiscardRequests: {
          ...state.draftContentDiscardRequests,
          [projectId]: true,
        },
      };
    });
  },
  consumeDraftContentDiscard: (projectId) => {
    let shouldDiscard = false;
    set((state) => {
      if (!(projectId in state.draftContentDiscardRequests)) return {};
      shouldDiscard = true;
      const { [projectId]: _, ...rest } = state.draftContentDiscardRequests;
      return { draftContentDiscardRequests: rest };
    });
    return shouldDiscard;
  },
  saveThreadDraftContent: (threadId, content) => {
    composerDraftStorage()?.save("thread", threadId, content);
    set((state) => ({
      threadDraftContents: { ...state.threadDraftContents, [threadId]: content },
    }));
  },
  clearThreadDraftContent: (threadId) => {
    composerDraftStorage()?.remove("thread", threadId);
    set((state) => {
      if (!(threadId in state.threadDraftContents)) return {};
      const { [threadId]: _, ...rest } = state.threadDraftContents;
      return { threadDraftContents: rest };
    });
  },
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
  setComposerSeed: (projectId, text, options) =>
    set((state) => {
      const trimmed = text.trim();
      if (!trimmed) return {};
      const prevNonce = state.pendingComposerSeeds[projectId]?.nonce ?? 0;
      return {
        pendingComposerSeeds: {
          ...state.pendingComposerSeeds,
          [projectId]: {
            text: trimmed,
            nonce: prevNonce + 1,
            ...(options?.bindLeadingSkill ? { bindLeadingSkill: true } : {}),
            ...(options?.leadingSkillPluginId
              ? { leadingSkillPluginId: options.leadingSkillPluginId }
              : {}),
            ...(options?.enableMcpServerIds?.length
              ? { enableMcpServerIds: [...options.enableMcpServerIds] }
              : {}),
          },
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

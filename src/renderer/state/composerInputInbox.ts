import { create } from "zustand";
import type { PromptSegment } from "@/shared/contracts";

interface ComposerInputInboxState {
  itemsByComposer: Record<string, PromptSegment[][]>;
  enqueue(composerId: string, segments: PromptSegment[]): void;
  drain(composerId: string): PromptSegment[][];
}

export function worktreeComposerInboxKey(projectId: string, worktreePath: string): string {
  return `worktree:${projectId}:${worktreePath}`;
}

export const useComposerInputInbox = create<ComposerInputInboxState>((set, get) => ({
  itemsByComposer: {},
  enqueue: (composerId, segments) => {
    if (segments.length === 0) return;
    set((state) => ({
      itemsByComposer: {
        ...state.itemsByComposer,
        [composerId]: [...(state.itemsByComposer[composerId] ?? []), [...segments]],
      },
    }));
  },
  drain: (composerId) => {
    const items = get().itemsByComposer[composerId];
    if (!items || items.length === 0) return [];
    set((state) => {
      const next = { ...state.itemsByComposer };
      delete next[composerId];
      return { itemsByComposer: next };
    });
    return items;
  },
}));

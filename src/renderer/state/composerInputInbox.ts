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

/** The part of a composer editor that queued inputs are appended into. */
export interface ComposerInputTarget {
  serializeSegments(): PromptSegment[];
  insertSegments(segments: PromptSegment[], options?: { atEnd?: boolean; focus?: boolean }): void;
}

/**
 * Drains the queued inputs for each of `composerIds`, in order, and appends
 * them to the end of `composer` without moving focus. An input that follows
 * existing content is preceded by a blank line.
 */
export function drainComposerInputsInto(
  composer: ComposerInputTarget,
  composerIds: readonly string[],
): void {
  let composerHasContent = composer.serializeSegments().length > 0;
  for (const composerId of composerIds) {
    for (const segments of useComposerInputInbox.getState().drain(composerId)) {
      const separator: PromptSegment[] = composerHasContent
        ? [{ kind: "text", content: "\n\n" }]
        : [];
      composer.insertSegments([...separator, ...segments], { atEnd: true, focus: false });
      composerHasContent = true;
    }
  }
}

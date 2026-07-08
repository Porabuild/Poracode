import type { SliceCreator } from "./shared";

export interface SubAgentOverlaySlice {
  /**
   * Per-thread id of the currently-open sub-agent parent `tool_call`, or null
   * when no overlay is open in that thread. Scoped per-thread so split-pane
   * layouts can have independent overlays open in each pane.
   */
  openSubAgentByThread: Record<string, string | null>;
  openSubAgent: (threadId: string, parentItemId: string) => void;
  closeSubAgent: (threadId: string) => void;
}

/** Fresh sub-agent-overlay map; spread into both the slice and full resets so
 * the two never drift (see {@link createInitialRuntimeEventState}). */
export function createInitialSubAgentOverlayState(): Pick<
  SubAgentOverlaySlice,
  "openSubAgentByThread"
> {
  return { openSubAgentByThread: {} };
}

export const createSubAgentOverlaySlice: SliceCreator<SubAgentOverlaySlice> = (set) => ({
  ...createInitialSubAgentOverlayState(),
  openSubAgent: (threadId, parentItemId) =>
    set((state) =>
      state.openSubAgentByThread[threadId] === parentItemId
        ? {}
        : {
            openSubAgentByThread: {
              ...state.openSubAgentByThread,
              [threadId]: parentItemId,
            },
          },
    ),
  closeSubAgent: (threadId) =>
    set((state) =>
      state.openSubAgentByThread[threadId] == null
        ? {}
        : {
            openSubAgentByThread: { ...state.openSubAgentByThread, [threadId]: null },
          },
    ),
});

import type { PromptSegment } from "@/shared/contracts";
import type { SliceCreator } from "./shared";

export interface LaunchSlice {
  pendingThreadLaunches: Record<string, string>;
  pendingLaunchSegments: Record<string, PromptSegment[]>;
  pendingLaunchUserMessageItemIds: Record<string, string>;
  /** Renderer-only reconnect state. Kept separate from `ThreadStatus` so an
   * empty reconnect does not manufacture an active/completed turn. */
  connectingThreadIds: Record<string, string>;
  queueThreadLaunch: (
    threadId: string,
    prompt: string,
    segments?: PromptSegment[],
    userMessageItemId?: string,
  ) => void;
  consumeThreadLaunch: (threadId: string) => void;
  beginThreadConnecting: (threadId: string) => string;
  finishThreadConnecting: (threadId: string, token: string) => void;
}

export const createLaunchSlice: SliceCreator<LaunchSlice> = (set) => ({
  pendingThreadLaunches: {},
  pendingLaunchSegments: {},
  pendingLaunchUserMessageItemIds: {},
  connectingThreadIds: {},
  queueThreadLaunch: (threadId, prompt, segments, userMessageItemId) =>
    set((state) => ({
      pendingThreadLaunches: {
        ...state.pendingThreadLaunches,
        [threadId]: prompt,
      },
      ...(segments
        ? {
            pendingLaunchSegments: {
              ...state.pendingLaunchSegments,
              [threadId]: segments,
            },
          }
        : {}),
      ...(userMessageItemId
        ? {
            pendingLaunchUserMessageItemIds: {
              ...state.pendingLaunchUserMessageItemIds,
              [threadId]: userMessageItemId,
            },
          }
        : {}),
    })),
  consumeThreadLaunch: (threadId) =>
    set((state) => {
      if (!(threadId in state.pendingThreadLaunches)) {
        return {};
      }

      const { [threadId]: _removed, ...pendingThreadLaunches } = state.pendingThreadLaunches;
      const { [threadId]: _removedSeg, ...pendingLaunchSegments } = state.pendingLaunchSegments;
      const { [threadId]: _removedUserMessage, ...pendingLaunchUserMessageItemIds } =
        state.pendingLaunchUserMessageItemIds;
      return { pendingThreadLaunches, pendingLaunchSegments, pendingLaunchUserMessageItemIds };
    }),
  beginThreadConnecting: (threadId) => {
    const token = crypto.randomUUID();
    set((state) => ({
      connectingThreadIds: { ...state.connectingThreadIds, [threadId]: token },
    }));
    return token;
  },
  finishThreadConnecting: (threadId, token) =>
    set((state) => {
      // A stale launch completion must not clear a newer reconnect for the
      // same persisted thread id.
      if (state.connectingThreadIds[threadId] !== token) return {};
      const { [threadId]: _removed, ...connectingThreadIds } = state.connectingThreadIds;
      return { connectingThreadIds };
    }),
});

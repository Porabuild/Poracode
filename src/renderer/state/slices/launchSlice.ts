import type { PromptSegment } from "@/shared/contracts";
import type { SliceCreator } from "./shared";

export interface LaunchSlice {
  pendingThreadLaunches: Record<string, string>;
  pendingLaunchSegments: Record<string, PromptSegment[]>;
  pendingLaunchUserMessageItemIds: Record<string, string>;
  queueThreadLaunch: (
    threadId: string,
    prompt: string,
    segments?: PromptSegment[],
    userMessageItemId?: string,
  ) => void;
  consumeThreadLaunch: (threadId: string) => void;
}

export const createLaunchSlice: SliceCreator<LaunchSlice> = (set) => ({
  pendingThreadLaunches: {},
  pendingLaunchSegments: {},
  pendingLaunchUserMessageItemIds: {},
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
});

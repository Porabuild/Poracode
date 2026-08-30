import type { PromptSegment, StartThreadPayload } from "@/shared/contracts";
import type { SliceCreator } from "./shared";

export type PendingLaunchProviderSwitch = NonNullable<StartThreadPayload["providerSwitch"]>;

export interface LaunchSlice {
  pendingThreadLaunches: Record<string, string>;
  pendingLaunchSegments: Record<string, PromptSegment[]>;
  pendingLaunchUserMessageItemIds: Record<string, string>;
  /**
   * Marks a queued launch as continuing an existing thread under a new
   * provider, so the launch omits the stale `sessionRef` and the supervisor
   * records the handoff divider.
   */
  pendingLaunchProviderSwitches: Record<string, PendingLaunchProviderSwitch>;
  /** Renderer-only reconnect state. Kept separate from `ThreadStatus` so an
   * empty reconnect does not manufacture an active/completed turn. */
  connectingThreadIds: Record<string, string>;
  queueThreadLaunch: (
    threadId: string,
    prompt: string,
    segments?: PromptSegment[],
    userMessageItemId?: string,
    providerSwitch?: PendingLaunchProviderSwitch,
  ) => void;
  consumeThreadLaunch: (threadId: string) => void;
  beginThreadConnecting: (threadId: string) => string;
  finishThreadConnecting: (threadId: string, token: string) => void;
}

function omitThreadKey<T>(map: Record<string, T>, threadId: string): Record<string, T> {
  if (!(threadId in map)) return map;
  const { [threadId]: _removed, ...rest } = map;
  return rest;
}

export const createLaunchSlice: SliceCreator<LaunchSlice> = (set) => ({
  pendingThreadLaunches: {},
  pendingLaunchSegments: {},
  pendingLaunchUserMessageItemIds: {},
  pendingLaunchProviderSwitches: {},
  connectingThreadIds: {},
  queueThreadLaunch: (threadId, prompt, segments, userMessageItemId, providerSwitch) =>
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
      // Set AND cleared here: a plain relaunch queued while a stale marker
      // lingered would otherwise drop its session ref and emit a second
      // handoff divider for a switch that already happened.
      pendingLaunchProviderSwitches: providerSwitch
        ? { ...state.pendingLaunchProviderSwitches, [threadId]: providerSwitch }
        : omitThreadKey(state.pendingLaunchProviderSwitches, threadId),
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
      return {
        pendingThreadLaunches,
        pendingLaunchSegments,
        pendingLaunchUserMessageItemIds,
        pendingLaunchProviderSwitches: omitThreadKey(state.pendingLaunchProviderSwitches, threadId),
      };
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

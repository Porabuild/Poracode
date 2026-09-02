import type { PromptSegment, StartThreadPayload } from "@/shared/contracts";
import type { SliceCreator } from "./shared";

export type PendingLaunchProviderSwitch = NonNullable<StartThreadPayload["providerSwitch"]>;

/** Launch-time marks a queued launch carries besides its prompt and segments. */
export interface PendingLaunchOptions {
  providerSwitch?: PendingLaunchProviderSwitch;
  /**
   * The launch reads its context from a thread mention in its own prompt (a
   * forked chat thread), so the supervisor degrades instead of failing when
   * the session cannot resolve `read_thread`. See `StartThreadPayload`.
   */
  mentionHandoff?: true;
}

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
  /** Marks a queued launch as a fork reading its source thread by mention. */
  pendingLaunchMentionHandoffs: Record<string, true>;
  /** Renderer-only reconnect state. Kept separate from `ThreadStatus` so an
   * empty reconnect does not manufacture an active/completed turn. */
  connectingThreadIds: Record<string, string>;
  queueThreadLaunch: (
    threadId: string,
    prompt: string,
    segments?: PromptSegment[],
    userMessageItemId?: string,
    options?: PendingLaunchOptions,
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
  pendingLaunchMentionHandoffs: {},
  connectingThreadIds: {},
  queueThreadLaunch: (threadId, prompt, segments, userMessageItemId, options) =>
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
      pendingLaunchProviderSwitches: options?.providerSwitch
        ? { ...state.pendingLaunchProviderSwitches, [threadId]: options.providerSwitch }
        : omitThreadKey(state.pendingLaunchProviderSwitches, threadId),
      pendingLaunchMentionHandoffs: options?.mentionHandoff
        ? { ...state.pendingLaunchMentionHandoffs, [threadId]: true }
        : omitThreadKey(state.pendingLaunchMentionHandoffs, threadId),
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
        pendingLaunchMentionHandoffs: omitThreadKey(state.pendingLaunchMentionHandoffs, threadId),
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

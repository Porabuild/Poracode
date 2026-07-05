import { type Thread, type ThreadStatus, isThreadTurnActive } from "@/shared/contracts";
import { markThreadRuntimeForPersistence, type CompletedTurnRecord } from "./runtimeEventSlice";
import type { AppStoreState } from "./shared";

const isThreadLiveStatus = isThreadTurnActive;

function parseTurnIso(iso: string | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * If the previous status was live but the next turn timing has flipped to
 * "no active turn" (i.e. a turn just closed), append a frozen record of that
 * turn's window to `runtimeCompletedTurnsByThread` anchored to the last item
 * currently in the thread's timeline. Returns the existing map untouched when
 * no turn just closed.
 *
 * The persister snapshots these records after each close so prior "Worked for
 * X" indicators survive reloads in addition to staying visible in-session.
 */
export interface TurnCloseUpdate {
  runtimeCompletedTurnsByThread: AppStoreState["runtimeCompletedTurnsByThread"];
}

export function appendCompletedTurnIfClosed(
  state: AppStoreState,
  threadId: string,
  prevThread: Thread,
  nextTurnTiming: Pick<Thread, "activeTurnStartedAt" | "lastTurnStartedAt" | "lastTurnEndedAt">,
): TurnCloseUpdate {
  const wasLive = isThreadLiveStatus(prevThread.status);
  const willBeLive = nextTurnTiming.activeTurnStartedAt !== undefined;
  const unchanged: TurnCloseUpdate = {
    runtimeCompletedTurnsByThread: state.runtimeCompletedTurnsByThread,
  };
  if (!wasLive || willBeLive) return unchanged;

  const startedAt = parseTurnIso(nextTurnTiming.lastTurnStartedAt);
  const endedAt = parseTurnIso(nextTurnTiming.lastTurnEndedAt);
  if (startedAt === null || endedAt === null) return unchanged;
  if (endedAt - startedAt < 1000) return unchanged;
  if (
    prevThread.lastTurnStartedAt === nextTurnTiming.lastTurnStartedAt &&
    prevThread.lastTurnEndedAt === nextTurnTiming.lastTurnEndedAt
  ) {
    return unchanged;
  }

  const anchorItemId = resolveCompletedTurnAnchorItemId(state, threadId);

  const record: CompletedTurnRecord = { startedAt, endedAt, anchorItemId };
  const existing = state.runtimeCompletedTurnsByThread[threadId] ?? [];
  markThreadRuntimeForPersistence(threadId);
  return {
    runtimeCompletedTurnsByThread: {
      ...state.runtimeCompletedTurnsByThread,
      [threadId]: [...existing, record],
    },
  };
}

function resolveCompletedTurnAnchorItemId(state: AppStoreState, threadId: string): string | null {
  const itemIds = state.runtimeItemIdsByThread[threadId];
  if (!itemIds?.length) return null;

  const items = state.runtimeItemsByIdByThread[threadId];
  for (let idx = itemIds.length - 1; idx >= 0; idx -= 1) {
    const itemId = itemIds[idx]!;
    const item = items?.[itemId];
    if (!item) return itemId;
    // A short startup status blip can close before the provider emits any
    // assistant/tool output. Anchoring that synthetic window to the optimistic
    // user_message makes chat show a stale "Worked for 1s" under the prompt.
    if (item.type === "user_message" || item.type === "plan" || item.type === "error") continue;
    return itemId;
  }

  return null;
}

export function deriveTurnTiming(
  thread: Thread,
  nextStatus: ThreadStatus,
  options: { enteredLiveAt: string; nowIso: string },
): Pick<Thread, "activeTurnStartedAt" | "lastTurnStartedAt" | "lastTurnEndedAt"> {
  const wasLive = isThreadLiveStatus(thread.status);
  const willBeLive = isThreadLiveStatus(nextStatus);

  if (willBeLive) {
    return {
      activeTurnStartedAt: wasLive
        ? (thread.activeTurnStartedAt ?? thread.updatedAt ?? options.enteredLiveAt)
        : options.enteredLiveAt,
      lastTurnStartedAt: thread.lastTurnStartedAt,
      lastTurnEndedAt: thread.lastTurnEndedAt,
    };
  }

  if (wasLive) {
    return {
      activeTurnStartedAt: undefined,
      lastTurnStartedAt: thread.activeTurnStartedAt ?? thread.updatedAt ?? options.nowIso,
      lastTurnEndedAt: options.nowIso,
    };
  }

  return {
    activeTurnStartedAt: thread.activeTurnStartedAt,
    lastTurnStartedAt: thread.lastTurnStartedAt,
    lastTurnEndedAt: thread.lastTurnEndedAt,
  };
}

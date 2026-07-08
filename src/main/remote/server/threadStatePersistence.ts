import type { Thread } from "@/shared/contracts";
import { isThreadTurnActive } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import {
  dbGetThread,
  dbGetThreadCompletedTurns,
  dbGetThreadRuntimeItems,
  dbGetThreads,
  dbReplaceThreadRuntimeSnapshot,
  dbUpsertThread,
  type PersistedCompletedTurn,
  type PersistedRuntimeItem,
} from "../../db";
import { sortOrderForThread } from "./snapshots";

type ThreadStateEvent = Extract<SupervisorEvent, { type: "thread-state" }>;

function deriveTurnTiming(
  thread: Thread,
  nextStatus: Thread["status"],
  nowIso: string,
): Pick<Thread, "activeTurnStartedAt" | "lastTurnStartedAt" | "lastTurnEndedAt"> {
  const wasLive = isThreadTurnActive(thread.status);
  const willBeLive = isThreadTurnActive(nextStatus);

  if (willBeLive) {
    return {
      activeTurnStartedAt: wasLive ? (thread.activeTurnStartedAt ?? thread.updatedAt) : nowIso,
      lastTurnStartedAt: thread.lastTurnStartedAt,
      lastTurnEndedAt: thread.lastTurnEndedAt,
    };
  }

  if (wasLive) {
    return {
      activeTurnStartedAt: undefined,
      lastTurnStartedAt: thread.activeTurnStartedAt ?? thread.updatedAt ?? nowIso,
      lastTurnEndedAt: nowIso,
    };
  }

  return {
    activeTurnStartedAt: thread.activeTurnStartedAt,
    lastTurnStartedAt: thread.lastTurnStartedAt,
    lastTurnEndedAt: thread.lastTurnEndedAt,
  };
}

/**
 * Remote-started threads are created directly in the durable DB before the
 * supervisor starts running. When no renderer window is present, the remote
 * server is also the only process that sees later supervisor status events, so
 * it must mirror those thread-state transitions into the same DB row.
 */
export function persistRemoteThreadStateEvent(event: ThreadStateEvent): void {
  const thread = dbGetThread(event.threadId);
  if (!thread) return;

  // The desktop's `updateThreadRuntime` treats every supervisor status event as
  // authoritative and records the event's status source alongside it (sources
  // legitimately change, e.g. terminal_parse -> cli_hook when the hook plugin
  // activates). Mirror that here: never drop a transition on a source mismatch,
  // or the DB row freezes at its creation status and snapshots re-serve the
  // stale "working"/"launching" state to remote clients forever.
  const nowIso = new Date().toISOString();
  const turnTiming = deriveTurnTiming(thread, event.status, nowIso);
  const nextSessionRef =
    event.sessionRef && thread.sessionRef?.providerSessionId !== event.sessionRef.providerSessionId
      ? event.sessionRef
      : thread.sessionRef;

  dbUpsertThread(
    {
      ...thread,
      status: event.status,
      attention: event.attention,
      canResumeWithConfig: event.canResumeWithConfig,
      ...(event.config ? { config: event.config } : {}),
      ...(nextSessionRef ? { sessionRef: nextSessionRef } : {}),
      ...(event.threadStatusSource !== undefined
        ? { threadStatusSource: event.threadStatusSource }
        : {}),
      ...(event.errorMessage !== undefined ? { errorMessage: event.errorMessage } : {}),
      ...(event.slashCommands !== undefined ? { slashCommands: event.slashCommands } : {}),
      ...(event.status === "working" && thread.status !== "working" ? { updatedAt: nowIso } : {}),
      ...turnTiming,
    },
    sortOrderForThread(dbGetThreads(), event.threadId),
  );
  appendCompletedTurnIfClosed(event.threadId, thread, turnTiming);
}

function appendCompletedTurnIfClosed(
  threadId: string,
  prevThread: Thread,
  nextTurnTiming: Pick<Thread, "activeTurnStartedAt" | "lastTurnStartedAt" | "lastTurnEndedAt">,
): void {
  const wasLive = isThreadTurnActive(prevThread.status);
  const willBeLive = nextTurnTiming.activeTurnStartedAt !== undefined;
  if (!wasLive || willBeLive) return;

  const startedAt = parseTurnIso(nextTurnTiming.lastTurnStartedAt);
  const endedAt = parseTurnIso(nextTurnTiming.lastTurnEndedAt);
  if (startedAt === null || endedAt === null) return;
  if (endedAt - startedAt < 1000) return;
  if (
    prevThread.lastTurnStartedAt === nextTurnTiming.lastTurnStartedAt &&
    prevThread.lastTurnEndedAt === nextTurnTiming.lastTurnEndedAt
  ) {
    return;
  }

  const items = dbGetThreadRuntimeItems(threadId);
  const turns = dbGetThreadCompletedTurns(threadId);
  const record: PersistedCompletedTurn = {
    startedAt: new Date(startedAt).toISOString(),
    endedAt: new Date(endedAt).toISOString(),
    anchorItemId: resolveCompletedTurnAnchorItemId(items),
  };
  dbReplaceThreadRuntimeSnapshot(threadId, items, [...turns, record], undefined);
}

function resolveCompletedTurnAnchorItemId(items: readonly PersistedRuntimeItem[]): string | null {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index]!;
    if (item.type === "user_message" || item.type === "plan" || item.type === "error") continue;
    return item.id;
  }
  return null;
}

function parseTurnIso(iso: string | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
}

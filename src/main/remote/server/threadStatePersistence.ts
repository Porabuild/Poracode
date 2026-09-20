import type { Thread } from "@/shared/contracts";
import { isThreadTurnActive } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import {
  dbAppendThreadCompletedTurn,
  dbGetThread,
  dbGetLatestThreadRuntimeAnchorItemId,
  dbGetThreadCompletedTurns,
  dbGetThreads,
  dbUpsertThread,
  type PersistedCompletedTurn,
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
 * Mirrors supervisor thread-state transitions into the durable DB for both
 * desktop main and the headless remote host.
 */
export function persistThreadStateEvent(event: ThreadStateEvent): void {
  const thread = dbGetThread(event.threadId);
  if (!thread) return;

  // A thread switched to another provider in place still receives one last
  // state from the session it left, describing that session's model, commands
  // and ref. Persisting any of it would leave the durable row naming the new
  // provider while carrying the old one's config, and the thread would hydrate
  // after a restart with a model its agent does not offer.
  if (event.agentKind !== undefined && event.agentKind !== thread.agentKind) return;

  // Every supervisor status event is authoritative, and status sources can
  // legitimately change (for example terminal_parse -> cli_hook). Never drop a
  // transition on a source mismatch or the durable row can freeze at a stale
  // "working"/"launching" state.
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

  const startedAtIso = new Date(startedAt).toISOString();
  const endedAtIso = new Date(endedAt).toISOString();
  const existing = dbGetThreadCompletedTurns(threadId);
  if (existing.some((turn) => turn.startedAt === startedAtIso && turn.endedAt === endedAtIso)) {
    return;
  }
  const anchorItemId = dbGetLatestThreadRuntimeAnchorItemId(threadId);
  if (anchorItemId !== null && existing.some((turn) => turn.anchorItemId === anchorItemId)) {
    return;
  }

  const record: PersistedCompletedTurn = {
    startedAt: startedAtIso,
    endedAt: endedAtIso,
    anchorItemId,
  };
  dbAppendThreadCompletedTurn(threadId, record);
}

function parseTurnIso(iso: string | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : null;
}

import type {
  PendingSteerState,
  SetPendingSteerPayload,
  ThreadStatus,
  TurnState,
} from "@/shared/contracts";
import type { QueuedStructuredTurn, SessionRuntime } from "../sessionTypes";

export interface QueueEntry {
  readonly id: string;
  readonly stagedAt: number;
  /** Snapshot at receipt; preparation must not mutate this value. */
  readonly payload: SetPendingSteerPayload;
  readonly userMessageItemId: string;
  prepared?: { instanceId: string; turn: QueuedStructuredTurn };
}

export interface ActiveQueueEntry {
  readonly entry: QueueEntry;
  session: SessionRuntime;
  /** False while the entry is cancellable preparation. */
  dispatched: boolean;
  /** Resolves when the provider has admitted this entry or rejected it. */
  admission?: {
    promise: Promise<void>;
    resolve(): void;
  };
  /** True once the provider has reported a live working turn. */
  admitted?: boolean;
  turnId?: string;
  completionState?: TurnState;
  cancelled?: boolean;
}

export interface QueueRecord {
  readonly threadId: string;
  /** Includes the active preparation entry until the dispatch boundary. */
  readonly items: QueueEntry[];
  paused: boolean;
  replacing: boolean;
  /** A queue-owned restart is replacing the backing structured session. */
  restarting: boolean;
  active?: ActiveQueueEntry;
  pumpRunning: boolean;
  pumpAgain: boolean;
}

export interface ThreadLifecycle {
  instanceId: string;
  /** Current canonical turn, when one has started on this session. */
  turnId?: string;
  turnCompleted: boolean;
  /** Direct submit/steer barrier; queue must wait for its completion. */
  direct: boolean;
  /** Interrupt-and-drain direct steer is waiting for its replacement start. */
  directAwaitingReplacement: boolean;
  directCompletion: boolean;
  /** An unanswered permission/question request blocks readiness. */
  readonly pendingRequestIds: Set<string>;
}

export function isSettledStatus(status: ThreadStatus): boolean {
  return status === "idle" || status === "finished";
}

export function isBlockedStatus(status: ThreadStatus): boolean {
  return status === "needs_approval" || status === "needs_reply";
}

/**
 * Detached copy of an accepted follow-up. The client context is part of the
 * record: it was captured when this follow-up was submitted, so no later
 * caller (another tab, client or edit) can rewrite it.
 */
export function snapshotPayload(payload: SetPendingSteerPayload): SetPendingSteerPayload {
  const activeTab = payload.clientContext?.browserFocus?.activeTab;
  return {
    threadId: payload.threadId,
    prompt: payload.prompt,
    config: {
      ...payload.config,
      ...(payload.config.executionEnvironment
        ? { executionEnvironment: { ...payload.config.executionEnvironment } }
        : {}),
    },
    ...(payload.segments ? { segments: payload.segments.map((segment) => ({ ...segment })) } : {}),
    ...(payload.clientContext
      ? {
          clientContext: {
            ...(payload.clientContext.conversationSnapshot
              ? { conversationSnapshot: { ...payload.clientContext.conversationSnapshot } }
              : {}),
            ...(payload.clientContext.browserFocus
              ? { browserFocus: activeTab ? { activeTab: { ...activeTab } } : {} }
              : {}),
          },
        }
      : {}),
  };
}

export function pendingState(entry: QueueEntry): PendingSteerState {
  return {
    id: entry.id,
    prompt: entry.payload.prompt,
    stagedAt: entry.stagedAt,
    ...(entry.payload.segments
      ? { segments: entry.payload.segments.map((segment) => ({ ...segment })) }
      : {}),
  };
}

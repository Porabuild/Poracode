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

/** All current payload fields are plain objects; copy the only nested value. */
export function snapshotPayload(payload: SetPendingSteerPayload): SetPendingSteerPayload {
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

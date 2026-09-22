import { useAppStore } from "@/renderer/state/appStore";
import { evictOversizedInactiveThreadRuntimeItems } from "@/renderer/state/chatRuntimePersister";
import { clearRuntimeItemStoreSelectorCacheForThread } from "@/renderer/components/thread/ChatPane/chatPaneSelectors";
import { useThreadFollowUpQueueStore } from "@/renderer/state/threadFollowUpQueueStore";
import { RuntimeEventQueue, type RuntimeEventQueueBatch } from "@/renderer/state/runtimeEventQueue";
import {
  isAgentStatusSupervisorEvent,
  type AgentStatusSupervisorEvent,
  type SupervisorEvent,
} from "@/shared/ipc";
import type { RuntimeEvent, Thread } from "@/shared/contracts";
import type { EventSequenceSpace } from "@/shared/eventSequenceSpace";

/**
 * THE one `SupervisorEvent` reducer (V5 plan 2.3 / T3).
 *
 * Desktop (`app.tsx`) and remote clients (`state/remote/sync.ts`) used to run
 * two hand-maintained copies of this state machine over the same event union.
 * They diverged on selector-cache invalidation and on reset/resume ordering.
 * This module is the single implementation; each flavor injects:
 *
 * - a RECOVERY STRATEGY — how authoritative state is re-installed when the
 *     bounded runtime queue overflows, and how a `thread-reset` orders the
 *     resume:
 *     - local snapshot (`localSnapshotRecovery.ts`): the desktop re-reads the
 *       backend-persisted runtime history and resumes only once it lands;
 *     - HTTP snapshot (remote): the caller re-fetches snapshots from the host
 *       for overflow, and a reset — having no snapshot to await — resumes the
 *       queue immediately so fresh deltas are not blocked behind recovery.
 * - persistence/surface hooks — the fan-outs only one flavor owns (Electron
 *     terminal scrollback + dev shells, provider usage, agent-status bulk
 *     discovery; remote launch-config normalization and mobile side effects).
 *
 * The core owns everything shared: the bounded runtime event queue, the
 * frame-paced flush scheduling, overflow lifecycle (in-flight/invalidated
 * bookkeeping, hydration status, resume ordering), selector-cache
 * invalidation, and the per-event store mutations.
 */

export type ThreadStateSupervisorEvent = Extract<SupervisorEvent, { type: "thread-state" }>;

/** What `updateThreadRuntime` accepts; the remote normalization widens a
 * missing `launchConfig` to an explicit null. */
export type ThreadStateEventPayload = Parameters<
  ReturnType<typeof useAppStore.getState>["updateThreadRuntime"]
>[1];

export type ProviderUsageSupervisorEvent = Extract<SupervisorEvent, { type: "provider-usage" }>;
export type ProviderUsageAllSupervisorEvent = Extract<
  SupervisorEvent,
  { type: "provider-usage-all" }
>;

/**
 * How a flavor recovers authoritative state. `resume()` unblocks the runtime
 * queue (and reschedules the flush); it is a no-op while the recovery is
 * invalidated. A strategy returns a promise when it performs async recovery —
 * the core then resumes on `true`/`void` and fails the hydration status on
 * `false` or rejection. A synchronous return means the strategy applied its
 * own ordering inline (the remote reset path resumes immediately).
 */
export interface RuntimeEventRecoveryStrategy {
  readonly recoverFromQueueOverflow: (
    threadIds: readonly string[],
    resume: () => void,
  ) => void | Promise<boolean | void>;
  readonly recoverFromThreadReset: (
    threadId: string,
    resume: () => void,
  ) => void | Promise<boolean | void>;
}

/** Queue operations a recovery strategy may use to arbitrate against live deltas. */
export interface RuntimeQueueArbitration {
  readonly hasUnsequenced: (threadId: string) => boolean;
  readonly discardThroughSequence: (
    threadId: string,
    sequence: number,
    space?: EventSequenceSpace,
  ) => void;
}

/**
 * Per-dispatch side effects (remote clients). The desktop wires its surface
 * fan-outs statically in the config; mobile attaches these so the shared core
 * stays free of mobile-only stores.
 */
export interface SupervisorEventSideEffects {
  readonly onThreadState?: (input: {
    readonly threadId: string;
    readonly status: string;
    readonly oldThread: Thread | undefined;
  }) => void;
  readonly onThreadReset?: (threadId: string) => void;
  readonly onThreadExited?: (input: {
    readonly threadId: string;
    readonly exitCode: number | null;
  }) => void;
}

export interface SupervisorEventDispatchOptions {
  readonly sideEffects?: SupervisorEventSideEffects;
  readonly sequenceSpace?: EventSequenceSpace;
}

export interface RuntimeBatchDispatchOptions {
  readonly rendererSequence?: number;
  readonly sequenceSpace?: EventSequenceSpace;
  readonly deliverRuntimeEventsImmediately?: boolean;
}

/** Accepted from either flavor: validated remote batches carry readonly event arrays. */
export interface RuntimeBatchInput {
  readonly threadId: string;
  readonly events: readonly RuntimeEvent[];
}

export interface SupervisorEventReducerConfig {
  /** INJECTED recovery strategy (local snapshot | HTTP snapshot). */
  readonly recovery: RuntimeEventRecoveryStrategy;
  /** Queue limits override (tests force overflow with small limits). */
  readonly queueLimits?: {
    readonly maxEvents?: number;
    readonly maxBytes?: number;
    readonly maxThreadBytes?: number;
  };
  /** Electron: tracks the latest sequenced event per thread for recovery arbitration. */
  readonly onSequencedEvent?: (
    event: SupervisorEvent,
    rendererSequence: number,
    space: EventSequenceSpace,
  ) => void;
  /**
   * Electron: dev-shell gate. Called for events whose `threadId` starts with
   * `shell:`; the event is fully consumed afterwards (dev shells never touch
   * the thread stores).
   */
  readonly routeShellEvent?: (event: SupervisorEvent) => void;
  /** Electron persistence hooks: the renderer-side terminal scrollback accumulator. */
  readonly onThreadOutput?: (threadId: string, data: string) => void;
  readonly onThreadOutputCleared?: (threadId: string) => void;
  /** Flavor-specific agent-status fan-out (bulk discovery is desktop-only). */
  readonly onAgentStatusEvent?: (event: AgentStatusSupervisorEvent) => void;
  readonly onProviderUsage?: (event: ProviderUsageSupervisorEvent) => void;
  readonly onProviderUsageAll?: (event: ProviderUsageAllSupervisorEvent) => void;
  /** Remote: snapshot-shaped thread-state events normalize a missing launchConfig to null. */
  readonly normalizeThreadState?: (event: ThreadStateSupervisorEvent) => ThreadStateEventPayload;
  /** Electron perf diagnostics (Gate 4). `stats` is filled by the flush. */
  readonly wrapFlush?: (
    run: () => void,
    stats: { drainedThreads: number; drainedEvents: number },
  ) => void;
  readonly wrapApply?: (
    run: () => void,
    stats: { drainedThreads: number; drainedEvents: number },
  ) => void;
  /** Electron post-apply persistence: bounded windows + durable usage capture. */
  readonly afterApply?: (
    batches: readonly RuntimeEventQueueBatch[],
    context: {
      readonly threadMetadata: readonly Thread[];
      readonly drainedThreads: number;
      readonly drainedEvents: number;
    },
  ) => void;
}

export interface SupervisorEventReducer {
  readonly arbitration: RuntimeQueueArbitration;
  dispatch(
    event: SupervisorEvent,
    rendererSequence?: number,
    options?: SupervisorEventDispatchOptions,
  ): void;
  enqueueRuntimeBatches(
    batches: readonly RuntimeBatchInput[],
    options?: RuntimeBatchDispatchOptions,
  ): void;
  /** Drains one thread's queued deltas synchronously, preserving event order. */
  flushSync(threadId: string): void;
  /** Idempotent; returns the teardown for the scheduling listeners. */
  installScheduling(): () => void;
  /** Drops every queued delta, cancels pending flushes, and tears down listeners. */
  clear(): void;
  /** Invalidates every in-flight recovery (transport generation changed). */
  invalidateInFlightRecoveries(): void;
}

const RUNTIME_ENVELOPE_TYPES: ReadonlySet<string> = new Set([
  "thread-runtime-event",
  "thread-runtime-events",
  "thread-runtime-events-multi",
]);

function runtimeBatchesFromSupervisorEvent(event: SupervisorEvent): RuntimeEventQueueBatch[] {
  switch (event.type) {
    case "thread-runtime-event":
      return [{ threadId: event.threadId, events: [event.event] }];
    case "thread-runtime-events":
      return event.events.length > 0 ? [{ threadId: event.threadId, events: event.events }] : [];
    case "thread-runtime-events-multi":
      return event.batches
        .filter((batch) => batch.events.length > 0)
        .map((batch) => ({ threadId: batch.threadId, events: batch.events }));
    default:
      return [];
  }
}

function isThenable(value: void | Promise<boolean | void>): value is Promise<boolean | void> {
  return typeof (value as Promise<boolean | void> | undefined)?.then === "function";
}

export function createSupervisorEventReducer(
  config: SupervisorEventReducerConfig,
): SupervisorEventReducer {
  const queue = new RuntimeEventQueue(config.queueLimits ?? {});
  const runtimeRecoveryInFlight = new Set<string>();
  const runtimeRecoveryInvalidated = new Set<string>();
  let runtimeFlushHandle: number | null = null;
  let backgroundRuntimeFlushHandle: ReturnType<typeof setTimeout> | null = null;
  let runtimeDrainContinuationHandle: ReturnType<typeof setTimeout> | null = null;
  let runtimeDrainContinuationFlush: (() => void) | null = null;
  let removeSchedulingListeners: (() => void) | null = null;

  const BACKGROUND_RUNTIME_EVENT_BATCH_MS = 250;
  /** A3 cooperative flush budget, measured per drained slice. The value is an
   * initial estimate: it keeps one rAF/background task well inside a frame
   * while still draining bursts in one pass; tune from A0 measurements. */
  const RUNTIME_FLUSH_BUDGET_MS = 4;

  const isForegroundRuntimeThread = (threadId: string): boolean => {
    if (document.visibilityState === "hidden") return false;
    const view = useAppStore.getState().view;
    return view.kind === "thread" && view.panes.includes(threadId);
  };

  const scheduleDrainContinuation = (flush: () => void): void => {
    runtimeDrainContinuationFlush = flush;
    if (runtimeDrainContinuationHandle !== null) return;
    runtimeDrainContinuationHandle = setTimeout(() => {
      runtimeDrainContinuationHandle = null;
      const next = runtimeDrainContinuationFlush;
      runtimeDrainContinuationFlush = null;
      next?.();
    }, 0);
  };

  const flushPendingRuntimeEvents = (
    shouldFlush: (threadId: string) => boolean,
    budgeted = false,
  ): void => {
    const stats = { drainedThreads: 0, drainedEvents: 0 };
    const runFlush = (): void => {
      const store = useAppStore.getState();
      const threadMetadata = store.threads;
      const { batches, hasMore } = queue.drainBudgeted(
        shouldFlush,
        budgeted ? RUNTIME_FLUSH_BUDGET_MS : Number.POSITIVE_INFINITY,
      );
      stats.drainedThreads = batches.length;
      stats.drainedEvents = batches.reduce((total, batch) => total + batch.events.length, 0);
      if (batches.length > 0) {
        const applyBatches = (): void => {
          store.applyRuntimeEventBatches(batches);
        };
        if (config.wrapApply) config.wrapApply(applyBatches, stats);
        else applyBatches();
        evictOversizedInactiveThreadRuntimeItems(batches.map((batch) => batch.threadId));
        config.afterApply?.(batches, {
          threadMetadata,
          drainedThreads: stats.drainedThreads,
          drainedEvents: stats.drainedEvents,
        });
      }
      if (hasMore && budgeted) {
        // A3: yield between safe ordered units instead of draining the whole
        // burst in one task. Order is preserved because each unit is a
        // contiguous run of one thread's queue.
        scheduleDrainContinuation(() => {
          flushPendingRuntimeEvents(shouldFlush, true);
          schedulePendingRuntimeEvents();
        });
      }
    };
    if (config.wrapFlush) config.wrapFlush(runFlush, stats);
    else runFlush();
  };

  const schedulePendingRuntimeEvents = (): void => {
    let hasForeground = false;
    let hasBackground = false;
    for (const threadId of queue.threadIds()) {
      if (isForegroundRuntimeThread(threadId)) hasForeground = true;
      else hasBackground = true;
      if (hasForeground && hasBackground) break;
    }

    if (hasForeground && runtimeFlushHandle === null) {
      runtimeFlushHandle = requestAnimationFrame(() => {
        runtimeFlushHandle = null;
        flushPendingRuntimeEvents(isForegroundRuntimeThread, true);
        schedulePendingRuntimeEvents();
      });
    } else if (!hasForeground && runtimeFlushHandle !== null) {
      cancelAnimationFrame(runtimeFlushHandle);
      runtimeFlushHandle = null;
    }

    if (hasBackground && backgroundRuntimeFlushHandle === null) {
      backgroundRuntimeFlushHandle = setTimeout(() => {
        backgroundRuntimeFlushHandle = null;
        flushPendingRuntimeEvents((threadId) => !isForegroundRuntimeThread(threadId), true);
        schedulePendingRuntimeEvents();
      }, BACKGROUND_RUNTIME_EVENT_BATCH_MS);
    } else if (!hasBackground && backgroundRuntimeFlushHandle !== null) {
      clearTimeout(backgroundRuntimeFlushHandle);
      backgroundRuntimeFlushHandle = null;
    }
  };

  const finishRecovery = (threadIds: readonly string[]): void => {
    for (const threadId of threadIds) {
      runtimeRecoveryInFlight.delete(threadId);
      runtimeRecoveryInvalidated.delete(threadId);
    }
    schedulePendingRuntimeEvents();
  };

  const failRecovery = (threadIds: readonly string[]): void => {
    const store = useAppStore.getState();
    for (const threadId of threadIds) {
      runtimeRecoveryInFlight.delete(threadId);
      runtimeRecoveryInvalidated.delete(threadId);
      store.setRuntimeHydrationStatus(threadId, "failed");
    }
    schedulePendingRuntimeEvents();
  };

  /** Unblocks the group only when no member was invalidated mid-recovery. */
  const createGroupResume =
    (threadIds: readonly string[]): (() => void) =>
    () => {
      if (threadIds.some((threadId) => runtimeRecoveryInvalidated.has(threadId))) return;
      for (const threadId of threadIds) queue.resume(threadId);
      schedulePendingRuntimeEvents();
    };

  const settleRecovery = (
    recovery: void | Promise<boolean | void>,
    threadIds: readonly string[],
    resume: () => void,
    phase: "overflow" | "reset",
  ): void => {
    if (!isThenable(recovery)) {
      if (phase === "overflow") {
        // No async recovery was started (the injected strategy declined):
        // resume immediately rather than leaving the queue blocked.
        resume();
      }
      // A synchronous reset strategy applied its own ordering inline; either
      // way only the provisional in-flight marker is left to release.
      finishRecovery(threadIds);
      return;
    }
    void recovery.then(
      (recovered) => {
        if (
          recovered !== false &&
          !threadIds.some((threadId) => runtimeRecoveryInvalidated.has(threadId))
        ) {
          resume();
          finishRecovery(threadIds);
        } else {
          failRecovery(threadIds);
        }
      },
      () => failRecovery(threadIds),
    );
  };

  const enqueueRuntimeBatches = (
    batches: readonly RuntimeBatchInput[],
    options?: RuntimeBatchDispatchOptions,
  ): void => {
    if (batches.length === 0) return;
    if (options?.deliverRuntimeEventsImmediately) {
      // Ordered authoritative replay (recovery): apply directly without
      // re-entering the bounded queue.
      useAppStore
        .getState()
        .applyRuntimeEventBatches(
          batches.map((batch) => ({ threadId: batch.threadId, events: [...batch.events] })),
        );
      evictOversizedInactiveThreadRuntimeItems(batches.map((batch) => batch.threadId));
      return;
    }
    const overflowed: string[] = [];
    for (const batch of batches) {
      const result = queue.enqueue(
        batch.threadId,
        batch.events,
        options?.rendererSequence,
        options?.sequenceSpace ?? "ipc",
      );
      if (!result.overflowed) continue;
      if (runtimeRecoveryInFlight.has(batch.threadId)) {
        // The bounded post-baseline tail also overflowed while a recovery
        // already owns this thread. The current snapshot can no longer prove
        // convergence: block and surface the retryable hydration failure. The
        // projection is intentionally left as the recovery installed it.
        runtimeRecoveryInvalidated.add(batch.threadId);
        useAppStore.getState().setRuntimeHydrationStatus(batch.threadId, "failed");
      } else {
        // The backend persists runtime events before broadcasting them. Once
        // the final-consumer queue overflows, clear the partial projection and
        // re-read authoritative history (injected strategy) before accepting
        // new deltas.
        overflowed.push(batch.threadId);
        runtimeRecoveryInFlight.add(batch.threadId);
        useAppStore.getState().clearThreadRuntimeEvents(batch.threadId);
        useAppStore.getState().clearAllPendingSteer(batch.threadId);
        clearRuntimeItemStoreSelectorCacheForThread(batch.threadId);
      }
    }
    if (overflowed.length > 0) {
      const resume = createGroupResume(overflowed);
      const recovery = config.recovery.recoverFromQueueOverflow(overflowed, resume);
      settleRecovery(recovery, overflowed, resume, "overflow");
    }
    schedulePendingRuntimeEvents();
  };

  const flushSync = (threadId: string): void => {
    flushPendingRuntimeEvents((pendingThreadId) => pendingThreadId === threadId);
    schedulePendingRuntimeEvents();
  };

  const dispatch = (
    event: SupervisorEvent,
    rendererSequence?: number,
    options?: SupervisorEventDispatchOptions,
  ): void => {
    if (rendererSequence !== undefined) {
      config.onSequencedEvent?.(event, rendererSequence, options?.sequenceSpace ?? "ipc");
    }

    // Dev shells (action terminals) never touch the thread stores; the
    // Electron flavor notes their output/exit on the dev terminal store.
    if (config.routeShellEvent && "threadId" in event && event.threadId.startsWith("shell:")) {
      config.routeShellEvent(event);
      return;
    }

    // Feed subscribed agent PTY bytes into the renderer-side scrollback
    // accumulator. Hidden threads stay behind the backend interest filter and
    // restore from the supervisor transcript when their pane mounts again.
    if (config.onThreadOutput && event.type === "thread-output") {
      config.onThreadOutput(event.threadId, event.data);
    } else if (
      config.onThreadOutputCleared &&
      (event.type === "thread-reset" || event.type === "thread-scrollback-resync")
    ) {
      // `thread-reset` (a fresh spawn) clears the thread's accumulated bytes;
      // a loss-range rebuild resyncs it from the supervisor transcript.
      config.onThreadOutputCleared(event.threadId);
    }

    if (RUNTIME_ENVELOPE_TYPES.has(event.type)) {
      enqueueRuntimeBatches(runtimeBatchesFromSupervisorEvent(event), {
        ...(rendererSequence !== undefined ? { rendererSequence } : {}),
        ...(options?.sequenceSpace !== undefined ? { sequenceSpace: options.sequenceSpace } : {}),
      });
      return;
    }

    // Non-runtime event: drain pending runtime events first so the switch
    // below observes the same ordering callers expect from the IPC stream.
    if ("threadId" in event && queue.has(event.threadId)) {
      flushSync(event.threadId);
    }

    switch (event.type) {
      case "thread-state": {
        const oldThread = useAppStore.getState().threads.find((t) => t.id === event.threadId);
        const payload = config.normalizeThreadState ? config.normalizeThreadState(event) : event;
        useAppStore.getState().updateThreadRuntime(event.threadId, payload);
        // Once the agent process is gone, native sub-agents that hadn't
        // completed are orphaned — their parent `item.completed` will never
        // arrive — so reconcile to stop the active dock showing them as
        // running. Crossagent runs are supervisor-owned and keep working
        // through parent errors; their rows survive here and end only on the
        // authoritative settle tile (or on force-terminated paths like
        // provider switch).
        if (event.status === "inactive" || event.status === "error") {
          useAppStore.getState().reconcileStaleSubAgents(event.threadId);
        }
        options?.sideEffects?.onThreadState?.({
          threadId: event.threadId,
          status: event.status,
          oldThread,
        });
        return;
      }
      case "thread-follow-up-queue":
        useThreadFollowUpQueueStore.getState().setQueue(event.threadId, event.queue);
        return;
      case "thread-pending-steer":
        useAppStore.getState().setPendingSteer(event.threadId, event.pending);
        return;
      case "thread-reset": {
        queue.discard(event.threadId);
        useAppStore.getState().clearThreadRuntimeEvents(event.threadId);
        useAppStore.getState().clearAllPendingSteer(event.threadId);
        // The reset wiped the in-memory transcript: drop the selector caches
        // for the thread in BOTH flavors so no pane can render stale items.
        clearRuntimeItemStoreSelectorCacheForThread(event.threadId);
        options?.sideEffects?.onThreadReset?.(event.threadId);
        if (!runtimeRecoveryInFlight.has(event.threadId)) {
          runtimeRecoveryInFlight.add(event.threadId);
          const resume = createGroupResume([event.threadId]);
          const recovery = config.recovery.recoverFromThreadReset(event.threadId, resume);
          settleRecovery(recovery, [event.threadId], resume, "reset");
        }
        return;
      }
      case "thread-exited":
        useAppStore.getState().markThreadExited(event.threadId);
        useAppStore.getState().clearAllPendingSteer(event.threadId);
        options?.sideEffects?.onThreadExited?.({
          threadId: event.threadId,
          exitCode: event.exitCode,
        });
        return;
      default:
        break;
    }

    if (isAgentStatusSupervisorEvent(event)) {
      config.onAgentStatusEvent?.(event);
    }
    if (event.type === "provider-usage") {
      config.onProviderUsage?.(event);
    }
    if (event.type === "provider-usage-all") {
      config.onProviderUsageAll?.(event);
    }
  };

  const installScheduling = (): (() => void) => {
    if (removeSchedulingListeners) return removeSchedulingListeners;
    const unsubscribe = useAppStore.subscribe((state) => state.view, schedulePendingRuntimeEvents);
    document.addEventListener("visibilitychange", schedulePendingRuntimeEvents);
    removeSchedulingListeners = () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", schedulePendingRuntimeEvents);
    };
    return removeSchedulingListeners;
  };

  const clear = (): void => {
    if (runtimeFlushHandle !== null) {
      cancelAnimationFrame(runtimeFlushHandle);
      runtimeFlushHandle = null;
    }
    if (backgroundRuntimeFlushHandle !== null) {
      clearTimeout(backgroundRuntimeFlushHandle);
      backgroundRuntimeFlushHandle = null;
    }
    if (runtimeDrainContinuationHandle !== null) {
      clearTimeout(runtimeDrainContinuationHandle);
      runtimeDrainContinuationHandle = null;
    }
    runtimeDrainContinuationFlush = null;
    removeSchedulingListeners?.();
    removeSchedulingListeners = null;
    queue.clear();
    runtimeRecoveryInFlight.clear();
    runtimeRecoveryInvalidated.clear();
  };

  const invalidateInFlightRecoveries = (): void => {
    const store = useAppStore.getState();
    for (const threadId of runtimeRecoveryInFlight) {
      runtimeRecoveryInvalidated.add(threadId);
      store.setRuntimeHydrationStatus(threadId, "failed");
    }
  };

  return {
    arbitration: {
      hasUnsequenced: (threadId) => queue.hasUnsequenced(threadId),
      discardThroughSequence: (threadId, sequence, space) =>
        queue.discardThroughSequence(threadId, sequence, space),
    },
    dispatch,
    enqueueRuntimeBatches,
    flushSync,
    installScheduling,
    clear,
    invalidateInFlightRecoveries,
  };
}

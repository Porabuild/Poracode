// Direct module imports (not the `@/host/db` barrel): this module is loaded by
// remote-server tests that mock the barrel, and persistence must still be the
// real bounded implementation, not a test double.
import {
  dbApplyThreadRuntimeEvents,
  replaceThreadRuntimeSnapshotUnchecked,
} from "@/host/db/runtimeItems";
import {
  enqueueRuntimeControlOperation,
  markRuntimeRebaseDropped,
  runThreadRuntimeMutation,
} from "@/host/db/runtimePersistenceRuntime";
import type { RuntimeAdmission } from "@/host/db/runtimePersistenceTypes";
import type { SupervisorEvent } from "@/shared/ipc";
import type { RemoteBroadcastEvent } from "./context";
import { persistThreadStateEvent } from "./threadStatePersistence";

/**
 * Outstanding-of `persistSupervisorEvent`: the composition publishes exactly
 * what was admitted (or applied), and nothing else. Refused canonical events
 * were never accepted, so publishing them would advance the client cursor over
 * a durable hole.
 *
 * The event type parameter exists so the backend host, which owns a
 * `SupervisorEvent`, can forward the accepted/partial envelope (or the later
 * deferred reset) to `options.onEvent(event: SupervisorEvent)` without a cast:
 * every envelope this function produces from a `SupervisorEvent` input is
 * itself a `SupervisorEvent` (`thread-runtime-event`, `thread-runtime-events`,
 * or `thread-runtime-events-multi`).
 */
export type PersistOutcome<E extends RemoteBroadcastEvent = RemoteBroadcastEvent> =
  | { kind: "publish"; event: E }
  | {
      kind: "publish-partial";
      event: E;
      droppedEvents: number;
      droppedBytes: number;
    }
  | {
      kind: "withhold";
      reason: "refused" | "deferred-reset" | "shutdown";
      threadIds: string[];
    };

export interface PersistSupervisorEventOptions {
  /**
   * Invoked exactly once when a withheld `thread-reset`'s durable rebase
   * applies, so the composition can publish the retained envelope after the
   * durable effect (never before). Absent callback: the reset still applies
   * durably; publication is the caller's responsibility.
   */
  publishDeferredEvent?: (event: RemoteBroadcastEvent) => void;
}

/**
 * Single durability entry point for a supervisor broadcast event. Mirrors
 * runtime items, the usage ledger (inside the runtime writer's transaction),
 * and — for thread-state transitions — the thread row. Desktop main and the
 * headless remote host both route through this so the "which event persists
 * where" rule lives in one place.
 *
 * This function NEVER throws. It returns what the composition may publish:
 * canonical events only after admission (a partial admission publishes only
 * the accepted prefix), `thread-reset` only after its durable rebase applies
 * (withheld until then, retained as an envelope for deferred publication), and
 * other events immediately.
 */
export function persistSupervisorEvent(
  event: SupervisorEvent,
  options?: PersistSupervisorEventOptions,
): PersistOutcome<SupervisorEvent>;
export function persistSupervisorEvent(
  event: RemoteBroadcastEvent,
  options?: PersistSupervisorEventOptions,
): PersistOutcome;
export function persistSupervisorEvent(
  event: RemoteBroadcastEvent,
  options: PersistSupervisorEventOptions = {},
): PersistOutcome {
  try {
    return dispatchPersist(event, options);
  } catch (error) {
    // Final backstop. The controller already classified any SQLite error it
    // saw; reaching here means a mapping or dispatch bug, not storage state.
    console.error(
      `[db] runtime persistence dispatch failed for supervisor event "${event.type}":`,
      error,
    );
    return { kind: "withhold", reason: "refused", threadIds: threadIdsFor(event) };
  }
}

function dispatchPersist(
  event: RemoteBroadcastEvent,
  options: PersistSupervisorEventOptions,
): PersistOutcome {
  switch (event.type) {
    case "thread-runtime-event": {
      const admission = dbApplyThreadRuntimeEvents(event.threadId, [event.event]);
      if (admission.kind === "accepted") return { kind: "publish", event };
      return refusalOutcome(event, admission);
    }
    case "thread-runtime-events": {
      const admission = dbApplyThreadRuntimeEvents(event.threadId, event.events);
      if (admission.kind === "refused") return refusalOutcome(event, admission);
      const accepted = event.events.slice(0, admission.acceptedEvents);
      if (accepted.length === 0) return refusalOutcome(event, admission);
      if (accepted.length === event.events.length) return { kind: "publish", event };
      return {
        kind: "publish-partial",
        event: { type: "thread-runtime-events", threadId: event.threadId, events: accepted },
        droppedEvents: event.events.length - accepted.length,
        droppedBytes: admission.refusedBytes,
      };
    }
    case "thread-runtime-events-multi": {
      const acceptedBatches: Array<{
        threadId: string;
        events: (typeof event.batches)[number]["events"];
      }> = [];
      const refusedThreadIds: string[] = [];
      let droppedEvents = 0;
      let droppedBytes = 0;
      for (const batch of event.batches) {
        const admission = dbApplyThreadRuntimeEvents(batch.threadId, batch.events);
        if (admission.kind === "refused") {
          refusedThreadIds.push(batch.threadId);
          droppedEvents += batch.events.length;
          droppedBytes += admission.refusedBytes;
          continue;
        }
        const accepted = batch.events.slice(0, admission.acceptedEvents);
        if (accepted.length > 0)
          acceptedBatches.push({ threadId: batch.threadId, events: accepted });
        if (accepted.length < batch.events.length) {
          refusedThreadIds.push(batch.threadId);
          droppedEvents += batch.events.length - accepted.length;
          droppedBytes += admission.refusedBytes;
        }
      }
      if (acceptedBatches.length === 0) {
        return {
          kind: "withhold",
          reason: refusedThreadIds.length > 0 ? "refused" : "shutdown",
          threadIds: refusedThreadIds,
        };
      }
      if (refusedThreadIds.length === 0) return { kind: "publish", event };
      if (acceptedBatches.length === 1) {
        const single = acceptedBatches[0]!;
        return {
          kind: "publish-partial",
          event:
            single.events.length === 1
              ? {
                  type: "thread-runtime-event",
                  threadId: single.threadId,
                  event: single.events[0]!,
                }
              : { type: "thread-runtime-events", threadId: single.threadId, events: single.events },
          droppedEvents,
          droppedBytes,
        };
      }
      return {
        kind: "publish-partial",
        event: { type: "thread-runtime-events-multi", batches: acceptedBatches },
        droppedEvents,
        droppedBytes,
      };
    }
    case "thread-state": {
      // Control write: queued for bounded retry (idempotent upsert). Row lag is
      // replay-covered, so publication stays immediate — but only once the
      // write was actually queued. A refused control reserve means the row
      // would never be rebuilt, so publishing the state would claim a durable
      // transition that does not exist.
      const queued = enqueueRuntimeControlOperation({
        key: `thread-state:${event.threadId}`,
        describe: `thread-state ${event.threadId}`,
        run: () => persistThreadStateEvent(event),
      });
      if (queued === "refused") {
        return { kind: "withhold", reason: "refused", threadIds: [event.threadId] };
      }
      return { kind: "publish", event };
    }
    case "thread-reset":
      enqueueDeferredReset(event, options.publishDeferredEvent);
      // Durable-first: withheld until the rebase applies; the retained envelope
      // is published exactly once from the control-op completion.
      return { kind: "withhold", reason: "deferred-reset", threadIds: [event.threadId] };
    default:
      return { kind: "publish", event };
  }
}

function refusalOutcome(event: RemoteBroadcastEvent, admission: RuntimeAdmission): PersistOutcome {
  const threadIds = threadIdsFor(event);
  if (admission.kind === "refused" && admission.reason === "shutdown") {
    return { kind: "withhold", reason: "shutdown", threadIds };
  }
  return { kind: "withhold", reason: "refused", threadIds };
}

function threadIdsFor(event: RemoteBroadcastEvent): string[] {
  if (event.type === "thread-runtime-events-multi") {
    return [...new Set(event.batches.map((batch) => batch.threadId))];
  }
  if ("threadId" in event && typeof event.threadId === "string") return [event.threadId];
  return [];
}

/**
 * Durable-first thread reset: the envelope is withheld until the rebase
 * applies and then published exactly once. The operation is queued through the
 * controller's retrying control-op path, so a transient storage failure defers
 * the reset instead of discarding it, and a contaminated thread is rebased
 * (the reset is its authoritative recovery).
 *
 * Terminal outcomes are explicit: a deferred reset whose bounded retries are
 * exhausted (or that the control reserve refuses at enqueue) marks the thread
 * contaminated (`rebase-dropped`), so a later session's events are refused
 * instead of silently appending to the pre-reset transcript. An applied rebase
 * clears that marker. Publication stays exactly-once: only a successful rebase
 * invokes the publish callback, and only once.
 */
function enqueueDeferredReset(
  event: Extract<RemoteBroadcastEvent, { type: "thread-reset" }>,
  publishDeferredEvent: ((event: RemoteBroadcastEvent) => void) | undefined,
): void {
  let published = false;
  pendingResetThreadIds.add(event.threadId);
  const enqueueResult = enqueueRuntimeControlOperation({
    key: `thread-reset:${event.threadId}`,
    describe: `thread-reset ${event.threadId}`,
    run: () =>
      runThreadRuntimeMutation(event.threadId, "reset", () =>
        replaceThreadRuntimeSnapshotUnchecked(event.threadId, [], [], null),
      ),
    onCompleted: (result) => {
      pendingResetThreadIds.delete(event.threadId);
      if (!result.ok) {
        // The bounded retry was exhausted: the durable rebase will never apply
        // and is not republished. Leave the explicit per-thread gap marker.
        markRuntimeRebaseDropped(event.threadId);
        console.error(
          `[db] deferred thread-reset for ${event.threadId} exhausted its bounded retries; the thread stays contaminated until an authoritative rebase.`,
        );
        return;
      }
      if (published) return;
      published = true;
      try {
        publishDeferredEvent?.(event);
      } catch (error) {
        console.error(
          `[db] deferred thread-reset publication failed for ${event.threadId}:`,
          error,
        );
      }
    },
  });
  if (enqueueResult === "refused") {
    pendingResetThreadIds.delete(event.threadId);
    markRuntimeRebaseDropped(event.threadId);
    console.error(
      `[db] deferred thread-reset for ${event.threadId} was refused: the control reserve is exhausted; the thread stays contaminated until an authoritative rebase.`,
    );
  }
}

/**
 * Retained reset envelopes for diagnostics/tests: the queue itself owns retry,
 * this exposes only whether a reset is still pending publication.
 */
export function hasDeferredThreadReset(threadId: string): boolean {
  return pendingResetThreadIds.has(threadId);
}

const pendingResetThreadIds = new Set<string>();

/** Test helper: clears the diagnostics-only pending-reset marker set. */
export function resetDeferredThreadResetsForTests(): void {
  pendingResetThreadIds.clear();
}

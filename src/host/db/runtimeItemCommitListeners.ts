import type { RuntimeEvent } from "@/shared/contracts";
import { runtimeRequestItemId } from "./runtimeRequestItemId";

/**
 * Post-commit notification for runtime-item payload changes.
 *
 * The writer (`applyThreadRuntimeEventsNow` / `applyRuntimeEventBatchesNow`)
 * is the single choke point every canonical event application funnels
 * through — queue flushes, fence commits, and the boot-settle direct call —
 * so notifying from there covers every event-applied payload change.
 * Wholesale mutations (replace/truncate/reset/delete) do not pass through
 * the writer; they bump `runtimeHistoryRevision` instead, and consumers
 * combine both signals (see the image bytes cache).
 *
 * `payloadItemIdForRuntimeEvent` is the ONE predicate for "this event can
 * change an item's stored payload or existence": the write queue's
 * pending-write check and this post-commit notification share it so the
 * pre-commit and post-commit views of payload ownership cannot drift.
 */

export type RuntimeItemCommitListener = (
  threadId: string,
  itemIds: ReadonlySet<string> | "all",
) => void;

const listeners = new Set<RuntimeItemCommitListener>();

export function addRuntimeItemCommitListener(listener: RuntimeItemCommitListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The item whose stored payload/existence this event can change, `"all"`
 * when it can prune unnamed items, or null when it cannot touch payloads
 * (stream deltas, lifecycle pings).
 */
export function payloadItemIdForRuntimeEvent(event: RuntimeEvent): string | "all" | null {
  switch (event.type) {
    case "item.started":
    case "item.updated":
    case "item.completed":
      return event.itemId;
    case "request.opened":
      return runtimeRequestItemId(event.requestId);
    case "turn.completed":
      // Cancellation may prune trailing reasoning rows without naming an item.
      return event.state === "interrupted" || event.state === "cancelled" ? "all" : null;
    default:
      return null;
  }
}

/** Called by the writer AFTER its transaction commits; never on rollback. */
export function notifyRuntimeItemsCommitted(
  threadId: string,
  events: readonly RuntimeEvent[],
): void {
  if (listeners.size === 0) return;
  let itemIds: Set<string> | undefined;
  let all = false;
  for (const event of events) {
    const id = payloadItemIdForRuntimeEvent(event);
    if (id === "all") {
      all = true;
      break;
    }
    if (id !== null) (itemIds ??= new Set()).add(id);
  }
  if (!all && !itemIds) return;
  const delivered: ReadonlySet<string> | "all" = all ? "all" : itemIds!;
  for (const listener of [...listeners]) {
    try {
      listener(threadId, delivered);
    } catch (error) {
      console.error("[db] runtime item commit listener failed:", error);
    }
  }
}

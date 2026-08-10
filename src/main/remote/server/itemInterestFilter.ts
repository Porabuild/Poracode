import {
  filterRuntimeEventsForLiveInterest,
  isBulkRuntimeContentEvent,
} from "@/shared/liveEventInterests";
import type { RemoteBroadcastEvent } from "./context";

/**
 * Withholds live transcript *content* for threads a connection is not watching.
 *
 * Runtime events are broadcast to every client for every thread, so a phone
 * viewing one thread also downloads every other thread's tool payloads. Terminal
 * output has had per-connection `terminal-watch` scoping for this reason; item
 * content never did.
 *
 * Two invariants make this safe:
 *
 * 1. **Only bulk content is scoped.** `request.opened`/`request.resolved`,
 *    `turn.*`, `session.*`, `context.updated`, `usage.spent`, warnings and errors
 *    always pass through. Permission and question prompts ride
 *    `request.opened`, the mobile approval UI reads them out of
 *    `runtimeRequestsByThread`, and a thread snapshot has no field to recover an
 *    open request from — so scoping those would silently strand a background
 *    thread waiting on an approval the user never sees.
 *
 * 2. **Events are emptied, never dropped.** Reconnect replay validates that it
 *    received exactly `seq - lastSeenSeq` entries; omitting an event entirely
 *    would look like packet loss and force a spurious full resync. An event whose
 *    content was fully withheld is therefore still delivered, carrying an empty
 *    `events` array (which the client's dispatch treats as a no-op).
 */

/**
 * Narrows `event` to what this connection asked for. `interests` of `null` means
 * the client never declared any (older clients), so everything passes through.
 * Returns the original event when nothing was withheld.
 */
export function filterEventForItemInterests(
  event: RemoteBroadcastEvent,
  interests: ReadonlySet<string> | null,
): RemoteBroadcastEvent {
  if (!interests) return event;
  switch (event.type) {
    case "thread-runtime-event": {
      if (!isBulkRuntimeContentEvent(event.event) || interests.has(event.threadId)) return event;
      // Collapse to the plural form so the delivered frame stays a valid,
      // content-free event and the replay count still lines up.
      return { type: "thread-runtime-events", threadId: event.threadId, events: [] };
    }
    case "thread-runtime-events": {
      const events = filterRuntimeEventsForLiveInterest(
        event.events,
        interests.has(event.threadId),
      );
      return events === event.events ? event : { ...event, events: [...events] };
    }
    case "thread-runtime-events-multi": {
      let changed = false;
      const batches = event.batches.map((batch) => {
        const events = filterRuntimeEventsForLiveInterest(
          batch.events,
          interests.has(batch.threadId),
        );
        if (events === batch.events) return batch;
        changed = true;
        return { ...batch, events: [...events] };
      });
      return changed ? { ...event, batches } : event;
    }
    default:
      return event;
  }
}

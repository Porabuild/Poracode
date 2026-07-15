import { dbApplyThreadRuntimeEvents, dbReplaceThreadRuntimeSnapshot } from "../../db";
import type { RemoteBroadcastEvent } from "./context";
import { persistThreadStateEvent } from "./threadStatePersistence";

/**
 * Single durability entry point for a supervisor broadcast event. Mirrors
 * runtime items and, for thread-state transitions, the thread row. Desktop main
 * and the headless remote host both route through this so the "which event
 * persists where" rule lives in one place.
 */
export function persistSupervisorEvent(event: RemoteBroadcastEvent): void {
  persistRuntimeEvent(event);
  if (event.type === "thread-state") {
    persistThreadStateEvent(event);
  }
}

/**
 * Applies canonical supervisor runtime events directly to SQLite. The same
 * writer is used by desktop main and the headless remote host, so durability
 * never depends on a mounted renderer or a full transcript rewrite.
 */
function persistRuntimeEvent(event: RemoteBroadcastEvent): void {
  switch (event.type) {
    case "thread-runtime-event":
      dbApplyThreadRuntimeEvents(event.threadId, [event.event]);
      return;
    case "thread-runtime-events":
      dbApplyThreadRuntimeEvents(event.threadId, event.events);
      return;
    case "thread-runtime-events-multi":
      for (const batch of event.batches) {
        dbApplyThreadRuntimeEvents(batch.threadId, batch.events);
      }
      return;
    case "thread-reset":
      dbReplaceThreadRuntimeSnapshot(event.threadId, [], [], null);
      return;
    default:
      return;
  }
}

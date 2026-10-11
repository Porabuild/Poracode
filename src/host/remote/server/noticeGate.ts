import type { RemoteBroadcastEvent } from "./context";
import type { RemoteAccessServerHost } from "../remoteAccessServerTypes";

/**
 * B1 live/replay content gate for acknowledged history notices.
 *
 * A connection that did NOT declare `notices=v1` at upgrade cannot render the
 * durable history-incomplete notice, so it must never append post-gap canonical
 * content to its stale transcript. The gate empties (never drops) canonical
 * runtime batches for a thread with a notice, preserving sequence positions so
 * the replay-contiguity contract still holds; every unrelated frame and thread
 * passes untouched. Capable connections keep the byte-identical canonical
 * frame.
 *
 * The notice test is a bounded DB-backed derived lookup owned by the composed
 * gap port (per-connection-bounded LRU; a miss re-queries the durable table;
 * eviction and every ack/delete/rebind invalidate it). A lookup error or an
 * absent store answer FAILS CLOSED: the thread is treated as gated rather than
 * assumed clean. This module never loads the whole notice table.
 */

function isNoticeThread(host: RemoteAccessServerHost, threadId: string): boolean {
  const port = host.options.runtimeHistoryGap;
  if (!port) return false;
  try {
    return port.lookupNotice(threadId).kind !== "clean";
  } catch {
    return true;
  }
}

/**
 * Applies the notice gate for one connection. Returns the original event when
 * the connection is capable or no affected thread has a notice, and an emptied
 * copy otherwise.
 */
export function filterEventForNoticeGate(
  host: RemoteAccessServerHost,
  event: RemoteBroadcastEvent,
  client: import("ws").WebSocket,
): RemoteBroadcastEvent {
  if (!host.options.runtimeHistoryGap) return event;
  if (host.noticeCapableClients.has(client)) return event;
  switch (event.type) {
    case "thread-runtime-event": {
      if (!isNoticeThread(host, event.threadId)) return event;
      // Collapse to the plural form so the frame stays valid, content-free,
      // and replay-count-compatible.
      return { type: "thread-runtime-events", threadId: event.threadId, events: [] };
    }
    case "thread-runtime-events": {
      if (!isNoticeThread(host, event.threadId)) return event;
      return event.events.length === 0 ? event : { ...event, events: [] };
    }
    case "thread-runtime-events-multi": {
      let changed = false;
      const batches = event.batches.map((batch) => {
        if (!isNoticeThread(host, batch.threadId)) return batch;
        if (batch.events.length === 0) return batch;
        changed = true;
        return { ...batch, events: [] };
      });
      return changed ? { ...event, batches } : event;
    }
    default:
      return event;
  }
}

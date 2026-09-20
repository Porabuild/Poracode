import type { RuntimeEvent } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import { coalesceRuntimeEvents } from "@/shared/coalesce";

const RUNTIME_EVENT_BATCH_MS = 16;

/**
 * Coalesces runtime events per thread and flushes them as IPC envelopes. A
 * single-thread tick uses the cheap `thread-runtime-event(s)` envelope; a
 * multi-thread tick collapses into one `thread-runtime-events-multi` envelope
 * to keep IPC round-trips bounded when many threads stream concurrently.
 *
 * Consecutive `content.delta` events for the same item and stream are merged
 * at this boundary: a token-sized delta otherwise rides a ~250-byte envelope
 * end to end (persisted copies are coalesced separately), and every consumer
 * already merges identical-shape deltas on apply, so the merged form is
 * byte-compatible downstream.
 */
export class RuntimeEventBuffer {
  private readonly pending = new Map<string, RuntimeEvent[]>();
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(private readonly emit: (event: SupervisorEvent) => void) {}

  append(threadId: string, event: RuntimeEvent): void {
    const pending = this.pending.get(threadId);
    if (pending) {
      pending.push(event);
    } else {
      this.pending.set(threadId, [event]);
    }
    this.timer ??= setTimeout(() => {
      this.flush();
    }, RUNTIME_EVENT_BATCH_MS);
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (this.pending.size === 0) return;

    // Single-thread path: keep the existing per-thread IPC shape so single
    // active stream cases stay on the cheaper non-array envelope.
    if (this.pending.size === 1) {
      for (const [threadId, events] of this.pending) {
        const merged = coalesceRuntimeEvents(events);
        if (merged.length === 1) {
          this.emit({ type: "thread-runtime-event", threadId, event: merged[0]! });
        } else if (merged.length > 1) {
          this.emit({ type: "thread-runtime-events", threadId, events: merged });
        }
      }
      this.pending.clear();
      return;
    }

    // Multi-thread path: collapse into a single IPC envelope so 6-8 concurrent
    // streams produce one round-trip per 16ms tick instead of 6-8.
    const batches: { threadId: string; events: RuntimeEvent[] }[] = [];
    for (const [threadId, events] of this.pending) {
      if (events.length > 0) batches.push({ threadId, events: coalesceRuntimeEvents(events) });
    }
    if (batches.length > 0) {
      this.emit({ type: "thread-runtime-events-multi", batches });
    }
    this.pending.clear();
  }
}

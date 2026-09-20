import type { RuntimeEvent } from "@/shared/contracts";
import { coalesceRuntimeEvents } from "@/shared/coalesce";

/**
 * Buffers canonical runtime events per thread so streamed output reaches SQLite
 * in a few coalesced writes per second instead of one full-row rewrite per
 * chunk.
 *
 * The supervisor already batches events on a 16 ms tick, which still leaves ~60
 * writes per second per streaming item, and each of those rewrites the item's
 * entire accumulated `streams` blob synchronously on the main process. Holding
 * events for a short window and merging each item's consecutive deltas collapses
 * that into one write per window.
 *
 * Ordering is preserved: a thread's queue is a single ordered list, and deltas
 * merge only with the immediately preceding delta for the same item and stream,
 * so an `item.started` / `item.completed` between them still lands in order.
 *
 * Reads must not observe a stale transcript, so every reader flushes first (see
 * `runtimeItems.ts`). Buffered events survive at most one window; the queue is
 * also drained before the database closes.
 */
const RUNTIME_WRITE_FLUSH_MS = 250;

type RuntimeWriteFlush = (threadId: string, events: RuntimeEvent[]) => void;

export class RuntimeWriteQueue {
  private readonly pending = new Map<string, RuntimeEvent[]>();
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly write: RuntimeWriteFlush,
    private readonly flushMs: number = RUNTIME_WRITE_FLUSH_MS,
  ) {}

  enqueue(threadId: string, events: readonly RuntimeEvent[]): void {
    if (events.length === 0) return;
    const pending = this.pending.get(threadId);
    // Appended one by one: a replayed sub-agent history can be thousands of
    // events, and spreading that into `push` risks an argument-count limit.
    if (pending) for (const event of events) pending.push(event);
    else this.pending.set(threadId, [...events]);
    this.scheduleFlush();
  }

  /** Drain one thread's queue, or every thread when `threadId` is omitted. */
  flush(threadId?: string): void {
    if (this.pending.size === 0) return;
    if (threadId !== undefined) {
      const events = this.pending.get(threadId);
      if (!events) return;
      this.write(threadId, coalesceRuntimeEvents(events));
      this.pending.delete(threadId);
      return;
    }
    const drained = [...this.pending];
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    for (const [id, events] of drained) {
      this.write(id, coalesceRuntimeEvents(events));
      this.pending.delete(id);
    }
  }

  /** Discard a thread's buffered writes (its rows are going away anyway). */
  discard(threadId: string): void {
    this.pending.delete(threadId);
  }

  private scheduleFlush(): void {
    if (this.timer !== undefined || this.pending.size === 0) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      try {
        this.flush();
      } catch (error) {
        console.error("[db] runtime write flush failed; retrying:", error);
        this.scheduleFlush();
      }
    }, this.flushMs);
    // A pending write must never hold the process open on its own.
    this.timer.unref?.();
  }
}

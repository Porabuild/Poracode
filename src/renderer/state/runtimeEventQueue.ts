import type { RuntimeEvent } from "@/shared/contracts";
import type { EventSequenceSpace } from "@/shared/eventSequenceSpace";

/**
 * The final renderer consumer cannot apply an unbounded stream of runtime
 * deltas. Keep the queue finite and make overflow an explicit recovery event;
 * callers must rebuild the affected thread from authoritative state before
 * resuming live delivery.
 */
export const RUNTIME_EVENT_QUEUE_LIMITS = {
  maxEvents: 4_096,
  maxBytes: 8 * 1024 * 1024,
  maxThreadBytes: 2 * 1024 * 1024,
} as const;

/**
 * A3 cooperative drain: the scheduled flush drains in safe ordered units — a
 * contiguous run of one thread's queued events, capped at this many events —
 * and yields between units once its time budget is spent. The synchronous
 * overflow/recovery paths (`drain`, `discardThroughSequence`) keep their
 * whole-batch atomicity.
 */
export const RUNTIME_EVENT_DRAIN_UNIT_MAX_EVENTS = 512;

export interface RuntimeEventQueueBatch {
  readonly threadId: string;
  readonly events: RuntimeEvent[];
}

export interface RuntimeEventQueueEnqueueResult {
  readonly accepted: boolean;
  readonly overflowed: boolean;
  readonly blocked: boolean;
}

export interface RuntimeEventQueueDiagnostics {
  readonly queuedEvents: number;
  readonly queuedBytes: number;
  readonly blockedThreads: number;
  readonly overflowCount: number;
  readonly peakQueuedBytes: number;
}

export interface RuntimeEventQueueBudgetedDrain {
  readonly batches: RuntimeEventQueueBatch[];
  /** Flushable work remains; the caller should schedule a continuation. */
  readonly hasMore: boolean;
}

interface PendingEntry {
  readonly event: RuntimeEvent;
  readonly sequence?: number;
  readonly space: EventSequenceSpace;
  readonly bytes: number;
}

interface PendingThreadEvents {
  events: PendingEntry[];
  bytes: number;
}

const textEncoder = new TextEncoder();

export class RuntimeEventQueue {
  private readonly pending = new Map<string, PendingThreadEvents>();
  private readonly blockedThreads = new Set<string>();
  private queuedEvents = 0;
  private queuedBytes = 0;
  private overflowCount = 0;
  private peakQueuedBytes = 0;

  constructor(
    private readonly limits: {
      readonly maxEvents?: number;
      readonly maxBytes?: number;
      readonly maxThreadBytes?: number;
    } = {},
  ) {}

  enqueue(
    threadId: string,
    events: readonly RuntimeEvent[],
    sequence?: number,
    space: EventSequenceSpace = "ipc",
  ): RuntimeEventQueueEnqueueResult {
    if (events.length === 0) return { accepted: true, overflowed: false, blocked: false };
    const stamped = events.map((event) => stampQueuedEvent(event, sequence, space));
    const bytes = stamped.reduce((total, entry) => total + entry.bytes, 0);
    const existing = this.pending.get(threadId);
    const nextThreadBytes = (existing?.bytes ?? 0) + bytes;
    const exceedsLimits =
      nextThreadBytes > (this.limits.maxThreadBytes ?? RUNTIME_EVENT_QUEUE_LIMITS.maxThreadBytes) ||
      this.queuedEvents + events.length >
        (this.limits.maxEvents ?? RUNTIME_EVENT_QUEUE_LIMITS.maxEvents) ||
      this.queuedBytes + bytes > (this.limits.maxBytes ?? RUNTIME_EVENT_QUEUE_LIMITS.maxBytes);
    if (exceedsLimits) {
      if (existing) this.removePending(threadId, existing);
      this.blockedThreads.add(threadId);
      this.overflowCount += 1;
      return { accepted: false, overflowed: true, blocked: true };
    }
    if (existing) {
      existing.events.push(...stamped);
      existing.bytes += bytes;
    } else {
      this.pending.set(threadId, { events: stamped, bytes });
    }
    this.queuedEvents += events.length;
    this.queuedBytes += bytes;
    this.peakQueuedBytes = Math.max(this.peakQueuedBytes, this.queuedBytes);
    return { accepted: true, overflowed: false, blocked: this.blockedThreads.has(threadId) };
  }

  /** Whole-batch drain: used by the synchronous `flushSync` ordering path and
   * the recovery arbitration. Atomic per thread; no yields. */
  drain(shouldFlush: (threadId: string) => boolean): RuntimeEventQueueBatch[] {
    return this.drainBudgeted(shouldFlush, Number.POSITIVE_INFINITY).batches;
  }

  /**
   * A3 budgeted drain. When `budgetMs` is finite, at most
   * `RUNTIME_EVENT_DRAIN_UNIT_MAX_EVENTS` events per thread are taken and the
   * loop stops once the budget is spent; remaining work is reported through
   * `hasMore` so the caller can yield and continue. Order inside a thread is
   * exactly the enqueue order, so a truncated frame's events stay ordered.
   */
  drainBudgeted(
    shouldFlush: (threadId: string) => boolean,
    budgetMs: number,
    now: () => number = () => performance.now(),
  ): RuntimeEventQueueBudgetedDrain {
    const batches: RuntimeEventQueueBatch[] = [];
    let hasMore = false;
    const budgeted = Number.isFinite(budgetMs);
    const startedAt = now();
    for (const [threadId, pending] of this.pending) {
      if (this.blockedThreads.has(threadId) || !shouldFlush(threadId)) continue;
      if (pending.events.length === 0) {
        this.pending.delete(threadId);
        continue;
      }
      if (batches.length > 0 && budgeted && now() - startedAt >= budgetMs) {
        hasMore = true;
        break;
      }
      const take = budgeted
        ? Math.min(pending.events.length, RUNTIME_EVENT_DRAIN_UNIT_MAX_EVENTS)
        : pending.events.length;
      const taken = pending.events.splice(0, take);
      const takenBytes = taken.reduce((total, entry) => total + entry.bytes, 0);
      pending.bytes -= takenBytes;
      this.queuedEvents -= taken.length;
      this.queuedBytes -= takenBytes;
      batches.push({ threadId, events: taken.map((entry) => entry.event) });
      if (pending.events.length === 0) {
        this.pending.delete(threadId);
        continue;
      }
      hasMore = true;
      if (budgeted && now() - startedAt >= budgetMs) break;
    }
    return { batches, hasMore };
  }

  resume(threadId: string): void {
    this.blockedThreads.delete(threadId);
  }

  threadIds(): string[] {
    return [...this.pending.keys()].filter((threadId) => !this.blockedThreads.has(threadId));
  }

  has(threadId: string): boolean {
    return this.pending.has(threadId);
  }

  discard(threadId: string): void {
    const pending = this.pending.get(threadId);
    if (pending) this.removePending(threadId, pending);
  }

  discardThroughSequence(
    threadId: string,
    sequence: number,
    space: EventSequenceSpace = "ipc",
  ): void {
    const pending = this.pending.get(threadId);
    if (!pending) return;
    const retained: PendingEntry[] = [];
    let removedEvents = 0;
    let removedBytes = 0;
    for (const entry of pending.events) {
      const covered =
        entry.space === space && entry.sequence !== undefined && entry.sequence <= sequence;
      if (covered) {
        removedEvents += 1;
        removedBytes += entry.bytes;
      } else {
        retained.push(entry);
      }
    }
    if (removedEvents === 0) return;
    this.queuedEvents -= removedEvents;
    this.queuedBytes -= removedBytes;
    if (retained.length === 0) this.pending.delete(threadId);
    else {
      this.pending.set(threadId, {
        events: retained,
        bytes: pending.bytes - removedBytes,
      });
    }
  }

  hasUnsequenced(threadId: string): boolean {
    return (
      this.pending.get(threadId)?.events.some((entry) => entry.sequence === undefined) ?? false
    );
  }

  clear(): void {
    this.pending.clear();
    this.blockedThreads.clear();
    this.queuedEvents = 0;
    this.queuedBytes = 0;
  }

  getDiagnostics(): RuntimeEventQueueDiagnostics {
    return {
      queuedEvents: this.queuedEvents,
      queuedBytes: this.queuedBytes,
      blockedThreads: this.blockedThreads.size,
      overflowCount: this.overflowCount,
      peakQueuedBytes: this.peakQueuedBytes,
    };
  }

  private removePending(threadId: string, pending: PendingThreadEvents): void {
    this.pending.delete(threadId);
    this.queuedEvents -= pending.events.length;
    this.queuedBytes -= pending.bytes;
  }
}

function stampQueuedEvent(
  event: RuntimeEvent,
  sequence: number | undefined,
  space: EventSequenceSpace,
): PendingEntry {
  // Size is measured exactly once, at admission. The removal/arbitration paths
  // reuse it instead of re-serializing the event.
  const bytes = textEncoder.encode(JSON.stringify(event)).byteLength;
  return sequence !== undefined ? { event, sequence, space, bytes } : { event, space, bytes };
}

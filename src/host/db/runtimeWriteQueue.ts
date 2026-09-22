import type { RuntimeEvent } from "@/shared/contracts";
import { coalesceRuntimeEvents } from "@/shared/coalesce";
import { estimateRuntimeEventBytes } from "@/shared/runtimeEventSize";
import type { RuntimeAdmissionRefusalReason, RuntimeRefusalScope } from "./runtimePersistenceTypes";

/**
 * Bounded, per-thread ordered buffering for canonical runtime events before
 * they reach SQLite. Replaces the previous unbounded map + whole-map flush.
 *
 * Contracts:
 *
 * - Per-thread order is never reordered; coalescing happens only at flush time
 *   and merges consecutive same-item/same-stream deltas.
 * - Admission is bounded by count and estimated bytes per thread and globally,
 *   and by age at the controller level. A batch is accepted chunk by chunk at
 *   event boundaries: acceptance stops at the first event that does not fit and
 *   the remaining events are refused (reported by the caller, never silently
 *   evicted). The refusal reason names the exact binding constraint and scope.
 * - A single canonical event has an explicit hard bound
 *   (`maxSingleEventBytes`). The host's per-thread accumulation bound
 *   (`maxPendingBytesPerThread`) is never silently enlarged: one event above it
 *   may occupy a **separately reserved oversize slot** only while the thread is
 *   otherwise empty, only up to the hard single-event bound, and only within
 *   the global budget. Oversize residency is accounted separately in `stats()`
 *   (`oversizeEvents`/`oversizeBytes`) so no consumer can mistake it for
 *   normal per-thread capacity. Above the hard bound the event is explicitly
 *   refused (`reason: "oversize"`) and the caller stops that producer; the
 *   event is never split or truncated.
 * - Nothing already pending is removed to make room. `discard` is the only
 *   removal path besides a committed flush, and callers use it only for a
 *   deletion or an authoritative rebase that explicitly supersedes the prefix.
 * - A failed `write` keeps the pending entry intact for a retry with backoff.
 *   The queue itself throws nothing; scheduling lives in the controller.
 * - A **prefix pin** (`pinThread`) records the intake watermark and forbids any
 *   flush path (barrier, budgeted cycle, fence chunk) from committing events
 *   above it until `releasePin`. This is the write-side half of the
 *   committed-prefix read barrier: while a fence holds, the durable prefix
 *   cannot grow past the pinned cursor, so a read behind the fence is exact.
 *
 * The queue owns no timer and no persistence state machine so it stays a
 * mechanical bounded buffer: admission, flush ordering, and barrier results are
 * all observable by the controller.
 */

export interface RuntimeQueueBounds {
  /** Global count cap across all threads. */
  maxPendingEventsGlobal: number;
  /** Global estimated-byte cap across all threads (hard bound). */
  maxPendingBytesGlobal: number;
  /** Per-thread count cap. */
  maxPendingEventsPerThread: number;
  /**
   * Per-thread accumulated-byte cap for multi-event batches. A lone oversize
   * event may exceed it only through the separately accounted oversize slot.
   */
  maxPendingBytesPerThread: number;
  /**
   * Hard bound for one canonical event. Above it admission refuses explicitly
   * (`reason: "oversize"`); the producer is stopped rather than silently
   * dropping or truncating the event.
   */
  maxSingleEventBytes: number;
  /** Age after which the controller must stop admission (checked on its tick). */
  maxPendingAgeMs: number;
}

export const DEFAULT_RUNTIME_QUEUE_BOUNDS: RuntimeQueueBounds = {
  maxPendingEventsGlobal: 50_000,
  maxPendingBytesGlobal: 32 * 1024 * 1024,
  maxPendingEventsPerThread: 5_000,
  maxPendingBytesPerThread: 4 * 1024 * 1024,
  maxSingleEventBytes: 8 * 1024 * 1024,
  maxPendingAgeMs: 30_000,
};

export interface RuntimeEnqueueResult {
  kind: "accepted" | "refused";
  /** Events accepted from this batch (0 when refused). */
  acceptedEvents: number;
  acceptedBytes: number;
  /** Events refused from this batch (0 when accepted). */
  refusedEvents: number;
  refusedBytes: number;
  /** Highest persistSeq allocated by this call (0 when nothing was accepted). */
  persistSeq: number;
  /** Present when at least one event was refused. The exact binding constraint. */
  reason?: RuntimeAdmissionRefusalReason;
  /** Present with `reason`: which budget refused. */
  scope?: RuntimeRefusalScope;
}

export interface RuntimeFlushOutcome {
  kind: "committed" | "failed" | "empty";
  persistSeq: number;
  committedEvents: number;
  committedBytes: number;
  /** True when more events at or below the requested watermark remain. */
  remainingWithinThrough: boolean;
  /** Present on a failed write: the error the controller must classify. */
  error?: unknown;
}

export interface RuntimeBudgetedFlushResult {
  flushedThreads: number;
  committedEvents: number;
  committedBytes: number;
  /** First failure this cycle, if any. The queue retained the thread's events. */
  failure: { threadId: string; error: unknown } | null;
  /** Threads still pending after the cycle. */
  remainingThreads: number;
  elapsedMs: number;
}

export interface RuntimeBudgetedFlushOptions {
  maxThreads: number;
  maxBytes: number;
  maxMs: number;
  /** Per-transaction chunk bound; defaults to {@link DEFAULT_RUNTIME_FLUSH_CHUNK}. */
  chunk?: RuntimeFlushChunkBounds;
  now?: () => number;
}

export interface RuntimeQueueStats {
  pendingThreads: number;
  pendingEvents: number;
  pendingEstimatedBytes: number;
  oldestPendingAgeMs: number | null;
  /** Events admitted since process start (intake accounting). */
  admittedEvents: number;
  admittedBytes: number;
  refusedEvents: number;
  refusedBytes: number;
  /**
   * Resident lone-oversize events/bytes admitted through the separately
   * reserved slot. Disjoint from normal per-thread batch residency only in the
   * sense that these threads hold nothing else; they are included in the
   * global totals above.
   */
  oversizeEvents: number;
  oversizeBytes: number;
  /** Input vs coalesced output byte estimates summed at flush time. */
  coalescedInputBytes: number;
  coalescedOutputBytes: number;
  committedThroughPersistSeq: number;
}

interface PendingEvent {
  event: RuntimeEvent;
  persistSeq: number;
  bytes: number;
  enqueuedAt: number;
}

interface PendingThread {
  events: PendingEvent[];
  estimatedBytes: number;
  firstEnqueuedAt: number;
  lastEnqueuedAt: number;
  firstPersistSeq: number;
  lastPersistSeq: number;
  /** Set when a lone oversize event landed in an otherwise empty thread. */
  forceFlush: boolean;
}

export type RuntimeWriteFlush = (threadId: string, events: readonly RuntimeEvent[]) => void;

export interface RuntimeFlushChunkBounds {
  /** Commit at most this many events in one transaction. */
  maxEvents: number;
  /** Commit at most this many estimated input bytes in one transaction. */
  maxBytes: number;
}

export const DEFAULT_RUNTIME_FLUSH_CHUNK: RuntimeFlushChunkBounds = {
  maxEvents: 500,
  maxBytes: 1024 * 1024,
};

export class RuntimeWriteQueue {
  private readonly pending = new Map<string, PendingThread>();
  private readonly committedByThread = new Map<string, number>();
  private readonly pins = new Map<string, number>();
  private readonly bounds: RuntimeQueueBounds;
  private nextPersistSeq = 1;
  private committedThroughPersistSeq = 0;
  private admittedEvents = 0;
  private admittedBytes = 0;
  private refusedEvents = 0;
  private refusedBytes = 0;
  private oversizeEvents = 0;
  private oversizeBytes = 0;
  private coalescedInputBytes = 0;
  private coalescedOutputBytes = 0;
  private queueGeneration = 1;

  constructor(
    private readonly write: RuntimeWriteFlush,
    bounds: Partial<RuntimeQueueBounds> = {},
    private readonly now: () => number = () => Date.now(),
  ) {
    this.bounds = { ...DEFAULT_RUNTIME_QUEUE_BOUNDS, ...bounds };
  }

  getBounds(): RuntimeQueueBounds {
    return this.bounds;
  }

  /** Bumped whenever the queue is cleared/reset; stale fence tokens compare against it. */
  get generation(): number {
    return this.queueGeneration;
  }

  /**
   * Admit as much of `events` as the bounds allow, in order. The caller's array
   * is taken by reference and never mutated; the queue owns the admitted
   * events. Refused events are reported with the exact reason and scope, never
   * dropped silently by the queue itself: the caller decides the producer
   * signal and diagnostic.
   */
  enqueue(threadId: string, events: readonly RuntimeEvent[]): RuntimeEnqueueResult {
    if (events.length === 0) {
      return {
        kind: "accepted",
        acceptedEvents: 0,
        acceptedBytes: 0,
        refusedEvents: 0,
        refusedBytes: 0,
        persistSeq: 0,
      };
    }
    const globalRemainingBytes = this.bounds.maxPendingBytesGlobal - this.pendingBytes();
    const globalRemainingEvents = this.bounds.maxPendingEventsGlobal - this.pendingEvents();

    let acceptedEvents = 0;
    let acceptedBytes = 0;
    let refusedEvents = 0;
    let refusedBytes = 0;
    let refusalReason: RuntimeAdmissionRefusalReason | undefined;
    let refusalScope: RuntimeRefusalScope | undefined;
    let lastSeq = 0;
    let entry = this.pending.get(threadId);

    for (let index = 0; index < events.length; index += 1) {
      const event = events[index]!;
      const bytes = estimateRuntimeEventBytes(event);
      const threadEvents = entry?.events.length ?? 0;
      const threadBytes = entry?.estimatedBytes ?? 0;
      const globalBytesLeft = globalRemainingBytes - acceptedBytes;
      const globalEventsLeft = globalRemainingEvents - acceptedEvents;

      // The explicit hard bound comes first: it is a property of the event
      // itself and names the reason precisely.
      const oversizeEvent = bytes > this.bounds.maxSingleEventBytes;
      // One lone event may use the separately reserved oversize slot. It is
      // admitted only into an empty thread, is never combined with other
      // events, and is accounted apart from normal per-thread capacity.
      const usesOversizeSlot =
        !oversizeEvent && threadEvents === 0 && bytes > this.bounds.maxPendingBytesPerThread;
      const fitsThreadBytes =
        usesOversizeSlot || threadBytes + bytes <= this.bounds.maxPendingBytesPerThread;
      const fitsThreadCount = threadEvents + 1 <= this.bounds.maxPendingEventsPerThread;
      const fitsGlobal = bytes <= globalBytesLeft && 1 <= globalEventsLeft;

      if (oversizeEvent || !fitsThreadCount || !fitsThreadBytes || !fitsGlobal) {
        if (oversizeEvent) {
          refusalReason = "oversize";
          refusalScope = "thread";
        } else if (!fitsThreadCount) {
          refusalReason = "thread-events";
          refusalScope = "thread";
        } else if (!fitsThreadBytes) {
          refusalReason = "thread-bytes";
          refusalScope = "thread";
        } else if (bytes > globalBytesLeft) {
          refusalReason = "global-bytes";
          refusalScope = "global";
        } else {
          refusalReason = "global-events";
          refusalScope = "global";
        }
        for (let rest = index; rest < events.length; rest += 1) {
          refusedEvents += 1;
          refusedBytes += estimateRuntimeEventBytes(events[rest]!);
        }
        break;
      }

      const persistSeq = this.nextPersistSeq++;
      const now = this.now();
      if (!entry) {
        entry = {
          events: [],
          estimatedBytes: 0,
          firstEnqueuedAt: now,
          lastEnqueuedAt: now,
          firstPersistSeq: persistSeq,
          lastPersistSeq: persistSeq,
          forceFlush: false,
        };
        this.pending.set(threadId, entry);
      }
      entry.events.push({ event, persistSeq, bytes, enqueuedAt: now });
      entry.estimatedBytes += bytes;
      entry.lastEnqueuedAt = now;
      entry.lastPersistSeq = persistSeq;
      if (usesOversizeSlot) {
        entry.forceFlush = true;
        this.oversizeEvents += 1;
        this.oversizeBytes += bytes;
      }
      acceptedEvents += 1;
      acceptedBytes += bytes;
      lastSeq = persistSeq;
    }

    this.admittedEvents += acceptedEvents;
    this.admittedBytes += acceptedBytes;
    this.refusedEvents += refusedEvents;
    this.refusedBytes += refusedBytes;

    if (acceptedEvents === 0) {
      return {
        kind: "refused",
        acceptedEvents: 0,
        acceptedBytes: 0,
        refusedEvents,
        refusedBytes,
        persistSeq: 0,
        reason: refusalReason ?? "thread-events",
        scope: refusalScope ?? "thread",
      };
    }

    return {
      kind: "accepted",
      acceptedEvents,
      acceptedBytes,
      refusedEvents,
      refusedBytes,
      persistSeq: lastSeq,
      ...(refusedEvents > 0 && refusalReason !== undefined
        ? {
            reason: refusalReason,
            ...(refusalScope !== undefined ? { scope: refusalScope } : {}),
          }
        : {}),
    };
  }

  /**
   * Pin a thread's prefix at its current intake watermark. Flushes stop at the
   * pin until released, so the committed prefix is exactly what a fence
   * captured. Returns the pinned watermark (0 when the thread has nothing).
   */
  pinThread(threadId: string): number {
    const through = this.lastPersistSeqForThread(threadId);
    this.pins.set(threadId, through);
    return through;
  }

  /** Set/replace the pin explicitly (fence queue head changes, lock cleanup). */
  setPin(threadId: string, through: number | null): void {
    if (through === null) this.pins.delete(threadId);
    else this.pins.set(threadId, through);
  }

  releasePin(threadId: string): void {
    this.pins.delete(threadId);
  }

  isPinned(threadId: string): boolean {
    return this.pins.has(threadId);
  }

  pinnedThrough(threadId: string): number | null {
    return this.pins.get(threadId) ?? null;
  }

  /** Highest intake sequence allocated for the thread, 0 when nothing exists. */
  lastPersistSeqForThread(threadId: string): number {
    return this.pending.get(threadId)?.lastPersistSeq ?? this.committedByThread.get(threadId) ?? 0;
  }

  /**
   * Drain one thread up to its pin (or completely when unpinned). On failure
   * the entry is retained untouched.
   */
  flushThread(threadId: string): RuntimeFlushOutcome {
    return this.flushThreadThrough(threadId, this.pins.get(threadId) ?? Number.MAX_SAFE_INTEGER, {
      maxEvents: Number.MAX_SAFE_INTEGER,
      maxBytes: Number.MAX_SAFE_INTEGER,
    });
  }

  /**
   * Commit one chunk of the thread's prefix at or below `throughSeq`. The write
   * is synchronous, so a committed result means the chunk is in SQLite; the
   * remaining prefix stays pending for the next chunk/cycle. Order and final
   * state are preserved because coalescing only merges consecutive deltas.
   */
  flushThreadThrough(
    threadId: string,
    throughSeq: number,
    chunk: RuntimeFlushChunkBounds = DEFAULT_RUNTIME_FLUSH_CHUNK,
  ): RuntimeFlushOutcome {
    const entry = this.pending.get(threadId);
    if (!entry || entry.events.length === 0) {
      return {
        kind: "empty",
        persistSeq: this.committedByThread.get(threadId) ?? 0,
        committedEvents: 0,
        committedBytes: 0,
        remainingWithinThrough: false,
      };
    }
    let take = 0;
    let takeBytes = 0;
    for (const pendingEvent of entry.events) {
      if (pendingEvent.persistSeq > throughSeq) break;
      if (
        take > 0 &&
        (take >= chunk.maxEvents || takeBytes + pendingEvent.bytes > chunk.maxBytes)
      ) {
        break;
      }
      take += 1;
      takeBytes += pendingEvent.bytes;
    }
    if (take === 0) {
      return {
        kind: "empty",
        persistSeq: this.committedByThread.get(threadId) ?? 0,
        committedEvents: 0,
        committedBytes: 0,
        remainingWithinThrough: false,
      };
    }

    const committed = entry.events.slice(0, take);
    const inputBytes = committed.reduce((total, item) => total + item.bytes, 0);
    let coalesced: RuntimeEvent[];
    try {
      coalesced = coalesceRuntimeEvents(committed.map((item) => item.event));
    } catch (error) {
      return {
        kind: "failed",
        persistSeq: this.committedByThread.get(threadId) ?? 0,
        committedEvents: 0,
        committedBytes: 0,
        remainingWithinThrough: true,
        error,
      };
    }
    try {
      this.write(threadId, coalesced);
    } catch (error) {
      // Retain the original entry (with its estimates) for a retry.
      return {
        kind: "failed",
        persistSeq: this.committedByThread.get(threadId) ?? 0,
        committedEvents: 0,
        committedBytes: 0,
        remainingWithinThrough: true,
        error,
      };
    }

    const lastSeq = committed[committed.length - 1]!.persistSeq;
    const wasOversize = entry.forceFlush && entry.events.length === take && take === 1;
    if (wasOversize) {
      this.oversizeEvents = Math.max(0, this.oversizeEvents - 1);
      this.oversizeBytes = Math.max(0, this.oversizeBytes - committed[0]!.bytes);
    }
    entry.events.splice(0, take);
    entry.estimatedBytes -= inputBytes;
    if (entry.events.length === 0) {
      this.pending.delete(threadId);
    } else {
      entry.firstPersistSeq = entry.events[0]!.persistSeq;
      // Truthful age: the oldest still-pending event, not the newest arrival.
      entry.firstEnqueuedAt = entry.events[0]!.enqueuedAt;
      entry.forceFlush = false;
    }
    this.coalescedInputBytes += inputBytes;
    this.coalescedOutputBytes += estimateCoalescedBytes(coalesced);
    this.committedThroughPersistSeq = Math.max(this.committedThroughPersistSeq, lastSeq);
    this.committedByThread.set(
      threadId,
      Math.max(this.committedByThread.get(threadId) ?? 0, lastSeq),
    );
    const remainingWithinThrough =
      entry.events.length > 0 && entry.events[0]!.persistSeq <= throughSeq;
    return {
      kind: "committed",
      persistSeq: lastSeq,
      committedEvents: take,
      committedBytes: inputBytes,
      remainingWithinThrough,
    };
  }

  /**
   * Flush oldest-pending-first, at most `maxThreads` threads / `maxBytes`
   * committed bytes / `maxMs` elapsed, respecting prefix pins. Each visit
   * commits at most one chunk (`chunk`: 500 events / 1 MiB by default), so no
   * single transaction can grow with a thread's backlog; a thread with more
   * work is revisited on the next cycle, which the caller schedules. Stops at
   * the first failure and leaves that thread's entry pending.
   */
  flushBudgeted(options: RuntimeBudgetedFlushOptions): RuntimeBudgetedFlushResult {
    const now = options.now ?? Date.now;
    const startedAt = now();
    const chunk = options.chunk ?? DEFAULT_RUNTIME_FLUSH_CHUNK;
    const order = [...this.pending.entries()]
      .sort((a, b) => a[1].firstEnqueuedAt - b[1].firstEnqueuedAt)
      .map(([threadId]) => threadId);

    let flushedThreads = 0;
    let committedEvents = 0;
    let committedBytes = 0;
    let failure: RuntimeBudgetedFlushResult["failure"] = null;

    for (const threadId of order) {
      if (flushedThreads >= options.maxThreads) break;
      if (committedBytes >= options.maxBytes) break;
      if (now() - startedAt >= options.maxMs) break;
      const outcome = this.flushThreadThrough(
        threadId,
        this.pins.get(threadId) ?? Number.MAX_SAFE_INTEGER,
        chunk,
      );
      if (outcome.kind === "failed") {
        failure = { threadId, error: outcome.error };
        break;
      }
      if (outcome.kind === "committed") {
        flushedThreads += 1;
        committedEvents += outcome.committedEvents;
        committedBytes += outcome.committedBytes;
      }
    }

    return {
      flushedThreads,
      committedEvents,
      committedBytes,
      failure,
      remainingThreads: this.pending.size,
      elapsedMs: now() - startedAt,
    };
  }

  /** Threads with buffered writes, oldest pending first. */
  pendingThreadIds(): string[] {
    return [...this.pending.entries()]
      .sort((a, b) => a[1].firstEnqueuedAt - b[1].firstEnqueuedAt)
      .map(([threadId]) => threadId);
  }

  /** Threads with an oversized single event that must drain promptly. */
  forceFlushThreadIds(): string[] {
    const ids: string[] = [];
    for (const [threadId, entry] of this.pending) {
      if (entry.forceFlush) ids.push(threadId);
    }
    return ids;
  }

  /**
   * Drop a thread's buffered writes. Only for deletion or an authoritative
   * rebase (reset/replace) that explicitly supersedes the prefix, and only
   * from under the per-thread mutation gate. Returns the number of accepted
   * events discarded so the caller can report the explicit supersede.
   */
  discard(threadId: string): number {
    const entry = this.pending.get(threadId);
    const discarded = entry?.events.length ?? 0;
    if (entry?.forceFlush) {
      this.oversizeEvents = Math.max(0, this.oversizeEvents - 1);
      this.oversizeBytes -= entry.estimatedBytes;
      if (this.oversizeBytes < 0) this.oversizeBytes = 0;
    }
    this.pending.delete(threadId);
    this.committedByThread.delete(threadId);
    this.pins.delete(threadId);
    return discarded;
  }

  /** Highest persistSeq committed for a thread, or 0 when nothing has committed. */
  committedThrough(threadId: string): number {
    return this.committedByThread.get(threadId) ?? 0;
  }

  hasPending(threadId?: string): boolean {
    return threadId === undefined ? this.pending.size > 0 : this.pending.has(threadId);
  }

  pendingEvents(threadId?: string): number {
    if (threadId !== undefined) return this.pending.get(threadId)?.events.length ?? 0;
    return this.pendingEventsValue;
  }

  pendingBytes(threadId?: string): number {
    if (threadId !== undefined) return this.pending.get(threadId)?.estimatedBytes ?? 0;
    return this.pendingBytesValue;
  }

  /** Events at or below the thread's pin that are still uncommitted. */
  pendingWithinPin(threadId: string): number {
    const entry = this.pending.get(threadId);
    const pin = this.pins.get(threadId);
    if (!entry || pin === undefined) return 0;
    let count = 0;
    for (const pendingEvent of entry.events) {
      if (pendingEvent.persistSeq > pin) break;
      count += 1;
    }
    return count;
  }

  oldestPendingAgeMs(now: number = this.now()): number | null {
    let oldest: number | null = null;
    for (const entry of this.pending.values()) {
      const age = now - entry.firstEnqueuedAt;
      if (oldest === null || age > oldest) oldest = age;
    }
    return oldest;
  }

  stats(): RuntimeQueueStats {
    return {
      pendingThreads: this.pending.size,
      pendingEvents: this.pendingEventsValue,
      pendingEstimatedBytes: this.pendingBytesValue,
      oldestPendingAgeMs: this.pending.size === 0 ? null : this.oldestPendingAgeMs(),
      admittedEvents: this.admittedEvents,
      admittedBytes: this.admittedBytes,
      refusedEvents: this.refusedEvents,
      refusedBytes: this.refusedBytes,
      oversizeEvents: this.oversizeEvents,
      oversizeBytes: this.oversizeBytes,
      coalescedInputBytes: this.coalescedInputBytes,
      coalescedOutputBytes: this.coalescedOutputBytes,
      committedThroughPersistSeq: this.committedThroughPersistSeq,
    };
  }

  /** Test/close helper: forget all pending entries without writing them. */
  clear(): void {
    this.pending.clear();
    this.committedByThread.clear();
    this.pins.clear();
    this.oversizeEvents = 0;
    this.oversizeBytes = 0;
    this.queueGeneration += 1;
  }

  private get pendingEventsValue(): number {
    let total = 0;
    for (const entry of this.pending.values()) total += entry.events.length;
    return total;
  }

  private get pendingBytesValue(): number {
    let total = 0;
    for (const entry of this.pending.values()) total += entry.estimatedBytes;
    return total;
  }
}

function estimateCoalescedBytes(events: readonly RuntimeEvent[]): number {
  let total = 0;
  for (const event of events) total += estimateRuntimeEventBytes(event);
  return total;
}

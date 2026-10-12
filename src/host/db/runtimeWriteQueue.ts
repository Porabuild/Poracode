import type { RuntimeEvent } from "@/shared/contracts";
import { estimateRuntimeEventBytes } from "@/shared/runtimeEventSize";
import type { RuntimeAdmissionRefusalReason, RuntimeRefusalScope } from "./runtimePersistenceTypes";
import {
  RuntimeAdmissionReservations,
  type RuntimeAdmissionCost,
  type RuntimeReservationResult,
} from "./runtimeAdmissionReservations";
import {
  runtimeQueueCapacitySnapshot,
  type RuntimeQueueCapacityChange,
  type RuntimeQueueCapacitySnapshot,
} from "./runtimeQueueCapacity";
import {
  DEFAULT_RUNTIME_FLUSH_CHUNK,
  acknowledgeRuntimeFlush,
  flushRuntimeQueueBudgeted,
  planRuntimeFlush,
  type PendingRuntimeThread,
  type RuntimeAtomicBatchWriter,
  type RuntimeBudgetedFlushOptions,
  type RuntimeBudgetedFlushResult,
  type RuntimeFlushChunkBounds,
  type RuntimeFlushOutcome,
  type RuntimeFlushPlan,
  type RuntimeFlushRecovery,
  type RuntimeWriteFlush,
} from "./runtimeWriteQueueFlush";

export { DEFAULT_RUNTIME_FLUSH_CHUNK } from "./runtimeWriteQueueFlush";
export type {
  RuntimeAtomicBatchWriter,
  RuntimeBudgetedFlushOptions,
  RuntimeBudgetedFlushResult,
  RuntimeFlushChunkBounds,
  RuntimeFlushOutcome,
  RuntimeWriteBatch,
  RuntimeWriteFlush,
} from "./runtimeWriteQueueFlush";

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

export class RuntimeWriteQueue {
  private readonly pending = new Map<string, PendingRuntimeThread>();
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
  private capacityRevision = 0;
  private pendingEventsValue = 0;
  private pendingBytesValue = 0;
  private reservations: RuntimeAdmissionReservations | null = null;
  private readonly flushRecovery: RuntimeFlushRecovery = { retryIndividually: false };

  constructor(
    private readonly write: RuntimeWriteFlush,
    bounds: Partial<RuntimeQueueBounds> = {},
    private readonly now: () => number = () => Date.now(),
    private readonly atomicBatchWriter?: RuntimeAtomicBatchWriter,
    private readonly onCapacityChange?: (change: RuntimeQueueCapacityChange) => void,
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

  /** Current byte/count capacity for the caller's selected threads. No reservation is made. */
  capacitySnapshot(threadIds: readonly string[] = []): RuntimeQueueCapacitySnapshot {
    return runtimeQueueCapacitySnapshot({
      generation: this.queueGeneration,
      revision: this.capacityRevision,
      throughPersistSeq: this.nextPersistSeq - 1,
      pendingEvents: this.pendingEventsValue,
      pendingBytes: this.pendingBytesValue,
      reservedEvents: this.reservations?.events ?? 0,
      reservedBytes: this.reservations?.bytes ?? 0,
      bounds: this.bounds,
      threadIds,
      readThread: (threadId) => {
        const reserved = this.reservations?.forThread(threadId);
        return {
          pendingEvents: this.pendingEvents(threadId),
          pendingBytes: this.pendingBytes(threadId),
          reservedEvents: reserved?.eventCount ?? 0,
          reservedBytes: reserved?.eventBytes ?? 0,
          pinnedThrough: this.pinnedThrough(threadId),
        };
      },
    });
  }

  /** Protect an exact future batch against every other queue admission. */
  reserveAdmission(threadId: string, cost: RuntimeAdmissionCost): RuntimeReservationResult {
    const result = (this.reservations ??= new RuntimeAdmissionReservations(this.bounds)).reserve({
      threadId,
      cost,
      generation: this.queueGeneration,
      pendingEvents: this.pendingEventsValue,
      pendingBytes: this.pendingBytesValue,
      threadPendingEvents: this.pendingEvents(threadId),
      threadPendingBytes: this.pendingBytes(threadId),
    });
    if (result.kind === "granted") this.capacityChanged("reserved", threadId);
    return result;
  }

  /** Cancel unsent work, or release grants after their owner's transport stops. */
  releaseAdmissionReservation(id: string): boolean {
    const threadId = this.reservations?.release(id);
    if (threadId == null) return false;
    this.capacityChanged("reservation-released", threadId);
    return true;
  }

  /** Single-use exact-cost transfer from a grant into ordinary queued custody. */
  enqueueReserved(
    threadId: string,
    id: string,
    events: readonly RuntimeEvent[],
  ): RuntimeEnqueueResult | { kind: "invalid-reservation" } {
    return (
      this.prepareReservedAdmission(threadId, id, events)?.() ?? { kind: "invalid-reservation" }
    );
  }

  /**
   * Validate before controller durability/health gates, without consuming the
   * lease or serializing the payload twice. Invoke the returned transfer in
   * the same synchronous turn; events must remain immutable, as for enqueue.
   * The closure is temporary caller custody, never retained by the queue.
   */
  prepareReservedAdmission(
    threadId: string,
    id: string,
    events: readonly RuntimeEvent[],
  ): (() => RuntimeEnqueueResult | { kind: "invalid-reservation" }) | null {
    if (!this.reservations) return null;
    const bytes = events.map(estimateRuntimeEventBytes);
    const cost = {
      eventCount: events.length,
      eventBytes: bytes.reduce((total, size) => total + size, 0),
      maxEventBytes: bytes.reduce((max, size) => Math.max(max, size), 0),
    };
    if (!this.reservations.matches(id, this.queueGeneration, threadId, cost)) return null;
    return () => {
      if (!this.reservations?.consume(id, this.queueGeneration, threadId, cost))
        return { kind: "invalid-reservation" };
      // No observer runs between releasing the lease and taking batch custody.
      return this.enqueueWithEstimates(threadId, events, bytes);
    };
  }

  /**
   * Admit as much of `events` as the bounds allow, in order. The caller's array
   * is taken by reference and never mutated; the queue owns the admitted
   * events. Refused events are reported with the exact reason and scope, never
   * dropped silently by the queue itself: the caller decides the producer
   * signal and diagnostic.
   */
  enqueue(threadId: string, events: readonly RuntimeEvent[]): RuntimeEnqueueResult {
    return this.enqueueWithEstimates(threadId, events);
  }

  private enqueueWithEstimates(
    threadId: string,
    events: readonly RuntimeEvent[],
    estimates?: readonly number[],
  ): RuntimeEnqueueResult {
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
    const globalRemainingBytes =
      this.bounds.maxPendingBytesGlobal - this.pendingBytes() - (this.reservations?.bytes ?? 0);
    const globalRemainingEvents =
      this.bounds.maxPendingEventsGlobal - this.pendingEvents() - (this.reservations?.events ?? 0);
    const reservedThread = this.reservations?.forThread(threadId);

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
      const bytes = estimates?.[index] ?? estimateRuntimeEventBytes(event);
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
        !oversizeEvent &&
        threadEvents === 0 &&
        (reservedThread?.eventCount ?? 0) === 0 &&
        bytes > this.bounds.maxPendingBytesPerThread;
      const fitsThreadBytes =
        usesOversizeSlot ||
        threadBytes + (reservedThread?.eventBytes ?? 0) + bytes <=
          this.bounds.maxPendingBytesPerThread;
      const fitsThreadCount =
        threadEvents + (reservedThread?.eventCount ?? 0) + 1 <=
        this.bounds.maxPendingEventsPerThread;
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
          refusedBytes += estimates?.[rest] ?? estimateRuntimeEventBytes(events[rest]!);
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
      this.pendingEventsValue += 1;
      this.pendingBytesValue += bytes;
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
    if (acceptedEvents > 0) this.capacityChanged("admitted", threadId);

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
    this.setPin(threadId, through);
    return through;
  }

  /** Set/replace the pin explicitly (fence queue head changes, lock cleanup). */
  setPin(threadId: string, through: number | null): void {
    if (this.pinnedThrough(threadId) === through) return;
    if (through === null) this.pins.delete(threadId);
    else this.pins.set(threadId, through);
    this.capacityChanged("pin", threadId);
  }

  releasePin(threadId: string): void {
    this.setPin(threadId, null);
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
    const through = Math.min(throughSeq, this.pins.get(threadId) ?? Number.MAX_SAFE_INTEGER);
    let plan: RuntimeFlushPlan | null;
    try {
      plan = planRuntimeFlush(threadId, this.pending.get(threadId), through, chunk);
      if (plan) this.write(threadId, plan.events);
    } catch (error) {
      return {
        kind: "failed",
        persistSeq: this.committedThrough(threadId),
        committedEvents: 0,
        committedBytes: 0,
        remainingWithinThrough: true,
        error,
      };
    }
    if (!plan) {
      return {
        kind: "empty",
        persistSeq: this.committedThrough(threadId),
        committedEvents: 0,
        committedBytes: 0,
        remainingWithinThrough: false,
      };
    }
    this.acknowledgeFlush(plan);
    return {
      kind: "committed",
      persistSeq: plan.lastSeq,
      committedEvents: plan.eventCount,
      committedBytes: plan.inputBytes,
      remainingWithinThrough:
        plan.entry.events.length > 0 && plan.entry.events[0]!.persistSeq <= through,
    };
  }

  /** Oldest-first bounded prefixes; the optional atomic writer commits a group. */
  flushBudgeted(options: RuntimeBudgetedFlushOptions): RuntimeBudgetedFlushResult {
    return flushRuntimeQueueBudgeted(
      {
        pending: this.pending,
        pins: this.pins,
        write: this.write,
        atomicBatchWriter: this.atomicBatchWriter,
        recovery: this.flushRecovery,
        acknowledge: (plan) => this.acknowledgeFlush(plan),
      },
      options,
    );
  }

  /** The sole flush acknowledgement path, invoked only after actual COMMIT. */
  private acknowledgeFlush(plan: RuntimeFlushPlan): void {
    acknowledgeRuntimeFlush(this.pending, plan);
    this.pendingEventsValue -= plan.eventCount;
    this.pendingBytesValue -= plan.inputBytes;
    if (plan.oversizeBytes > 0) {
      this.oversizeEvents -= 1;
      this.oversizeBytes -= plan.oversizeBytes;
    }
    this.coalescedInputBytes += plan.inputBytes;
    this.coalescedOutputBytes += plan.outputBytes;
    this.committedThroughPersistSeq = Math.max(this.committedThroughPersistSeq, plan.lastSeq);
    this.committedByThread.set(
      plan.threadId,
      Math.max(this.committedByThread.get(plan.threadId) ?? 0, plan.lastSeq),
    );
    this.capacityChanged("committed", plan.threadId);
  }

  /** Threads with buffered writes, oldest pending first. */
  pendingThreadIds(): string[] {
    return [...this.pending.entries()]
      .sort((a, b) => a[1].firstEnqueuedAt - b[1].firstEnqueuedAt)
      .map(([threadId]) => threadId);
  }

  /** Detached payload-event inventory after a producer has retired. */
  pendingItemPayloadEvents(): Array<
    Extract<RuntimeEvent, { type: "item.started" | "item.updated" }>
  > {
    return [...this.pending.values()].flatMap((entry) =>
      entry.events.flatMap(({ event }) =>
        event.type === "item.started" || event.type === "item.updated"
          ? [structuredClone(event)]
          : [],
      ),
    );
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
    const hadReservations = this.reservations?.discardThread(threadId) ?? false;
    const changed =
      entry !== undefined ||
      this.committedByThread.has(threadId) ||
      this.pins.has(threadId) ||
      hadReservations;
    this.pendingEventsValue -= discarded;
    this.pendingBytesValue -= entry?.estimatedBytes ?? 0;
    if (entry?.forceFlush) {
      this.oversizeEvents = Math.max(0, this.oversizeEvents - 1);
      this.oversizeBytes -= entry.estimatedBytes;
      if (this.oversizeBytes < 0) this.oversizeBytes = 0;
    }
    this.pending.delete(threadId);
    this.committedByThread.delete(threadId);
    this.pins.delete(threadId);
    if (changed) this.capacityChanged("discarded", threadId);
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
    this.pendingEventsValue = 0;
    this.pendingBytesValue = 0;
    this.reservations = null;
    this.queueGeneration += 1;
    this.flushRecovery.retryIndividually = false;
    this.capacityChanged("reset");
  }

  private capacityChanged(kind: RuntimeQueueCapacityChange["kind"], threadId?: string): void {
    this.capacityRevision += 1;
    if (!this.onCapacityChange) return;
    // Observers run after custody/accounting changes. A diagnostic or transport
    // listener must never turn a successful COMMIT into a retry of its prefix.
    try {
      this.onCapacityChange({
        generation: this.queueGeneration,
        revision: this.capacityRevision,
        throughPersistSeq: this.nextPersistSeq - 1,
        kind,
        ...(threadId !== undefined ? { threadId } : {}),
      });
    } catch (error) {
      console.error("[db] runtime queue capacity listener failed:", error);
    }
  }
}

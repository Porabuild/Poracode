import type { RuntimeEvent } from "@/shared/contracts";
import { coalesceRuntimeEvents } from "@/shared/coalesce";
import { estimateRuntimeEventBytes } from "@/shared/runtimeEventSize";

export interface RuntimeFlushOutcome {
  kind: "committed" | "failed" | "empty";
  persistSeq: number;
  committedEvents: number;
  committedBytes: number;
  remainingWithinThrough: boolean;
  error?: unknown;
}

export interface RuntimeBudgetedFlushResult {
  flushedThreads: number;
  committedEvents: number;
  committedBytes: number;
  /** First failed write; for an unisolated batch failure, its oldest affected thread. */
  failure: { threadId: string; error: unknown } | null;
  remainingThreads: number;
  elapsedMs: number;
}

export interface RuntimeFlushChunkBounds {
  maxEvents: number;
  maxBytes: number;
}

export const DEFAULT_RUNTIME_FLUSH_CHUNK: RuntimeFlushChunkBounds = {
  maxEvents: 500,
  maxBytes: 1024 * 1024,
};

export interface RuntimeBudgetedFlushOptions {
  maxThreads: number;
  maxBytes: number;
  /** Admission deadline, not an interrupt: one selected SQL transaction can exceed it. */
  maxMs: number;
  chunk?: RuntimeFlushChunkBounds;
  now?: () => number;
}

export type RuntimeWriteFlush = (threadId: string, events: readonly RuntimeEvent[]) => void;

export interface RuntimeWriteBatch {
  readonly threadId: string;
  readonly events: readonly RuntimeEvent[];
}

/**
 * Optional storage capability, independent of provider and durable row format.
 * Synchronous and storage-only: no awaits, queue mutations, reads through a
 * fence, notifications or other caller callbacks inside the transaction.
 * `committed` means the OUTERMOST commit completed. `rolled-back` proves no
 * selected event or usage entry committed and no transaction remains active;
 * only that result permits ordered single-thread fallback. A throw MUST mean
 * no commit occurred (even cleanup errors after commit must return committed),
 * but supplies no rollback proof: every prefix stays pending and subsequent
 * atomic attempts must still establish a clean top-level transaction boundary.
 */
export type RuntimeAtomicBatchWriter = (
  batches: readonly RuntimeWriteBatch[],
) => { kind: "committed" } | { kind: "rolled-back"; error: unknown };

export interface PendingRuntimeEvent {
  event: RuntimeEvent;
  persistSeq: number;
  bytes: number;
  enqueuedAt: number;
}

export interface PendingRuntimeThread {
  events: PendingRuntimeEvent[];
  estimatedBytes: number;
  firstEnqueuedAt: number;
  lastEnqueuedAt: number;
  firstPersistSeq: number;
  lastPersistSeq: number;
  forceFlush: boolean;
}

/** Everything that could throw (coalescing/estimation) is prepared before SQL. */
export interface RuntimeFlushPlan extends RuntimeWriteBatch {
  readonly entry: PendingRuntimeThread;
  readonly eventCount: number;
  readonly inputBytes: number;
  readonly outputBytes: number;
  readonly lastSeq: number;
  readonly oversizeBytes: number;
}

export function planRuntimeFlush(
  threadId: string,
  entry: PendingRuntimeThread | undefined,
  throughSeq: number,
  chunk: RuntimeFlushChunkBounds,
): RuntimeFlushPlan | null {
  if (!entry) return null;
  let eventCount = 0;
  let inputBytes = 0;
  for (const pending of entry.events) {
    if (pending.persistSeq > throughSeq) break;
    // A single canonical event is indivisible, including the reserved oversize slot.
    if (
      eventCount > 0 &&
      (eventCount >= chunk.maxEvents || inputBytes + pending.bytes > chunk.maxBytes)
    )
      break;
    eventCount += 1;
    inputBytes += pending.bytes;
  }
  if (eventCount === 0) return null;
  const events = coalesceRuntimeEvents(entry.events.slice(0, eventCount).map((item) => item.event));
  return {
    threadId,
    entry,
    events,
    eventCount,
    inputBytes,
    outputBytes: events.reduce((total, event) => total + estimateRuntimeEventBytes(event), 0),
    lastSeq: entry.events[eventCount - 1]!.persistSeq,
    oversizeBytes: entry.forceFlush && eventCount === 1 ? inputBytes : 0,
  };
}

/** Called only after storage success; does no event parsing or external work. */
export function acknowledgeRuntimeFlush(
  pending: Map<string, PendingRuntimeThread>,
  plan: RuntimeFlushPlan,
): void {
  const entry = plan.entry;
  entry.events.splice(0, plan.eventCount);
  entry.estimatedBytes -= plan.inputBytes;
  if (entry.events.length === 0) pending.delete(plan.threadId);
  else {
    entry.firstPersistSeq = entry.events[0]!.persistSeq;
    entry.firstEnqueuedAt = entry.events[0]!.enqueuedAt;
    entry.forceFlush = false;
  }
}

export interface RuntimeFlushRecovery {
  /** A failed group must not repeatedly roll back healthy prefixes on later ticks. */
  retryIndividually: boolean;
}

interface FlushHost {
  pending: ReadonlyMap<string, PendingRuntimeThread>;
  pins: ReadonlyMap<string, number>;
  write: RuntimeWriteFlush;
  atomicBatchWriter: RuntimeAtomicBatchWriter | undefined;
  recovery: RuntimeFlushRecovery;
  acknowledge(plan: RuntimeFlushPlan): void;
}

const ATOMIC_MAX_THREADS = 4;
const ATOMIC_MAX_BYTES = 4 * 1024 * 1024;

/**
 * One visit per thread, oldest first. Atomic groups contain at most four
 * 500-event/1 MiB prefixes and at most 4 MiB of ordinary input. One indivisible
 * event exceeding the chunk limit is separately reserved; a second ends the
 * group. Thus total input is <= 4 MiB + the largest selected oversize event,
 * still within four threads and the queue's hard single-event bound.
 * maxMs stops admission of additional work; it cannot interrupt a transaction.
 */
export function flushRuntimeQueueBudgeted(
  host: FlushHost,
  options: RuntimeBudgetedFlushOptions,
): RuntimeBudgetedFlushResult {
  const now = options.now ?? Date.now;
  const startedAt = now();
  const result: RuntimeBudgetedFlushResult = {
    flushedThreads: 0,
    committedEvents: 0,
    committedBytes: 0,
    failure: null,
    remainingThreads: host.pending.size,
    elapsedMs: 0,
  };
  const order = [...host.pending].sort((a, b) => a[1].firstEnqueuedAt - b[1].firstEnqueuedAt);
  const acknowledge = (plan: RuntimeFlushPlan) => {
    host.acknowledge(plan);
    result.flushedThreads += 1;
    result.committedEvents += plan.eventCount;
    result.committedBytes += plan.inputBytes;
  };
  const writeSingle = (plan: RuntimeFlushPlan): boolean => {
    try {
      host.write(plan.threadId, plan.events);
    } catch (error) {
      result.failure = { threadId: plan.threadId, error };
      return false;
    }
    acknowledge(plan);
    return true;
  };
  const hasTime = () => now() - startedAt < options.maxMs;
  const requestedChunk = options.chunk ?? DEFAULT_RUNTIME_FLUSH_CHUNK;
  const atomic = host.atomicBatchWriter && !host.recovery.retryIndividually;

  if (!atomic) {
    // Keep the original single-thread/fallback cycle semantics and budgets.
    for (const [threadId, entry] of order) {
      if (
        result.flushedThreads >= options.maxThreads ||
        result.committedBytes >= options.maxBytes ||
        !hasTime()
      )
        break;
      try {
        const plan = planRuntimeFlush(
          threadId,
          entry,
          host.pins.get(threadId) ?? Number.MAX_SAFE_INTEGER,
          requestedChunk,
        );
        if (plan && !writeSingle(plan)) break;
      } catch (error) {
        result.failure = { threadId, error };
        break;
      }
    }
    if (result.flushedThreads > 0 && !result.failure) host.recovery.retryIndividually = false;
  } else {
    const plans: RuntimeFlushPlan[] = [];
    const maxThreads = Math.min(options.maxThreads, ATOMIC_MAX_THREADS);
    const maxBytes = Math.min(options.maxBytes, ATOMIC_MAX_BYTES);
    const chunk = {
      maxEvents: Math.min(requestedChunk.maxEvents, DEFAULT_RUNTIME_FLUSH_CHUNK.maxEvents),
      maxBytes: Math.min(requestedChunk.maxBytes, DEFAULT_RUNTIME_FLUSH_CHUNK.maxBytes, maxBytes),
    };
    let normalBytes = 0;
    let oversizeBytes = 0;
    for (const [threadId, entry] of order) {
      if (plans.length >= maxThreads || normalBytes >= maxBytes || !hasTime()) break;
      try {
        const plan = planRuntimeFlush(
          threadId,
          entry,
          host.pins.get(threadId) ?? Number.MAX_SAFE_INTEGER,
          {
            maxEvents: chunk.maxEvents,
            maxBytes: Math.min(chunk.maxBytes, maxBytes - normalBytes),
          },
        );
        if (!plan) continue;
        if (plan.inputBytes > chunk.maxBytes) {
          if (oversizeBytes > 0) break;
          oversizeBytes = plan.inputBytes;
        } else {
          if (normalBytes + plan.inputBytes > maxBytes) break;
          normalBytes += plan.inputBytes;
        }
        plans.push(plan);
      } catch (error) {
        result.failure = { threadId, error };
        break;
      }
    }
    if (plans.length === 1) writeSingle(plans[0]!);
    else if (plans.length > 1) {
      try {
        const outcome = host.atomicBatchWriter!(plans);
        if (outcome.kind === "committed") {
          for (const plan of plans) acknowledge(plan);
        } else if (outcome.kind === "rolled-back") {
          result.failure = { threadId: plans[0]!.threadId, error: outcome.error };
          // Only proven rollback permits replay. If the group consumed the
          // deadline, the next cycle runs sequentially instead of regrouping
          // the same poison event with healthy older prefixes forever.
          host.recovery.retryIndividually = true;
          for (const plan of plans) {
            if (!hasTime() || !writeSingle(plan)) break;
          }
          if (result.flushedThreads === plans.length) host.recovery.retryIndividually = false;
          // Retain the failed group diagnostic even if every fallback committed.
        } else {
          throw new Error("An atomic runtime writer must return a synchronous commit result.");
        }
      } catch (error) {
        result.failure = { threadId: plans[0]!.threadId, error };
      }
    }
  }
  result.remainingThreads = host.pending.size;
  result.elapsedMs = now() - startedAt;
  return result;
}

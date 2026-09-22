import type { RuntimeFlushOutcome } from "./runtimeWriteQueue";
import {
  RuntimeControlOperationQueue,
  type RuntimeControlOperation,
} from "./runtimeControlOperationQueue";
import { RuntimeThreadAccessScheduler } from "./runtimeThreadAccessScheduler";
import {
  RuntimePersistenceBusyError,
  RuntimePersistenceContaminatedError,
  RuntimePersistenceDegradedError,
  type RuntimeContaminationReason,
  type RuntimeFenceResult,
  type RuntimeFenceToken,
} from "./runtimePersistenceTypes";

/**
 * Fence/control mechanics of the B1 persistence controller: the per-thread
 * asynchronous committed-prefix read barrier, the mutation gate, and the
 * bounded retrying control-op queue. One cohesive mechanism, not a generic
 * framework: fences and mutations must serialize against each other, share one
 * bounded waiter accounting and one deadline timer, and the control queue is
 * the third user of the same thread access.
 *
 * The controller remains the one authority for admission, health, and storage:
 * this module reads pending/contamination state and commits chunks exclusively
 * through its host callbacks and never touches SQLite or the queue directly.
 * On success a fence stays HELD (queue pin + scheduler grant) so the caller's
 * `readFenced` runs in the same turn; every other exit releases.
 */

export interface RuntimeFenceControlHost {
  now(): number;
  queueGeneration(): number;
  pinnedThrough(threadId: string): number | null;
  lastPersistSeqForThread(threadId: string): number;
  committedThrough(threadId: string): number;
  pendingEvents(threadId: string): number;
  pendingBytes(threadId: string): number;
  setPin(threadId: string, through: number | null): void;
  flushChunk(threadId: string, through: number): RuntimeFlushOutcome;
  contamination(threadId: string): {
    reason: RuntimeContaminationReason;
    refusedEvents: number;
    refusedBytes: number;
  } | null;
  /** A chunk committed: feed the duration sample and the stable-window health. */
  onChunkCommitted(elapsedMs: number): void;
  /**
   * A chunk failed: classify once (the controller owns storage
   * classification), apply the failure, and keep the prefix pending. Returns
   * the class so the typed refusal carries the same classification.
   */
  onFlushFailure(error: unknown, threadId: string): "retryable" | "storage" | "fatal";
  /** The thread's full prefix committed: health success observation. */
  onPrefixCommitted(): void;
  retryAfterMs(errorClass?: "retryable" | "storage" | "fatal"): number;
  executeControlOperation(
    operation: RuntimeControlOperation,
  ): Promise<{ ok: boolean; errorClass?: "retryable" | "storage" | "fatal"; error?: unknown }>;
  onControlDropped(
    operation: RuntimeControlOperation,
    result: { ok: boolean; errorClass?: "retryable" | "storage" | "fatal"; error?: unknown },
  ): void;
  yieldToEventLoop(): Promise<void>;
}

export interface RuntimeFenceControlOptions {
  host: RuntimeFenceControlHost;
  fenceFlushChunk: { maxEvents: number; maxBytes: number };
  fenceDeadlineMs: number;
  fenceMaxHoldMs: number;
  mutationDeadlineMs: number;
  maxControlOperations: number;
  schedulerOptions?: {
    maxFenceWaitersPerThread?: number;
    maxMutationWaitersPerThread?: number;
    maxWaitersTotal?: number;
  };
}

export class RuntimeFenceControl {
  private readonly options: RuntimeFenceControlOptions;
  private scheduler: RuntimeThreadAccessScheduler;
  private readonly controlOperations: RuntimeControlOperationQueue;
  /** Fences whose prefix committed and whose read/release has not run yet. */
  private readonly heldFences = new Set<RuntimeFenceToken>();

  constructor(options: RuntimeFenceControlOptions) {
    this.options = options;
    this.scheduler = this.createScheduler();
    this.controlOperations = new RuntimeControlOperationQueue({
      now: options.host.now,
      maxOperations: options.maxControlOperations,
      execute: (operation) => options.host.executeControlOperation(operation),
      onDropped: (operation, result) => options.host.onControlDropped(operation, result),
    });
  }

  private createScheduler(): RuntimeThreadAccessScheduler {
    return new RuntimeThreadAccessScheduler({
      now: this.options.host.now,
      fenceMaxHoldMs: this.options.fenceMaxHoldMs,
      mutationDeadlineMs: this.options.mutationDeadlineMs,
      ...this.options.schedulerOptions,
    });
  }

  /**
   * Pin the thread's intake prefix for an asynchronous read barrier. The
   * effective queue pin is the *earliest* active fence: a later fence must
   * never lift the boundary an earlier held fence captured.
   */
  beginFence(threadId: string): RuntimeFenceToken {
    const host = this.options.host;
    const previousPin = host.pinnedThrough(threadId);
    const through = host.lastPersistSeqForThread(threadId);
    const effectivePin = previousPin === null ? through : Math.min(previousPin, through);
    host.setPin(threadId, effectivePin);
    try {
      const token = this.scheduler.beginFence(threadId, through, host.queueGeneration());
      this.heldFences.add(token);
      return token;
    } catch (error) {
      host.setPin(threadId, previousPin);
      throw error;
    }
  }

  /**
   * Commit the pinned prefix in bounded chunks, yielding between chunks so the
   * host loop stays responsive, and set `token.ready` so `readFenced` can
   * assert the exactness precondition. Never throws.
   */
  async flushFence(
    token: RuntimeFenceToken,
    options: { deadlineMs?: number; signal?: AbortSignal } = {},
  ): Promise<RuntimeFenceResult> {
    const host = this.options.host;
    const committed = (): number => host.committedThrough(token.threadId);
    if (token.generation !== host.queueGeneration() || token.released) {
      return { kind: "cancelled", persistSeq: committed() };
    }
    this.releaseExpiredFences();
    const contamination = host.contamination(token.threadId);
    if (contamination) {
      this.releaseFence(token);
      return {
        kind: "contaminated",
        persistSeq: committed(),
        reason: contamination.reason,
        refusedEvents: contamination.refusedEvents,
        refusedBytes: contamination.refusedBytes,
      };
    }
    const deadlineAt = host.now() + (options.deadlineMs ?? this.options.fenceDeadlineMs);
    const turn = await this.scheduler.waitFenceTurn(token);
    if (turn.kind !== "granted") {
      this.releaseFence(token);
      return {
        kind: turn.kind === "cancelled" ? "cancelled" : "deadline",
        persistSeq: committed(),
      };
    }
    // Success leaves the fence HELD (pin + scheduler grant) so the caller's
    // `readFenced` can read in the same turn. Every non-success exit releases.
    let held = false;
    try {
      for (;;) {
        if (options.signal?.aborted || this.scheduler.isFenceCancelled(token) || token.released) {
          return { kind: "cancelled", persistSeq: committed() };
        }
        if (host.now() >= deadlineAt) {
          return { kind: "deadline", persistSeq: committed() };
        }
        const activeContamination = host.contamination(token.threadId);
        if (activeContamination) {
          return {
            kind: "contaminated",
            persistSeq: committed(),
            reason: activeContamination.reason,
            refusedEvents: activeContamination.refusedEvents,
            refusedBytes: activeContamination.refusedBytes,
          };
        }
        const started = host.now();
        const outcome = host.flushChunk(token.threadId, token.throughPersistSeq);
        host.onChunkCommitted(host.now() - started);
        if (outcome.kind === "failed") {
          const errorClass = host.onFlushFailure(outcome.error, token.threadId);
          return { kind: "degraded", persistSeq: committed(), errorClass, error: outcome.error };
        }
        if (outcome.kind === "empty" || !outcome.remainingWithinThrough) break;
        await host.yieldToEventLoop();
      }
      token.ready = true;
      held = true;
      return {
        kind: "committed",
        persistSeq: committed(),
        pendingEvents: host.pendingEvents(token.threadId),
        pendingBytes: host.pendingBytes(token.threadId),
      };
    } finally {
      if (!held) this.releaseFence(token);
    }
  }

  /**
   * Run the content read behind a committed fence. Synchronous by contract:
   * the caller must not await between `flushFence` resolving and this call.
   * Releases the fence in the same turn after the read.
   */
  readFenced<T>(token: RuntimeFenceToken, read: () => T): T {
    const host = this.options.host;
    if (!token.ready || token.released) {
      throw new Error(
        "Runtime fence read was attempted before its prefix committed or after release.",
      );
    }
    if (token.generation !== host.queueGeneration()) {
      this.releaseFence(token);
      throw new Error("Runtime fence is stale: the write queue was reset.");
    }
    if (!this.scheduler.isFenceActive(token) || this.scheduler.isFenceCancelled(token)) {
      // The scheduler's max-hold timer (or a delete's fence cancellation)
      // settled this fence while the caller paused between flush and read. The
      // prefix is no longer pinned, so the read is refused instead of running
      // behind a boundary that no longer holds.
      this.releaseFence(token);
      throw new Error("Runtime fence is no longer held; the read was refused.");
    }
    try {
      return read();
    } finally {
      this.releaseFence(token);
    }
  }

  releaseFence(token: RuntimeFenceToken): void {
    this.heldFences.delete(token);
    token.released = true;
    const nextPin = this.scheduler.settleFence(token);
    this.options.host.setPin(token.threadId, nextPin);
  }

  /**
   * Release fences whose caller never finished (the scheduler's max-hold timer
   * settled them) so the queue pin cannot leak. Runs on the flush cycle and at
   * fence entry; bounded by the fence waiter bounds.
   */
  releaseExpiredFences(): void {
    for (const token of [...this.heldFences]) {
      if (token.released) {
        this.heldFences.delete(token);
        continue;
      }
      // A token still waiting for its turn (not `ready`) is owned by its own
      // `flushFence` driver, which releases on deadline/cancel.
      if (!token.ready) continue;
      if (!this.scheduler.isFenceActive(token) || this.scheduler.isFenceCancelled(token)) {
        this.releaseFence(token);
      }
    }
  }

  /** Number of queued fence/mutation waiters (diagnostics/tests). */
  waiterCount(threadId?: string): number {
    return this.scheduler.waiterCount(threadId);
  }

  /**
   * Run one content mutation under the per-thread gate. The operation may
   * await; the gate is held until it settles, so no fence or other mutation
   * can interleave.
   */
  runMutation<T>(
    threadId: string,
    kind: "truncate" | "replace" | "reset" | "delete" | "acknowledge",
    operation: () => T | Promise<T>,
    options: { deadlineMs?: number } = {},
  ): Promise<T> {
    return this.scheduler.runMutation(threadId, kind, operation, options);
  }

  /**
   * Synchronous mutation fast path for callers whose contract is synchronous
   * (checkpoint truncate). Grants only when the thread has no active or queued
   * fence/mutation; otherwise throws typed busy. The operation runs in one
   * turn, so it can never land inside a fence's flush/read window.
   */
  tryRunMutation<T>(
    threadId: string,
    kind: "truncate" | "replace" | "reset",
    operation: () => T,
  ): T {
    const result = this.scheduler.tryRunMutationSync(threadId, kind, operation);
    if (!result.granted) {
      throw new RuntimePersistenceBusyError(threadId, "mutation", this.options.host.retryAfterMs());
    }
    return result.value as T;
  }

  /** Chunk-bounded, yielding commit of the thread's full accepted prefix. */
  async flushPrefix(threadId: string): Promise<void> {
    const host = this.options.host;
    const deadlineAt = host.now() + this.options.mutationDeadlineMs;
    for (;;) {
      const contamination = host.contamination(threadId);
      if (contamination)
        throw contaminationError(threadId, contamination, host.retryAfterMs("storage"));
      const started = host.now();
      const outcome = host.flushChunk(threadId, Number.MAX_SAFE_INTEGER);
      host.onChunkCommitted(host.now() - started);
      if (outcome.kind === "failed") {
        const errorClass = host.onFlushFailure(outcome.error, threadId);
        throw degradedError(threadId, host, outcome.error, errorClass);
      }
      if (outcome.kind === "empty" || !outcome.remainingWithinThrough) {
        host.onPrefixCommitted();
        return;
      }
      if (host.now() >= deadlineAt) {
        throw new RuntimePersistenceBusyError(threadId, "mutation", host.retryAfterMs());
      }
      await host.yieldToEventLoop();
    }
  }

  /** Same chunk bound, no yield: the synchronous truncate contract. */
  commitPrefixSync(threadId: string): void {
    const host = this.options.host;
    for (;;) {
      const contamination = host.contamination(threadId);
      if (contamination)
        throw contaminationError(threadId, contamination, host.retryAfterMs("storage"));
      const started = host.now();
      const outcome = host.flushChunk(threadId, Number.MAX_SAFE_INTEGER);
      host.onChunkCommitted(host.now() - started);
      if (outcome.kind === "failed") {
        const errorClass = host.onFlushFailure(outcome.error, threadId);
        throw degradedError(threadId, host, outcome.error, errorClass);
      }
      if (outcome.kind === "empty" || !outcome.remainingWithinThrough) {
        host.onPrefixCommitted();
        return;
      }
    }
  }

  enqueueControlOperation(operation: RuntimeControlOperation): "accepted" | "refused" {
    return this.controlOperations.enqueue(operation);
  }

  pendingControlOperations(): number {
    return this.controlOperations.pendingCount();
  }

  processDueControlOperations(): void {
    this.controlOperations.processDue();
  }

  clearControlOperations(): void {
    this.controlOperations.clear();
  }

  /**
   * Cancel active fences and drop the scheduler state (shutdown/reset).
   *
   * Every cancelled fence releases its queue pin in the same synchronous step:
   * the shutdown drain must be able to commit accepted post-pin content
   * instead of reporting retained custody for it, and a stale token must still
   * refuse a late read (`released`) rather than reading behind a boundary that
   * no longer holds. Pins are released for exactly the threads that held a
   * cancelled fence.
   */
  cancelActiveFences(): void {
    for (const token of [...this.heldFences]) {
      token.released = true;
      this.options.host.setPin(token.threadId, null);
    }
    this.heldFences.clear();
    this.scheduler.dispose();
    this.scheduler = this.createScheduler();
  }
}

export function contaminationError(
  threadId: string,
  contamination: {
    reason: RuntimeContaminationReason;
    refusedEvents: number;
    refusedBytes: number;
  },
  retryAfterMs: number,
): RuntimePersistenceContaminatedError {
  return new RuntimePersistenceContaminatedError(
    threadId,
    contamination.reason,
    contamination.refusedEvents,
    contamination.refusedBytes,
    retryAfterMs,
  );
}

function degradedError(
  threadId: string,
  host: RuntimeFenceControlHost,
  error: unknown,
  errorClass: "retryable" | "storage" | "fatal",
): RuntimePersistenceDegradedError {
  return new RuntimePersistenceDegradedError(
    threadId,
    host.pendingEvents(threadId),
    host.pendingBytes(threadId),
    errorClass,
    host.retryAfterMs(errorClass),
    error,
  );
}

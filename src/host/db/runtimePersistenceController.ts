import type { RuntimeEvent } from "@/shared/contracts";
import type { RuntimePersistenceSample } from "@/shared/diagnostics/runtimePersistenceSample";
import type {
  RuntimeHistoryGapAcknowledgeResult,
  RuntimeHistoryGapDescriptor,
  RuntimeHistoryNotice,
} from "@/shared/runtimeHistoryNotice";
import {
  RuntimeWriteQueue,
  DEFAULT_RUNTIME_FLUSH_CHUNK,
  type RuntimeBudgetedFlushResult,
  type RuntimeFlushChunkBounds,
  type RuntimeQueueBounds,
  type RuntimeWriteFlush,
} from "./runtimeWriteQueue";
import type { RuntimeControlOperation } from "./runtimeControlOperationQueue";
import {
  RuntimePersistenceAdmission,
  type RuntimeContaminationInfo,
} from "./runtimePersistenceAdmission";
import { RuntimeFenceControl, contaminationError } from "./runtimePersistenceFenceControl";
import { classifyStorageError } from "./runtimePersistenceClassification";
import { RuntimeDurableGapCoordinator } from "./runtimeDurableGapCoordinator";
import type { RuntimeHistoryNoticeLookup } from "./runtimeHistoryNotice";
import type { RuntimeDurableGapDatabase } from "./runtimeDurableGap";
import { RuntimePersistenceHealth } from "./runtimePersistenceHealth";
import {
  RuntimePersistenceBusyError,
  RuntimePersistenceContaminatedError,
  RuntimePersistenceDegradedError,
  RuntimePersistenceDrainIncompleteError,
  type RuntimeAdmission,
  type RuntimeBarrierResult,
  type RuntimeFenceResult,
  type RuntimeFenceToken,
  type RuntimePersistenceState,
  type RuntimePersistenceStateInfo,
  type RuntimeProducerSignal,
  type RuntimeRefusalReason,
  type RuntimeRefusalScope,
  type RuntimeShutdownReport,
  type RuntimeStorageErrorClass,
} from "./runtimePersistenceTypes";

export { classifyStorageError } from "./runtimePersistenceClassification";
export type { RuntimeContaminationInfo } from "./runtimePersistenceAdmission";
export {
  RUNTIME_PERSISTENCE_CONSERVATIVE_IN_FLIGHT_BYTES,
  RUNTIME_PERSISTENCE_LOW_WATERMARK_RATIO,
  RUNTIME_PERSISTENCE_SOFT_WATERMARK_RATIO,
} from "./runtimePersistenceHealth";

/**
 * B1 persistence controller: owns the bounded write queue, admission gating,
 * per-thread contamination, the shutdown drain report, and the diagnostics
 * sample. Two cohesive collaborators own the mechanics:
 * {@link RuntimePersistenceHealth} (state machine, watermarks, backoff, and
 * counters) and {@link RuntimeFenceControl} (async committed-prefix fences,
 * the mutation gate, and the retrying control-op queue). The controller stays
 * the one authority: both collaborators read queue/contamination state and
 * write storage exclusively through it, and every SQLite interaction is
 * synchronous and chunk-bounded.
 *
 * A per-thread refusal stays per-thread: the global state does not escalate
 * and healthy threads keep admitting, so one overloaded producer cannot wedge
 * the host. A global refusal closes bulk admission (explicit and recoverable);
 * control writes stay serviceable through their reserved path.
 */
const DEFAULT_FLUSH_INTERVAL_MS = 250;
const DEFAULT_SHUTDOWN_DRAIN_MS = 1_000;
const DEFAULT_FENCE_DEADLINE_MS = 2_000;
const DEFAULT_FENCE_MAX_HOLD_MS = 5_000;
const DEFAULT_MUTATION_DEADLINE_MS = 5_000;
const FLUSH_MAX_THREADS = 4;
const FLUSH_MAX_BYTES = 4 * 1024 * 1024;
const FLUSH_MAX_MS = 5;

export interface RuntimePersistenceControllerOptions {
  write: RuntimeWriteFlush;
  bounds?: Partial<RuntimeQueueBounds>;
  flushIntervalMs?: number;
  recoverAfterMs?: number;
  retryableFailureThreshold?: number;
  retryableFailureWindowMs?: number;
  retryBackoffMs?: readonly number[];
  storageBackoffMs?: readonly number[];
  shutdownDrainMs?: number;
  now?: () => number;
  onSignal?(signal: RuntimeProducerSignal): void;
  onStateChange?(info: RuntimePersistenceStateInfo): void;
  onRefusal?(
    reason: RuntimeRefusalReason,
    scope: RuntimeRefusalScope,
    info: {
      pendingEvents: number;
      pendingBytes: number;
      refusedEvents: number;
      refusedBytes: number;
    },
  ): void;
  onFailure?(error: unknown, errorClass: RuntimeStorageErrorClass, threadId?: string): void;
  /**
   * Supervisor bytes that may already be retained/in transit outside the host
   * queue (IPC sender queue + kernel/receiver buffers + one envelope). Used to
   * compute the pause threshold; never mutates the configured global bound.
   * `null` (default) means the peer advertised nothing: the conservative
   * constant is used instead of a ratio that could leave less headroom than
   * the supervisor's own queue can retain.
   */
  inFlightWindowBytes?: number | null;
  safetyBytes?: number;
  minimumWorkingSetBytes?: number;
  fenceFlushChunk?: RuntimeFlushChunkBounds;
  fenceDeadlineMs?: number;
  fenceMaxHoldMs?: number;
  mutationDeadlineMs?: number;
  maxControlOperations?: number;
  schedulerOptions?: {
    maxFenceWaitersPerThread?: number;
    maxMutationWaitersPerThread?: number;
    maxWaitersTotal?: number;
  };
}

export interface RuntimeControlWriteResult {
  ok: boolean;
  errorClass?: RuntimeStorageErrorClass;
  error?: unknown;
}

/**
 * Synchronous mutation-callback contract. `NotPromise` collapses a
 * promise-returning callback to `never`, so an `async` callback (or any
 * callback whose inferred result is a promise) is rejected at compile time;
 * `executeMutation`'s runtime check enforces the same rule for untyped or
 * JavaScript callers. Awaiting such a callback would let events admitted
 * during the await be superseded by the rebase with no record of the gap.
 */
export type SynchronousMutationCallback<T> = () => T & NotPromise<T>;
type NotPromise<T> = T extends PromiseLike<unknown> ? never : T;

export class RuntimePersistenceController {
  private readonly queue: RuntimeWriteQueue;
  private readonly options: Required<
    Pick<
      RuntimePersistenceControllerOptions,
      | "flushIntervalMs"
      | "shutdownDrainMs"
      | "now"
      | "fenceFlushChunk"
      | "fenceDeadlineMs"
      | "fenceMaxHoldMs"
      | "mutationDeadlineMs"
      | "maxControlOperations"
    >
  > &
    RuntimePersistenceControllerOptions;
  private readonly health: RuntimePersistenceHealth;
  private readonly fenceControl: RuntimeFenceControl;

  private timer: ReturnType<typeof setTimeout> | undefined;
  private immediate: ReturnType<typeof setImmediate> | undefined;
  private readonly admission: RuntimePersistenceAdmission;
  private readonly durableGap: RuntimeDurableGapCoordinator;
  private durableGapReserveLatchReported = false;
  private shutdownReport: RuntimeShutdownReport | null = null;

  constructor(options: RuntimePersistenceControllerOptions) {
    this.options = {
      flushIntervalMs: DEFAULT_FLUSH_INTERVAL_MS,
      shutdownDrainMs: DEFAULT_SHUTDOWN_DRAIN_MS,
      fenceFlushChunk: DEFAULT_RUNTIME_FLUSH_CHUNK,
      fenceDeadlineMs: DEFAULT_FENCE_DEADLINE_MS,
      fenceMaxHoldMs: DEFAULT_FENCE_MAX_HOLD_MS,
      mutationDeadlineMs: DEFAULT_MUTATION_DEADLINE_MS,
      maxControlOperations: 256,
      // Indirection so a replaced/faked clock (tests) is observed.
      now: () => Date.now(),
      ...options,
    };
    this.queue = new RuntimeWriteQueue(options.write, options.bounds, this.options.now);
    this.health = new RuntimePersistenceHealth({
      observe: () => this.observation(),
      now: this.options.now,
      ...(options.flushIntervalMs !== undefined
        ? { flushIntervalMs: options.flushIntervalMs }
        : {}),
      ...(options.recoverAfterMs !== undefined ? { recoverAfterMs: options.recoverAfterMs } : {}),
      ...(options.retryableFailureThreshold !== undefined
        ? { retryableFailureThreshold: options.retryableFailureThreshold }
        : {}),
      ...(options.retryableFailureWindowMs !== undefined
        ? { retryableFailureWindowMs: options.retryableFailureWindowMs }
        : {}),
      ...(options.retryBackoffMs !== undefined ? { retryBackoffMs: options.retryBackoffMs } : {}),
      ...(options.storageBackoffMs !== undefined
        ? { storageBackoffMs: options.storageBackoffMs }
        : {}),
      ...(options.safetyBytes !== undefined ? { safetyBytes: options.safetyBytes } : {}),
      ...(options.minimumWorkingSetBytes !== undefined
        ? { minimumWorkingSetBytes: options.minimumWorkingSetBytes }
        : {}),
      inFlightWindowBytes: options.inFlightWindowBytes ?? null,
      ...(options.onSignal ? { onSignal: options.onSignal } : {}),
      ...(options.onStateChange ? { onStateChange: options.onStateChange } : {}),
      ...(options.onRefusal ? { onRefusal: options.onRefusal } : {}),
      ...(options.onFailure ? { onFailure: options.onFailure } : {}),
    });
    this.fenceControl = new RuntimeFenceControl({
      host: {
        now: this.options.now,
        queueGeneration: () => this.queue.generation,
        pinnedThrough: (threadId) => this.queue.pinnedThrough(threadId),
        lastPersistSeqForThread: (threadId) => this.queue.lastPersistSeqForThread(threadId),
        committedThrough: (threadId) => this.queue.committedThrough(threadId),
        pendingEvents: (threadId) => this.queue.pendingEvents(threadId),
        pendingBytes: (threadId) => this.queue.pendingBytes(threadId),
        setPin: (threadId, through) => this.queue.setPin(threadId, through),
        flushChunk: (threadId, through) =>
          this.queue.flushThreadThrough(threadId, through, this.options.fenceFlushChunk),
        contamination: (threadId) => this.admission.getContamination(threadId),
        onChunkCommitted: (elapsedMs) => this.health.recordDuration(elapsedMs),
        onFlushFailure: (error, threadId) => this.applyFlushFailure(error, threadId),
        onPrefixCommitted: () => this.health.noteQueueSuccess(),
        retryAfterMs: (errorClass) => this.health.currentRetryDelayMs(errorClass),
        executeControlOperation: (operation) => this.executeControlOperation(operation),
        onControlDropped: (operation, result) => {
          console.error(
            `[db] runtime control write dropped after bounded retries (${operation.describe}):`,
            result.error ?? "unknown",
          );
        },
        yieldToEventLoop,
      },
      fenceFlushChunk: this.options.fenceFlushChunk,
      fenceDeadlineMs: this.options.fenceDeadlineMs,
      fenceMaxHoldMs: this.options.fenceMaxHoldMs,
      mutationDeadlineMs: this.options.mutationDeadlineMs,
      maxControlOperations: this.options.maxControlOperations,
      ...(this.options.schedulerOptions !== undefined
        ? { schedulerOptions: this.options.schedulerOptions }
        : {}),
    });
    this.durableGap = new RuntimeDurableGapCoordinator({
      now: this.options.now,
      onStorageFailure: (error) => this.applyFailure(error, classifyStorageError(error)),
      onStorageSuccess: () => this.health.noteSuccessWithoutQueue(),
      onReserveOverflow: () => this.applyDurableGapReserveLatch(),
    });
    this.admission = new RuntimePersistenceAdmission({
      queue: this.queue,
      health: this.health,
      now: this.options.now,
      durableGap: this.durableGap.port,
    });
  }

  private observation() {
    const stats = this.queue.stats();
    return {
      pendingEvents: stats.pendingEvents,
      pendingBytes: stats.pendingEstimatedBytes,
      oldestPendingAgeMs: stats.oldestPendingAgeMs,
      bounds: this.queue.getBounds(),
      contaminatedThreads: this.admission.contaminatedThreadCount(),
    };
  }

  getState(): RuntimePersistenceState {
    return this.health.getState();
  }

  isAdmissionClosed(): boolean {
    return this.health.isAdmissionClosed();
  }

  getProducerSignal(): "none" | "pause" | "stop" {
    return this.health.getProducerSignal();
  }

  getLastErrorClass(): RuntimeStorageErrorClass | null {
    return this.health.getLastErrorClass();
  }

  getBounds(): RuntimeQueueBounds {
    return this.queue.getBounds();
  }

  /**
   * Runtime-owned durable-gap open. The runtime layer calls this when the
   * SQLite handle changes: it is a read-only bind (singleton epoch row), never
   * an arm, so pure reads keep zero schema side effects.
   */
  bindDurableGapForConnection(sqlite: RuntimeDurableGapDatabase): void {
    this.durableGap.bindForConnection(sqlite);
  }

  /**
   * Eager runtime-owned open for a production composition: bind (if needed)
   * and commit this boot's root arm. A storage failure is classified into the
   * typed degraded state and leaves the boot unarmed; it never throws, and
   * every canonical batch is then refused `degraded` until a later retry arms.
   */
  attachDurableGapForConnection(sqlite: RuntimeDurableGapDatabase): void {
    this.durableGap.attachAndArm(sqlite);
  }

  /**
   * Pre-launch bridge (`SupervisorClient.prepareStartThread`): arm the boot if
   * needed and commit `touch(T)` before the launch request is sent. Throws
   * typed on an unknown thread or on storage failure; the caller rejects the
   * launch before any provider process exists.
   */
  armThreadForLaunch(threadId: string): void {
    this.durableGap.armThreadForLaunch(threadId);
  }

  /**
   * Clean-close finalize: retry every pending evidence obligation, then delete
   * this boot's touches and disarm in one transaction. Throws (keeping
   * `closeDatabase` custody) when evidence is unwritten or the reserve
   * overflowed, so no false clean close is possible.
   */
  finalizeDurableGapClose(): void {
    this.durableGap.flushPendingGaps();
    this.durableGap.disarmAfterCleanClose();
  }

  /** After a thread delete (FK cascade already removed the durable rows). */
  forgetDurableGapThread(threadId: string): void {
    // A reused thread id must not inherit the deleted thread's in-memory
    // contamination or durable resolution cache.
    this.admission.clearContaminationForRebase(threadId, 0);
    this.durableGap.forgetThread(threadId);
  }

  /** Armed boot epoch an authoritative rebase must preserve, or null. */
  durableGapRebaseEpoch(): number | null {
    return this.durableGap.currentBootEpochForRebase();
  }

  /** Diagnostics/tests: threads whose exact gap evidence is not yet durable. */
  durableGapPendingThreadIds(): readonly string[] {
    return this.durableGap.pendingThreadIds();
  }

  isDurableGapReserveLatched(): boolean {
    return this.durableGap.isReserveLatched();
  }

  /** Test-only: drop the bound connection, pending obligations, and latch. */
  resetDurableGapForTests(): void {
    this.durableGap.resetForTests();
  }

  private applyDurableGapReserveLatch(): void {
    if (this.durableGapReserveLatchReported) return;
    this.durableGapReserveLatchReported = true;
    // Bounded exhaustion is a global failure: stop canonical production and
    // refuse every future clean close until the process exits. The surviving
    // touches still identify every thread in the next boot.
    this.health.transitionTo("refusing");
    this.health.emitSignal({ kind: "stop", reason: "hard-cap" });
    console.error(
      "[db] runtime durable-gap pending reserve overflowed; canonical admission is stopped and no clean close is possible for this process.",
    );
  }

  /** Contamination record for a thread, or null when it is clean. */
  getContamination(threadId: string): RuntimeContaminationInfo | null {
    return this.admission.getContamination(threadId);
  }

  contaminatedThreadCount(): number {
    return this.admission.contaminatedThreadCount();
  }

  /** Supplied pause threshold; see {@link RuntimePersistenceHealth}. */
  getPauseThresholdBytes(): number {
    return this.health.getPauseThresholdBytes();
  }

  isPauseThresholdClamped(): boolean {
    return this.health.isPauseThresholdClamped();
  }

  /** Negotiated in-flight window for the pause arithmetic (`null`: none advertised). */
  setInFlightWindowBytes(bytes: number | null): void {
    this.health.setInFlightWindowBytes(bytes);
  }

  getInFlightWindowBytes(): number | null {
    return this.health.getInFlightWindowBytes();
  }

  /**
   * Admit canonical runtime events. Never throws. Refusal is explicit and
   * reported through `onRefusal`; a per-thread refusal contaminates only that
   * thread and raises a thread-scoped stop, while a global bound/age refusal
   * closes bulk admission and raises a global stop.
   */
  admit(threadId: string, events: readonly RuntimeEvent[]): RuntimeAdmission {
    const admission = this.admission.admit(threadId, events);
    if (admission.kind === "accepted") {
      // Accepted events (including the prefix of a partial admission) are
      // committed by the bounded scheduler; without this the queue would only
      // drain when a reader or mutation happens to ask.
      if (this.queue.forceFlushThreadIds().length > 0) this.scheduleImmediateFlush();
      else this.scheduleFlush(this.options.flushIntervalMs);
      this.health.evaluateWatermarks();
    }
    return admission;
  }

  clearContaminationForRebase(threadId: string, supersededEvents: number): void {
    this.admission.clearContaminationForRebase(threadId, supersededEvents);
    // The applied rebase cleared the thread's durable evidence inside its own
    // transaction; drop the derived resolution cache and any pending
    // obligation (the rebase explicitly supersedes that evidence).
    this.durableGap.forgetThread(threadId);
  }

  /**
   * A deferred authoritative rebase (`thread-reset`) exhausted its bounded
   * retries (or was refused before it could run): keep an explicit per-thread
   * contamination so later events cannot silently append to the pre-reset
   * transcript. Cleared only by an applied rebase (`reset`/`replace`/
   * `delete`), exactly like an admission refusal gap.
   */
  markDroppedRebase(threadId: string): void {
    this.admission.markDroppedRebase(threadId);
  }

  /**
   * Run a synchronous control write (thread row, scrollback) through the same
   * classification. Never throws: a failure is classified, transitions the
   * state, and is reported. Control writes are small, idempotent, and are not
   * queued; typed persistence errors short-circuit without re-applying the
   * failure the barrier/gate already applied.
   */
  runControlWrite(operation: () => void, threadId?: string): RuntimeControlWriteResult {
    if (this.health.isAdmissionClosed()) {
      return { ok: false, errorClass: "fatal", error: new Error("Persistence is shut down.") };
    }
    try {
      operation();
      this.health.noteSuccessWithoutQueue();
      return { ok: true };
    } catch (error) {
      if (error instanceof RuntimePersistenceDegradedError) {
        return { ok: false, errorClass: error.errorClass, error };
      }
      if (error instanceof RuntimePersistenceContaminatedError) {
        return { ok: false, errorClass: "storage", error };
      }
      if (error instanceof RuntimePersistenceBusyError) {
        return { ok: false, errorClass: "retryable", error };
      }
      const errorClass = classifyStorageError(error);
      this.applyFailure(error, errorClass, threadId);
      return { ok: false, errorClass, error };
    }
  }

  /**
   * Enqueue an idempotent control write for bounded retry. Control capacity is
   * reserved: it does not consume canonical bulk admission, and it stays
   * serviceable while canonical admission is refused. Overflow of the control
   * reserve itself is a genuine host fault and is refused typed.
   */
  enqueueControlOperation(operation: RuntimeControlOperation): "accepted" | "refused" {
    if (this.health.isAdmissionClosed()) return "refused";
    const result = this.fenceControl.enqueueControlOperation(operation);
    if (result === "refused") {
      // Control reserve exhaustion is explicit and bounded: close bulk
      // admission with a fatal-class diagnostic rather than silently dropping
      // a durable-state write.
      this.applyFailure(
        new Error(`Runtime control reserve exhausted for "${operation.describe}".`),
        "fatal",
        undefined,
        false,
      );
      console.error(
        `[db] runtime control reserve exhausted; refusing control write "${operation.describe}".`,
      );
    } else {
      this.scheduleImmediateFlush();
    }
    return result;
  }

  pendingControlOperations(): number {
    return this.fenceControl.pendingControlOperations();
  }

  private async executeControlOperation(
    operation: RuntimeControlOperation,
  ): Promise<RuntimeControlWriteResult> {
    if (this.health.isAdmissionClosed()) {
      return { ok: false, errorClass: "fatal", error: new Error("Persistence is shut down.") };
    }
    try {
      await operation.run();
      this.health.noteSuccessWithoutQueue();
      return { ok: true };
    } catch (error) {
      if (error instanceof RuntimePersistenceDegradedError) {
        // The write observed the degradation; do NOT re-apply it (which would
        // double-count retryable failures and can misclassify).
        return { ok: false, errorClass: error.errorClass, error };
      }
      if (error instanceof RuntimePersistenceContaminatedError) {
        return { ok: false, errorClass: "storage", error };
      }
      if (error instanceof RuntimePersistenceBusyError) {
        return { ok: false, errorClass: "retryable", error };
      }
      const errorClass = classifyStorageError(error);
      this.applyFailure(error, errorClass, undefined, false);
      return { ok: false, errorClass, error };
    }
  }

  /**
   * Commit every accepted event for a thread and report the persist watermark.
   * Never throws; a failed commit returns `degraded` with the entry retained.
   * A contaminated thread refuses even when the queue drained.
   */
  barrier(threadId: string): RuntimeBarrierResult {
    const contamination = this.admission.getContamination(threadId);
    if (contamination) {
      return {
        kind: "contaminated",
        reason: contamination.reason,
        persistSeq: this.queue.committedThrough(threadId),
        refusedEvents: contamination.refusedEvents,
        refusedBytes: contamination.refusedBytes,
      };
    }
    if (!this.queue.hasPending(threadId)) {
      // A clean barrier is also a health observation: age/watermark signals and
      // stable-window recovery must not depend on a write having happened.
      this.health.maybeRecover();
      this.health.maybeRecoverFromRefusing();
      this.health.evaluateWatermarks();
      return { kind: "committed", persistSeq: this.queue.committedThrough(threadId) };
    }
    const started = this.options.now();
    const outcome = this.queue.flushThread(threadId);
    this.health.recordDuration(this.options.now() - started);
    if (outcome.kind === "failed") {
      const errorClass = classifyStorageError(outcome.error);
      this.applyFailure(outcome.error, errorClass, threadId);
      return {
        kind: "degraded",
        persistSeq: this.queue.committedThrough(threadId),
        pendingEvents: this.queue.pendingEvents(threadId),
        pendingBytes: this.queue.pendingBytes(threadId),
        errorClass,
        error: outcome.error,
      };
    }
    if (this.queue.hasPending(threadId)) {
      // The thread is pinned by an active fence: the committed prefix is exact
      // but not complete. Report a retryable refusal instead of claiming the
      // thread drained.
      return {
        kind: "degraded",
        persistSeq: this.queue.committedThrough(threadId),
        pendingEvents: this.queue.pendingEvents(threadId),
        pendingBytes: this.queue.pendingBytes(threadId),
        errorClass: "retryable",
        error: new RuntimePersistenceBusyError(threadId, "fence", 100),
      };
    }
    if (outcome.kind === "committed") {
      this.health.noteQueueSuccess();
    }
    return { kind: "committed", persistSeq: this.queue.committedThrough(threadId) };
  }

  /**
   * Barrier for readers that must not serve a short transcript with a fresh
   * cursor. Throws a typed refusal instead of returning partial content.
   */
  barrierOrThrow(threadId: string): number {
    const result = this.barrier(threadId);
    if (result.kind === "committed") return result.persistSeq;
    if (result.kind === "contaminated") {
      throw new RuntimePersistenceContaminatedError(
        threadId,
        result.reason,
        result.refusedEvents,
        result.refusedBytes,
        this.health.currentRetryDelayMs("storage"),
      );
    }
    throw new RuntimePersistenceDegradedError(
      threadId,
      result.pendingEvents,
      result.pendingBytes,
      result.errorClass,
      this.health.currentRetryDelayMs(result.errorClass),
      result.error,
    );
  }

  /** Pin the thread's intake prefix; see {@link RuntimeFenceControl}. */
  beginFence(threadId: string): RuntimeFenceToken {
    return this.fenceControl.beginFence(threadId);
  }

  /** Commit the pinned prefix in bounded chunks; see {@link RuntimeFenceControl}. */
  flushFence(
    token: RuntimeFenceToken,
    options: { deadlineMs?: number; signal?: AbortSignal } = {},
  ): Promise<RuntimeFenceResult> {
    return this.fenceControl.flushFence(token, options);
  }

  /** Read behind a held fence and release it in the same turn. */
  readFenced<T>(token: RuntimeFenceToken, read: () => T): T {
    return this.fenceControl.readFenced(token, read);
  }

  releaseFence(token: RuntimeFenceToken): void {
    this.fenceControl.releaseFence(token);
  }

  /** Number of queued fence/mutation waiters (diagnostics/tests). */
  accessWaiterCount(threadId?: string): number {
    return this.fenceControl.waiterCount(threadId);
  }

  /**
   * Run one content mutation under the per-thread gate. The operation may
   * await; the gate is held until it settles, so no fence or other mutation
   * can interleave.
   *
   * Contamination semantics (the correction to the original design):
   * - `reset` and `replace` are authoritative rebases. They are reachable
   *   while contaminated: the applied rebase explicitly supersedes the
   *   accepted-but-uncommitted prefix (recorded, never silent) and clears
   *   contamination. A failed rebase keeps the pending events and the
   *   contamination.
   * - `truncate` preserves a prefix and therefore refuses a contaminated
   *   thread typed; it cannot truthfully rebase a hole it does not own.
   * - `delete` discards because the rows are going away.
   * - `acknowledge` (B1 GUI durable-gap recovery) records the durable notice
   *   and clears only the matching episode evidence. On `applied` the accepted
   *   prefix is superseded (counted in the notice) and contamination cleared;
   *   `already`/`stale`/failure discard nothing.
   *
   * The operation callback is synchronous by contract, checked at the boundary
   * (`assertSynchronousMutationCallback` before it runs and
   * `requireSynchronousMutationResult` on its result): an async callback would
   * suspend the mutation body, letting events admitted during the await be
   * superseded by the rebase without any record. All shipped callers pass
   * synchronous callbacks; an async result is refused instead of awaited.
   */
  runThreadMutation<T>(
    threadId: string,
    kind: "truncate" | "replace" | "reset" | "delete" | "acknowledge",
    operation: SynchronousMutationCallback<T>,
    options: { deadlineMs?: number } = {},
  ): Promise<T> {
    return this.fenceControl.runMutation(
      threadId,
      kind,
      () => this.executeMutation(threadId, kind, operation),
      options,
    );
  }

  /**
   * B1 GUI durable-gap acknowledgement. Runs under the per-thread mutation
   * gate (ordering against fences/truncates/rebases) and the caller's
   * supervisor dispatch lock; the episode precondition and the
   * delete+notice transaction are one synchronous SQL step. Only an `applied`
   * result supersedes the accepted-but-uncommitted prefix — its count was
   * folded into the durable notice before the discard, and no committed
   * transcript row is ever touched.
   */
  acknowledgeThreadRuntimeGap(
    threadId: string,
    token: string,
  ): Promise<RuntimeHistoryGapAcknowledgeResult> {
    return this.runThreadMutation(threadId, "acknowledge", () => {
      // Counted at the gate, in the same synchronous turn as the transaction:
      // a concurrent flush that committed part of the prefix before the gate
      // grant is not miscounted as superseded loss.
      const acceptedEvents = this.queue.pendingEvents(threadId);
      const acceptedBytes = this.queue.pendingBytes(threadId);
      const result = this.durableGap.acknowledgeThreadGap(threadId, token, {
        events: acceptedEvents,
        bytes: acceptedBytes,
      });
      if (result.outcome === "applied") {
        const discarded = this.queue.discard(threadId);
        this.admission.clearContaminationForRebase(threadId, discarded);
      }
      return result;
    });
  }

  /** Ordinary read-only current episode descriptor (fail closed when unreadable). */
  getThreadRuntimeGapDescriptor(threadId: string): RuntimeHistoryGapDescriptor | null {
    return this.durableGap.getGapDescriptor(threadId);
  }

  /** Ordinary read-only durable notice (fail closed when unreadable). */
  getThreadRuntimeGapNotice(threadId: string): RuntimeHistoryNotice | null {
    return this.durableGap.getNotice(threadId);
  }

  /** Bounded derived notice lookup for live/replay scoping (WS lane consumes). */
  lookupRuntimeNotice(threadId: string): RuntimeHistoryNoticeLookup {
    return this.durableGap.lookupNotice(threadId);
  }

  /**
   * Synchronous mutation fast path for callers whose contract is synchronous
   * (checkpoint truncate). Grants only when the thread has no active or queued
   * fence/mutation; otherwise throws typed busy. The operation runs in one
   * turn, so it can never land inside a fence's flush/read window.
   */
  tryRunThreadMutation<T>(
    threadId: string,
    kind: "truncate" | "replace" | "reset",
    operation: SynchronousMutationCallback<T>,
  ): T {
    return this.fenceControl.tryRunMutation(threadId, kind, () =>
      this.executeMutationSync(threadId, kind, operation),
    );
  }

  /**
   * Async mutation body: the accepted prefix commits in bounded chunks with a
   * yield between chunks (the scheduler already holds the thread), then the
   * operation applies.
   */
  private async executeMutation<T>(
    threadId: string,
    kind: "truncate" | "replace" | "reset" | "delete" | "acknowledge",
    operation: () => T,
  ): Promise<T> {
    assertSynchronousMutationCallback(operation);
    const contamination = this.admission.getContamination(threadId);
    if (contamination && kind === "truncate") {
      throw contaminationError(threadId, contamination, this.health.currentRetryDelayMs("storage"));
    }
    if (kind === "acknowledge") {
      // The acknowledgement owns its own supersede on `applied` only (inside
      // the synchronous callback, before this returns): the accepted prefix is
      // never committed and never discarded unless the durable transaction
      // applied. Committing it first would make the counted loss untruthful.
      return requireSynchronousMutationResult(operation());
    }
    if (kind === "delete") {
      // The operation applies before the in-memory prefix is discarded: a
      // failed or thenable delete must keep the accepted events and the
      // contamination marker. Calling the SQL delete first and discarding
      // only after it returns keeps the discard exact (the callback is
      // synchronous, so nothing can be admitted in between); the durable rows
      // are gone, so discarding the accepted-but-uncommitted prefix is the
      // explicit supersede.
      const value = requireSynchronousMutationResult(operation());
      this.supersedePendingPrefix(threadId);
      return value;
    }
    if (kind === "reset" || kind === "replace") {
      // Authoritative rebase. On a clean thread the accepted prefix must not be
      // bypassed: commit it first. On a contaminated thread the rebase is the
      // explicit recovery, so the supersede is the point; it is recorded by
      // `supersedePendingPrefix`, never silent. The operation is applied
      // before the in-memory prefix is discarded, so a failed rebase keeps
      // both the pending events and the contamination. The operation result is
      // checked synchronously: no event can be admitted between it and the
      // supersede, so the discard is exact.
      if (!contamination) await this.fenceControl.flushPrefix(threadId);
      const value = requireSynchronousMutationResult(operation());
      this.supersedePendingPrefix(threadId);
      return value;
    }
    // truncate on a clean thread: commit the accepted prefix, then apply.
    await this.fenceControl.flushPrefix(threadId);
    return requireSynchronousMutationResult(operation());
  }

  /**
   * Synchronous mutation body for the checkpoint truncate boundary. Applies
   * the same checked synchronous-callback contract as the async path: an
   * `async` callback is refused before it runs and a thenable result is
   * refused before the supersede, so a type-bypassed caller cannot discard the
   * accepted prefix outside the gate.
   */
  private executeMutationSync<T>(
    threadId: string,
    kind: "truncate" | "replace" | "reset",
    operation: () => T,
  ): T {
    assertSynchronousMutationCallback(operation);
    const contamination = this.admission.getContamination(threadId);
    if (contamination && kind === "truncate") {
      throw contaminationError(threadId, contamination, this.health.currentRetryDelayMs("storage"));
    }
    if (kind === "reset" || kind === "replace") {
      if (!contamination) this.fenceControl.commitPrefixSync(threadId);
      const value = requireSynchronousMutationResult(operation());
      this.supersedePendingPrefix(threadId);
      return value;
    }
    this.fenceControl.commitPrefixSync(threadId);
    return requireSynchronousMutationResult(operation());
  }

  private supersedePendingPrefix(threadId: string): void {
    const discarded = this.queue.discard(threadId);
    this.admission.clearContaminationForRebase(threadId, discarded);
    // The applied rebase cleared the durable evidence inside its own SQL
    // transaction; the in-memory pending obligation and resolution cache go
    // with the supersede so no stale evidence survives the repair.
    this.durableGap.forgetThread(threadId);
  }

  /** Drop a thread's buffered writes; only for deletion or an applied rebase. */
  discard(threadId: string): void {
    this.queue.discard(threadId);
  }

  /**
   * Commit a thread's full accepted prefix in chunk-bound synchronous
   * transactions (no yield). Exists for synchronous contract boundaries that
   * must address accepted-but-uncommitted events, such as the checkpoint
   * revert gate. Throws typed degraded/contaminated refusals instead of
   * reading behind uncommitted or refused state.
   */
  commitThreadPrefixSync(threadId: string): number {
    this.fenceControl.commitPrefixSync(threadId);
    return this.queue.committedThrough(threadId);
  }

  hasPending(threadId?: string): boolean {
    return this.queue.hasPending(threadId);
  }

  pendingThreadIds(): string[] {
    return this.queue.pendingThreadIds();
  }

  pendingStats(): { threads: number; events: number; bytes: number; oldestAgeMs: number | null } {
    const stats = this.queue.stats();
    return {
      threads: stats.pendingThreads,
      events: stats.pendingEvents,
      bytes: stats.pendingEstimatedBytes,
      oldestAgeMs: stats.oldestPendingAgeMs,
    };
  }

  /**
   * Stop admission, cancel active fences (readers settle `cancelled`), drain
   * oldest-first within the deadline, and report the outcome. Synchronous
   * writes only; a failure ends the attempt immediately so the caller can
   * preserve custody.
   */
  shutdown(deadlineMs: number = this.options.shutdownDrainMs): RuntimeShutdownReport {
    this.health.setAdmissionClosed();
    this.stopTimers();
    this.fenceControl.cancelActiveFences();
    const started = this.options.now();
    let errorClass = this.health.getLastErrorClass();
    while (this.queue.hasPending()) {
      const elapsed = this.options.now() - started;
      if (elapsed >= deadlineMs) break;
      const remaining = Math.max(1, deadlineMs - elapsed);
      const result = this.queue.flushBudgeted({
        maxThreads: 16,
        maxBytes: 16 * 1024 * 1024,
        maxMs: Math.min(remaining, 50),
        now: this.options.now,
      });
      this.recordBudgetedResult(result, false);
      if (result.failure) {
        errorClass = classifyStorageError(result.failure.error);
        break;
      }
      if (result.flushedThreads === 0) break;
    }
    if (!this.queue.hasPending()) {
      const drained: RuntimeShutdownReport = {
        kind: "drained",
        committedThroughPersistSeq: this.queue.stats().committedThroughPersistSeq,
      };
      this.shutdownReport = drained;
      return drained;
    }
    const stats = this.queue.stats();
    const incomplete: RuntimeShutdownReport = {
      kind: "incomplete",
      pendingEvents: stats.pendingEvents,
      pendingBytes: stats.pendingEstimatedBytes,
      oldestPendingAgeMs: stats.oldestPendingAgeMs,
      errorClass,
      message: `Runtime persistence shutdown left ${stats.pendingEvents} accepted event(s) (${stats.pendingEstimatedBytes} estimated bytes) uncommitted.`,
    };
    this.shutdownReport = incomplete;
    return incomplete;
  }

  /** Stop retry scheduling (close path and tests). Pending entries are kept. */
  stopTimers(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    if (this.immediate !== undefined) {
      clearImmediate(this.immediate);
      this.immediate = undefined;
    }
  }

  /**
   * Close-time hook: drain, then throw when work is left so `closeDatabase`
   * keeps the handle open instead of dropping accepted events and reporting a
   * successful commit.
   */
  drainBeforeClose(deadlineMs?: number): RuntimeShutdownReport {
    const report = this.shutdown(deadlineMs);
    if (report.kind === "incomplete") {
      throw new RuntimePersistenceDrainIncompleteError(report);
    }
    this.finalizeDurableGapClose();
    this.queue.clear();
    this.fenceControl.clearControlOperations();
    return report;
  }

  sample(): RuntimePersistenceSample {
    const stats = this.queue.stats();
    const counters = this.health.counters();
    const durations = [...counters.flushDurationsMs].sort((a, b) => a - b);
    return {
      state: this.getState(),
      pendingThreads: stats.pendingThreads,
      pendingEvents: stats.pendingEvents,
      pendingEstimatedBytes: stats.pendingEstimatedBytes,
      oldestPendingAgeMs: stats.oldestPendingAgeMs,
      admittedEvents: stats.admittedEvents,
      refusedAdmissions: counters.refusedAdmissions,
      refusedEvents: stats.refusedEvents,
      refusedBytes: stats.refusedBytes,
      flushAttempts: counters.flushAttempts,
      flushSuccesses: counters.flushSuccesses,
      flushFailuresRetryable: counters.flushFailuresRetryable,
      flushFailuresStorage: counters.flushFailuresStorage,
      flushFailuresFatal: counters.flushFailuresFatal,
      flushDurationMs: {
        count: durations.length,
        p50: percentile(durations, 0.5),
        p95: percentile(durations, 0.95),
        max: durations.length === 0 ? null : durations[durations.length - 1]!,
      },
      committedThroughPersistSeq: stats.committedThroughPersistSeq,
      coalescedInputBytes: stats.coalescedInputBytes,
      coalescedOutputBytes: stats.coalescedOutputBytes,
      producerSignal: this.getProducerSignal(),
      shutdown: this.shutdownReport === null ? "not-attempted" : this.shutdownReport.kind,
      oversizeEvents: stats.oversizeEvents,
      oversizeBytes: stats.oversizeBytes,
      contaminatedThreads: this.admission.contaminatedThreadCount(),
      pauseThresholdBytes: this.getPauseThresholdBytes(),
      pauseThresholdClamped: this.isPauseThresholdClamped(),
      controlOperationsPending: this.fenceControl.pendingControlOperations(),
      accessWaiters: this.fenceControl.waiterCount(),
      supersededAcceptedEvents: this.admission.supersededAcceptedEventCount(),
    };
  }

  /**
   * Re-arm the pipeline for a freshly opened database handle. Tests and
   * long-lived processes reopen the profile; without this, a close would leave
   * admission permanently closed.
   */
  resetForNewConnection(): void {
    this.stopTimers();
    this.queue.clear();
    this.fenceControl.cancelActiveFences();
    this.fenceControl.clearControlOperations();
    this.admission.clearAll();
    this.health.resetForNewConnection();
    // Derived durable-resolution state goes with the connection; pending
    // evidence obligations stay tracked (only a durable write or an applied
    // rebase/delete clears them).
    this.durableGap.resetForConnection();
    this.shutdownReport = null;
  }

  /** Test-only reset of health counters (not part of the production contract). */
  resetCountersForTests(): void {
    this.health.resetCountersForTests();
  }

  private scheduleFlush(delayMs: number): void {
    if (this.health.isAdmissionClosed()) return;
    if (this.timer !== undefined || this.immediate !== undefined) return;
    this.timer = setTimeout(
      () => {
        this.timer = undefined;
        this.runFlushCycle();
      },
      Math.max(0, delayMs),
    );
    this.timer.unref?.();
  }

  private scheduleImmediateFlush(): void {
    if (this.health.isAdmissionClosed()) return;
    if (this.immediate !== undefined) return;
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.immediate = setImmediate(() => {
      this.immediate = undefined;
      this.runFlushCycle();
    });
    this.immediate.unref?.();
  }

  private runFlushCycle(): void {
    if (this.health.isAdmissionClosed()) return;
    this.fenceControl.releaseExpiredFences();
    this.fenceControl.processDueControlOperations();
    this.health.maybeRecover();
    this.health.maybeRecoverFromRefusing();
    const age = this.queue.oldestPendingAgeMs(this.options.now());
    const bounds = this.queue.getBounds();
    if (age !== null && age >= bounds.maxPendingAgeMs) {
      this.health.noteRefusalFailure();
      this.health.transitionTo("refusing");
      this.health.emitSignal({ kind: "stop", reason: "age" });
    } else if (age !== null && age >= bounds.maxPendingAgeMs / 2) {
      this.health.emitSignal({ kind: "pause", reason: "age" });
    }

    if (!this.queue.hasPending()) {
      this.health.evaluateWatermarks();
      this.scheduleFlush(this.options.flushIntervalMs);
      return;
    }

    const result = this.queue.flushBudgeted({
      maxThreads: FLUSH_MAX_THREADS,
      maxBytes: FLUSH_MAX_BYTES,
      maxMs: FLUSH_MAX_MS,
      now: this.options.now,
    });
    const failed = this.recordBudgetedResult(result, true);
    if (failed) return;
    if (result.remainingThreads > 0 && result.flushedThreads > 0) {
      this.scheduleImmediateFlush();
      return;
    }
    if (result.flushedThreads === 0) {
      this.scheduleFlush(this.options.flushIntervalMs);
      return;
    }
    this.health.evaluateWatermarks();
    this.scheduleFlush(
      this.queue.hasPending() ? this.health.currentRetryDelayMs() : this.options.flushIntervalMs,
    );
  }

  /** Returns true when the cycle failed (a backoff timer was scheduled). */
  private recordBudgetedResult(result: RuntimeBudgetedFlushResult, schedule: boolean): boolean {
    this.health.noteFlushAttempts(result.flushedThreads + (result.failure ? 1 : 0));
    if (result.flushedThreads > 0) {
      this.health.recordDuration(result.elapsedMs);
      this.health.noteQueueSuccess();
    }
    if (!result.failure) return false;
    const errorClass = classifyStorageError(result.failure.error);
    this.applyFailure(result.failure.error, errorClass, result.failure.threadId, schedule);
    return true;
  }

  /** Classify + apply + schedule; returns the class for the typed refusal. */
  private applyFlushFailure(error: unknown, threadId: string): RuntimeStorageErrorClass {
    const errorClass = classifyStorageError(error);
    this.applyFailure(error, errorClass, threadId);
    return errorClass;
  }

  private applyFailure(
    error: unknown,
    errorClass: RuntimeStorageErrorClass,
    threadId?: string,
    schedule = true,
  ): void {
    this.health.applyFailure(error, errorClass, threadId);
    if (schedule) this.scheduleFlush(this.health.currentRetryDelayMs(errorClass));
  }
}

function yieldToEventLoop(): Promise<void> {
  return new Promise<void>((resolve) => setImmediate(resolve));
}

/**
 * Checked synchronous-callback contract for thread mutations. An `async`
 * callback is refused before it runs (its synchronous prefix would otherwise
 * execute), and a synchronous callback that returns a thenable is refused
 * before `supersedePendingPrefix`: awaiting either would let events admitted
 * during the await be discarded after the rebase applied, with no record of
 * the gap. The forbidden promise is observed so a later rejection cannot
 * surface as an unhandled rejection.
 */
function assertSynchronousMutationCallback(operation: () => unknown): void {
  const constructorName = (operation as { constructor?: { name?: string } }).constructor?.name;
  if (constructorName === "AsyncFunction") {
    throw new Error(
      "Runtime thread mutation callbacks must be synchronous; an async callback would supersede events admitted during its await.",
    );
  }
}

function requireSynchronousMutationResult<T>(value: T): T {
  if (isThenable(value)) {
    void Promise.resolve(value).catch(() => {});
    throw new Error(
      "Runtime thread mutation callbacks must be synchronous; an async result would supersede events admitted during its await.",
    );
  }
  return value;
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

function percentile(sorted: readonly number[], fraction: number): number | null {
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.floor(fraction * (sorted.length - 1)));
  return sorted[index] ?? null;
}

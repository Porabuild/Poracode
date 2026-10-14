import type { RuntimeQueueBounds } from "./runtimeWriteQueue";
import type {
  RuntimePersistenceState,
  RuntimePersistenceStateInfo,
  RuntimeProducerSignal,
  RuntimeRefusalReason,
  RuntimeRefusalScope,
  RuntimeStorageErrorClass,
} from "./runtimePersistenceTypes";

/**
 * Health/admission mechanics of the B1 persistence controller: the storage
 * state machine, refusal classification, producer signals, pause/resume
 * watermarks, retry backoff, and the diagnostics counters.
 *
 * One authority: the controller owns the queue, contamination, fences, and
 * mutations; this class owns *what the observed pending work means for
 * admission*. It never touches SQLite or the queue directly; every decision
 * reads a fresh observation supplied by the controller.
 *
 * State machine (edge-triggered, one signal per transition):
 *   healthy --(retryable threshold | storage class | watermark)--> degraded
 *   degraded --(stable success >= recoverAfterMs)--> healthy
 *   degraded --(global hard cap | age cap | fatal class)--> refusing
 *   refusing --(drain to resume level + stable success, non-fatal)--> degraded
 */

export const RUNTIME_PERSISTENCE_SOFT_WATERMARK_RATIO = 0.6;
export const RUNTIME_PERSISTENCE_LOW_WATERMARK_RATIO = 0.3;
/** Conservative in-flight assumption when the supervisor advertises no window. */
export const RUNTIME_PERSISTENCE_CONSERVATIVE_IN_FLIGHT_BYTES = 14 * 1024 * 1024;
const DEFAULT_RECOVER_AFTER_MS = 2_000;
const DEFAULT_RETRYABLE_FAILURE_THRESHOLD = 3;
const DEFAULT_RETRYABLE_FAILURE_WINDOW_MS = 10_000;
const DEFAULT_RETRY_BACKOFF_MS = [50, 100, 250, 500, 1_000] as const;
const DEFAULT_STORAGE_BACKOFF_MS = [250, 1_000, 2_000] as const;
const FLUSH_DURATION_SAMPLE_LIMIT = 512;
const DEFAULT_SAFETY_BYTES = 1 * 1024 * 1024;
const DEFAULT_MINIMUM_WORKING_SET_BYTES = 1 * 1024 * 1024;

/** Fresh view of the work this health policy must judge. */
export interface RuntimePersistenceHealthObservation {
  pendingEvents: number;
  pendingBytes: number;
  oldestPendingAgeMs: number | null;
  bounds: RuntimeQueueBounds;
  contaminatedThreads: number;
}

export interface RuntimePersistenceHealthOptions {
  /** Reads the queue/contamination state at decision time. */
  observe: () => RuntimePersistenceHealthObservation;
  now?: () => number;
  recoverAfterMs?: number;
  retryableFailureThreshold?: number;
  retryableFailureWindowMs?: number;
  retryBackoffMs?: readonly number[];
  storageBackoffMs?: readonly number[];
  safetyBytes?: number;
  minimumWorkingSetBytes?: number;
  /**
   * Supervisor bytes that may already be retained/in transit outside the host
   * queue (IPC sender queue + kernel/receiver buffers + one envelope). Used to
   * compute the pause threshold; never mutates the configured global bound.
   * `null` means the peer advertised nothing: fall back to the conservative
   * constant.
   */
  inFlightWindowBytes?: number | null;
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
}

export interface RuntimePersistenceHealthCounters {
  flushAttempts: number;
  flushSuccesses: number;
  flushFailuresRetryable: number;
  flushFailuresStorage: number;
  flushFailuresFatal: number;
  flushDurationsMs: readonly number[];
  refusedAdmissions: number;
}

export class RuntimePersistenceHealth {
  private readonly options: Required<
    Pick<
      RuntimePersistenceHealthOptions,
      | "recoverAfterMs"
      | "retryableFailureThreshold"
      | "retryableFailureWindowMs"
      | "retryBackoffMs"
      | "storageBackoffMs"
      | "safetyBytes"
      | "minimumWorkingSetBytes"
      | "now"
    >
  > &
    RuntimePersistenceHealthOptions;

  private state: RuntimePersistenceState = "healthy";
  private lastErrorClass: RuntimeStorageErrorClass | null = null;
  private admissionClosed = false;
  private producerSignal: "none" | "pause" | "stop" = "none";
  private retryableFailureTimes: number[] = [];
  private lastFailureAt: number | null = null;
  private lastSuccessAt: number | null = null;
  private retryBackoffIndex = 0;
  private storageBackoffIndex = 0;
  private flushAttempts = 0;
  private flushSuccesses = 0;
  private flushFailuresRetryable = 0;
  private flushFailuresStorage = 0;
  private flushFailuresFatal = 0;
  private readonly flushDurationsMs: number[] = [];
  private refusedAdmissions = 0;
  private inFlightWindowBytes: number | null;

  constructor(options: RuntimePersistenceHealthOptions) {
    this.options = {
      recoverAfterMs: DEFAULT_RECOVER_AFTER_MS,
      retryableFailureThreshold: DEFAULT_RETRYABLE_FAILURE_THRESHOLD,
      retryableFailureWindowMs: DEFAULT_RETRYABLE_FAILURE_WINDOW_MS,
      retryBackoffMs: DEFAULT_RETRY_BACKOFF_MS,
      storageBackoffMs: DEFAULT_STORAGE_BACKOFF_MS,
      safetyBytes: DEFAULT_SAFETY_BYTES,
      minimumWorkingSetBytes: DEFAULT_MINIMUM_WORKING_SET_BYTES,
      now: () => Date.now(),
      ...options,
    };
    this.inFlightWindowBytes = options.inFlightWindowBytes ?? null;
  }

  getState(): RuntimePersistenceState {
    return this.state;
  }

  getLastErrorClass(): RuntimeStorageErrorClass | null {
    return this.lastErrorClass;
  }

  getProducerSignal(): "none" | "pause" | "stop" {
    return this.producerSignal;
  }

  isAdmissionClosed(): boolean {
    return this.admissionClosed;
  }

  setAdmissionClosed(): void {
    this.admissionClosed = true;
  }

  /** Negotiated in-flight window for the pause arithmetic (`null`: no advertisement). */
  setInFlightWindowBytes(bytes: number | null): void {
    this.inFlightWindowBytes = bytes === null ? null : Math.max(0, Math.floor(bytes));
    this.evaluateWatermarks();
  }

  getInFlightWindowBytes(): number | null {
    return this.inFlightWindowBytes;
  }

  /**
   * Compute the supplied pause threshold: configured bulk bound minus the
   * supervisor's advertised in-flight window minus a safety margin. A peer
   * that advertises nothing gets the conservative constant, never a ratio that
   * would leave less headroom than the supervisor's own retained queue can
   * hold. The configured global bound is never mutated; when the arithmetic
   * cannot leave a working set the threshold clamps up to
   * `minimumWorkingSetBytes` and `isPauseThresholdClamped()` reports it, so a
   * peer that advertises an in-flight window larger than the host budget
   * pauses immediately instead of silently accepting more memory than
   * configured.
   */
  getPauseThresholdBytes(): number {
    const global = this.options.observe().bounds.maxPendingBytesGlobal;
    return Math.max(
      this.options.minimumWorkingSetBytes,
      global - this.effectiveInFlightWindowBytes() - this.options.safetyBytes,
    );
  }

  isPauseThresholdClamped(): boolean {
    const global = this.options.observe().bounds.maxPendingBytesGlobal;
    return (
      global - this.effectiveInFlightWindowBytes() - this.options.safetyBytes <
      this.options.minimumWorkingSetBytes
    );
  }

  private effectiveInFlightWindowBytes(): number {
    return this.inFlightWindowBytes ?? RUNTIME_PERSISTENCE_CONSERVATIVE_IN_FLIGHT_BYTES;
  }

  private resumeThresholdBytes(): number {
    return (
      this.getPauseThresholdBytes() *
      (RUNTIME_PERSISTENCE_LOW_WATERMARK_RATIO / RUNTIME_PERSISTENCE_SOFT_WATERMARK_RATIO)
    );
  }

  /** Transition the state machine and notify observers on an edge. */
  transitionTo(next: RuntimePersistenceState): void {
    if (this.state === next) return;
    this.state = next;
    const observation = this.options.observe();
    this.options.onStateChange?.({
      state: next,
      errorClass: this.lastErrorClass,
      pendingEvents: observation.pendingEvents,
      pendingBytes: observation.pendingBytes,
      contaminatedThreads: observation.contaminatedThreads,
    });
  }

  /**
   * Emit one producer signal. Thread-scoped stops are per-thread and must each
   * reach the supervisor; they are not deduplicated against the global signal
   * state.
   */
  emitSignal(signal: RuntimeProducerSignal): void {
    if (signal.kind === "stop" && signal.threadIds !== undefined && signal.threadIds.length > 0) {
      this.options.onSignal?.(signal);
      return;
    }
    const next = signal.kind === "resume" ? "none" : signal.kind;
    if (next === this.producerSignal) return;
    this.producerSignal = next;
    this.options.onSignal?.(signal);
  }

  reportRefusal(
    reason: RuntimeRefusalReason,
    scope: RuntimeRefusalScope,
    refusedEvents: number,
    refusedBytes: number,
  ): void {
    this.refusedAdmissions += 1;
    this.options.onRefusal?.(reason, scope, {
      pendingEvents: this.options.observe().pendingEvents,
      pendingBytes: this.options.observe().pendingBytes,
      refusedEvents,
      refusedBytes,
    });
  }

  /** A hard-cap/age refusal is a failure event for the stable-window logic. */
  noteRefusalFailure(): void {
    this.lastFailureAt = this.options.now();
    if (this.lastErrorClass === null) this.lastErrorClass = "retryable";
  }

  applyFailure(error: unknown, errorClass: RuntimeStorageErrorClass, threadId?: string): void {
    const now = this.options.now();
    this.lastFailureAt = now;
    this.lastErrorClass = errorClass;
    if (errorClass === "retryable") {
      this.flushFailuresRetryable += 1;
      this.retryableFailureTimes.push(now);
      this.retryableFailureTimes = this.retryableFailureTimes.filter(
        (time) => now - time <= this.options.retryableFailureWindowMs,
      );
      if (this.retryableFailureTimes.length >= this.options.retryableFailureThreshold) {
        this.transitionTo("degraded");
        this.emitSignal({ kind: "pause", reason: "storage" });
      }
    } else if (errorClass === "storage") {
      this.flushFailuresStorage += 1;
      this.transitionTo("degraded");
      this.emitSignal({ kind: "pause", reason: "storage" });
    } else {
      this.flushFailuresFatal += 1;
      this.transitionTo("refusing");
      this.emitSignal({ kind: "stop", reason: "fatal" });
    }
    this.options.onFailure?.(error, errorClass, threadId);
  }

  currentRetryDelayMs(
    errorClass: RuntimeStorageErrorClass = this.lastErrorClass ?? "retryable",
  ): number {
    const backoff =
      errorClass === "storage" ? this.options.storageBackoffMs : this.options.retryBackoffMs;
    const index = errorClass === "storage" ? this.storageBackoffIndex : this.retryBackoffIndex;
    if (errorClass === "storage") this.storageBackoffIndex += 1;
    else this.retryBackoffIndex += 1;
    return backoff[Math.min(index, backoff.length - 1)] ?? 1_000;
  }

  noteQueueSuccess(): void {
    this.flushSuccesses += 1;
    this.retryBackoffIndex = 0;
    this.storageBackoffIndex = 0;
    this.lastSuccessAt = this.options.now();
    this.maybeRecover();
    this.maybeRecoverFromRefusing();
    this.evaluateWatermarks();
  }

  /** A successful control write is also evidence that storage works again. */
  noteSuccessWithoutQueue(): void {
    this.lastSuccessAt = this.options.now();
    this.retryBackoffIndex = 0;
    this.storageBackoffIndex = 0;
    this.maybeRecover();
    this.maybeRecoverFromRefusing();
    this.evaluateWatermarks();
  }

  noteFlushAttempts(count: number): void {
    this.flushAttempts += count;
  }

  maybeRecover(): void {
    if (this.state !== "degraded" || this.lastFailureAt === null) return;
    const now = this.options.now();
    if (now - this.lastFailureAt < this.options.recoverAfterMs) return;
    const committedSinceFailure =
      this.lastSuccessAt !== null && this.lastSuccessAt >= this.lastFailureAt;
    if (this.options.observe().pendingEvents > 0 && !committedSinceFailure) return;
    this.transitionTo("healthy");
    this.evaluateWatermarks();
  }

  /**
   * Safe global recovery after transient overload (hard cap / age / storage):
   * once the accepted backlog drains below the resume level and a write has
   * succeeded after the refusal, `refusing` returns to `degraded` and the
   * normal stable-window path can reach `healthy`. This is safe only because
   * refused events are never published (the publication gate): there is no
   * durable/published divergence to hide. Fatal storage classes stay refused
   * until the connection is reopened, and per-thread contamination is never
   * cleared here.
   */
  maybeRecoverFromRefusing(): void {
    if (this.state !== "refusing") return;
    if (this.lastErrorClass === "fatal") return;
    if (this.lastFailureAt === null) return;
    const now = this.options.now();
    if (now - this.lastFailureAt < this.options.recoverAfterMs) return;
    if (this.lastSuccessAt === null || this.lastSuccessAt < this.lastFailureAt) return;
    const observation = this.options.observe();
    const bounds = observation.bounds;
    const backlogAboveResume =
      observation.pendingBytes > this.resumeThresholdBytes() ||
      observation.pendingEvents >
        bounds.maxPendingEventsGlobal * RUNTIME_PERSISTENCE_LOW_WATERMARK_RATIO;
    if (observation.pendingEvents > 0 && backlogAboveResume) return;
    this.transitionTo("degraded");
    if (this.producerSignal === "stop") this.emitSignal({ kind: "resume", reason: "recovered" });
  }

  evaluateWatermarks(): void {
    if (this.admissionClosed || this.state === "refusing") return;
    const observation = this.options.observe();
    const bounds = observation.bounds;
    const age = observation.oldestPendingAgeMs ?? 0;
    const hardBytes = observation.pendingBytes >= bounds.maxPendingBytesGlobal;
    const hardEvents = observation.pendingEvents >= bounds.maxPendingEventsGlobal;
    if (hardBytes || hardEvents || age >= bounds.maxPendingAgeMs) {
      this.noteRefusalFailure();
      this.transitionTo("refusing");
      this.emitSignal({
        kind: "stop",
        reason: hardBytes || hardEvents ? "hard-cap" : "age",
      });
      return;
    }
    const pauseAtBytes = this.getPauseThresholdBytes();
    const pauseBytes = observation.pendingBytes >= pauseAtBytes;
    const pauseEvents =
      observation.pendingEvents >=
      bounds.maxPendingEventsGlobal * RUNTIME_PERSISTENCE_SOFT_WATERMARK_RATIO;
    if (pauseBytes || pauseEvents || age >= bounds.maxPendingAgeMs / 2) {
      this.emitSignal({
        kind: "pause",
        reason: age >= bounds.maxPendingAgeMs / 2 ? "age" : "watermark",
      });
      return;
    }
    const belowResume =
      observation.pendingBytes < this.resumeThresholdBytes() &&
      observation.pendingEvents <
        bounds.maxPendingEventsGlobal * RUNTIME_PERSISTENCE_LOW_WATERMARK_RATIO;
    if (belowResume && this.producerSignal === "pause") {
      this.emitSignal({ kind: "resume", reason: "watermark-cleared" });
    }
  }

  recordDuration(durationMs: number): void {
    if (!Number.isFinite(durationMs)) return;
    this.flushDurationsMs.push(durationMs);
    if (this.flushDurationsMs.length > FLUSH_DURATION_SAMPLE_LIMIT) {
      this.flushDurationsMs.splice(0, this.flushDurationsMs.length - FLUSH_DURATION_SAMPLE_LIMIT);
    }
  }

  counters(): RuntimePersistenceHealthCounters {
    return {
      flushAttempts: this.flushAttempts,
      flushSuccesses: this.flushSuccesses,
      flushFailuresRetryable: this.flushFailuresRetryable,
      flushFailuresStorage: this.flushFailuresStorage,
      flushFailuresFatal: this.flushFailuresFatal,
      flushDurationsMs: this.flushDurationsMs,
      refusedAdmissions: this.refusedAdmissions,
    };
  }

  /** Test-only reset of health counters (not part of the production contract). */
  resetCountersForTests(): void {
    this.flushAttempts = 0;
    this.flushSuccesses = 0;
    this.flushFailuresRetryable = 0;
    this.flushFailuresStorage = 0;
    this.flushFailuresFatal = 0;
    this.refusedAdmissions = 0;
    this.flushDurationsMs.length = 0;
  }

  /** Re-arm the state machine for a freshly opened database handle. */
  resetForNewConnection(): void {
    this.state = "healthy";
    this.lastErrorClass = null;
    this.admissionClosed = false;
    this.producerSignal = "none";
    this.retryableFailureTimes = [];
    this.lastFailureAt = null;
    this.lastSuccessAt = null;
    this.retryBackoffIndex = 0;
    this.storageBackoffIndex = 0;
  }
}

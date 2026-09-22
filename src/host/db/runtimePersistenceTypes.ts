import type { RuntimeHistoryNoticeReason } from "@/shared/runtimeHistoryNotice";

/**
 * B1 persistence-health vocabulary shared by the runtime write queue, the
 * persistence controller, the supervisor flow-control channel, and diagnostics.
 *
 * Acknowledgement levels (documented contract, no API claims more):
 * - Delivered: the supervisor queued the event on its IPC channel.
 * - Accepted (queued): host intake admitted it to bounded memory. Lost on host
 *   process crash or power loss; no function reports it as durable.
 * - Committed: a SQLite `.immediate()` transaction returned success (WAL).
 *   Survives a process crash; power loss is not promised (`synchronous=NORMAL`).
 * - Checkpointed: `wal_checkpoint(TRUNCATE)` on a clean close improves the
 *   power-loss posture; it is not a durability promise for chat events.
 */

export type RuntimePersistenceState = "healthy" | "degraded" | "refusing";

export type RuntimeStorageErrorClass = "retryable" | "storage" | "fatal";

/**
 * Which budget bound refused an admission. The reason is exact: it names the
 * first constraint that could not fit, never a coarser "bytes" bucket.
 */
export type RuntimeAdmissionRefusalReason =
  | "thread-events"
  | "thread-bytes"
  | "global-events"
  | "global-bytes"
  | "oversize"
  | "age"
  | "degraded"
  | "shutdown"
  /**
   * B1: canonical events named a thread with no `threads` row. The batch is
   * refused explicitly (never silently accepted into a write that would be a
   * no-op) and no durable gap is fabricated: a gap row could never commit for
   * a thread that does not exist, and nothing was accepted or published.
   */
  | "unknown-thread";

/** Which budget the refusing thread(s) exceeded. */
export type RuntimeRefusalScope = "thread" | "global";

/**
 * Contamination survives until an authoritative rebase of the thread.
 *
 * `age` and `degraded` are global refusal reasons: while bulk admission is
 * closed (backlog age or a refusing persistence state) a refused batch is a
 * canonical gap for exactly the thread that produced it, so that thread is
 * contaminated and read-refused until a deliberate rebase — a global
 * pause/stop alone is not per-thread evidence.
 *
 * `rebase-dropped` is not an admission refusal: a deferred authoritative
 * rebase (`thread-reset`) exhausted its bounded control retries, so the
 * pre-reset transcript and the post-reset session cannot be told apart. The
 * thread is contaminated so later events are refused instead of silently
 * appending to the old transcript; an applied rebase is the recovery.
 */
export type RuntimeContaminationReason = RuntimeHistoryNoticeReason;

/**
 * Why an admission was refused or a thread read is refused. Budget-bound
 * refusals carry a {@link RuntimeAdmissionRefusalReason}; a contaminated thread
 * carries its {@link RuntimeContaminationReason} (including the non-admission
 * `rebase-dropped`).
 */
export type RuntimeRefusalReason = RuntimeAdmissionRefusalReason | RuntimeContaminationReason;

export type RuntimeAdmission =
  | {
      kind: "accepted";
      persistSeq: number;
      estimatedBytes: number;
      /** Events accepted from this batch (a prefix; the rest are refused). */
      acceptedEvents: number;
      refusedEvents: number;
      refusedBytes: number;
      /** Present when part of the batch was refused (the accepted prefix published). */
      reason?: RuntimeAdmissionRefusalReason;
      scope?: RuntimeRefusalScope;
    }
  | {
      kind: "refused";
      reason: RuntimeRefusalReason;
      scope: RuntimeRefusalScope;
      refusedEvents: number;
      refusedBytes: number;
    };

export type RuntimeBarrierResult =
  | { kind: "committed"; persistSeq: number }
  | {
      kind: "contaminated";
      reason: RuntimeContaminationReason;
      persistSeq: number;
      refusedEvents: number;
      refusedBytes: number;
    }
  | {
      kind: "degraded";
      persistSeq: number;
      pendingEvents: number;
      pendingBytes: number;
      errorClass: RuntimeStorageErrorClass;
      error?: unknown;
    };

export type RuntimeShutdownReport =
  | { kind: "drained"; committedThroughPersistSeq: number }
  | {
      kind: "incomplete";
      pendingEvents: number;
      pendingBytes: number;
      oldestPendingAgeMs: number | null;
      errorClass: RuntimeStorageErrorClass | null;
      message: string;
    };

/** Typed read refusal for a thread whose accepted events could not commit. */
export class RuntimePersistenceDegradedError extends Error {
  constructor(
    readonly threadId: string,
    readonly pendingEvents: number,
    readonly pendingBytes: number,
    readonly errorClass: RuntimeStorageErrorClass,
    readonly retryAfterMs: number,
    cause?: unknown,
  ) {
    super(
      `Runtime persistence for thread "${threadId}" is degraded: ${pendingEvents} accepted event(s) could not commit. Reads are refused instead of serving a short transcript with a fresh cursor.`,
    );
    this.name = "RuntimePersistenceDegradedError";
    if (cause !== undefined) this.cause = cause;
  }
}

/**
 * Typed read refusal for a thread whose canonical events were explicitly
 * refused by bounded admission. A refused event was never published, so the
 * thread's durable transcript is a strict prefix of the published domain until
 * an authoritative rebase (reset/replace/delete) makes the domains agree
 * again; serving the committed rows behind a fresh cursor would silently skip
 * the refused output.
 *
 * B1 durable-gap evidence extends the same truth across host restarts: the
 * contamination is persisted (an exact `thread_runtime_gaps` row, or a
 * surviving epoch touch) and no amount of retrying a read can repair it.
 * `repairRequired` is the stable machine signal for that.
 */
export class RuntimePersistenceContaminatedError extends Error {
  /** True whenever only an authoritative rebase (reset/replace/delete) repairs it. */
  readonly repairRequired = true;

  constructor(
    readonly threadId: string,
    readonly reason: RuntimeContaminationReason,
    readonly refusedEvents: number,
    readonly refusedBytes: number,
    readonly retryAfterMs: number,
  ) {
    super(contaminatedRefusalMessage(threadId, reason, refusedEvents));
    this.name = "RuntimePersistenceContaminatedError";
  }
}

function contaminatedRefusalMessage(
  threadId: string,
  reason: RuntimeContaminationReason,
  refusedEvents: number,
): string {
  if (reason === "rebase-dropped") {
    return `Runtime persistence for thread "${threadId}" is contaminated (${reason}): the deferred authoritative rebase exhausted its bounded retries and will never apply, so later events cannot be appended to the pre-reset transcript. Repair: reset/replace/delete the thread; retrying the read cannot repair it.`;
  }
  if (reason === "unclean-epoch") {
    return `Runtime persistence for thread "${threadId}" is contaminated (${reason}): a previous host session did not close cleanly, so its accepted prefix may be incomplete. Repair: reset/replace/delete the thread; retrying the read cannot repair it.`;
  }
  return `Runtime persistence for thread "${threadId}" is contaminated (${reason}): ${refusedEvents} event(s) were explicitly refused and never published, so the durable transcript is a strict prefix of the published domain. Repair: reset/replace/delete the thread; retrying the read cannot repair it.`;
}

/**
 * A launch (or any durable touch) named a thread with no `threads` row. The
 * request is refused typed before supervisor dispatch so no provider process
 * can run for a thread whose canonical evidence cannot be armed.
 */
export class RuntimePersistenceUnknownThreadError extends Error {
  constructor(readonly threadId: string) {
    super(
      `Runtime persistence refused a durable touch for unknown thread "${threadId}": no threads row exists, so canonical evidence cannot be armed.`,
    );
    this.name = "RuntimePersistenceUnknownThreadError";
  }
}

/**
 * Thrown by the before-database-close hook when durable gap evidence is not
 * safe to close: an exact gap write is still pending, or the pending-obligation
 * reserve overflowed (latched). `closeDatabase` keeps the handle open on a
 * failed hook, so the armed epoch and every touch survive to the next boot and
 * no false clean close is possible.
 */
export class RuntimePersistenceDurableGapPendingError extends Error {
  constructor(
    readonly pendingThreadIds: readonly string[],
    readonly reserveLatched: boolean,
  ) {
    super(
      reserveLatched
        ? `Runtime persistence refused a clean close: the durable gap reserve overflowed, so obligations beyond it are covered only by their surviving epoch touches (${pendingThreadIds.length} tracked).`
        : `Runtime persistence refused a clean close: exact gap evidence is not durable for ${pendingThreadIds.length} thread(s).`,
    );
    this.name = "RuntimePersistenceDurableGapPendingError";
  }
}

/**
 * B1 GUI acknowledgement: the durable-gap store is not usable for a durable
 * read or mutation (no bound connection, a failed bind, or a boot that never
 * armed). The operation fails closed instead of assuming clean state: an ack
 * must never clear evidence it cannot durably record, and a descriptor read
 * must never present a clean thread it cannot verify.
 */
export class RuntimePersistenceDurableStateUnavailableError extends Error {
  constructor(
    readonly threadId: string,
    readonly operation: "gap-descriptor" | "notice-descriptor" | "acknowledge",
    cause?: unknown,
  ) {
    super(
      `Runtime durable history state is unavailable for thread "${threadId}" (${operation}); the operation was refused instead of assuming a clean transcript.`,
    );
    this.name = "RuntimePersistenceDurableStateUnavailableError";
    if (cause !== undefined) this.cause = cause;
  }
}

/**
 * A persisted episode identity is missing or malformed (a `thread_runtime_gaps`
 * row without a valid episode UUID, or a notice token that does not decode).
 * Readers refuse typed instead of minting a token from corrupt state; the only
 * repair is an authoritative rebase (reset/replace/delete).
 */
export class RuntimePersistenceGapIdentityError extends Error {
  constructor(
    readonly threadId: string,
    readonly detail: string,
  ) {
    super(`Runtime history episode identity for thread "${threadId}" is invalid: ${detail}.`);
    this.name = "RuntimePersistenceGapIdentityError";
  }
}

/** Typed busy refusal for fence/mutation waiters beyond the bounded queue. */
export class RuntimePersistenceBusyError extends Error {
  constructor(
    readonly threadId: string,
    readonly operation: "fence" | "mutation",
    readonly retryAfterMs: number,
  ) {
    super(
      `Runtime persistence is busy for thread "${threadId}" (${operation}): too many waiters. Retry shortly.`,
    );
    this.name = "RuntimePersistenceBusyError";
  }
}

/**
 * Thrown by the before-database-close hook when accepted events remain
 * uncommitted. `closeDatabase` intentionally leaves the database open on a
 * failed hook so custody is preserved for a retry or a forced process exit;
 * no shutdown path may claim a successful join over this report.
 */
export class RuntimePersistenceDrainIncompleteError extends Error {
  constructor(readonly report: Extract<RuntimeShutdownReport, { kind: "incomplete" }>) {
    super(report.message);
    this.name = "RuntimePersistenceDrainIncompleteError";
  }
}

/**
 * Producer-facing persistence health. `pause` asks the supervisor to stop
 * flushing canonical runtime events (bounded buffers + provider pause where a
 * provider declares it); `stop` means the host cannot accept canonical events
 * at all and affected sessions must stop explicitly. A thread-scoped `stop`
 * (`threadIds`) stops exact sessions and never resumes them implicitly: an
 * explicit refusal must stay visible instead of silently resuming as if the
 * refused output had been accepted.
 */
export type RuntimeProducerSignal =
  | { kind: "pause"; reason: "watermark" | "storage" | "age" }
  | {
      kind: "stop";
      reason: "hard-cap" | "age" | "fatal";
      threadIds?: string[];
      refusal?: RuntimeContaminationReason;
    }
  | { kind: "resume"; reason: "recovered" | "watermark-cleared" };

export interface RuntimePersistenceStateInfo {
  state: RuntimePersistenceState;
  errorClass: RuntimeStorageErrorClass | null;
  pendingEvents: number;
  pendingBytes: number;
  /** Threads currently contaminated by an explicit admission refusal. */
  contaminatedThreads: number;
}

/**
 * Fence token for the asynchronous committed-prefix read barrier. The caller
 * pins the intake prefix (`beginFence`) and captures the published cursor in
 * the same synchronous turn, then awaits `flushFence`, reads behind the held
 * fence with `readFenced`, and releases. `generation` fences a stale token
 * against a queue reset; `ready` is set by `flushFence` and asserted by
 * `readFenced` so a read can never run before its prefix is committed.
 */
export interface RuntimeFenceToken {
  readonly threadId: string;
  /** Intake prefix pinned at begin; only events at or below it may commit. */
  readonly throughPersistSeq: number;
  /** Queue generation at pin time; a mismatch means the queue was reset. */
  readonly generation: number;
  /** Internal: set true by `flushFence` immediately before it resolves. */
  ready?: boolean;
  /** Internal: set when released/expired so a late read is refused. */
  released?: boolean;
}

export type RuntimeFenceResult =
  | { kind: "committed"; persistSeq: number; pendingEvents: number; pendingBytes: number }
  | { kind: "degraded"; persistSeq: number; errorClass: RuntimeStorageErrorClass; error?: unknown }
  | {
      kind: "contaminated";
      persistSeq: number;
      reason: RuntimeContaminationReason;
      refusedEvents: number;
      refusedBytes: number;
    }
  | { kind: "cancelled"; persistSeq: number }
  | { kind: "deadline"; persistSeq: number };

import type { RuntimeEvent } from "@/shared/contracts";
import type { RuntimeWriteQueue } from "./runtimeWriteQueue";
import type { RuntimePersistenceHealth } from "./runtimePersistenceHealth";
import type { RuntimeDurableGapPort } from "./runtimeDurableGap";
import {
  RuntimePersistenceUnknownThreadError,
  type RuntimeAdmission,
  type RuntimeAdmissionRefusalReason,
  type RuntimeContaminationReason,
  type RuntimeRefusalReason,
  type RuntimeRefusalScope,
} from "./runtimePersistenceTypes";

/**
 * Admission/contamination mechanics of the B1 persistence controller: the
 * bounded enqueue gate, explicit refusal reporting, and the per-thread
 * contamination records.
 *
 * Contamination is the truthful consequence of an explicit refusal: the
 * refused events were never accepted, so the thread's durable transcript is a
 * strict prefix of the published domain until an authoritative rebase. It
 * clears only through {@link clearContaminationForRebase}.
 *
 * A per-thread refusal stays per-thread (only that thread is contaminated and
 * stopped); a global bound/age refusal closes bulk admission and marks the
 * refusing thread, while other threads' contamination is untouched.
 */

export interface RuntimeContaminationInfo {
  reason: RuntimeContaminationReason;
  refusedEvents: number;
  refusedBytes: number;
  at: number;
  /** Number of accepted-but-uncommitted events superseded by the last rebase. */
  supersededEvents: number;
}

export interface RuntimePersistenceAdmissionOptions {
  queue: RuntimeWriteQueue;
  health: RuntimePersistenceHealth;
  now: () => number;
  /**
   * B1 durable canonical-gap evidence. The decider owns the ordering
   * (resolve -> arm/touch -> enqueue) and delegates every SQL statement to the
   * store port; an absent port (direct unit harnesses) keeps admission
   * behaviorally identical to the in-memory-only contract.
   */
  durableGap?: RuntimeDurableGapPort;
}

export class RuntimePersistenceAdmission {
  private readonly queue: RuntimeWriteQueue;
  private readonly health: RuntimePersistenceHealth;
  private readonly now: () => number;
  private readonly durableGap: RuntimeDurableGapPort | undefined;
  private readonly contaminatedThreads = new Map<string, RuntimeContaminationInfo>();
  private supersededAcceptedEvents = 0;

  constructor(options: RuntimePersistenceAdmissionOptions) {
    this.queue = options.queue;
    this.health = options.health;
    this.now = options.now;
    this.durableGap = options.durableGap;
  }

  /**
   * Admit canonical runtime events. Never throws. Refusal is explicit and
   * reported through the health observer; a per-thread refusal contaminates
   * only that thread and raises a thread-scoped stop, while a global bound/age
   * refusal closes bulk admission and raises a global stop.
   *
   * B1 durable ordering (when a durable-gap port is attached): a boot that
   * cannot arm refuses every batch typed, a thread whose durable resolution is
   * not clean is refused with its durable reason, and the per-thread touch
   * commits before the batch may enter the queue. Any refusal with a
   * contamination reason records exact durable evidence (or a bounded pending
   * obligation) so a restart cannot serve a shorter transcript as complete.
   */
  admit(threadId: string, events: readonly RuntimeEvent[]): RuntimeAdmission {
    // Byte estimation parses every event; it is only needed on a refusal path,
    // so accepted batches never pay it (memoized for the branches below).
    let estimatedRefusedBytes: number | undefined;
    const bytes = (): number => (estimatedRefusedBytes ??= estimateBytes(events));
    if (this.health.isAdmissionClosed()) {
      // A nonempty shutdown-window refusal is a real canonical gap (B1):
      // persist it so a later boot cannot present the durable transcript as a
      // complete published prefix. A zero-event batch has no gap.
      if (events.length > 0) {
        this.markContaminated(threadId, "shutdown", events.length, bytes());
        this.health.reportRefusal("shutdown", "global", events.length, bytes());
      }
      return {
        kind: "refused",
        reason: "shutdown",
        scope: "global",
        refusedEvents: events.length,
        refusedBytes: bytes(),
      };
    }
    const contamination = this.contaminatedThreads.get(threadId);
    if (contamination) {
      this.health.reportRefusal(contamination.reason, "thread", events.length, bytes());
      this.durableGap?.recordGap(threadId, contamination.reason, events.length, bytes());
      return {
        kind: "refused",
        reason: contamination.reason,
        scope: "thread",
        refusedEvents: events.length,
        refusedBytes: bytes(),
      };
    }
    // The exact backlog-age refusal is decided before the durable arm/touch
    // writes: its reason names the real constraint (`age`) instead of the
    // coarser global `degraded`, and it must not be shadowed by the health
    // watermark transition a successful durable write can trigger.
    const bounds = this.queue.getBounds();
    const age = this.queue.oldestPendingAgeMs(this.now());
    if (age !== null && age >= bounds.maxPendingAgeMs) {
      // Mark the gap before the state transition so the state-change
      // observation already includes this contaminated thread.
      this.markRefusalGap(threadId, "age", events.length, bytes());
      this.health.noteRefusalFailure();
      this.health.transitionTo("refusing");
      this.health.emitSignal({ kind: "stop", reason: "age" });
      this.health.reportRefusal("age", "global", events.length, bytes());
      return {
        kind: "refused",
        reason: "age",
        scope: "global",
        refusedEvents: events.length,
        refusedBytes: bytes(),
      };
    }
    // Durable ordering runs before any acceptance decision (including the
    // global refusing gate): the root arm is retried on every admission
    // attempt so storage recovery re-arms the boot, and the per-thread touch
    // commits before any event may enter the bounded queue. A read-only boot
    // therefore refuses the batch instead of accepting events it cannot cover.
    const durable = this.durableGap;
    if (durable) {
      const resolution = durable.resolve(threadId);
      if (resolution.kind === "error") {
        // The bounded read failed: for this boot only, refuse the thread
        // (read-refused, not persisted) so no decision is made against
        // unreadable evidence. The next connection re-resolves.
        durable.reportFailure(resolution.error);
        this.handleRefusal(threadId, "degraded", "thread", events.length, bytes());
        return {
          kind: "refused",
          reason: "degraded",
          scope: "thread",
          refusedEvents: events.length,
          refusedBytes: bytes(),
        };
      }
      if (resolution.kind === "suspect") {
        // A surviving touch from a boot that never cleanly closed. The
        // refused events are an additional gap; exact evidence records them.
        this.handleRefusal(threadId, "unclean-epoch", "thread", events.length, bytes());
        return {
          kind: "refused",
          reason: "unclean-epoch",
          scope: "thread",
          refusedEvents: events.length,
          refusedBytes: bytes(),
        };
      }
      if (resolution.kind === "exact") {
        this.handleRefusal(threadId, resolution.reason, "thread", events.length, bytes());
        return {
          kind: "refused",
          reason: resolution.reason,
          scope: "thread",
          refusedEvents: events.length,
          refusedBytes: bytes(),
        };
      }
      if (events.length > 0) {
        try {
          // INV-A: the root arm and the per-thread touch commit before any
          // event may enter the bounded queue. A touch failure refuses the
          // whole batch; nothing is accepted, so nothing is lost.
          durable.armThread(threadId);
        } catch (error) {
          if (error instanceof RuntimePersistenceUnknownThreadError) {
            // No threads row exists: refuse explicitly instead of accepting
            // into a guaranteed no-op write. No durable gap is fabricated (a
            // gap row could never commit for the missing thread) and the
            // message never reached a provider in this boot.
            this.health.reportRefusal("unknown-thread", "thread", events.length, bytes());
            return {
              kind: "refused",
              reason: "unknown-thread",
              scope: "thread",
              refusedEvents: events.length,
              refusedBytes: bytes(),
            };
          }
          this.handleRefusal(threadId, "degraded", "global", events.length, bytes());
          return {
            kind: "refused",
            reason: "degraded",
            scope: "global",
            refusedEvents: events.length,
            refusedBytes: bytes(),
          };
        }
      }
    }

    if (this.health.getState() === "refusing") {
      // A global refusal is still a canonical gap for this exact thread: the
      // refused events were never accepted or published. Mark the thread
      // contaminated (read-refused until a deliberate rebase) instead of
      // letting a later read serve the shorter transcript as complete. The
      // refusing state already raised the global stop, so no signal is
      // re-emitted here.
      this.markRefusalGap(threadId, "degraded", events.length, bytes());
      this.health.reportRefusal("degraded", "global", events.length, bytes());
      return {
        kind: "refused",
        reason: "degraded",
        scope: "global",
        refusedEvents: events.length,
        refusedBytes: bytes(),
      };
    }

    const result = this.queue.enqueue(threadId, events);
    if (result.kind === "accepted") {
      if (result.refusedEvents > 0) {
        this.handleRefusal(
          threadId,
          result.reason ?? "thread-events",
          result.scope ?? "thread",
          result.refusedEvents,
          result.refusedBytes,
        );
      }
      return {
        kind: "accepted",
        persistSeq: result.persistSeq,
        estimatedBytes: result.acceptedBytes,
        acceptedEvents: result.acceptedEvents,
        refusedEvents: result.refusedEvents,
        refusedBytes: result.refusedBytes,
        ...(result.refusedEvents > 0 && result.reason !== undefined
          ? { reason: result.reason, scope: result.scope }
          : {}),
      };
    }

    const reason = result.reason ?? "thread-events";
    const scope = result.scope ?? "thread";
    this.handleRefusal(threadId, reason, scope, result.refusedEvents, result.refusedBytes);
    return {
      kind: "refused",
      reason,
      scope,
      refusedEvents: result.refusedEvents,
      refusedBytes: result.refusedBytes,
    };
  }

  /**
   * Record the thread-level consequence of a global refusal: refused events
   * are a canonical gap, so the refusing thread is contaminated and its reads
   * refuse typed until a deliberate rebase. A zero-event refusal has no gap.
   */
  private markRefusalGap(
    threadId: string,
    reason: RuntimeAdmissionRefusalReason,
    refusedEvents: number,
    refusedBytes: number,
  ): void {
    if (refusedEvents === 0) return;
    const contaminationReason = toContaminationReason(reason);
    if (contaminationReason) {
      this.markContaminated(threadId, contaminationReason, refusedEvents, refusedBytes);
    }
  }

  /** Shared refusal handling: contamination, reporting, and producer signal. */
  private handleRefusal(
    threadId: string,
    reason: RuntimeRefusalReason,
    scope: RuntimeRefusalScope,
    refusedEvents: number,
    refusedBytes: number,
  ): void {
    this.health.reportRefusal(reason, scope, refusedEvents, refusedBytes);
    const contaminationReason = toContaminationReason(reason);
    if (contaminationReason) {
      this.markContaminated(threadId, contaminationReason, refusedEvents, refusedBytes);
    }
    this.health.noteRefusalFailure();
    if (scope === "global") {
      this.health.transitionTo("refusing");
      this.health.emitSignal({ kind: "stop", reason: "hard-cap" });
      return;
    }
    // A per-thread refusal stays per-thread: the thread's producer is stopped
    // explicitly, other threads keep admitting and serving.
    this.health.emitSignal({
      kind: "stop",
      reason: "hard-cap",
      threadIds: [threadId],
      ...(contaminationReason ? { refusal: contaminationReason } : {}),
    });
  }

  /**
   * In-memory contamination record plus durable evidence. The durable write is
   * best-effort here: a storage failure is reported through the port's health
   * path and recorded as a bounded pending obligation, and the refusal result
   * is still explicit. A zero-event refusal has no gap unless the reason is the
   * rebase-dropped marker, which exists without refused events.
   */
  private markContaminated(
    threadId: string,
    reason: RuntimeContaminationReason,
    refusedEvents: number,
    refusedBytes: number,
  ): void {
    if (refusedEvents > 0 || reason === "rebase-dropped") {
      this.durableGap?.recordGap(threadId, reason, refusedEvents, refusedBytes);
    }
    const existing = this.contaminatedThreads.get(threadId);
    this.contaminatedThreads.set(threadId, {
      reason,
      refusedEvents: (existing?.refusedEvents ?? 0) + refusedEvents,
      refusedBytes: (existing?.refusedBytes ?? 0) + refusedBytes,
      at: this.now(),
      supersededEvents: existing?.supersededEvents ?? 0,
    });
  }

  /**
   * Contamination record for a thread, or null when it is clean. On an
   * in-memory miss with a durable port, resolve once per boot (bounded, read
   * only) so a gap recorded by a previous boot still refuses reads: an exact
   * row keeps its reason/counts, a surviving foreign touch resolves
   * `unclean-epoch`, and a failed bounded read marks the thread degraded for
   * this boot only (never persisted by the resolution itself).
   */
  getContamination(threadId: string): RuntimeContaminationInfo | null {
    const info = this.contaminatedThreads.get(threadId);
    if (info) return { ...info };
    const durable = this.durableGap;
    if (!durable) return null;
    const resolution = durable.resolve(threadId);
    if (resolution.kind === "clean") return null;
    if (resolution.kind === "error") {
      durable.reportFailure(resolution.error);
      const degraded: RuntimeContaminationInfo = {
        reason: "degraded",
        refusedEvents: 0,
        refusedBytes: 0,
        at: this.now(),
        supersededEvents: 0,
      };
      this.contaminatedThreads.set(threadId, degraded);
      return { ...degraded };
    }
    const durableInfo: RuntimeContaminationInfo =
      resolution.kind === "exact"
        ? {
            reason: resolution.reason,
            refusedEvents: resolution.refusedEvents,
            refusedBytes: resolution.refusedBytes,
            at: this.now(),
            supersededEvents: 0,
          }
        : {
            reason: "unclean-epoch",
            refusedEvents: 0,
            refusedBytes: 0,
            at: this.now(),
            supersededEvents: 0,
          };
    this.contaminatedThreads.set(threadId, durableInfo);
    return { ...durableInfo };
  }

  contaminatedThreadCount(): number {
    return this.contaminatedThreads.size;
  }

  supersededAcceptedEventCount(): number {
    return this.supersededAcceptedEvents;
  }

  /**
   * Record that a deferred authoritative rebase (the `thread-reset` control
   * op) exhausted its bounded retries or was refused before it could run. No
   * admission refused events here: the gap is that the pre-reset transcript
   * and the post-reset session can no longer be told apart. Marking the thread
   * contaminated makes later events refuse (and reads typed-refuse) instead of
   * silently appending to the old transcript; an applied rebase is the
   * recovery.
   */
  markDroppedRebase(threadId: string): void {
    this.markContaminated(threadId, "rebase-dropped", 0, 0);
    this.health.reportRefusal("rebase-dropped", "thread", 0, 0);
    this.health.emitSignal({
      kind: "stop",
      reason: "hard-cap",
      threadIds: [threadId],
      refusal: "rebase-dropped",
    });
  }

  /**
   * Record that an authoritative rebase (reset/replace/delete) was applied and
   * explicitly superseded `supersededEvents` accepted-but-uncommitted events,
   * then clear the thread's contamination. Contamination clears only here and
   * on an applied rebase.
   */
  clearContaminationForRebase(threadId: string, supersededEvents: number): void {
    this.supersededAcceptedEvents += supersededEvents;
    if (supersededEvents > 0) {
      console.error(
        `[db] runtime rebase for thread ${threadId} explicitly superseded ${supersededEvents} accepted-but-uncommitted event(s).`,
      );
    }
    this.contaminatedThreads.delete(threadId);
  }

  clearAll(): void {
    this.contaminatedThreads.clear();
    this.supersededAcceptedEvents = 0;
  }
}

function toContaminationReason(reason: RuntimeRefusalReason): RuntimeContaminationReason | null {
  if (
    reason === "thread-events" ||
    reason === "thread-bytes" ||
    reason === "global-events" ||
    reason === "global-bytes" ||
    reason === "oversize" ||
    reason === "age" ||
    reason === "degraded" ||
    reason === "rebase-dropped" ||
    reason === "shutdown" ||
    reason === "unclean-epoch"
  ) {
    return reason;
  }
  return null;
}

function estimateBytes(events: readonly RuntimeEvent[]): number {
  let total = 0;
  for (const event of events) {
    try {
      total += Buffer.byteLength(JSON.stringify(event), "utf8");
    } catch {
      total += 1;
    }
  }
  return total;
}

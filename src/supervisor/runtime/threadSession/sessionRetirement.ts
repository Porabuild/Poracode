import { toError } from "@/shared/errorMessage";
import type { StructuredSessionHandle } from "../../agents/base";
import type { HostResourceClass, HostResourceLease } from "../hostResourceAdmission";
import type {
  PendingStructuredDisposal,
  SessionRuntime,
  ShellSessionRuntime,
} from "../sessionTypes";
import type { PtyLifecycle } from "./ptyLifecycle";
import {
  STRUCTURED_DISPOSAL_TIMEOUT_MS,
  StructuredDisposalCustody,
} from "./structuredDisposalCustody";

export { STRUCTURED_DISPOSAL_TIMEOUT_MS } from "./structuredDisposalCustody";

/**
 * Provider-neutral settle pause after a confirmed structured dispose, before
 * the backing PTY is terminated. Late provider callbacks land in this window;
 * it is a pause, not a retirement confirmation — capacity is released by the
 * observed effects, never by the wait.
 */
export const STRUCTURED_DISPOSAL_SETTLE_MS = 150;

/**
 * The outcome of retiring one logical execution slot.
 *
 * `confirmed` is the hand-off gate: a replacement may only start a successor
 * once every owned process effect is confirmed gone. A PTY session is
 * confirmed by its exit callback; a structured-only session by its disposal
 * (or its transport `onClose`). An unexpected mixed PTY+structured session
 * requires both, so a failed structured disposal can never free capacity on
 * the PTY exit alone.
 */
export interface SessionRetirementOutcome {
  structuredRetired: boolean;
  ptyExitConfirmed: boolean;
  confirmed: boolean;
  /** First cleanup failure (a rejecting structured dispose), if any. */
  error?: unknown;
}

interface AbandonedCleanup {
  readonly lease: HostResourceLease;
  readonly custody: StructuredDisposalCustody;
}

function abandonedKey(resourceClass: HostResourceClass, key: string): string {
  return `${resourceClass}::${key}`;
}

/**
 * Owns teardown of a session's process effects so three invariants hold
 * together:
 *
 * 1. A rejecting structured dispose never skips PTY termination — the PTY is
 *    always killed and its exit awaited, even when `dispose()` threw.
 * 2. An unconfirmed effect is retained: the lease stays `retiring` (counted)
 *    until every owned effect is confirmed, and a later retirement call
 *    joins/retries the *one* pending disposal per handle.
 * 3. Custody survives map deletion. A force-stop's handle (F1), an abandoned
 *    unpublished start (F2) and a close/restart whose retirement failed stay
 *    reachable through this instance, so a later start/close/shutdown retry
 *    can finish the cleanup and free the slot without a supervisor restart.
 *
 * A caller's wait is bounded: the structured join uses a lifecycle deadline
 * ({@link STRUCTURED_DISPOSAL_TIMEOUT_MS}) and the PTY exit has its own
 * bounded wait. A timeout never means the process exited: it leaves the
 * original disposal operation held, and its eventual completion releases the
 * lease exactly once (instance-keyed by the admission owner).
 */
export class SessionRetirement {
  private readonly inFlight = new WeakMap<object, Promise<unknown>>();
  /**
   * Abandoned unpublished effects keyed by resource key. Bounded by the
   * admission owner: at most one entry per live reservation, pruned as soon
   * as the lease is released.
   */
  private readonly abandoned = new Map<string, AbandonedCleanup>();

  constructor(
    private readonly ptyLifecycle: Pick<PtyLifecycle, "kill" | "killShell" | "waitForExit">,
    /**
     * Provider-neutral settle pause after a successful structured dispose
     * (the production 150 ms window in which late provider callbacks land)
     * before the backing PTY is terminated.
     */
    private readonly settleAfterStructuredDispose: () => Promise<void> = async () => undefined,
    /** Bounded structured-disposal join deadline; overridable by focused harnesses. */
    private readonly structuredDisposalTimeoutMs: number = STRUCTURED_DISPOSAL_TIMEOUT_MS,
    /**
     * Notified whenever this instance releases a lease. Owners use it to prune
     * retained custody entries, keeping them bounded by live reservations.
     */
    private readonly onLeaseReleased?: (lease: HostResourceLease) => void,
  ) {}

  retireAgentSession(session: SessionRuntime): Promise<SessionRetirementOutcome> {
    return this.joinWith<SessionRetirementOutcome>(session, () => this.runAgentRetirement(session));
  }

  retireShellSession(shell: ShellSessionRuntime): Promise<boolean> {
    return this.joinWith<boolean>(shell, () => this.runShellRetirement(shell));
  }

  /**
   * Force-stop watchdog path (F1): retain the force-stopped handle with its
   * single pending disposal on the session. Later retirements join this exact
   * operation instead of inferring retirement from a cleared handle.
   */
  startForceStoppedDisposal(session: SessionRuntime, handle: StructuredSessionHandle): void {
    session.resourceLease?.beginRetirement();
    this.ensureDisposal(session, handle).custody.begin();
  }

  /**
   * Settle a lease for a startup that never published a runtime. `cleanup` is
   * the confirmed disposal of anything the attempt created; if it rejects or
   * is still unconfirmed the {lease, cleanup} custody is retained so a later
   * start/close/shutdown retry can re-run it.
   */
  async abandonLease(
    lease: HostResourceLease | undefined,
    cleanup?: (() => Promise<void>) | undefined,
  ): Promise<void> {
    if (!lease || lease.state === "released") return;
    if (!cleanup) {
      lease.cancel();
      return;
    }
    const record = this.retainAbandoned({
      lease,
      cleanup,
      onConfirmed: () => this.releaseLease(lease),
    });
    lease.beginRetirement();
    const outcome = await record.custody.settle();
    if (outcome === "confirmed") return;
    throw toError(record.custody.error ?? this.abandonmentError(lease));
  }

  /**
   * Discard a structured handle that will not back a published runtime (for
   * example a non-kept handle before a terminal PTY spawn). A successful
   * dispose drops the handle while the lease continues into the spawn; a
   * rejected dispose retains {handle, attempt} custody so a later start can
   * retry it without re-running the provider call in this same failure path.
   */
  async discardStructuredHandle(
    lease: HostResourceLease | undefined,
    handle: StructuredSessionHandle,
  ): Promise<void> {
    let attempt: Promise<void>;
    try {
      attempt = Promise.resolve(handle.dispose());
    } catch (error) {
      attempt = Promise.reject(error);
    }
    try {
      await attempt;
      this.pruneReleasedAbandoned();
    } catch (error) {
      if (!lease || lease.state === "released") throw error;
      lease.beginRetirement();
      this.retainAbandoned({
        lease,
        cleanup: () => handle.dispose(),
        onConfirmed: () => this.releaseLease(lease),
        attempt,
      });
      throw error;
    }
  }

  /** Join/retry one retained abandonment; throws while its cleanup is unconfirmed. */
  async retryAbandoned(resourceClass: HostResourceClass, key: string): Promise<void> {
    this.pruneReleasedAbandoned();
    const record = this.abandoned.get(abandonedKey(resourceClass, key));
    if (!record) return;
    const outcome = await record.custody.settle();
    if (outcome === "confirmed" || record.lease.state === "released") return;
    throw toError(record.custody.error ?? this.abandonmentError(record.lease));
  }

  /** True while a retained abandonment still holds an unreleased reservation. */
  hasAbandoned(resourceClass: HostResourceClass, key: string): boolean {
    this.pruneReleasedAbandoned();
    const record = this.abandoned.get(abandonedKey(resourceClass, key));
    return record !== undefined && record.lease.state !== "released";
  }

  /**
   * Join/retry every retained abandonment (shutdown path). Each join is
   * bounded; a still-hanging cleanup keeps its custody instead of cancelling
   * the operation.
   */
  async retryAllAbandoned(): Promise<void> {
    for (const record of [...this.abandoned.values()]) {
      if (record.lease.state === "released") continue;
      await record.custody.settle();
    }
    this.pruneReleasedAbandoned();
  }

  private joinWith<T>(key: object, run: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key) as Promise<T> | undefined;
    if (existing) return existing;
    const promise = run().finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, promise);
    return promise;
  }

  private ensureDisposal(
    session: SessionRuntime,
    handle: StructuredSessionHandle,
  ): PendingStructuredDisposal {
    const existing = session.pendingStructuredDisposal;
    if (existing && existing.handle === handle) return existing;
    const custody = new StructuredDisposalCustody(() => handle.dispose(), {
      timeoutMs: this.structuredDisposalTimeoutMs,
      onConfirmed: () => {
        session.structuredRetired = true;
        if (session.pendingStructuredDisposal?.custody === custody) {
          session.pendingStructuredDisposal = undefined;
        }
        // A structured-only session frees its slot at confirmed disposal. A
        // PTY-backed (unexpected mixed) session still owes its exit to the
        // retirement gate, which requires both effects.
        if (!session.pty) this.releaseLease(session.resourceLease);
      },
      onFailure: (disposeError) => {
        console.warn(
          `[supervisor] structured session disposal failed; its execution slot stays counted:`,
          disposeError,
        );
      },
    });
    const pending: PendingStructuredDisposal = { handle, custody };
    session.pendingStructuredDisposal = pending;
    return pending;
  }

  private async runAgentRetirement(session: SessionRuntime): Promise<SessionRetirementOutcome> {
    session.resourceLease?.beginRetirement();
    let structuredRetired = session.structuredRetired === true;
    let error: unknown;
    let confirmedDuringCall = false;
    if (!structuredRetired) {
      let pending = session.pendingStructuredDisposal;
      // A disposal retained before this call (force-stop, earlier failed
      // retirement) already had its settle window; only a disposal issued
      // here needs the pause before the PTY kill.
      const retainedBeforeCall = pending !== undefined;
      if (!pending && session.structuredSession) {
        pending = this.ensureDisposal(session, session.structuredSession);
      }
      if (pending) {
        const outcome = await pending.custody.settle();
        structuredRetired = outcome === "confirmed";
        confirmedDuringCall = structuredRetired && !retainedBeforeCall;
        if (!structuredRetired) error = pending.custody.error;
      } else {
        structuredRetired = true;
      }
    }
    if (confirmedDuringCall) {
      await this.settleAfterStructuredDispose();
    }
    // The correction: dispose rejection or a hang must not skip PTY
    // termination. The lifecycle kill is a no-op when the session has no PTY.
    this.ptyLifecycle.kill(session);
    let ptyExitConfirmed = session.pty === undefined;
    if (session.pty) {
      ptyExitConfirmed = await this.ptyLifecycle.waitForExit(session);
    }
    // Both owned effects must be confirmed when an unexpected mixed
    // PTY+structured session exists; a single-effect session reduces to its
    // one owned effect.
    const confirmed = structuredRetired && ptyExitConfirmed;
    if (confirmed) {
      this.releaseLease(session.resourceLease);
    }
    return {
      structuredRetired,
      ptyExitConfirmed,
      confirmed,
      ...(error !== undefined ? { error } : {}),
    };
  }

  private async runShellRetirement(shell: ShellSessionRuntime): Promise<boolean> {
    shell.resourceLease?.beginRetirement();
    this.ptyLifecycle.killShell(shell);
    const confirmed = await this.ptyLifecycle.waitForExit(shell);
    if (confirmed) {
      this.releaseLease(shell.resourceLease);
    }
    return confirmed;
  }

  private retainAbandoned(input: {
    lease: HostResourceLease;
    cleanup: () => Promise<void>;
    onConfirmed: () => void;
    attempt?: Promise<void>;
  }): AbandonedCleanup {
    const mapKey = abandonedKey(input.lease.resourceClass, input.lease.key);
    this.pruneReleasedAbandoned();
    const existing = this.abandoned.get(mapKey);
    if (existing && existing.lease === input.lease) return existing;
    const custody = new StructuredDisposalCustody(input.cleanup, {
      timeoutMs: this.structuredDisposalTimeoutMs,
      onConfirmed: () => {
        if (this.abandoned.get(mapKey)?.custody === custody) this.abandoned.delete(mapKey);
        input.onConfirmed();
      },
      onFailure: (cleanupError) => {
        console.warn(
          `[supervisor] cleanup for host ${input.lease.resourceClass} ${input.lease.key} failed; its execution slot stays counted:`,
          cleanupError,
        );
      },
    });
    const record: AbandonedCleanup = { lease: input.lease, custody };
    this.abandoned.set(mapKey, record);
    if (input.attempt) custody.adopt(input.attempt);
    return record;
  }

  /** Single release path for leases this instance confirmed, plus owner prune. */
  private releaseLease(lease: HostResourceLease | undefined): void {
    if (!lease) return;
    lease.confirmExit();
    this.onLeaseReleased?.(lease);
  }

  private pruneReleasedAbandoned(): void {
    for (const [mapKey, record] of this.abandoned) {
      if (record.lease.state === "released") this.abandoned.delete(mapKey);
    }
  }

  private abandonmentError(lease: HostResourceLease): Error {
    return new Error(
      `Host ${lease.resourceClass} cleanup for ${lease.key} is not confirmed; its execution slot stays counted.`,
    );
  }
}

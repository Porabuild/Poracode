/** Bounded wait for one disposal join before a caller reports unconfirmed. */
export const STRUCTURED_DISPOSAL_TIMEOUT_MS = 3_000;

export type StructuredDisposalOutcome = "confirmed" | "failed" | "unconfirmed";

export interface StructuredDisposalCustodyOptions {
  /** Bounded join deadline; defaults to {@link STRUCTURED_DISPOSAL_TIMEOUT_MS}. */
  timeoutMs?: number;
  /** Invoked exactly once when a disposal operation settles successfully. */
  onConfirmed?(): void;
  /** Invoked once per failed attempt; reporting only, never rethrown here. */
  onFailure?(error: unknown): void;
}

/**
 * Resolve `true` when `promise` settles before the deadline, `false` when the
 * deadline passes first. The deadline never cancels or rejects the promise.
 */
export async function settlesWithin(
  promise: Promise<unknown>,
  timeoutMs: number,
): Promise<boolean> {
  let settled = false;
  const tracked = promise.then(
    () => {
      settled = true;
      return true;
    },
    () => {
      settled = true;
      return true;
    },
  );
  // Let an already-settled operation finish without arming a deadline timer:
  // immediate disposals are the common path and must leave no pending timer.
  await Promise.resolve();
  if (settled) return await tracked;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      tracked,
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Provider-agnostic custody for one structured handle's disposal.
 *
 * A structured provider's `dispose()` is an asynchronous process effect whose
 * rejection or hang does not prove the process is gone. This custody keeps the
 * handle and the *one* in-flight disposal operation reachable until that
 * operation actually settles:
 *
 * - `begin()` issues the single pending disposal (idempotent while it runs).
 * - `settle()` joins the pending operation or retries a settled rejection; the
 *   caller's wait is bounded, the operation itself is never cancelled.
 * - A timed-out join leaves the operation pending, so a later `settle()` joins
 *   the same operation instead of issuing a second disposal.
 * - When the operation finally resolves, `onConfirmed` fires exactly once —
 *   even if every caller already timed out — so capacity can be released at
 *   the real completion, not at the timeout.
 *
 * `adopt()` records a disposal that was already issued outside this custody
 * (for example a dispose that just rejected in a discard path), so retention
 * cannot double-fire the provider call.
 */
export class StructuredDisposalCustody {
  private attempt: Promise<void> | undefined;
  private settled = false;
  private lastError: unknown;

  constructor(
    private readonly cleanup: () => Promise<void>,
    private readonly options: StructuredDisposalCustodyOptions = {},
  ) {}

  /** True once the current operation settled without an error. */
  get confirmed(): boolean {
    return this.settled && this.lastError === undefined;
  }

  /** The first failure of the current operation, if it settled rejected. */
  get error(): unknown {
    return this.lastError;
  }

  /**
   * Issue the single pending disposal if none is running. A settled failure is
   * retried; a still-running operation is left untouched (one operation per
   * handle, no parallel dispose).
   */
  begin(): void {
    if (this.attempt !== undefined && !(this.settled && this.lastError !== undefined)) return;
    this.launch();
  }

  /**
   * Record a disposal operation issued outside this custody. The operation's
   * completion is still observed (including `onConfirmed`), so a rejected
   * attempt is retainable without calling `dispose()` twice.
   */
  adopt(attempt: Promise<void>): void {
    if (this.attempt !== undefined) return;
    this.bind(attempt);
  }

  /** Join the pending operation or retry a settled rejection; bounded. */
  async settle(): Promise<StructuredDisposalOutcome> {
    if (this.confirmed) return "confirmed";
    this.begin();
    const attempt = this.attempt;
    if (!attempt) return "failed";
    const settled = await settlesWithin(
      attempt,
      this.options.timeoutMs ?? STRUCTURED_DISPOSAL_TIMEOUT_MS,
    );
    if (!settled) return "unconfirmed";
    return this.lastError === undefined ? "confirmed" : "failed";
  }

  private launch(): void {
    let attempt: Promise<void>;
    try {
      attempt = Promise.resolve(this.cleanup());
    } catch (error) {
      attempt = Promise.reject(error);
    }
    this.bind(attempt);
  }

  private bind(attempt: Promise<void>): void {
    this.settled = false;
    this.lastError = undefined;
    this.attempt = attempt;
    void attempt.then(
      () => {
        this.settled = true;
        this.lastError = undefined;
        this.options.onConfirmed?.();
      },
      (error: unknown) => {
        this.settled = true;
        this.lastError = error;
        this.options.onFailure?.(error);
      },
    );
  }
}

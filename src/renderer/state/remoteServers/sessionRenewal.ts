/** Proactive renewal fires this long before the access deadline (capped at
 * half of a short remaining window). */
const RENEWAL_LEAD_MS = 5 * 60_000;
/** A transport-class renewal failure retries this long before the deadline; a
 * refusal is never retried. */
const RENEWAL_RETRY_MS = 60_000;
/** setTimeout's delay cap: a longer delay re-arms instead of firing early. */
const MAX_TIMEOUT_DELAY_MS = 2_147_483_647;

/**
 * Proactive access-token renewal for one host session, whichever host it is:
 * the bearer is rotated a lead before its deadline instead of letting a
 * request or the socket hit the expiry first.
 *
 * `renew` resolves true when the session rotated, false when the grant was
 * refused (the expiry path re-pairs), and rejects for a transport-class
 * failure, which is retried once a minute later while the deadline is ahead.
 * An already-expired bearer arms nothing: the request-401 refresh and the
 * expiry close renew it instead.
 */
export class SessionRenewal {
  private dueAtMs: number | null = null;
  private expiresAtMs: number | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(
    private readonly renew: () => Promise<boolean>,
    private readonly label: string,
  ) {}

  /** (Re)arms for a bearer that expires at `expiresAt`, when the host reported it. */
  schedule(expiresAt: string | undefined): void {
    this.clearTimer();
    const expiresAtMs = expiresAt ? Date.parse(expiresAt) : Number.NaN;
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now() || this.disposed) {
      this.dueAtMs = null;
      this.expiresAtMs = null;
      return;
    }
    const remaining = expiresAtMs - Date.now();
    this.expiresAtMs = expiresAtMs;
    this.dueAtMs = expiresAtMs - Math.min(RENEWAL_LEAD_MS, remaining / 2);
    this.arm();
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimer();
    this.dueAtMs = null;
    this.expiresAtMs = null;
  }

  /** Chunked like the host's session-expiry timer: a delay above the setTimeout
   * cap re-arms instead of firing early. */
  private arm(): void {
    this.clearTimer();
    const dueAtMs = this.dueAtMs;
    if (dueAtMs === null || this.disposed) return;
    this.timer = setTimeout(
      () => {
        this.timer = null;
        if (this.disposed) return;
        if ((this.dueAtMs ?? 0) > Date.now()) {
          this.arm();
          return;
        }
        this.dueAtMs = null;
        void this.renewNow();
      },
      Math.min(Math.max(0, dueAtMs - Date.now()), MAX_TIMEOUT_DELAY_MS),
    );
    this.timer.unref?.();
  }

  private async renewNow(): Promise<void> {
    try {
      // A successful rotation re-arms through the caller's schedule(); a
      // refused grant is the expiry-close/re-pair path's to handle.
      const renewed = await this.renew();
      if (!renewed) {
        console.warn(
          `[${this.label}] proactive renewal refused (grant dead); the expiry close will re-pair`,
        );
      }
    } catch {
      console.warn(
        `[${this.label}] proactive renewal failed (transport); retrying before the deadline`,
      );
      this.scheduleRetry();
    }
  }

  /** One bounded retry a minute after a transport-class failure, only while
   * nothing else re-armed the timer and the deadline is still ahead. */
  private scheduleRetry(): void {
    const expiresAtMs = this.expiresAtMs;
    if (this.disposed || this.dueAtMs !== null || expiresAtMs === null) return;
    const retryAtMs = Date.now() + RENEWAL_RETRY_MS;
    // Past the deadline the 401/expiry-close path renews; a proactive retry
    // could only race the close.
    if (retryAtMs >= expiresAtMs) return;
    this.dueAtMs = retryAtMs;
    this.arm();
  }

  private clearTimer(): void {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
  }
}

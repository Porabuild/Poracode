import { RemoteHttpError } from "../auth";
import {
  LEGACY_BULK_MAX_GLOBAL,
  LEGACY_BULK_MAX_PER_PRINCIPAL,
  LEGACY_BULK_RETRY_AFTER_MS,
  LEGACY_READ_BUSY_CODE,
} from "@/shared/remote/legacyReadContract";

/**
 * B4 legacy bulk-read admission (H1).
 *
 * The B3 `legacy-bulk` read class marked the two unbounded legacy variants
 * (`/api/snapshot` without `threadLimit`, `/api/threads/<id>/history` without
 * `runtimePage=1`). This controller is their explicit admission: non-waiting,
 * 2 concurrent globally and 1 per authenticated principal, refused with a
 * typed 503 + `Retry-After` exactly like the other host overload paths.
 *
 * A lease is cancellable at phase boundaries: the request's `close` event
 * aborts it, and the wrapper checks `aborted` before the pre-check and before
 * the (synchronous, non-interruptible) legacy build. It is released on EVERY
 * path — success, typed refusal, thrown error, client abort — and held until
 * the response completes on the success path, so a disconnecting client cannot
 * free admission while its materialization is still running.
 */

/** Anonymous callers still share one "principal" bucket (defense in depth). */
const ANONYMOUS_PRINCIPAL = "\u0000anonymous";

export interface LegacyBulkReadUsage {
  readonly active: number;
  readonly admitted: number;
  readonly refused: number;
  readonly aborted: number;
}

export interface LegacyBulkReadLease {
  /** True once the client closed/aborted the request before the work ran. */
  readonly aborted: boolean;
  /** Marks the lease aborted; idempotent. Does not release the slot. */
  abort(): void;
  /** Releases the slot; idempotent. */
  release(): void;
}

function once(action: () => void): () => void {
  let done = false;
  return () => {
    if (done) return;
    done = true;
    action();
  };
}

export class LegacyBulkReadAdmission {
  private active = 0;
  private readonly activeByPrincipal = new Map<string, number>();
  private admitted = 0;
  private refused = 0;
  private aborted = 0;
  private readonly retryAfterMs: number;

  constructor(retryAfterMs: number = LEGACY_BULK_RETRY_AFTER_MS) {
    this.retryAfterMs = retryAfterMs;
  }

  /**
   * Non-waiting admission for one legacy bulk read. Throws the typed 503 when
   * the global or principal legacy-read allowance is already saturated.
   */
  tryAdmit(principalId: string | null): LegacyBulkReadLease {
    const principal = principalId ?? ANONYMOUS_PRINCIPAL;
    const principalActive = this.activeByPrincipal.get(principal) ?? 0;
    if (this.active >= LEGACY_BULK_MAX_GLOBAL || principalActive >= LEGACY_BULK_MAX_PER_PRINCIPAL) {
      this.refused += 1;
      throw new RemoteHttpError(
        LEGACY_READ_BUSY_CODE,
        "Too many unbounded legacy reads are in flight; retry shortly.",
        503,
        this.retryAfterMs,
      );
    }
    this.active += 1;
    this.activeByPrincipal.set(principal, principalActive + 1);
    this.admitted += 1;
    let aborted = false;
    const releaseOnce = once(() => {
      this.active = Math.max(0, this.active - 1);
      const next = (this.activeByPrincipal.get(principal) ?? 1) - 1;
      if (next > 0) this.activeByPrincipal.set(principal, next);
      else this.activeByPrincipal.delete(principal);
    });
    return {
      get aborted() {
        return aborted;
      },
      abort: once(() => {
        if (aborted) return;
        aborted = true;
        this.aborted += 1;
      }),
      release: releaseOnce,
    };
  }

  usage(): LegacyBulkReadUsage {
    return {
      active: this.active,
      admitted: this.admitted,
      refused: this.refused,
      aborted: this.aborted,
    };
  }
}

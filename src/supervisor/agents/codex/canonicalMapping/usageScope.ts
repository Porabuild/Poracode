/**
 * Cumulative token-usage scope tracking for one Codex session.
 *
 * The app-server's `total.totalTokens` counter is an absolute, monotonically
 * increasing total per provider (Codex) thread. The main-process usage ledger
 * counts counter increases within a `(provider, scopeId, epoch)` key, so this
 * tracker draws those boundaries for one mapper:
 *
 * - `scopeId` is the CODEX thread id (not the Poracode thread id). A fork or
 *   replacement provider thread switches the scope via {@link replaceScope},
 *   starting a new epoch whose first sample is a baseline (forked threads
 *   carry inherited history — that is not new spend).
 * - An incoming counter LOWER than the last emitted one means upstream reset
 *   the total (e.g. ContextWindowExceeded recovery); the adapter bumps the
 *   epoch here because the ledger itself stays heuristic-free.
 * - `fresh: true` is emitted only on the first sample of a brand-new provider
 *   thread (created via `thread/start`, not resumed or forked), telling the
 *   ledger the baseline is 0 so the first sample counts in full.
 */
export class CodexUsageScopeTracker {
  private epoch = 0;
  private lastCounter: number | undefined;
  private freshPending: boolean;

  constructor(
    private scopeId: string,
    fresh: boolean,
  ) {
    this.freshPending = fresh;
  }

  /** Switch to a replacement provider thread (fork/new session): new epoch, baseline sample. */
  replaceScope(scopeId: string): void {
    this.scopeId = scopeId;
    this.epoch += 1;
    this.lastCounter = undefined;
    this.freshPending = false;
  }

  /** Meta for one incoming cumulative sample; a counter decrease signals an upstream reset. */
  sample(counter: number): { scopeId: string; epoch: number; fresh?: boolean } {
    if (this.lastCounter !== undefined && counter < this.lastCounter) {
      this.epoch += 1;
      this.lastCounter = undefined;
      this.freshPending = false;
    }
    this.lastCounter = counter;
    const fresh = this.freshPending;
    this.freshPending = false;
    return {
      scopeId: this.scopeId,
      epoch: this.epoch,
      ...(fresh ? { fresh: true } : {}),
    };
  }
}

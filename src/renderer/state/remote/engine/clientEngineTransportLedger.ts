/**
 * A3 correction: outstanding transport reservations for posted work whose
 * consumer callbacks already settled.
 *
 * `renew()`, `dispose()`, an entry timeout, an overflow or a `reset()` must
 * settle the consumer promise immediately (ordering), but none of them can
 * free the structured clone the worker may still hold in its message queue or
 * `unanswered` set. A reservation therefore survives until the worker proves
 * it consumed the message (any response for that id, including a
 * generation-fenced stale one) or the worker instance is actually terminated.
 *
 * A reservation intentionally carries no payload reference: only the id, the
 * measured byte charge and the reservation time. Dropping the host entry
 * releases the host's raw string; the charge stands in for the worker's clone.
 *
 * Bounds: reservations count against the engine's global pending/byte
 * backstops, so the ledger itself is count- and byte-bounded, and a single
 * watchdog timer retires the worker when the oldest reservation outlives the
 * documented budget — the only way to actually reclaim a hung worker's clones.
 */
export interface ClientEngineTransportReservation {
  readonly id: number;
  readonly bytes: number;
  readonly reservedAt: number;
}

export interface ClientEngineTransportLedgerOptions {
  readonly watchdogMs: number;
  /** Called when the oldest reservation outlived `watchdogMs`; the owner must
   * terminate the actual worker instance (which frees every reservation). */
  readonly onWatchdog: () => void;
}

export class ClientEngineTransportLedger {
  private readonly reservations = new Map<number, ClientEngineTransportReservation>();
  private totalBytes = 0;
  private watchdogTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: ClientEngineTransportLedgerOptions) {}

  get bytes(): number {
    return this.totalBytes;
  }

  get count(): number {
    return this.reservations.size;
  }

  /** Records the memory credit for one posted message the worker may still
   * hold. Idempotent: re-reserving an id never double-counts. */
  reserve(id: number, bytes: number): void {
    if (this.reservations.has(id)) return;
    this.reservations.set(id, { id, bytes, reservedAt: Date.now() });
    this.totalBytes += bytes;
    this.armWatchdog();
  }

  /** Releases the reservation for an id the worker proved it consumed; returns
   * the released bytes (0 for a duplicate or unknown response). */
  release(id: number): number {
    const reservation = this.reservations.get(id);
    if (!reservation) return 0;
    this.reservations.delete(id);
    this.totalBytes -= reservation.bytes;
    this.armWatchdog();
    return reservation.bytes;
  }

  /** Actual worker termination releases every clone the instance held. */
  clear(): void {
    this.reservations.clear();
    this.totalBytes = 0;
    this.clearWatchdog();
  }

  dispose(): void {
    this.clear();
  }

  private armWatchdog(): void {
    this.clearWatchdog();
    let oldest = Number.POSITIVE_INFINITY;
    for (const reservation of this.reservations.values()) {
      if (reservation.reservedAt < oldest) oldest = reservation.reservedAt;
    }
    if (oldest === Number.POSITIVE_INFINITY) return;
    const delay = Math.max(0, oldest + this.options.watchdogMs - Date.now());
    this.watchdogTimer = setTimeout(() => {
      this.watchdogTimer = null;
      if (this.reservations.size > 0) this.options.onWatchdog();
    }, delay);
  }

  private clearWatchdog(): void {
    if (!this.watchdogTimer) return;
    clearTimeout(this.watchdogTimer);
    this.watchdogTimer = null;
  }
}

/**
 * B3 — immediate aggregate outbound-byte budget.
 *
 * The per-socket cap in `remoteAccessServerWs.sendRaw` bounds one connection.
 * This engine is the aggregate bound behind it: every outbound frame is
 * reserved against its authenticated principal's budget and the global budget
 * *before* it is handed to `ws.send`, and released only when the frame actually
 * stops being retained by the transport — the `ws.send` completion callback or
 * the socket's `close` event. The advertised limits therefore hold at all
 * times instead of only between periodic audits, and no frame is ever skipped
 * silently: a recipient that cannot fit is terminated, so its reconnect
 * replays from its cursor or receives `resync-required`.
 *
 * ws semantics this accounting relies on (verified against `ws@8.21.3`):
 *
 * - `ws.bufferedAmount` is `socket._writableState.length + sender._bufferedBytes`.
 *   The writable-state length counts *framed* bytes (the unmasked RFC 6455
 *   header plus payload, or the compressed payload on the wire); the sender's
 *   counter holds the *uncompressed* payload of messages still queued behind an
 *   active compression (`Sender.dispatch` adds `kByteLength` before deflating
 *   and subtracts it once the compressed frame is written). Deflate-pipeline
 *   frames are therefore visible to `bufferedAmount`, at uncompressed size —
 *   they never fall outside transport accounting before the frame leaves the
 *   socket. {@link outboundFrameBytes} charges each reservation for the framed
 *   size and for the worst-case stored-block expansion, so the reservation is
 *   at least what the transport can retain.
 * - `ws.send(data, cb)` invokes `cb` when the frame has been written out of the
 *   socket queue (with an error if the socket is destroyed first). Holding the
 *   reservation until `cb` therefore matches the bytes the transport still
 *   retains.
 * - `terminate()` flips `readyState` to `CLOSING` synchronously and destroys the
 *   socket, but the queued bytes stay retained until the `close` event: the
 *   real-ws probe (`tmp/v2-production/b3-terminate-probe.json`) observed
 *   `bufferedAmount` unchanged and zero callbacks immediately after
 *   `terminate()`, with both settling only at `close`.
 *
 * Eviction must not pretend otherwise: an evicted account is marked
 * `evicting`, terminated for real, and keeps its reservations until the write
 * callbacks or `close` release them. While those bytes are still retained,
 * admission truthfully fails (the attempted recipient is terminated and
 * replays) instead of admitting replacement bytes on the assumption that
 * `terminate() === free`.
 *
 * Enforcement is O(1) per send while the budgets hold. Only the reservation
 * that would cross a budget pays for eviction: the offending principal's most
 * congested sockets for the per-principal budget, or the largest contributor's
 * most congested socket for the global budget. An already-evicting account is
 * never chosen again and never admits new frames; when nothing can be evicted
 * any more the frame is refused. Eviction always targets the principal whose
 * bytes crossed the budget, never an arbitrary peer of a different one; when
 * the frame still cannot be admitted, the caller terminates its recipient and
 * replay covers the gap.
 */

/**
 * Ground-truth reconciliation tolerance, not an admission budget. Application
 * frames and heartbeat/ping/pong frames reserve bytes before sending. Only
 * transport-generated close frames remain outside those reservations: at most
 * two frames of 127 bytes per socket. {@link OutboundByteBudget.reconcile}
 * detects a larger discrepancy; it does not authorize unaccounted traffic.
 */
export const OUTBOUND_RECONCILE_SLACK_BYTES = 8 * 1024;

/** Maximum payload one raw-DEFLATE stored block can carry (RFC 1951). */
const DEFLATE_STORED_BLOCK_PAYLOAD_BYTES = 65_535;
/** Overhead of one DEFLATE stored block (header bits plus LEN/NLEN). */
const DEFLATE_STORED_BLOCK_OVERHEAD_BYTES = 5;
/** `Z_SYNC_FLUSH` trailer `ws` appends to every permessage-deflate frame. */
const DEFLATE_SYNC_FLUSH_OVERHEAD_BYTES = 5;

/**
 * Conservative encoded size of one server-to-client frame carrying
 * `payloadBytes` of UTF-8 payload. Used for both the per-socket cap and the
 * aggregate reservation so the advertised limits cover *retained transport
 * bytes*, not just payload bytes.
 *
 * - RFC 6455 header for an unmasked server frame: 2 bytes, plus 2 (`126`) or
 *   8 (`127`) extended-length bytes once the payload exceeds 125 / 65 535
 *   bytes. The real-ws probe saw exactly 2 MiB + 20 bytes for two 1 MiB
 *   payloads, matching the 10-byte header per frame.
 * - `permessage-deflate` can enlarge incompressible payloads; the worst case
 *   is DEFLATE stored blocks plus the `Z_SYNC_FLUSH` trailer, so the bound adds
 *   5 bytes per 64 KiB block plus 5 bytes per frame. When deflate is not
 *   negotiated those extra bytes are conservative, never an undercount.
 */
export function outboundFrameBytes(payloadBytes: number): number {
  if (!Number.isFinite(payloadBytes) || payloadBytes <= 0) return 0;
  const headerBytes = payloadBytes >= 65_536 ? 10 : payloadBytes > 125 ? 4 : 2;
  const deflateBytes =
    DEFLATE_SYNC_FLUSH_OVERHEAD_BYTES +
    Math.ceil(payloadBytes / DEFLATE_STORED_BLOCK_PAYLOAD_BYTES) *
      DEFLATE_STORED_BLOCK_OVERHEAD_BYTES;
  return payloadBytes + headerBytes + deflateBytes;
}

/** Minimal transport surface the budget needs. `ws.WebSocket` satisfies it. */
export interface OutboundBudgetSocket {
  /** Framed bytes queued by the transport and not yet written out. */
  readonly bufferedAmount: number;
  once(event: "close", listener: () => void): unknown;
}

export interface OutboundBudgetLimits {
  readonly maxQueuedBytesPerPrincipal: number;
  readonly maxTotalQueuedBytes: number;
}

export interface OutboundReservation {
  /** Idempotent; called once the frame leaves the socket queue. */
  release(): void;
}

interface Ticket {
  readonly account: Account;
  readonly bytes: number;
  released: boolean;
}

interface Account {
  readonly socket: OutboundBudgetSocket;
  readonly principalId: string;
  queuedBytes: number;
  readonly pending: Set<Ticket>;
  closed: boolean;
  /**
   * Eviction requested: the transport has been told to terminate, but its
   * retained bytes are still reserved. Such an account admits nothing new and
   * is never selected as a victim again; the write callbacks and the socket's
   * `close` event free it.
   */
  evicting: boolean;
}

export class OutboundByteBudget {
  private readonly accounts = new Map<OutboundBudgetSocket, Account>();
  private readonly accountsByPrincipal = new Map<string, Set<Account>>();
  private readonly principalQueued = new Map<string, number>();
  private totalQueued = 0;
  /** Cached largest principal; invalidated when that principal's bytes drop. */
  private largestPrincipal: string | null = null;

  constructor(
    private readonly limits: OutboundBudgetLimits,
    /** Terminates one evicted socket. The engine keeps the reservation until
     * the transport write callbacks or `close` release it; an asynchronous
     * close therefore cannot free bytes that are still retained. */
    private readonly evictSocket: (socket: OutboundBudgetSocket) => void,
  ) {}

  get totalQueuedBytes(): number {
    return this.totalQueued;
  }

  queuedBytesFor(principalId: string): number {
    return this.principalQueued.get(principalId) ?? 0;
  }

  /**
   * Reserves `bytes` for one frame to `socket`. Returns null when the frame
   * must not be enqueued; the caller terminates the recipient in that case.
   * A frame that cannot fit under a budget by itself never evicts anyone —
   * there is nothing to gain. Eviction does not free the victim's
   * already-reserved bytes (the transport still retains them), so at most the
   * most congested socket is shed before the frame is refused; the recipient's
   * reconnect replays from its cursor or resyncs.
   */
  tryReserve(
    socket: OutboundBudgetSocket,
    principalId: string,
    bytes: number,
  ): OutboundReservation | null {
    if (bytes <= 0) return { release() {} };
    if (bytes > this.limits.maxQueuedBytesPerPrincipal || bytes > this.limits.maxTotalQueuedBytes) {
      return null;
    }

    const account = this.accountFor(socket, principalId);
    if (account.closed || account.evicting) return null;

    while (this.queuedBytesFor(principalId) + bytes > this.limits.maxQueuedBytesPerPrincipal) {
      const victim = this.mostCongestedAccount(principalId);
      if (!victim) return null;
      const queuedBefore = this.queuedBytesFor(principalId);
      this.evict(victim);
      if (account.closed || account.evicting) return null;
      // An asynchronous close retains the victim's bytes, so the eviction
      // freed nothing and no further eviction can make this frame fit. Stop
      // shedding and refuse truthfully instead of terminating more sockets.
      if (this.queuedBytesFor(principalId) === queuedBefore) return null;
    }

    while (this.totalQueued + bytes > this.limits.maxTotalQueuedBytes) {
      const victim = this.largestPrincipalAccount();
      if (!victim) return null;
      const totalBefore = this.totalQueued;
      this.evict(victim);
      if (account.closed || account.evicting) return null;
      // Same as above for the global budget: no freed bytes means no further
      // eviction can admit this frame.
      if (this.totalQueued === totalBefore) return null;
    }

    const ticket: Ticket = { account, bytes, released: false };
    account.pending.add(ticket);
    account.queuedBytes += bytes;
    this.addPrincipalBytes(principalId, bytes);
    this.totalQueued += bytes;
    return { release: () => this.releaseTicket(ticket) };
  }

  /**
   * Drops every reservation held by one socket. Called by the engine's own
   * `close` listener (and by `reconcile` once a closing socket's transport
   * reports nothing retained). Pending send callbacks that arrive later find
   * released tickets and cannot double-free.
   */
  releaseSocket(socket: OutboundBudgetSocket): void {
    const account = this.accounts.get(socket);
    if (!account) return;
    account.closed = true;
    this.accounts.delete(socket);
    const sockets = this.accountsByPrincipal.get(account.principalId);
    if (sockets) {
      sockets.delete(account);
      if (sockets.size === 0) this.accountsByPrincipal.delete(account.principalId);
    }
    for (const ticket of [...account.pending]) this.releaseTicket(ticket);
  }

  /**
   * Ground-truth audit: a socket whose real transport queue exceeds its
   * accounted bytes (beyond unaccounted protocol frames) has lost accounting,
   * so it is evicted rather than trusted. Over-accounting is conservative and
   * deliberately left alone — deflate-pipeline frames are charged at their
   * framed, unfrozen size.
   *
   * An evicted account whose transport reports nothing retained any more
   * (writes flushed and no close observed yet) is released here, which bounds
   * the lifetime of a closing account without ever freeing bytes the transport
   * still holds.
   */
  reconcile(slackBytes: number): void {
    for (const account of [...this.accounts.values()]) {
      if (account.closed) continue;
      if (account.evicting) {
        if (account.socket.bufferedAmount === 0) this.releaseSocket(account.socket);
        continue;
      }
      if (account.socket.bufferedAmount > account.queuedBytes + slackBytes) {
        this.evict(account);
      }
    }
  }

  private accountFor(socket: OutboundBudgetSocket, principalId: string): Account {
    let account = this.accounts.get(socket);
    if (account) return account;
    account = {
      socket,
      principalId,
      queuedBytes: 0,
      pending: new Set(),
      closed: false,
      evicting: false,
    };
    this.accounts.set(socket, account);
    let sockets = this.accountsByPrincipal.get(principalId);
    if (!sockets) {
      sockets = new Set();
      this.accountsByPrincipal.set(principalId, sockets);
    }
    sockets.add(account);
    socket.once("close", () => this.releaseSocket(socket));
    return account;
  }

  private mostCongestedAccount(principalId: string): Account | null {
    let best: Account | null = null;
    for (const account of this.accountsByPrincipal.get(principalId) ?? []) {
      if (account.closed || account.evicting || account.queuedBytes <= 0) continue;
      if (!best || account.queuedBytes > best.queuedBytes) best = account;
    }
    return best;
  }

  private largestPrincipalAccount(): Account | null {
    const principalId = this.largestPrincipalId();
    return principalId === null ? null : this.mostCongestedAccount(principalId);
  }

  private largestPrincipalId(): string | null {
    const cached = this.largestPrincipal;
    if (cached !== null && (this.principalQueued.get(cached) ?? 0) > 0) return cached;
    let best: string | null = null;
    let bestBytes = 0;
    for (const [principalId, bytes] of this.principalQueued) {
      if (bytes > bestBytes) {
        best = principalId;
        bestBytes = bytes;
      }
    }
    this.largestPrincipal = best;
    return best;
  }

  private evict(account: Account): void {
    if (account.closed || account.evicting) return;
    account.evicting = true;
    // Terminate the recipient for real, but keep its reservation: ws retains
    // the queued bytes until the write callbacks fire or `close` is emitted
    // (terminate() leaves `bufferedAmount` unchanged until then). Releasing
    // here would advertise capacity whose memory the transport still holds.
    this.evictSocket(account.socket);
  }

  private releaseTicket(ticket: Ticket): void {
    if (ticket.released) return;
    ticket.released = true;
    const { account } = ticket;
    if (account.pending.delete(ticket)) account.queuedBytes -= ticket.bytes;
    this.subtractPrincipalBytes(account.principalId, ticket.bytes);
    this.totalQueued = Math.max(0, this.totalQueued - ticket.bytes);
  }

  private addPrincipalBytes(principalId: string, bytes: number): void {
    const next = (this.principalQueued.get(principalId) ?? 0) + bytes;
    this.principalQueued.set(principalId, next);
    const cached = this.largestPrincipal;
    if (cached === null || next > (this.principalQueued.get(cached) ?? 0)) {
      this.largestPrincipal = principalId;
    }
  }

  private subtractPrincipalBytes(principalId: string, bytes: number): void {
    const next = (this.principalQueued.get(principalId) ?? 0) - bytes;
    if (next > 0) this.principalQueued.set(principalId, next);
    else this.principalQueued.delete(principalId);
    if (this.largestPrincipal === principalId) this.largestPrincipal = null;
  }
}

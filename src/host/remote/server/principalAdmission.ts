import type { WebSocket } from "ws";
import { RemoteHttpError } from "../auth";
import {
  resolveControlReserve,
  type IngressWorkClass,
  type RemoteAccessServerOptions,
} from "../remoteAccessServerTypes";
import { OutboundByteBudget, type OutboundReservation } from "./outboundBudget";

/**
 * B3 — principal and aggregate resource fairness.
 *
 * The transport semaphore in `remoteAccessServerIngress.ts` stays the
 * pre-authentication bound (global + per TCP socket + per resolved client
 * address). This controller is the SECOND, post-authentication bound: it keys
 * budgets on the authenticated session (`AuthenticatedRemoteSession.sessionId`
 * — a grant identity that survives access-token refresh and socket reconnect)
 * so a new TCP socket can never mint a fresh effective user budget, and an IP
 * address is never treated as identity.
 *
 * Every budget below is deliberately measurable and configurable:
 *
 * - work: outstanding HTTP/WS continuations per principal and in total,
 *   mirroring the transport semaphore's bulk/control split so a Stop/approval
 *   request stays admissible while the SAME principal saturates its own bulk
 *   allowance (the transport reserve alone only protects against other
 *   principals' bulk).
 * - sockets: established event sockets per principal and in total.
 * - watches: terminal watch interests per principal and in total.
 * - baselines: retained chunked-baseline streams and their serialized bytes
 *   per principal and in total.
 * - queued output: bytes reserved per principal and in total on EVERY send and
 *   released only when the transport stops retaining them — the ws write
 *   completion callback or the socket `close` event. A slow/frozen peer is
 *   evicted (terminate + replay/resync on reconnect) rather than silently
 *   skipping canonical event frames, but eviction itself frees nothing:
 *   `terminate()` leaves the queued bytes retained until close, so their
 *   reservation stays held and admission truthfully fails while it does. The
 *   heartbeat sweep only reconciles this accounting against live
 *   `bufferedAmount` to catch drift.
 *
 * All admission is NON-WAITING: waiting on a second semaphore while holding a
 * transport slot can deadlock under a flood. Overload is a typed 429
 * (`principal_busy`) carrying a `Retry-After` hint, never an unbounded queue.
 */

/** Outstanding HTTP/WS continuations admitted per authenticated principal. */
export const DEFAULT_MAX_CONCURRENT_PRINCIPAL_WORK = 32;
/**
 * Slice of a principal's work allowance bulk can never occupy, so Stop /
 * approval-class requests from the same principal stay admissible while its
 * bulk work is saturated. Mirrors `DEFAULT_RESERVED_INGRESS_CONTROL_CAPACITY_PER_SOURCE`.
 */
export const DEFAULT_RESERVED_PRINCIPAL_CONTROL_CAPACITY = 4;
/** Aggregate principal work, defaulting to the transport global admission. */
export const DEFAULT_MAX_TOTAL_PRINCIPAL_WORK = 128;
/** Established event sockets per principal. */
export const DEFAULT_MAX_SOCKETS_PER_PRINCIPAL = 16;
/** Established event sockets across all principals. */
export const DEFAULT_MAX_TOTAL_SOCKETS = 128;
/** Terminal watch interests per principal (the per-connection cap is 256). */
export const DEFAULT_MAX_WATCHES_PER_PRINCIPAL = 256;
/** Terminal watch interests across all principals. */
export const DEFAULT_MAX_TOTAL_WATCHES = 4_096;
/** Retained chunked-baseline streams per principal. */
export const DEFAULT_MAX_BASELINE_STREAMS_PER_PRINCIPAL = 16;
/** Retained chunked-baseline streams across all principals. */
export const DEFAULT_MAX_TOTAL_BASELINE_STREAMS = 256;
/** Retained serialized baseline bytes per principal (16 MiB). */
export const DEFAULT_MAX_BASELINE_BYTES_PER_PRINCIPAL = 16 * 1024 * 1024;
/** Retained serialized baseline bytes across all principals (64 MiB). */
export const DEFAULT_MAX_TOTAL_BASELINE_BYTES = 64 * 1024 * 1024;
/** Live outbound queue bytes per principal (16 MiB; per-socket cap is 4 MiB). */
export const DEFAULT_MAX_QUEUED_BYTES_PER_PRINCIPAL = 16 * 1024 * 1024;
/** Live outbound queue bytes across all principals (64 MiB). */
export const DEFAULT_MAX_TOTAL_QUEUED_BYTES = 64 * 1024 * 1024;
/** Overload retry hint surfaced as `Retry-After` (milliseconds). */
export const DEFAULT_OVERLOAD_RETRY_AFTER_MS = 1_000;

export interface PrincipalAdmissionLimits {
  readonly maxConcurrentPrincipalWork: number;
  readonly reservedPrincipalControlCapacity: number;
  readonly maxTotalPrincipalWork: number;
  readonly maxSocketsPerPrincipal: number;
  readonly maxTotalSockets: number;
  readonly maxWatchesPerPrincipal: number;
  readonly maxTotalWatches: number;
  readonly maxBaselineStreamsPerPrincipal: number;
  readonly maxTotalBaselineStreams: number;
  readonly maxBaselineBytesPerPrincipal: number;
  readonly maxTotalBaselineBytes: number;
  readonly maxQueuedBytesPerPrincipal: number;
  readonly maxTotalQueuedBytes: number;
  readonly retryAfterMs: number;
}

function requirePositiveInteger(field: string, value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive safe integer.`);
  }
  return value;
}

export function resolvePrincipalAdmissionLimits(
  options: RemoteAccessServerOptions,
): PrincipalAdmissionLimits {
  const maxConcurrentPrincipalWork = requirePositiveInteger(
    "maxConcurrentPrincipalWork",
    options.maxConcurrentPrincipalWork ?? DEFAULT_MAX_CONCURRENT_PRINCIPAL_WORK,
  );
  return {
    maxConcurrentPrincipalWork,
    reservedPrincipalControlCapacity: resolveControlReserve(
      "reservedPrincipalControlCapacity",
      options.reservedPrincipalControlCapacity,
      DEFAULT_RESERVED_PRINCIPAL_CONTROL_CAPACITY,
      maxConcurrentPrincipalWork,
    ),
    maxTotalPrincipalWork: requirePositiveInteger(
      "maxTotalPrincipalWork",
      options.maxTotalPrincipalWork ??
        options.maxConcurrentIngressWork ??
        DEFAULT_MAX_TOTAL_PRINCIPAL_WORK,
    ),
    maxSocketsPerPrincipal: requirePositiveInteger(
      "maxSocketsPerPrincipal",
      options.maxSocketsPerPrincipal ?? DEFAULT_MAX_SOCKETS_PER_PRINCIPAL,
    ),
    maxTotalSockets: requirePositiveInteger(
      "maxTotalSockets",
      options.maxTotalSockets ?? DEFAULT_MAX_TOTAL_SOCKETS,
    ),
    maxWatchesPerPrincipal: requirePositiveInteger(
      "maxWatchesPerPrincipal",
      options.maxWatchesPerPrincipal ?? DEFAULT_MAX_WATCHES_PER_PRINCIPAL,
    ),
    maxTotalWatches: requirePositiveInteger(
      "maxTotalWatches",
      options.maxTotalWatches ?? DEFAULT_MAX_TOTAL_WATCHES,
    ),
    maxBaselineStreamsPerPrincipal: requirePositiveInteger(
      "maxBaselineStreamsPerPrincipal",
      options.maxBaselineStreamsPerPrincipal ?? DEFAULT_MAX_BASELINE_STREAMS_PER_PRINCIPAL,
    ),
    maxTotalBaselineStreams: requirePositiveInteger(
      "maxTotalBaselineStreams",
      options.maxTotalBaselineStreams ?? DEFAULT_MAX_TOTAL_BASELINE_STREAMS,
    ),
    maxBaselineBytesPerPrincipal: requirePositiveInteger(
      "maxBaselineBytesPerPrincipal",
      options.maxBaselineBytesPerPrincipal ?? DEFAULT_MAX_BASELINE_BYTES_PER_PRINCIPAL,
    ),
    maxTotalBaselineBytes: requirePositiveInteger(
      "maxTotalBaselineBytes",
      options.maxTotalBaselineBytes ?? DEFAULT_MAX_TOTAL_BASELINE_BYTES,
    ),
    maxQueuedBytesPerPrincipal: requirePositiveInteger(
      "maxQueuedBytesPerPrincipal",
      options.maxQueuedBytesPerPrincipal ?? DEFAULT_MAX_QUEUED_BYTES_PER_PRINCIPAL,
    ),
    maxTotalQueuedBytes: requirePositiveInteger(
      "maxTotalQueuedBytes",
      options.maxTotalQueuedBytes ?? DEFAULT_MAX_TOTAL_QUEUED_BYTES,
    ),
    retryAfterMs: requirePositiveInteger(
      "overloadRetryAfterMs",
      options.overloadRetryAfterMs ?? DEFAULT_OVERLOAD_RETRY_AFTER_MS,
    ),
  };
}

/** Which principal budget rejected the work; also names the WS watch reason. */
export type PrincipalLimitKind =
  | "work"
  | "sockets"
  | "watches"
  | "baseline-streams"
  | "baseline-bytes";

/**
 * Typed overload. Status 429 plus the inherited `retryAfterMs` (surfaced as
 * `Retry-After` by `writeError` and `rejectUpgrade`), so clients can back off
 * with a hint instead of guessing.
 */
export class PrincipalOverloadError extends RemoteHttpError {
  constructor(
    readonly limit: PrincipalLimitKind,
    message: string,
    retryAfterMs: number,
  ) {
    super("principal_busy", message, 429, retryAfterMs);
    this.name = "PrincipalOverloadError";
  }

  /** Machine-readable cause for `terminal-watch-result.error.reason`. */
  get watchReason(): string {
    return `principal-${this.limit}-capacity`;
  }
}

/** One-shot release; the second call is always a no-op. */
class OneShotRelease {
  private released = false;

  constructor(private readonly onRelease: () => void) {}

  release(): void {
    if (this.released) return;
    this.released = true;
    this.onRelease();
  }
}

export interface PrincipalWorkLease {
  readonly principalId: string;
  /** Idempotent; called when the admitted work actually settles. */
  release(): void;
}

export interface PrincipalSocketLease {
  readonly principalId: string;
  /** Idempotent; called when the socket actually closes. */
  release(): void;
}

export interface PrincipalAdmissionUsage {
  readonly work: { readonly bulk: number; readonly control: number };
  readonly sockets: number;
  readonly watches: number;
  readonly baselineStreams: number;
  readonly baselineBytes: number;
}

export interface PrincipalAdmissionTotals {
  readonly work: { readonly bulk: number; readonly control: number };
  readonly sockets: number;
  readonly watches: number;
  readonly baselineStreams: number;
  readonly baselineBytes: number;
}

function baselineLeaseKey(watchId: string, epoch: number): string {
  return `${watchId}\u0000${epoch}`;
}

function incrementCount(map: Map<string, number>, key: string, by = 1): void {
  map.set(key, (map.get(key) ?? 0) + by);
}

function decrementCount(map: Map<string, number>, key: string, by = 1): void {
  const next = (map.get(key) ?? by) - by;
  if (next > 0) map.set(key, next);
  else map.delete(key);
}

export interface PrincipalAdmissionDeps {
  /**
   * Terminates one socket evicted by aggregate outbound-byte pressure. The
   * engine does NOT release the socket's reservation here: the transport keeps
   * the queued bytes until the send callbacks or `close` release them, so an
   * asynchronous close cannot free bytes that are still retained. Required:
   * without a real termination, evicting would let a congested socket keep
   * growing.
   */
  readonly evictSocket: (socket: WebSocket) => void;
}

export class PrincipalAdmissionController {
  readonly limits: PrincipalAdmissionLimits;

  private readonly workByPrincipal = new Map<string, { bulk: number; control: number }>();
  private workTotal = 0;
  private readonly socketsByPrincipal = new Map<string, number>();
  private socketTotal = 0;
  private readonly watchLeases = new Map<WebSocket, Map<string, OneShotRelease>>();
  private readonly watchesByPrincipal = new Map<string, number>();
  private watchTotal = 0;
  private readonly baselineLeases = new Map<WebSocket, Map<string, OneShotRelease>>();
  private readonly baselineStreamsByPrincipal = new Map<string, number>();
  private readonly baselineBytesByPrincipal = new Map<string, number>();
  private baselineStreamTotal = 0;
  private baselineByteTotal = 0;
  /** Immediate per-principal/global queued-output bound (see outboundBudget). */
  private readonly outbound: OutboundByteBudget;

  constructor(limits: PrincipalAdmissionLimits, deps: PrincipalAdmissionDeps) {
    this.limits = limits;
    this.outbound = new OutboundByteBudget(
      {
        maxQueuedBytesPerPrincipal: limits.maxQueuedBytesPerPrincipal,
        maxTotalQueuedBytes: limits.maxTotalQueuedBytes,
      },
      // The engine only ever receives the sockets `sendRaw` is given, so the
      // narrow structural socket is a WebSocket at this boundary.
      (socket) => deps.evictSocket(socket as WebSocket),
    );
  }

  /**
   * Reserves one outbound frame's framed byte size for the socket's principal
   * before it is handed to `ws.send`. `null` means the frame must not be
   * enqueued; the sender terminates the recipient, whose reconnect replays or
   * resyncs. Evicting a congested socket does not free its already-retained
   * bytes, so a refusal here is truthful even right after an eviction.
   */
  tryReserveOutboundBytes(
    ws: WebSocket,
    principalId: string,
    bytes: number,
  ): OutboundReservation | null {
    return this.outbound.tryReserve(ws, principalId, bytes);
  }

  /** Live queued bytes accounted for one principal (diagnostics/tests). */
  outboundQueuedBytes(principalId: string): number {
    return this.outbound.queuedBytesFor(principalId);
  }

  /** Ground-truth audit for the heartbeat sweep; see the engine doc. */
  reconcileOutboundBytes(slackBytes: number): void {
    this.outbound.reconcile(slackBytes);
  }

  /**
   * Non-waiting admission for one HTTP/WS continuation. Bulk fills only the
   * non-reserved slice of the principal's allowance; control may use the whole
   * allowance (and the shared absolute maximum still bounds both classes).
   */
  tryAdmitWork(principalId: string, workClass: IngressWorkClass): PrincipalWorkLease {
    const { maxConcurrentPrincipalWork, reservedPrincipalControlCapacity, maxTotalPrincipalWork } =
      this.limits;
    const counters = this.workByPrincipal.get(principalId) ?? { bulk: 0, control: 0 };
    if (workClass === "control") {
      if (counters.bulk + counters.control >= maxConcurrentPrincipalWork) {
        throw new PrincipalOverloadError(
          "work",
          "This paired client has too much work in flight; retry shortly.",
          this.limits.retryAfterMs,
        );
      }
    } else if (counters.bulk >= maxConcurrentPrincipalWork - reservedPrincipalControlCapacity) {
      throw new PrincipalOverloadError(
        "work",
        "This paired client has too much work in flight; retry shortly.",
        this.limits.retryAfterMs,
      );
    }
    if (this.workTotal >= maxTotalPrincipalWork) {
      throw new PrincipalOverloadError(
        "work",
        "The host is busy with other requests; retry shortly.",
        this.limits.retryAfterMs,
      );
    }
    if (!this.workByPrincipal.has(principalId)) this.workByPrincipal.set(principalId, counters);
    if (workClass === "control") counters.control += 1;
    else counters.bulk += 1;
    this.workTotal += 1;
    const oneShot = new OneShotRelease(() => {
      if (workClass === "control") counters.control -= 1;
      else counters.bulk -= 1;
      if (counters.bulk <= 0 && counters.control <= 0) {
        this.workByPrincipal.delete(principalId);
      }
      this.workTotal = Math.max(0, this.workTotal - 1);
    });
    return { principalId, release: () => oneShot.release() };
  }

  /** Non-waiting admission for one established event socket. */
  tryAdmitSocket(principalId: string): PrincipalSocketLease {
    const used = this.socketsByPrincipal.get(principalId) ?? 0;
    if (used >= this.limits.maxSocketsPerPrincipal) {
      throw new PrincipalOverloadError(
        "sockets",
        "This paired client has too many open connections; retry shortly.",
        this.limits.retryAfterMs,
      );
    }
    if (this.socketTotal >= this.limits.maxTotalSockets) {
      throw new PrincipalOverloadError(
        "sockets",
        "The host has reached its paired-client connection limit; retry shortly.",
        this.limits.retryAfterMs,
      );
    }
    this.socketsByPrincipal.set(principalId, used + 1);
    this.socketTotal += 1;
    const oneShot = new OneShotRelease(() => {
      decrementCount(this.socketsByPrincipal, principalId);
      this.socketTotal = Math.max(0, this.socketTotal - 1);
    });
    return { principalId, release: () => oneShot.release() };
  }

  /**
   * Non-waiting admission for one (connection, terminal) watch interest.
   * Re-watching the same terminal on the same connection reuses the existing
   * reservation, so a rewatch can never double-count or leak.
   */
  tryAdmitWatch(ws: WebSocket, principalId: string, terminalId: string): void {
    const leases = this.watchLeases.get(ws);
    if (leases?.has(terminalId)) return;
    if ((this.watchesByPrincipal.get(principalId) ?? 0) >= this.limits.maxWatchesPerPrincipal) {
      throw new PrincipalOverloadError(
        "watches",
        "This paired client is watching too many terminals; retry shortly.",
        this.limits.retryAfterMs,
      );
    }
    if (this.watchTotal >= this.limits.maxTotalWatches) {
      throw new PrincipalOverloadError(
        "watches",
        "The host has reached its terminal-watch limit; retry shortly.",
        this.limits.retryAfterMs,
      );
    }
    const oneShot = new OneShotRelease(() => {
      const map = this.watchLeases.get(ws);
      if (!map?.delete(terminalId)) return;
      if (map.size === 0) this.watchLeases.delete(ws);
      decrementCount(this.watchesByPrincipal, principalId);
      this.watchTotal = Math.max(0, this.watchTotal - 1);
    });
    const map = leases ?? new Map<string, OneShotRelease>();
    if (!leases) this.watchLeases.set(ws, map);
    map.set(terminalId, oneShot);
    incrementCount(this.watchesByPrincipal, principalId);
    this.watchTotal += 1;
  }

  /** Releases one watch reservation if the connection still holds it. */
  releaseWatch(ws: WebSocket, terminalId: string): void {
    this.watchLeases.get(ws)?.get(terminalId)?.release();
  }

  /**
   * Non-waiting admission for one retained chunked baseline, keyed by its
   * stream identity (watchId + install epoch) so a replaced stream's release
   * can never free a newer stream's reservation.
   */
  tryAdmitBaseline(
    ws: WebSocket,
    principalId: string,
    watchId: string,
    epoch: number,
    bytes: number,
  ): void {
    const key = baselineLeaseKey(watchId, epoch);
    const leases = this.baselineLeases.get(ws);
    if (leases?.has(key)) return;
    if (
      (this.baselineStreamsByPrincipal.get(principalId) ?? 0) >=
      this.limits.maxBaselineStreamsPerPrincipal
    ) {
      throw new PrincipalOverloadError(
        "baseline-streams",
        "This paired client has too many terminal baselines streaming; retry shortly.",
        this.limits.retryAfterMs,
      );
    }
    if (this.baselineStreamTotal >= this.limits.maxTotalBaselineStreams) {
      throw new PrincipalOverloadError(
        "baseline-streams",
        "The host has reached its terminal-baseline limit; retry shortly.",
        this.limits.retryAfterMs,
      );
    }
    if (
      (this.baselineBytesByPrincipal.get(principalId) ?? 0) + bytes >
      this.limits.maxBaselineBytesPerPrincipal
    ) {
      throw new PrincipalOverloadError(
        "baseline-bytes",
        "This paired client is streaming too much terminal baseline data; retry shortly.",
        this.limits.retryAfterMs,
      );
    }
    if (this.baselineByteTotal + bytes > this.limits.maxTotalBaselineBytes) {
      throw new PrincipalOverloadError(
        "baseline-bytes",
        "The host has reached its terminal-baseline byte budget; retry shortly.",
        this.limits.retryAfterMs,
      );
    }
    const oneShot = new OneShotRelease(() => {
      const map = this.baselineLeases.get(ws);
      if (!map?.delete(key)) return;
      if (map.size === 0) this.baselineLeases.delete(ws);
      decrementCount(this.baselineStreamsByPrincipal, principalId);
      decrementCount(this.baselineBytesByPrincipal, principalId, bytes);
      this.baselineStreamTotal = Math.max(0, this.baselineStreamTotal - 1);
      this.baselineByteTotal = Math.max(0, this.baselineByteTotal - bytes);
    });
    const map = leases ?? new Map<string, OneShotRelease>();
    if (!leases) this.baselineLeases.set(ws, map);
    map.set(key, oneShot);
    incrementCount(this.baselineStreamsByPrincipal, principalId);
    incrementCount(this.baselineBytesByPrincipal, principalId, bytes);
    this.baselineStreamTotal += 1;
    this.baselineByteTotal += bytes;
  }

  /** Releases one baseline reservation when its stream is removed. */
  releaseBaseline(ws: WebSocket, watchId: string, epoch: number): void {
    this.baselineLeases.get(ws)?.get(baselineLeaseKey(watchId, epoch))?.release();
  }

  /**
   * Connection teardown: releases every watch/baseline admission reservation
   * owned by the socket. Queued-output bytes are NOT released here — this runs
   * both when a socket is dropped (before its transport has released anything)
   * and from the WS close handler. The engine owns those reservations and frees
   * them from its own transport listeners (write completion, `close`), so a
   * drop cannot free budget the transport still retains. Both lease kinds are
   * one-shot, so ordering is safe.
   */
  releaseConnection(ws: WebSocket): void {
    // Each lease's own release removes its entry (and the per-connection map
    // once empty), so iterate a copy instead of clearing first.
    const watches = this.watchLeases.get(ws);
    if (watches) for (const lease of [...watches.values()]) lease.release();
    const baselines = this.baselineLeases.get(ws);
    if (baselines) for (const lease of [...baselines.values()]) lease.release();
  }

  usage(principalId: string): PrincipalAdmissionUsage {
    const work = this.workByPrincipal.get(principalId) ?? { bulk: 0, control: 0 };
    return {
      work: { bulk: work.bulk, control: work.control },
      sockets: this.socketsByPrincipal.get(principalId) ?? 0,
      watches: this.watchesByPrincipal.get(principalId) ?? 0,
      baselineStreams: this.baselineStreamsByPrincipal.get(principalId) ?? 0,
      baselineBytes: this.baselineBytesByPrincipal.get(principalId) ?? 0,
    };
  }

  totals(): PrincipalAdmissionTotals {
    let bulk = 0;
    let control = 0;
    for (const work of this.workByPrincipal.values()) {
      bulk += work.bulk;
      control += work.control;
    }
    return {
      work: { bulk, control },
      sockets: this.socketTotal,
      watches: this.watchTotal,
      baselineStreams: this.baselineStreamTotal,
      baselineBytes: this.baselineByteTotal,
    };
  }
}

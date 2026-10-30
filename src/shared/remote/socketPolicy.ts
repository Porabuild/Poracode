import { reconnectBackoffDelay } from "./backoff";

export const REMOTE_SOCKET_POLICY = {
  reconnectBaseMs: 1_000,
  reconnectMaxMs: 20_000,
  unauthorizedReconnectMs: 60_000,
  healthPingIntervalMs: 25_000,
  healthPingTimeoutMs: 5_000,
  connectTimeoutMs: 15_000,
} as const;

export const REMOTE_ACCESS_SESSION_EXPIRED_REASON = "Remote access session expired";

/**
 * The managed desktop's co-located loopback leg: recovery is local and cheap,
 * so the cadence is quicker than a paired remote host's. The caller owns the
 * escalation after a bounded number of local attempts (see the intake).
 */
export const REMOTE_LOCAL_SOCKET_POLICY = {
  reconnectBaseMs: 250,
  reconnectMaxMs: 5_000,
  connectTimeoutMs: 10_000,
  requestTimeoutMs: 10_000,
  healthPingIntervalMs: 15_000,
  healthPingTimeoutMs: 5_000,
} as const;

export interface RemoteSocketReconnectPolicyOptions {
  readonly baseMs?: number;
  readonly maxMs?: number;
}

export class RemoteSocketReconnectPolicy {
  private attempt = 0;

  constructor(private readonly options: RemoteSocketReconnectPolicyOptions = {}) {}

  nextDelay(): number {
    const delay = reconnectBackoffDelay(this.attempt, {
      baseMs: this.options.baseMs ?? REMOTE_SOCKET_POLICY.reconnectBaseMs,
      maxMs: this.options.maxMs ?? REMOTE_SOCKET_POLICY.reconnectMaxMs,
    });
    this.attempt += 1;
    return delay;
  }

  reset(): void {
    this.attempt = 0;
  }
}

interface RemoteSocketHealthMonitorOptions<Socket> {
  readonly isCurrent: (socket: Socket) => boolean;
  readonly isOpen: (socket: Socket) => boolean;
  readonly send: (socket: Socket, payload: string) => void;
  readonly onDead: (socket: Socket) => void;
  /** Pong timeout; defaults to the paired-session policy. */
  readonly timeoutMs?: number;
}

/** A pong deadline that fires later than this was delayed by a stalled event
 * loop, so the reply may already be queued behind the timer. */
const HEALTH_DEADLINE_STALL_SLACK_MS = 1_000;
/** Extra pong windows granted to a stalled or still-active socket before it
 * is declared dead, so a socket that truly went silent is still caught. */
const HEALTH_DEADLINE_MAX_EXTENSIONS = 3;

/** Shared correlated ping/pong timeout policy for remote event sockets. */
export class RemoteSocketHealthMonitor<Socket> {
  private pendingId: string | null = null;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private windowStartedAt = 0;
  private deadlineAt = 0;
  private extensions = 0;
  private lastActivityAt = Number.NEGATIVE_INFINITY;

  constructor(private readonly options: RemoteSocketHealthMonitorOptions<Socket>) {}

  probe(socket: Socket): void {
    if (
      !this.options.isCurrent(socket) ||
      !this.options.isOpen(socket) ||
      this.pendingId !== null
    ) {
      return;
    }
    const id = crypto.randomUUID();
    this.pendingId = id;
    this.extensions = 0;
    try {
      this.options.send(socket, JSON.stringify({ type: "ping", id, sentAt: Date.now() }));
    } catch {
      this.reset();
      this.options.onDead(socket);
      return;
    }
    this.armDeadline(id, socket);
  }

  /** Any inbound frame: the peer is alive even when its pong is still queued
   * behind the frames ahead of it. */
  noteActivity(): void {
    this.lastActivityAt = Date.now();
  }

  acceptPong(id: string | undefined): boolean {
    if (id !== this.pendingId) return false;
    this.reset();
    return true;
  }

  reset(): void {
    this.pendingId = null;
    if (this.timeout !== null) clearTimeout(this.timeout);
    this.timeout = null;
  }

  private armDeadline(id: string, socket: Socket): void {
    const timeoutMs = this.options.timeoutMs ?? REMOTE_SOCKET_POLICY.healthPingTimeoutMs;
    this.windowStartedAt = Date.now();
    this.deadlineAt = this.windowStartedAt + timeoutMs;
    this.timeout = setTimeout(() => this.expire(id, socket), timeoutMs);
  }

  private expire(id: string, socket: Socket): void {
    if (this.pendingId !== id) return;
    this.timeout = null;
    if (!this.options.isCurrent(socket)) {
      this.pendingId = null;
      return;
    }
    // A late timer means the event loop stalled (a saturated machine), so the
    // pong may be queued right behind it; frames during this window prove the
    // peer is alive. Either way the deadline is not evidence of death yet.
    const stalled = Date.now() - this.deadlineAt > HEALTH_DEADLINE_STALL_SLACK_MS;
    const active = this.lastActivityAt >= this.windowStartedAt;
    if ((stalled || active) && this.extensions < HEALTH_DEADLINE_MAX_EXTENSIONS) {
      this.extensions += 1;
      this.armDeadline(id, socket);
      return;
    }
    this.pendingId = null;
    this.options.onDead(socket);
  }
}

export function isUnauthorizedRemoteSocketClose(code: number, reason: string): boolean {
  return code === 1008 || reason === REMOTE_ACCESS_SESSION_EXPIRED_REASON;
}

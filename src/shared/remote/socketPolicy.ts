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

export class RemoteSocketReconnectPolicy {
  private attempt = 0;

  nextDelay(): number {
    const delay = reconnectBackoffDelay(this.attempt, {
      baseMs: REMOTE_SOCKET_POLICY.reconnectBaseMs,
      maxMs: REMOTE_SOCKET_POLICY.reconnectMaxMs,
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
}

/** Shared correlated ping/pong timeout policy for remote event sockets. */
export class RemoteSocketHealthMonitor<Socket> {
  private pendingId: string | null = null;
  private timeout: ReturnType<typeof setTimeout> | null = null;

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
    try {
      this.options.send(socket, JSON.stringify({ type: "ping", id, sentAt: Date.now() }));
    } catch {
      this.reset();
      this.options.onDead(socket);
      return;
    }
    this.timeout = setTimeout(() => {
      if (this.pendingId !== id) return;
      this.pendingId = null;
      this.timeout = null;
      if (!this.options.isCurrent(socket)) return;
      this.options.onDead(socket);
    }, REMOTE_SOCKET_POLICY.healthPingTimeoutMs);
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
}

export function isUnauthorizedRemoteSocketClose(code: number, reason: string): boolean {
  return code === 1008 || reason === REMOTE_ACCESS_SESSION_EXPIRED_REASON;
}

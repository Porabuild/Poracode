import {
  REMOTE_LOCAL_SOCKET_POLICY,
  RemoteSocketHealthMonitor,
  RemoteSocketReconnectPolicy,
} from "@/shared/remote/socketPolicy";
import type { DesktopLoopbackSocket } from "./desktopLoopbackSocket";

/**
 * Managed leg liveness policy (A4): open deadline, correlated health probes,
 * and bounded jittered local retries. This is the composition of the shared
 * socket primitives for the co-located loopback socket only — the intake keeps
 * owning the socket, credentials and activation.
 *
 * Escalation contract: after `maxLocalAttempts` consecutive transport-class
 * failures, `onEscalate` is invoked once (the owner re-resolves the bootstrap:
 * a moved port or a consumed credential cannot recover by retrying the same
 * endpoint). Without `onEscalate` the leg keeps retrying at the capped local
 * cadence rather than stranding silently.
 */
export interface DesktopLoopbackLivenessOptions {
  /** Test seam: fixed local retry cadence instead of jittered backoff. */
  readonly retryDelayMs?: number;
  /** Test seam: deadline for one socket reaching OPEN. */
  readonly connectTimeoutMs?: number;
  readonly maxLocalAttempts: number;
  /** Schedules the next activation attempt. */
  readonly onRetry: () => void;
  /** Bounded local retries exhausted; re-resolve the bootstrap. */
  readonly onEscalate?: () => void;
  /** A deadline or unanswered health probe marked the current socket dead. */
  readonly onDead: (socket: DesktopLoopbackSocket) => void;
}

export class DesktopLoopbackLiveness {
  private socket: DesktopLoopbackSocket | null = null;
  private open = false;
  private disposed = false;
  private localFailures = 0;
  private escalationNotified = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private healthPingInterval: ReturnType<typeof setInterval> | null = null;
  private readonly reconnectPolicy: RemoteSocketReconnectPolicy;
  private readonly connectTimeoutMs: number;
  private readonly health: RemoteSocketHealthMonitor<DesktopLoopbackSocket>;

  constructor(private readonly options: DesktopLoopbackLivenessOptions) {
    this.reconnectPolicy = new RemoteSocketReconnectPolicy(
      options.retryDelayMs === undefined
        ? undefined
        : { baseMs: options.retryDelayMs, maxMs: options.retryDelayMs },
    );
    this.connectTimeoutMs = options.connectTimeoutMs ?? REMOTE_LOCAL_SOCKET_POLICY.connectTimeoutMs;
    this.health = new RemoteSocketHealthMonitor({
      isCurrent: (socket) => this.socket === socket,
      isOpen: (socket) => this.socket === socket && this.open,
      send: (socket, payload) => socket.send(payload),
      onDead: (socket) => {
        if (this.socket !== socket) return;
        this.options.onDead(socket);
      },
      timeoutMs: REMOTE_LOCAL_SOCKET_POLICY.healthPingTimeoutMs,
    });
  }

  /** Tracks a freshly created socket and starts its OPEN deadline. */
  beginConnect(socket: DesktopLoopbackSocket): void {
    this.endSocket();
    this.socket = socket;
    this.open = false;
    this.connectTimer = setTimeout(() => {
      this.connectTimer = null;
      if (this.socket !== socket) return;
      this.options.onDead(socket);
    }, this.connectTimeoutMs);
    this.connectTimer.unref?.();
  }

  /** The socket reached OPEN: clear the deadline, reset the retry budget, and
   * start correlated health probing. */
  markOpen(): void {
    this.clearConnectDeadline();
    this.open = true;
    this.localFailures = 0;
    this.escalationNotified = false;
    this.reconnectPolicy.reset();
    this.clearHealth();
    const socket = this.socket;
    if (!socket) return;
    this.healthPingInterval = setInterval(() => {
      if (this.socket !== socket || !this.open) return;
      // A missing correlated pong within the policy timeout marks the socket
      // dead (half-open connections after suspend/resume included).
      this.health.probe(socket);
    }, REMOTE_LOCAL_SOCKET_POLICY.healthPingIntervalMs);
    this.healthPingInterval.unref?.();
  }

  /** Correlated pong acceptance for the in-flight health probe. */
  acceptPong(id: string | undefined): boolean {
    return this.health.acceptPong(id);
  }

  /** The current socket closed (or was torn down): stop its timers. */
  endSocket(): void {
    this.socket = null;
    this.open = false;
    this.clearConnectDeadline();
    this.clearHealth();
  }

  /** One transport-class failure: retry locally, or escalate once the bounded
   * budget is exhausted. */
  noteTransportFailure(): void {
    if (this.disposed || this.open || this.retryTimer) return;
    this.localFailures += 1;
    if (this.localFailures >= this.options.maxLocalAttempts && this.options.onEscalate) {
      if (!this.escalationNotified) {
        this.escalationNotified = true;
        this.options.onEscalate();
      }
      return;
    }
    this.scheduleRetry();
  }

  dispose(): void {
    this.disposed = true;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.endSocket();
  }

  private scheduleRetry(): void {
    if (this.disposed || this.retryTimer || this.open) return;
    const delay = this.reconnectPolicy.nextDelay();
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.options.onRetry();
    }, delay);
    this.retryTimer.unref?.();
  }

  private clearConnectDeadline(): void {
    if (!this.connectTimer) return;
    clearTimeout(this.connectTimer);
    this.connectTimer = null;
  }

  private clearHealth(): void {
    this.health.reset();
    if (!this.healthPingInterval) return;
    clearInterval(this.healthPingInterval);
    this.healthPingInterval = null;
  }
}

import { WebSocket } from "ws";

export const DEFAULT_WEBSOCKET_HEARTBEAT_INTERVAL_MS = 30_000;

export function sweepWebSocketLiveness(
  clients: ReadonlyMap<WebSocket, unknown>,
  clientLiveness: Map<WebSocket, boolean>,
  sendPing: (ws: WebSocket) => void,
): void {
  for (const client of clients.keys()) {
    if (client.readyState !== WebSocket.OPEN) {
      client.terminate();
      continue;
    }
    if (clientLiveness.get(client) === false) {
      client.terminate();
      continue;
    }
    clientLiveness.set(client, false);
    try {
      sendPing(client);
    } catch {
      client.terminate();
    }
  }
}

/**
 * Owns the server-side ping timer that prunes half-open remote sockets. The
 * orchestrator drives its lifecycle (start on listen, stop on dispose) while
 * this keeps the timer state and interval resolution local to the WS module.
 */
export class WebSocketHeartbeat {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly deps: {
      readonly intervalMs: number | undefined;
      readonly clients: ReadonlyMap<WebSocket, unknown>;
      readonly clientLiveness: Map<WebSocket, boolean>;
      /**
       * B3: sends the sweep's liveness ping through the budgeted outbound
       * control-frame path. Required — a raw `ws.ping` here would reopen the
       * unaccounted protocol-frame bypass for a peer that never sends
       * application messages.
       */
      readonly sendPing: (ws: WebSocket) => void;
      /** B3: runs after each liveness sweep to audit aggregate queued-output
       * budgets (a frozen peer never triggers an admission point). */
      readonly onSweep?: () => void;
    },
  ) {}

  start(): void {
    if (this.timer) return;
    const intervalMs = this.deps.intervalMs ?? DEFAULT_WEBSOCKET_HEARTBEAT_INTERVAL_MS;
    if (intervalMs <= 0) return;
    this.timer = setInterval(() => {
      sweepWebSocketLiveness(this.deps.clients, this.deps.clientLiveness, this.deps.sendPing);
      this.deps.onSweep?.();
    }, intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }
}

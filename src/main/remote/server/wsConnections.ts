import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket } from "ws";
import { remoteWebSocketClientMessageSchema } from "@/shared/remote";
import { RemoteHttpError, type AuthenticatedRemoteSession } from "../auth";
import type { RemoteBrowserFrame } from "../RemoteBrowserGateway";
import type { RemoteServerContext } from "./context";
import { MAX_JSON_BODY_BYTES } from "./requestBody";

export const DEFAULT_MAX_WEBSOCKET_PAYLOAD_BYTES = MAX_JSON_BODY_BYTES;
export const DEFAULT_MAX_WEBSOCKET_OUTBOUND_BUFFER_BYTES = 4 * 1024 * 1024;
export const DEFAULT_WEBSOCKET_HEARTBEAT_INTERVAL_MS = 30_000;
const MAX_TIMEOUT_DELAY_MS = 2_147_483_647;

/** Caches the serialized `browser-frame` message so a frame fanned out to many
 * watchers is only stringified once. */
const browserFrameSerializations = new WeakMap<RemoteBrowserFrame, string>();

export function serializeBrowserFrame(frame: RemoteBrowserFrame): string {
  let serialized = browserFrameSerializations.get(frame);
  if (serialized === undefined) {
    serialized = JSON.stringify({
      type: "browser-frame",
      tabId: frame.tabId,
      data: frame.data,
      metadata: frame.metadata,
    });
    browserFrameSerializations.set(frame, serialized);
  }
  return serialized;
}

export function parseLastSeenSeq(req: IncomingMessage, httpBaseUrl: string): number | null {
  try {
    const url = new URL(req.url ?? "/", httpBaseUrl);
    const raw = url.searchParams.get("lastSeenSeq");
    if (raw === null) return null;
    const seq = Number(raw);
    return Number.isSafeInteger(seq) && seq >= 0 ? seq : null;
  } catch {
    return null;
  }
}

export function rejectUpgrade(socket: Duplex, status: number, reason: string): void {
  try {
    socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\n\r\n`);
  } finally {
    socket.destroy();
  }
}

export async function handleUpgrade(
  ctx: RemoteServerContext,
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
): Promise<void> {
  try {
    const url = new URL(req.url ?? "/", ctx.requireInfo().httpBaseUrl);
    if (url.pathname !== "/ws") {
      socket.destroy();
      return;
    }
    // Browser WebSockets are opened directly by renderer/PWA clients rather
    // than through the HTTP proxy path. Keep HTTP CORS as the ticket-minting
    // gate and treat the short-lived, one-use ticket as the WS capability.
    const ticket = url.searchParams.get("ticket") ?? "";
    const session = ctx.auth.consumeWebSocketTicket(ticket);
    ctx.wss.handleUpgrade(req, socket, head, (ws) => {
      handleConnection(ctx, ws, req, session);
    });
  } catch (error) {
    if (error instanceof RemoteHttpError) {
      rejectUpgrade(socket, error.status, error.status === 401 ? "Unauthorized" : "Forbidden");
      return;
    }
    socket.destroy();
  }
}

function handleConnection(
  ctx: RemoteServerContext,
  ws: WebSocket,
  req: IncomingMessage,
  session: AuthenticatedRemoteSession,
): void {
  ctx.clients.set(ws, session);
  ctx.clientLiveness.set(ws, true);
  ctx.terminalWatches.set(ws, new Set());
  // Browser mirroring is per-connection opt-in (frames are heavy); the
  // gateway's screencast stops once the last watcher unsubscribes.
  let browserWatch: (() => void) | null = null;
  let expiryTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleSessionExpiry = () => {
    const delayMs = session.expiresAtMs - Date.now();
    if (delayMs <= 0) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1008, "Remote access session expired");
      } else {
        ws.terminate();
      }
      return;
    }
    expiryTimer = setTimeout(scheduleSessionExpiry, Math.min(delayMs, MAX_TIMEOUT_DELAY_MS));
    expiryTimer.unref?.();
  };
  ws.on("close", () => {
    if (expiryTimer) {
      clearTimeout(expiryTimer);
      expiryTimer = null;
    }
    browserWatch?.();
    browserWatch = null;
    ctx.terminalWatches.delete(ws);
    ctx.clients.delete(ws);
    ctx.clientLiveness.delete(ws);
  });
  ws.on("pong", () => {
    ctx.clientLiveness.set(ws, true);
  });
  ws.on("error", () => {
    ws.terminate();
  });
  ws.on("message", (data) => {
    try {
      const message = remoteWebSocketClientMessageSchema.parse(
        JSON.parse(data.toString()) as unknown,
      );
      if (message.type === "ping") {
        ctx.send(ws, {
          type: "pong",
          ...(message.id ? { id: message.id } : {}),
          ...(message.sentAt === undefined ? {} : { sentAt: message.sentAt }),
          receivedAt: Date.now(),
        });
      }
      if (message.type === "browser-watch") {
        const gateway = ctx.options.browser;
        if (!gateway || !session.scopes.includes("session:read")) {
          ctx.send(ws, {
            type: "browser-mirror-status",
            status: {
              status: "unavailable",
              tabId: null,
              reason: "Browser mirroring is not available on this desktop.",
            },
          });
          return;
        }
        if (browserWatch) {
          gateway.refresh();
          return;
        }
        browserWatch = gateway.watch({
          onFrame: (frame) => {
            // Drop frames when the socket is congested; the next frame
            // carries the complete picture anyway.
            if (ws.bufferedAmount > 1_500_000) return;
            ctx.sendRaw(ws, serializeBrowserFrame(frame));
          },
          onState: (state) => ctx.send(ws, { type: "browser-state", state }),
          onStatus: (status) => ctx.send(ws, { type: "browser-mirror-status", status }),
        });
      }
      if (message.type === "browser-unwatch") {
        browserWatch?.();
        browserWatch = null;
      }
      if (message.type === "browser-input") {
        if (!ctx.options.browser || !session.scopes.includes("session:operate")) return;
        void ctx.options.browser.dispatchInput(message.input).catch(() => {});
      }
      if (message.type === "terminal-watch") {
        if (!session.scopes.includes("terminal:read")) return;
        ctx.terminalWatches.get(ws)?.add(message.id);
      }
      if (message.type === "terminal-unwatch") {
        ctx.terminalWatches.get(ws)?.delete(message.id);
      }
    } catch {
      // Ignore invalid client messages; all state changes go through HTTP in this slice.
    }
  });
  scheduleSessionExpiry();

  const lastSeenSeq = parseLastSeenSeq(req, ctx.requireInfo().httpBaseUrl);
  ctx.send(ws, { type: "ready", seq: ctx.seq });
  if (lastSeenSeq === null || lastSeenSeq === ctx.seq) {
    // No client cursor, or the client is already current — nothing to replay.
    return;
  }
  if (lastSeenSeq > ctx.seq) {
    // Seq regressed below the client's cursor: `ctx.seq` is in-memory and
    // resets to 0 on restart while bearer sessions persist, so a client
    // reconnecting with a higher lastSeenSeq to a restarted server would
    // otherwise silently keep stale state. Force a fresh snapshot.
    ctx.send(ws, {
      type: "resync-required",
      seq: ctx.seq,
      reason: "Server event stream reset; request a fresh snapshot.",
    });
    return;
  }

  const replay = ctx.eventBuffer.filter((entry) => entry.seq > lastSeenSeq);
  if (replay.length !== ctx.seq - lastSeenSeq) {
    ctx.send(ws, {
      type: "resync-required",
      seq: ctx.seq,
      reason: "Event replay window expired; request a fresh snapshot.",
    });
    return;
  }
  for (const entry of replay) {
    ctx.send(ws, {
      type: "event",
      seq: entry.seq,
      event: entry.event,
    });
  }
}

export function sweepWebSocketLiveness(
  clients: ReadonlyMap<WebSocket, unknown>,
  clientLiveness: Map<WebSocket, boolean>,
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
      client.ping();
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
    },
  ) {}

  start(): void {
    if (this.timer) return;
    const intervalMs = this.deps.intervalMs ?? DEFAULT_WEBSOCKET_HEARTBEAT_INTERVAL_MS;
    if (intervalMs <= 0) return;
    this.timer = setInterval(
      () => sweepWebSocketLiveness(this.deps.clients, this.deps.clientLiveness),
      intervalMs,
    );
    this.timer.unref?.();
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }
}

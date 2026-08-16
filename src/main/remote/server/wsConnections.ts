import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket } from "ws";
import {
  remoteThreadItemInterestsSchema,
  remoteWebSocketClientMessageSchema,
  type RemoteTerminalWatchResult,
} from "@/shared/remote";
import { RemoteHttpError, type AuthenticatedRemoteSession } from "../auth";
import type { RemoteBrowserFrame } from "../RemoteBrowserGateway";
import type { RemoteServerContext } from "./context";
import { isReservedForwardProxyPath, proxyForwardedWebSocketUpgrade } from "./portForwardProxy";
import { MAX_JSON_BODY_BYTES } from "./requestBody";
import { projectGitStatePatchForInterests } from "./gitStateProjection";
import { filterEventForItemInterests } from "./itemInterestFilter";
import {
  buildTerminalWatchResultMessage,
  composeTerminalWatchReadyResult,
  forbiddenWatchResult,
  isSupportedTerminalCursorSyncVersion,
  notFoundWatchResult,
  unavailableWatchResult,
  unsupportedCursorSyncVersionResult,
} from "./terminalCursorSync";

export const DEFAULT_MAX_WEBSOCKET_PAYLOAD_BYTES = MAX_JSON_BODY_BYTES;
export const DEFAULT_MAX_WEBSOCKET_OUTBOUND_BUFFER_BYTES = 4 * 1024 * 1024;

/**
 * permessage-deflate settings for the remote event socket.
 *
 * Compression is worth it here — runtime transcript frames are highly redundant
 * JSON — but `ws` warns that it carries real CPU/memory cost, and this server
 * runs on the Electron **main** process, so every knob below is deliberate:
 *
 * - Context takeover is DISABLED in both directions. With it on, every
 *   connection retains a persistent zlib context (hundreds of KB each way) for
 *   the life of the socket. Per-message contexts cost some ratio but keep memory
 *   flat and predictable across many paired devices.
 * - `concurrencyLimit` bounds simultaneous zlib jobs so a burst of large frames
 *   cannot starve the main process's event loop.
 * - `level: 3` favors throughput over ratio; transcript JSON is already
 *   redundant enough that higher levels buy little.
 * - `threshold` skips small frames, which is most of the stream (status
 *   transitions, `content.delta` chunks) — those are cheaper sent as-is.
 *
 * Note the interaction with `sendRaw`'s backpressure guard: `bufferedAmount`
 * does not account for frames queued inside the deflate pipeline, so the guard
 * is checked against uncompressed size. That is intentionally conservative — it
 * can only drop a client earlier than strictly necessary, never later, and the
 * publish-time size cap (`eventSizeGuard`) keeps single events well clear of it.
 */
export const REMOTE_PER_MESSAGE_DEFLATE = {
  serverNoContextTakeover: true,
  clientNoContextTakeover: true,
  serverMaxWindowBits: 10,
  concurrencyLimit: 4,
  threshold: 1024,
  zlibDeflateOptions: { level: 3 },
} as const;
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

function parseLastSeenSeq(searchParams: URLSearchParams): number | null {
  try {
    const raw = searchParams.get("lastSeenSeq");
    if (raw === null) return null;
    const seq = Number(raw);
    return Number.isSafeInteger(seq) && seq >= 0 ? seq : null;
  } catch {
    return null;
  }
}

function parseThreadItemInterests(searchParams: URLSearchParams): ReadonlySet<string> | null {
  try {
    const raw = searchParams.get("threadItemInterests");
    if (raw === null) return null;
    const parsed = remoteThreadItemInterestsSchema.safeParse(JSON.parse(raw) as unknown);
    return parsed.success ? new Set(parsed.data) : null;
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

/**
 * Install reliable watch state, await the event-interest barrier, take a
 * supervisor snapshot (reply flush establishes the cursor boundary), then emit
 * `terminal-watch-result` only if the install epoch is still current.
 *
 * Failed setups (interest barrier, snapshot not-found/unavailable, etc.) clear
 * only that exact registration so live deltas never stream without a baseline,
 * and an older failure cannot clear a newer same-watchId registration.
 */
async function handleReliableTerminalWatch(
  ctx: RemoteServerContext,
  ws: WebSocket,
  session: AuthenticatedRemoteSession,
  terminalId: string,
  watchId: string,
  version: number,
): Promise<void> {
  if (!isSupportedTerminalCursorSyncVersion(version)) {
    // Replacement semantics: an unsupported positive version must not leave a
    // prior reliable *or* legacy stream for this terminal alive, and must never
    // install/downgrade a watch. Clear both interest maps, notify the supervisor
    // filter safely, then emit the non-retryable unavailable result.
    // Guard sync *and* async throws from the notify hook so the client still
    // receives the unavailable result.
    ctx.terminalCursorSync.clearReliable(ws, terminalId);
    ctx.terminalWatches.get(ws)?.delete(terminalId);
    try {
      void Promise.resolve(ctx.notifyEventInterestsChanged()).catch(() => {});
    } catch {
      // Synchronous throw from onEventInterestsChanged — still deliver error.
    }
    if (ws.readyState === WebSocket.OPEN) {
      ctx.send(
        ws,
        buildTerminalWatchResultMessage(terminalId, watchId, unsupportedCursorSyncVersionResult()),
      );
    }
    return;
  }

  if (!session.scopes.includes("terminal:read")) {
    if (ws.readyState === WebSocket.OPEN) {
      ctx.send(ws, buildTerminalWatchResultMessage(terminalId, watchId, forbiddenWatchResult()));
    }
    return;
  }

  // Rewatch replaces prior reliable state for this terminal id (new epoch).
  const epoch = ctx.terminalCursorSync.setReliable(ws, terminalId, { version: 1, watchId });
  ctx.terminalWatches.get(ws)?.add(terminalId);

  const stillCurrent = () => ctx.terminalCursorSync.isCurrent(ws, terminalId, watchId, epoch);

  /** Clear this install only, drop interest, notify supervisor filter, emit error. */
  const failSetup = (
    errorResult: Extract<RemoteTerminalWatchResult, { status: "error" }>,
  ): void => {
    if (!ctx.terminalCursorSync.clearReliableIfMatch(ws, terminalId, watchId, epoch)) return;
    // Only remove terminal interest when no reliable registration remains for it.
    if (!ctx.terminalCursorSync.hasReliableWatcher(ws, terminalId)) {
      ctx.terminalWatches.get(ws)?.delete(terminalId);
    }
    void Promise.resolve(ctx.notifyEventInterestsChanged()).catch(() => {});
    if (ws.readyState === WebSocket.OPEN) {
      ctx.send(ws, buildTerminalWatchResultMessage(terminalId, watchId, errorResult));
    }
  };

  try {
    await Promise.resolve(ctx.notifyEventInterestsChanged());
  } catch {
    if (!stillCurrent()) return;
    failSetup(unavailableWatchResult());
    return;
  }

  if (!stillCurrent()) return;

  let result;
  try {
    const snapshot = await ctx.options.callSupervisor("readTerminalSnapshot", {
      threadId: terminalId,
    });
    result = composeTerminalWatchReadyResult(snapshot, terminalId) ?? notFoundWatchResult();
  } catch {
    result = unavailableWatchResult();
  }

  if (!stillCurrent()) return;
  if (ws.readyState !== WebSocket.OPEN) {
    // Socket closed mid-setup: drop the registration so reconnect cannot inherit
    // a half-installed reliable watch without a delivered baseline.
    if (ctx.terminalCursorSync.clearReliableIfMatch(ws, terminalId, watchId, epoch)) {
      if (!ctx.terminalCursorSync.hasReliableWatcher(ws, terminalId)) {
        ctx.terminalWatches.get(ws)?.delete(terminalId);
      }
      void Promise.resolve(ctx.notifyEventInterestsChanged()).catch(() => {});
    }
    return;
  }

  if (result.status === "error") {
    failSetup(result);
    return;
  }

  ctx.send(ws, buildTerminalWatchResultMessage(terminalId, watchId, result));
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
      // Not the app's own WebSocket endpoint: the only other legitimate
      // upgrade is a forwarded dev server's own WebSocket (e.g. Vite/webpack
      // HMR) reached through an authenticated `lc_forward` session. Anything
      // else (no session, no PortProxy wired up on this host, or a path
      // reserved for the app itself — see `isReservedForwardProxyPath`, kept
      // in sync with the HTTP proxy fallthrough in `httpRouter`) is dropped,
      // matching the pre-existing behavior for unknown upgrade paths.
      const targetPort = isReservedForwardProxyPath(url.pathname)
        ? null
        : (ctx.options.portProxy?.resolveSession(req.headers.cookie) ?? null);
      if (targetPort) {
        proxyForwardedWebSocketUpgrade(req, socket, head, targetPort);
        return;
      }
      socket.destroy();
      return;
    }
    // Browser WebSockets are opened directly by renderer/PWA clients rather
    // than through the HTTP proxy path. Keep HTTP CORS as the ticket-minting
    // gate and treat the short-lived, one-use ticket as the WS capability.
    const ticket = url.searchParams.get("ticket") ?? "";
    const session = ctx.auth.consumeWebSocketTicket(ticket);
    const lastSeenSeq = parseLastSeenSeq(url.searchParams);
    const initialItemInterests = parseThreadItemInterests(url.searchParams);
    ctx.wss.handleUpgrade(req, socket, head, (ws) => {
      handleConnection(ctx, ws, session, lastSeenSeq, initialItemInterests);
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
  session: AuthenticatedRemoteSession,
  lastSeenSeq: number | null,
  initialItemInterests: ReadonlySet<string> | null,
): void {
  ctx.clients.set(ws, session);
  ctx.clientLiveness.set(ws, true);
  ctx.terminalWatches.set(ws, new Set());
  if (initialItemInterests && session.scopes.includes("session:read")) {
    ctx.itemInterests.set(ws, initialItemInterests);
  }
  void Promise.resolve(ctx.notifyEventInterestsChanged()).catch(() => {});
  const gitStateInterestOwnerId = `${session.sessionId}:${randomUUID()}`;
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
    ctx.gitStateInterests.delete(ws);
    ctx.itemInterests.delete(ws);
    ctx.options.gitState?.clearInterests(gitStateInterestOwnerId);
    ctx.terminalWatches.delete(ws);
    ctx.terminalCursorSync.clearConnection(ws);
    ctx.clients.delete(ws);
    ctx.clientLiveness.delete(ws);
    void Promise.resolve(ctx.notifyEventInterestsChanged()).catch(() => {});
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
        if (message.cursorSync) {
          // Fire-and-forget setup; swallow rejections so a late throw cannot
          // become an unhandled promise rejection on the host process.
          void handleReliableTerminalWatch(
            ctx,
            ws,
            session,
            message.id,
            message.cursorSync.watchId,
            message.cursorSync.version,
          ).catch(() => {});
          return;
        }
        if (!session.scopes.includes("terminal:read")) return;
        // One interest per (connection, terminalId): legacy rewatch drops any
        // prior reliable registration so we never dual-stream the same id.
        ctx.terminalCursorSync.clearReliable(ws, message.id);
        ctx.terminalWatches.get(ws)?.add(message.id);
        void Promise.resolve(ctx.notifyEventInterestsChanged()).catch(() => {});
      }
      if (message.type === "terminal-unwatch") {
        ctx.terminalWatches.get(ws)?.delete(message.id);
        ctx.terminalCursorSync.clearReliable(ws, message.id);
        void Promise.resolve(ctx.notifyEventInterestsChanged()).catch(() => {});
      }
      if (message.type === "thread-item-interests") {
        if (!session.scopes.includes("session:read")) return;
        ctx.itemInterests.set(ws, new Set(message.threadIds));
        void Promise.resolve(ctx.notifyEventInterestsChanged()).catch(() => {});
      }
      if (message.type === "git-state-interests") {
        if (!session.scopes.includes("session:read")) return;
        // Remembered per connection so `remote-git-state` patches only carry
        // pull-request bodies to the client that asked for them.
        ctx.gitStateInterests.set(ws, message.interests);
        ctx.options.gitState?.setInterests(gitStateInterestOwnerId, message.interests);
      }
    } catch {
      // Ignore invalid client messages; all state changes go through HTTP in this slice.
    }
  });
  scheduleSessionExpiry();

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
    // A reconnecting client has not re-declared its Git interests yet, so a
    // replayed patch is scoped to "nothing requested" and drops pull-request
    // bodies. The client re-declares on open, which triggers a fresh fetch of
    // whatever review it is actually looking at.
    const itemScoped = filterEventForItemInterests(entry.event, ctx.itemInterests.get(ws) ?? null);
    const event =
      itemScoped.type === "remote-git-state"
        ? {
            ...itemScoped,
            patch: projectGitStatePatchForInterests(
              itemScoped.patch,
              ctx.gitStateInterests.get(ws) ?? [],
            ),
          }
        : itemScoped;
    ctx.send(ws, {
      type: "event",
      seq: entry.seq,
      event,
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

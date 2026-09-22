import { hasRelayLoopbackHopMarker } from "./security";
import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket } from "ws";
import {
  DEFAULT_MAX_WEBSOCKET_OUTBOUND_BUFFER_BYTES,
  sendControlFrame,
  type OutboundFrameHost,
} from "../remoteAccessServerWs";
import {
  REMOTE_BOUNDED_CATALOG_CHANGES_DECLARATION,
  REMOTE_BOUNDED_CATALOG_CHANGES_WS_PARAM,
  REMOTE_RUNTIME_HISTORY_NOTICES_DECLARATION,
  remoteThreadItemInterestsSchema,
  remoteWebSocketClientMessageSchema,
} from "@/shared/remote";
import {
  REMOTE_DESKTOP_INTERNAL_SEQ_PARAM,
  REMOTE_DESKTOP_INTERNAL_WS_PARAM,
} from "@/shared/remote/contract/queryCodecs";

import { RemoteHttpError, type AuthenticatedRemoteSession } from "../auth";
import type { RemoteBrowserFrame } from "../RemoteBrowserGateway";
import type { RemoteServerContext } from "./context";
import {
  desktopInternalStreamHostOf,
  isDesktopInternalSession,
  isLoopbackRemoteAddress,
  markDesktopInternalSession,
  unmarkDesktopInternalSession,
} from "./desktopInternalStream";
import { MAX_JSON_BODY_BYTES } from "./requestBody";
import { replayEvents } from "./eventReplay";
import { PrincipalOverloadError, type PrincipalSocketLease } from "./principalAdmission";
import { buildTerminalWatchResultMessage, unavailableWatchResult } from "./terminalCursorSync";
import { MAX_TERMINAL_WATCHES_PER_CLIENT, handleReliableTerminalWatch } from "./wsTerminalWatch";

export {
  DEFAULT_WEBSOCKET_HEARTBEAT_INTERVAL_MS,
  WebSocketHeartbeat,
  sweepWebSocketLiveness,
} from "./wsHeartbeat";

export const DEFAULT_MAX_WEBSOCKET_PAYLOAD_BYTES = MAX_JSON_BODY_BYTES;
// The outbound cap lives with the send paths that enforce it
// (`remoteAccessServerWs.ts`); kept exported here for existing importers.
export { DEFAULT_MAX_WEBSOCKET_OUTBOUND_BUFFER_BYTES };

/**
 * permessage-deflate settings for the remote event socket.
 *
 * Compression is worth it here — runtime transcript frames are highly redundant
 * JSON — but `ws` warns that it carries real CPU/memory cost, and this server
 * runs in the extracted backend-host process (not Electron main), so every
 * knob below is deliberate:
 *
 * - Context takeover is DISABLED in both directions. With it on, every
 *   connection retains a persistent zlib context (hundreds of KB each way) for
 *   the life of the socket. Per-message contexts cost some ratio but keep memory
 *   flat and predictable across many paired devices.
 * - `concurrencyLimit` bounds simultaneous zlib jobs so a burst of large frames
 *   cannot starve the backend-host event loop (PWA HTTP/WS, desktop renderer
 *   stream, SQLite, and supervisor IPC share it).
 * - `level: 3` favors throughput over ratio; transcript JSON is already
 *   redundant enough that higher levels buy little.
 * - `threshold` skips small frames, which is most of the stream (status
 *   transitions, `content.delta` chunks) — those are cheaper sent as-is.
 *
 * Note the interaction with `sendRaw`'s backpressure guard: `bufferedAmount`
 * counts deflate-pipeline frames too — the sender holds their uncompressed
 * payload until the compressed frame is written — but the guard charges each
 * frame the worst-case encoded size (header plus stored-block expansion,
 * `outboundFrameBytes`). That stays intentionally conservative: it can only
 * drop a client earlier than strictly necessary, never later, and the
 * publish-time size cap (`eventSizeGuard`) keeps single events well clear of it.
 */
export const REMOTE_PER_MESSAGE_DEFLATE = {
  serverNoContextTakeover: true,
  clientNoContextTakeover: true,
  // No `serverMaxWindowBits` cap: the default 15-bit window compresses the
  // large frames that dominate weak links (terminal baselines, item events)
  // 30-50% smaller than the earlier 10-bit cap, and `noContextTakeover` still
  // bounds per-message memory.
  concurrencyLimit: 4,
  threshold: 1024,
  zlibDeflateOptions: { level: 3 },
} as const;
const MAX_TIMEOUT_DELAY_MS = 2_147_483_647;

const outboundFrameHosts = new WeakMap<RemoteServerContext, OutboundFrameHost>();

/**
 * Adapts the extracted server context to the narrow host slice every outbound
 * send path reads. All maps are the context's own by identity, and the
 * desktop-internal detach goes through the same registry the connection close
 * handler uses, so a budget refusal from the ping handler tears the socket
 * down exactly like a budget refusal from `sendRaw`. One adapter per context
 * (a context is created once per server).
 */
function outboundFrameHostFor(ctx: RemoteServerContext): OutboundFrameHost {
  let host = outboundFrameHosts.get(ctx);
  if (host) return host;
  host = {
    options: ctx.options,
    clients: ctx.clients,
    replayingClients: ctx.replayingClients,
    clientLiveness: ctx.clientLiveness,
    terminalWatches: ctx.terminalWatches,
    principalAdmission: ctx.principalAdmission,
    terminalCursorSync: ctx.terminalCursorSync,
    gitStateInterests: ctx.gitStateInterests,
    itemInterests: ctx.itemInterests,
    noticeCapableClients: ctx.noticeCapableClients,
    boundedCatalogChangeClients: ctx.boundedCatalogChangeClients,
    detachDesktopInternalClient: (ws) => {
      desktopInternalStreamHostOf(ctx)?.detachClient(ws);
    },
    notifyEventInterestsChanged: () => ctx.notifyEventInterestsChanged(),
  };
  outboundFrameHosts.set(ctx, host);
  return host;
}

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

/**
 * B1 per-connection notices capability. Only the exact declared value counts;
 * absent, unknown, or malformed declarations are incapable (fail closed), so a
 * connection that cannot render the durable notice never receives canonical
 * content for a notice thread.
 */
function parseNoticesCapability(searchParams: URLSearchParams): boolean {
  return searchParams.get("notices") === REMOTE_RUNTIME_HISTORY_NOTICES_DECLARATION;
}

/**
 * Bounded catalog changes: only the exact declared value counts; absent,
 * unknown, or malformed declarations are undeclared (fail closed), so a
 * connection that cannot process the bounded signal keeps receiving the
 * legacy full catalog event. Like `notices`, the declaration is honored only
 * with `session:read` (see `handleConnection`).
 */
function parseBoundedCatalogChangesDeclaration(searchParams: URLSearchParams): boolean {
  return (
    searchParams.get(REMOTE_BOUNDED_CATALOG_CHANGES_WS_PARAM) ===
    REMOTE_BOUNDED_CATALOG_CHANGES_DECLARATION
  );
}

function parseLastDesktopSeq(searchParams: URLSearchParams): number | null {
  try {
    const raw = searchParams.get(REMOTE_DESKTOP_INTERNAL_SEQ_PARAM);
    if (raw === null) return null;
    const seq = Number(raw);
    return Number.isSafeInteger(seq) && seq >= 0 ? seq : null;
  } catch {
    return null;
  }
}

/**
 * Desktop-internal admission (V5 plan 2.5): the opt-in query parameter counts
 * only when the upgrade originates from a loopback address. A remote peer
 * sending the parameter is admitted as an ordinary session — fail-closed by
 * construction, so the desktop-only event surface can never be negotiated
 * across the network.
 */
function desktopInternalRequested(req: IncomingMessage, searchParams: URLSearchParams): boolean {
  if (searchParams.get(REMOTE_DESKTOP_INTERNAL_WS_PARAM) !== "1") return false;
  // Deep-review fix: the relay adapter also dials from loopback on behalf of
  // REMOTE visitors (forwarding their query params verbatim), so the socket
  // address alone would admit any paired client to the desktop-only stream.
  // A marked dial is proxied, never direct.
  return isLoopbackRemoteAddress(req.socket.remoteAddress) && !hasRelayLoopbackHopMarker(req);
}

export function rejectUpgrade(
  socket: Duplex,
  status: number,
  reason: string,
  retryAfterMs?: number,
): void {
  try {
    // B3: rejected upgrades carry the same retry hint as HTTP overloads, so a
    // client that hit its principal socket budget can back off deliberately.
    const retryAfter =
      retryAfterMs === undefined
        ? ""
        : `Retry-After: ${Math.max(1, Math.ceil(retryAfterMs / 1_000))}\r\n`;
    socket.write(`HTTP/1.1 ${status} ${reason}\r\n${retryAfter}Connection: close\r\n\r\n`);
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
      // Not the app's own WebSocket endpoint. Forwarded applications' own
      // sockets (e.g. Vite/webpack HMR) are reached on their isolated child
      // origins, dispatched by `forwardOriginDispatch` before this function
      // runs — on the API/PWA origin there is no proxy fallback, so any other
      // upgrade path is dropped, matching the pre-existing behavior for
      // unknown upgrade paths.
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
    const noticesCapable = parseNoticesCapability(url.searchParams);
    const boundedCatalogChanges = parseBoundedCatalogChangesDeclaration(url.searchParams);
    const desktopInternal = desktopInternalRequested(req, url.searchParams);
    const lastDesktopSeq = desktopInternal ? parseLastDesktopSeq(url.searchParams) : null;
    // B3: per-principal socket admission AFTER authentication (the session id
    // survives refresh/reconnect, so a new TCP socket cannot mint a new
    // budget). Rejection happens before the handshake completes; the one-use
    // ticket is already consumed, so the client mints a fresh one on retry.
    const socketLease = ctx.principalAdmission.tryAdmitSocket(session.sessionId);
    let handedOff = false;
    try {
      ctx.wss.handleUpgrade(req, socket, head, (ws) => {
        handedOff = true;
        if (desktopInternal) markDesktopInternalSession(ctx, ws);
        handleConnection(
          ctx,
          ws,
          session,
          lastSeenSeq,
          initialItemInterests,
          noticesCapable,
          boundedCatalogChanges,
          desktopInternal,
          lastDesktopSeq,
          socketLease,
        );
      });
    } finally {
      // `handleUpgrade` hands the lease to the connection synchronously; if
      // the handshake itself failed, release it here exactly once.
      if (!handedOff) socketLease.release();
    }
  } catch (error) {
    if (error instanceof RemoteHttpError) {
      rejectUpgrade(
        socket,
        error.status,
        error.status === 401
          ? "Unauthorized"
          : error.status === 429
            ? "Too Many Requests"
            : "Forbidden",
        error.retryAfterMs,
      );
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
  noticesCapable = false,
  boundedCatalogChanges = false,
  desktopInternal = false,
  lastDesktopSeq: number | null = null,
  socketLease: PrincipalSocketLease | null = null,
): void {
  if (ctx.stopping) {
    socketLease?.release();
    ws.terminate();
    return;
  }
  // Register the socket-budget release before any other setup so a throw
  // during connection initialization still cannot leak the reservation; the
  // lease is one-shot, so the full close handler below may release it again.
  ws.once("close", () => socketLease?.release());
  ctx.clients.set(ws, session);
  ctx.replayingClients.add(ws);
  ctx.clientLiveness.set(ws, true);
  ctx.terminalWatches.set(ws, new Set());
  if (initialItemInterests && session.scopes.includes("session:read")) {
    ctx.itemInterests.set(ws, initialItemInterests);
  }
  // The notices capability counts only alongside transcript read scope, exactly
  // like item interests; every other connection is gated (fail closed).
  if (noticesCapable && session.scopes.includes("session:read")) {
    ctx.noticeCapableClients.add(ws);
  }
  // Bounded catalog changes: registered BEFORE `ready` and before the replay
  // pump starts, so this connection can never be classified by (or receive) a
  // form that precedes its declaration; the first replayed frame already
  // honors it. Same read-scope gate, fail closed.
  if (boundedCatalogChanges && session.scopes.includes("session:read")) {
    ctx.boundedCatalogChangeClients.add(ws);
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
    ctx.replayingClients.delete(ws);
    if (expiryTimer) {
      clearTimeout(expiryTimer);
      expiryTimer = null;
    }
    browserWatch?.();
    browserWatch = null;
    ctx.gitStateInterests.delete(ws);
    ctx.itemInterests.delete(ws);
    ctx.noticeCapableClients.delete(ws);
    ctx.boundedCatalogChangeClients.delete(ws);
    ctx.options.gitState?.clearInterests(gitStateInterestOwnerId);
    ctx.terminalWatches.delete(ws);
    // B3: release every watch/baseline reservation this connection held.
    // Socket-close is the settle point; a disconnect never releases admitted
    // HTTP work, which stays budgeted until its handler actually finishes.
    ctx.principalAdmission.releaseConnection(ws);
    ctx.terminalCursorSync.clearConnection(ws);
    ctx.terminalBaselineStreams.clearConnection(ws);
    desktopInternalStreamHostOf(ctx)?.detachClient(ws);
    unmarkDesktopInternalSession(ctx, ws);
    ctx.clients.delete(ws);
    ctx.clientLiveness.delete(ws);
    void Promise.resolve(ctx.notifyEventInterestsChanged()).catch(() => {});
  });
  ws.on("ping", (data: Buffer) => {
    // RFC 6455 requires a pong carrying the same payload. The server disables
    // ws's built-in auto-pong (see the WebSocketServer construction), so this
    // is the only reply path: a ping flood from a peer that stopped reading
    // cannot grow the transport queue with unaccounted protocol bytes. The
    // pong is charged through the same immediate per-socket/aggregate
    // admission as application frames; when it does not fit, the recipient is
    // terminated and replays or resyncs on reconnect.
    sendControlFrame(outboundFrameHostFor(ctx), ws, "pong", data);
  });
  ws.on("pong", () => {
    ctx.clientLiveness.set(ws, true);
  });
  ws.on("error", () => {
    ws.terminate();
  });
  ws.on("message", (data) => {
    // Revocation/expiry starts an asynchronous close handshake. A peer can
    // still transmit frames during it, but no longer has authority to do work.
    if (
      ctx.stopping ||
      ws.readyState !== WebSocket.OPEN ||
      ctx.clients.get(ws) !== session ||
      session.expiresAtMs <= Date.now()
    )
      return;
    try {
      const message = remoteWebSocketClientMessageSchema.parse(
        JSON.parse(data.toString()) as unknown,
      );
      if (message.type === "ping") {
        ctx.terminalBaselineStreams.noteControlSend(ws);
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
        const browser = ctx.options.browser;
        void ctx.runIngressWork(() => browser.dispatchInput(message.input), ws).catch(() => {});
      }
      if (message.type === "terminal-watch") {
        if (message.cursorSync) {
          // Fire-and-forget setup; swallow rejections so a late throw cannot
          // become an unhandled promise rejection on the host process.
          const cursorSync = message.cursorSync;
          void ctx
            .runIngressWork(
              () => handleReliableTerminalWatch(ctx, ws, session, message.id, cursorSync),
              ws,
            )
            .catch((error: unknown) => {
              // Admission can reject before the watch handler installs any
              // state. Keep that rejection correlated with the request so a
              // client does not wait for its baseline timeout. Handler
              // failures are still swallowed here because the handler owns
              // its setup/error result lifecycle.
              if (ws.readyState !== WebSocket.OPEN) return;
              if (error instanceof PrincipalOverloadError) {
                // B3: the principal's own work budget is saturated. Typed
                // retryable result with the budget-specific reason.
                ctx.send(
                  ws,
                  buildTerminalWatchResultMessage(message.id, cursorSync.watchId, {
                    ...unavailableWatchResult(),
                    reason: error.watchReason,
                  }),
                );
                return;
              }
              if (error instanceof RemoteHttpError && error.code === "host_busy") {
                ctx.send(
                  ws,
                  buildTerminalWatchResultMessage(
                    message.id,
                    cursorSync.watchId,
                    unavailableWatchResult(),
                  ),
                );
              }
            });
          return;
        }
        if (!session.scopes.includes("terminal:read")) return;
        // One interest per (connection, terminalId): legacy rewatch drops any
        // prior reliable registration so we never dual-stream the same id.
        const terminalWatches = ctx.terminalWatches.get(ws);
        if (
          terminalWatches &&
          !terminalWatches.has(message.id) &&
          terminalWatches.size >= MAX_TERMINAL_WATCHES_PER_CLIENT
        )
          return;
        if (terminalWatches && !terminalWatches.has(message.id)) {
          try {
            // B3 principal watch budget. The legacy watch contract has no
            // result frame, so an over-budget id is skipped exactly like the
            // per-connection cap above — the client simply receives no live
            // output for it and can re-request a reliable watch for a typed
            // retryable result.
            ctx.principalAdmission.tryAdmitWatch(ws, session.sessionId, message.id);
          } catch {
            return;
          }
        }
        ctx.terminalCursorSync.clearReliable(ws, message.id);
        terminalWatches?.add(message.id);
        void Promise.resolve(ctx.notifyEventInterestsChanged()).catch(() => {});
      }
      if (message.type === "terminal-unwatch") {
        ctx.terminalWatches.get(ws)?.delete(message.id);
        ctx.principalAdmission.releaseWatch(ws, message.id);
        ctx.terminalCursorSync.clearReliable(ws, message.id);
        void Promise.resolve(ctx.notifyEventInterestsChanged()).catch(() => {});
      }
      if (message.type === "terminal-watch-baseline-ack") {
        // Credit release for a v2 chunked baseline. Stale watchIds are
        // ignored inside the scheduler.
        ctx.terminalBaselineStreams.acknowledge(
          ws,
          message.id,
          message.cursorSync.watchId,
          message.cursorSync.throughCursor,
        );
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
    ctx.replayingClients.delete(ws);
    // No client cursor, or the client is already current — nothing to replay.
  } else if (lastSeenSeq > ctx.seq) {
    ctx.replayingClients.delete(ws);
    // Seq regressed below the client's cursor: `ctx.seq` is in-memory and
    // resets to 0 on restart while bearer sessions persist, so a client
    // reconnecting with a higher lastSeenSeq to a restarted server would
    // otherwise silently keep stale state. Force a fresh snapshot.
    ctx.send(ws, {
      type: "resync-required",
      seq: ctx.seq,
      reason: "Server event stream reset; request a fresh snapshot.",
    });
  } else {
    replayEvents(ctx, ws, lastSeenSeq);
  }

  // Desktop-internal sessions resume their SECOND, desktop-only replayable
  // stream independently (own cursor, own bounded buffer). Everything above
  // behaves exactly as for any other authenticated session.
  if (isDesktopInternalSession(ctx, ws)) {
    desktopInternalStreamHostOf(ctx)?.attachClient(ws, lastDesktopSeq);
  }
}

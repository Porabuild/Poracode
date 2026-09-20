import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket } from "ws";
import {
  TERMINAL_CURSOR_SYNC_V2_VERSION,
  remoteThreadItemInterestsSchema,
  remoteWebSocketClientMessageSchema,
  type RemoteTerminalCursorSyncRequest,
  type RemoteTerminalWatchResult,
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
import {
  buildTerminalWatchResultMessage,
  composeTerminalBaselineStream,
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
 * does not account for frames queued inside the deflate pipeline, so the guard
 * is checked against uncompressed size. That is intentionally conservative — it
 * can only drop a client earlier than strictly necessary, never later, and the
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
export const DEFAULT_WEBSOCKET_HEARTBEAT_INTERVAL_MS = 30_000;
const MAX_TIMEOUT_DELAY_MS = 2_147_483_647;
/** A client normally watches only the visible terminals. Keep interest state
 * finite even if a malformed or runaway client sends unique watch IDs. */
const MAX_TERMINAL_WATCHES_PER_CLIENT = 256;

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
  return isLoopbackRemoteAddress(req.socket.remoteAddress);
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
  cursorSync: RemoteTerminalCursorSyncRequest,
): Promise<void> {
  const { watchId, version } = cursorSync;
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

  const terminalWatches = ctx.terminalWatches.get(ws);
  if (
    terminalWatches &&
    !terminalWatches.has(terminalId) &&
    terminalWatches.size >= MAX_TERMINAL_WATCHES_PER_CLIENT
  ) {
    if (ws.readyState === WebSocket.OPEN) {
      ctx.send(
        ws,
        buildTerminalWatchResultMessage(terminalId, watchId, {
          status: "error",
          code: "unavailable",
          retryable: true,
          reason: "client-watch-capacity",
        }),
      );
    }
    return;
  }

  // Rewatch replaces prior reliable state for this terminal id (new epoch).
  // Version 2 baselines stream through the credit-windowed scheduler; the
  // registration (epochs, barrier, tagging) is identical to v1.
  const epoch = ctx.terminalCursorSync.setReliable(ws, terminalId, { version, watchId });
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

  if (version === TERMINAL_CURSOR_SYNC_V2_VERSION) {
    // Chunked v2 delivery: pre-stream errors already ran through failSetup,
    // so from here the baseline reaches the client as ordered chunks under
    // the credit window (or the socket dies trying — never a silent gap).
    const stream = composeTerminalBaselineStream({
      terminalId,
      watchId,
      result,
      resume: cursorSync.resume,
      maxChunkBytes: cursorSync.maxChunkBytes,
      maxWindowBytes: cursorSync.maxWindowBytes,
    });
    ctx.terminalBaselineStreams.enqueue(ws, {
      terminalId,
      watchId,
      epoch,
      messages: stream.messages,
      messageBytes: stream.messageBytes,
      throughCursors: stream.throughCursors,
      finalCursor: stream.finalCursor,
      windowBytes: stream.windowBytes,
    });
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
    const desktopInternal = desktopInternalRequested(req, url.searchParams);
    const lastDesktopSeq = desktopInternal ? parseLastDesktopSeq(url.searchParams) : null;
    ctx.wss.handleUpgrade(req, socket, head, (ws) => {
      if (desktopInternal) markDesktopInternalSession(ctx, ws);
      handleConnection(
        ctx,
        ws,
        session,
        lastSeenSeq,
        initialItemInterests,
        desktopInternal,
        lastDesktopSeq,
      );
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
  desktopInternal = false,
  lastDesktopSeq: number | null = null,
): void {
  if (ctx.stopping) {
    ws.terminate();
    return;
  }
  ctx.clients.set(ws, session);
  ctx.replayingClients.add(ws);
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
    ctx.replayingClients.delete(ws);
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
    ctx.terminalBaselineStreams.clearConnection(ws);
    desktopInternalStreamHostOf(ctx)?.detachClient(ws);
    unmarkDesktopInternalSession(ctx, ws);
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
              if (
                error instanceof RemoteHttpError &&
                error.code === "host_busy" &&
                ws.readyState === WebSocket.OPEN
              ) {
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
        ctx.terminalCursorSync.clearReliable(ws, message.id);
        terminalWatches?.add(message.id);
        void Promise.resolve(ctx.notifyEventInterestsChanged()).catch(() => {});
      }
      if (message.type === "terminal-unwatch") {
        ctx.terminalWatches.get(ws)?.delete(message.id);
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

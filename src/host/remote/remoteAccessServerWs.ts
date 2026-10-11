import { WebSocket } from "ws";
import type { GitStateInterest } from "@/shared/gitState";
import type { RemoteWebSocketServerMessage } from "@/shared/remote";
import type { AuthenticatedRemoteSession } from "./auth";
import { outboundFrameBytes } from "./server/outboundBudget";
import type { PrincipalAdmissionController } from "./server/principalAdmission";
import type { TerminalCursorSyncRegistry } from "./server/terminalCursorSync";
import type { RemoteAccessServerOptions } from "./remoteAccessServerTypes";

/**
 * Default cap on the framed bytes the transport may retain per socket. It is
 * declared with the send paths that enforce it; `server/wsConnections.ts`
 * re-exports it for the modules that historically imported it from there.
 */
export const DEFAULT_MAX_WEBSOCKET_OUTBOUND_BUFFER_BYTES = 4 * 1024 * 1024;

/**
 * Minimal host slice every outbound send path reads. The orchestrator's
 * `RemoteAccessServerHost` satisfies it directly; the extracted connection
 * module adapts its `RemoteServerContext` (see `server/wsConnections.ts`), so
 * protocol control frames ride the same per-socket and aggregate admission as
 * every application frame without depending on the orchestrator class.
 */
export interface OutboundFrameHost {
  readonly options: RemoteAccessServerOptions;
  readonly clients: Map<WebSocket, AuthenticatedRemoteSession>;
  readonly replayingClients: Set<WebSocket>;
  readonly clientLiveness: Map<WebSocket, boolean>;
  readonly terminalWatches: Map<WebSocket, Set<string>>;
  readonly principalAdmission: PrincipalAdmissionController;
  readonly terminalCursorSync: TerminalCursorSyncRegistry;
  readonly gitStateInterests: Map<WebSocket, readonly GitStateInterest[]>;
  readonly itemInterests: Map<WebSocket, ReadonlySet<string>>;
  /** B1: connections that declared `notices=v1` (see `server/noticeGate.ts`). */
  readonly noticeCapableClients: Set<WebSocket>;
  /** Bounded catalog changes: connections that declared `catalogChanges=bounded-v1`. */
  readonly boundedCatalogChangeClients: Set<WebSocket>;
  detachDesktopInternalClient(ws: WebSocket): void;
  notifyEventInterestsChanged(): void | Promise<void>;
}

export function broadcast(host: OutboundFrameHost, message: RemoteWebSocketServerMessage): void {
  broadcastRaw(host, JSON.stringify(message));
}

/** Fans an already-serialized message out to every client. Lets the caller
 * serialize a large body once instead of per send. `byteLength` lets the
 * caller that already measured the serialization (the publish path) reuse that
 * measurement instead of recomputing `Buffer.byteLength` per recipient. */
export function broadcastRaw(host: OutboundFrameHost, data: string, byteLength?: number): void {
  const bytes = byteLength ?? Buffer.byteLength(data, "utf8");
  for (const client of host.clients.keys()) {
    if (host.replayingClients.has(client)) continue;
    sendRaw(host, client, data, undefined, bytes);
  }
}

export function send(
  host: OutboundFrameHost,
  ws: WebSocket,
  message: RemoteWebSocketServerMessage,
): void {
  sendRaw(host, ws, JSON.stringify(message));
}

/**
 * Charges one already-sized frame against the per-socket cap and the aggregate
 * principal/global reservation before handing it to `queue`:
 *
 * - the per-socket cap is checked against `bufferedAmount` plus the frame's
 *   framed size, and a crossing frame terminates the recipient;
 * - the aggregate reservation is created before the frame is queued and is
 *   released when the write callback fires (bytes actually left the socket
 *   queue) or when the socket closes — never when the send merely returns and
 *   never when a socket is dropped, because terminate() leaves queued bytes
 *   retained until close.
 *
 * A `session`-less socket is sent uncounted (there is no principal to charge);
 * every socket that completed `handleConnection` has one.
 */
function sendReservedFrame(
  host: OutboundFrameHost,
  ws: WebSocket,
  frameBytes: number,
  queue: (settle?: (error?: Error) => void) => void,
  onSent?: (error?: Error) => void,
): boolean {
  if (ws.readyState !== WebSocket.OPEN) return false;
  const maxBuffered =
    host.options.maxWebSocketOutboundBufferBytes ?? DEFAULT_MAX_WEBSOCKET_OUTBOUND_BUFFER_BYTES;
  if (ws.bufferedAmount + frameBytes > maxBuffered) {
    dropWebSocketClient(host, ws);
    return false;
  }
  const session = host.clients.get(ws);
  const reservation = session
    ? host.principalAdmission.tryReserveOutboundBytes(ws, session.sessionId, frameBytes)
    : null;
  if (session && !reservation) {
    // Over budget even after evicting this principal's / the largest
    // contributor's congested sockets (whose retained bytes still count):
    // terminate the recipient rather than silently skipping a canonical frame.
    // Its reconnect replays or resyncs.
    if (ws.readyState === WebSocket.OPEN) dropWebSocketClient(host, ws);
    return false;
  }
  try {
    if (reservation) {
      queue((error) => {
        reservation.release();
        onSent?.(error);
      });
    } else {
      queue(onSent);
    }
    return true;
  } catch {
    // ws throws synchronously before queueing anything (closed/not-open state
    // or invalid data), so there are no retained bytes to keep reserved.
    reservation?.release();
    dropWebSocketClient(host, ws);
    return false;
  }
}

export function sendRaw(
  host: OutboundFrameHost,
  ws: WebSocket,
  data: string,
  onSent?: (error?: Error) => void,
  byteLength?: number,
): boolean {
  const payloadBytes = byteLength ?? Buffer.byteLength(data, "utf8");
  // `bufferedAmount` counts framed transport bytes, so both the per-socket cap
  // and the aggregate reservation are charged the conservative encoded frame
  // size (header plus worst-case deflate expansion), not just the payload.
  return sendReservedFrame(
    host,
    ws,
    outboundFrameBytes(payloadBytes),
    (settle) => (settle ? ws.send(data, settle) : ws.send(data)),
    onSent,
  );
}

/** RFC 6455 header of an unmasked server control frame. Control payloads are
 * capped at 125 bytes, so the extended-length header forms can never appear. */
const CONTROL_FRAME_HEADER_BYTES = 2;

/**
 * Sends an RFC 6455 control frame (ping/pong) through the same immediate
 * per-socket and aggregate admission as every data frame: control frames are
 * transport bytes too, and the remote access server constructs its
 * `WebSocketServer` with `autoPong: false`, so this is the only ping/pong
 * path. The write callback releases the reservation, a close releases whatever
 * is still pending, and a frame that cannot be admitted terminates the
 * recipient for replay instead of letting protocol output grow unaccounted.
 */
export function sendControlFrame(
  host: OutboundFrameHost,
  ws: WebSocket,
  frame: "ping" | "pong",
  payload?: Buffer,
): boolean {
  const frameBytes = CONTROL_FRAME_HEADER_BYTES + (payload?.byteLength ?? 0);
  return sendReservedFrame(host, ws, frameBytes, (settle) => {
    // Server frames are unmasked. ws's type surface wants an explicit mask
    // when a completion callback is passed.
    if (frame === "ping") ws.ping(payload, false, settle);
    else ws.pong(payload, false, settle);
  });
}

export function dropWebSocketClient(host: OutboundFrameHost, ws: WebSocket): void {
  host.clients.delete(ws);
  host.replayingClients.delete(ws);
  host.clientLiveness.delete(ws);
  host.terminalWatches.delete(ws);
  // Releases the socket's watch/baseline admission leases immediately — those
  // are logical interests that die with the connection. Its queued-byte
  // reservation is deliberately NOT released here: after terminate() the
  // transport still retains the queued bytes until its write callbacks or the
  // `close` event, and the engine releases them at exactly that point.
  host.principalAdmission.releaseConnection(ws);
  host.terminalCursorSync.clearConnection(ws);
  host.detachDesktopInternalClient(ws);
  host.gitStateInterests.delete(ws);
  host.itemInterests.delete(ws);
  host.noticeCapableClients.delete(ws);
  host.boundedCatalogChangeClients.delete(ws);
  void Promise.resolve(host.notifyEventInterestsChanged()).catch(() => {});
  try {
    ws.terminate();
  } catch {
    // ignore
  }
}

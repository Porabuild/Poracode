import { replayBoundedHistory } from "./eventReplay";
import { isLoopbackSocketAddress } from "./security";
import { WebSocket } from "ws";
import type { RemoteWebSocketServerMessage } from "@/shared/remote";
import type { BufferedSupervisorEvent, RemoteServerContext } from "./context";

/**
 * Desktop-internal loopback sessions (V5 plan 2.5).
 *
 * The co-located desktop renderer consumes the desktop-only supervisor event
 * families (provider usage, LSP, OSC, crossagent, experiment judging, …) over
 * a second, replayable `desktop-event` sequence that ONLY desktop-internal
 * sessions receive. Admission is a loopback-origin upgrade opt-in: the client
 * sets `desktopInternal=1` on `/ws` and the server honors it only when the
 * upgrade socket's remote address is a loopback address — a remote peer asking
 * for the kind is admitted as an ordinary session with the ordinary event
 * surface, so unknown (desktop-only) event types can never reach external or
 * native clients that validate against the remote runtime-event union.
 *
 * This module keeps the per-server registry (which live sockets are
 * desktop-internal) and the desktop replay pump without widening
 * `RemoteServerContext`: the server registers a
 * {@link DesktopInternalStreamHost} once per context and the extracted
 * connection module (`wsConnections.ts`) resolves it through the registry.
 */

/** A loopback peer address, normalized across IPv4, IPv6, and IPv4-mapped
 * IPv6 forms (`::1`, `127.x.x.x`, `::ffff:127.x.x.x`). Unix sockets report an
 * empty remote address; they are local by construction and count as loopback. */
export function isLoopbackRemoteAddress(address: string | undefined): boolean {
  // One classifier for every loopback gate (deep-review consolidation).
  return isLoopbackSocketAddress(address);
}

const registrySessions = new WeakMap<RemoteServerContext, WeakSet<WebSocket>>();
const registryHosts = new WeakMap<RemoteServerContext, DesktopInternalStreamHost>();

/** Marks one live connection as desktop-internal. Only `wsConnections.ts`
 * calls this, and only after the loopback-address check passed. */
export function markDesktopInternalSession(ctx: RemoteServerContext, ws: WebSocket): void {
  let sessions = registrySessions.get(ctx);
  if (!sessions) {
    sessions = new WeakSet();
    registrySessions.set(ctx, sessions);
  }
  sessions.add(ws);
}

export function isDesktopInternalSession(ctx: RemoteServerContext, ws: WebSocket): boolean {
  return registrySessions.get(ctx)?.has(ws) ?? false;
}

export function unmarkDesktopInternalSession(ctx: RemoteServerContext, ws: WebSocket): void {
  registrySessions.get(ctx)?.delete(ws);
}

/**
 * The server-side half of the desktop-internal stream, implemented by
 * `RemoteAccessServer` and registered once per context at construction.
 */
export interface DesktopInternalStreamHost {
  /**
   * Registers a freshly admitted desktop-internal connection and starts its
   * desktop-stream replay when the client resumed from `lastDesktopSeq`:
   * a null/absent cursor (or one already current) means nothing to replay, a
   * cursor ahead of the server's (server restart) earns `resync-required`,
   * and otherwise the bounded buffer replays the missing range.
   */
  attachClient(ws: WebSocket, lastDesktopSeq: number | null): void;
  /** Drops every per-connection desktop-stream bookkeeping (socket closed). */
  detachClient(ws: WebSocket): void;
}

export function registerDesktopInternalStreamHost(
  ctx: RemoteServerContext,
  host: DesktopInternalStreamHost,
): void {
  registryHosts.set(ctx, host);
}

export function desktopInternalStreamHostOf(
  ctx: RemoteServerContext,
): DesktopInternalStreamHost | null {
  return registryHosts.get(ctx) ?? null;
}

/**
 * Serves the bounded desktop-event history to one reconnecting desktop-internal
 * client, one frame at a time, mirroring `eventReplay.ts`: the desktop buffer
 * is seq-contiguous, so each step seeks by index and reuses the ingest-time
 * serialization; a gap (replay window expired) sends `resync-required` instead
 * of a partial history.
 */
export function replayDesktopEvents(
  host: DesktopInternalReplayContext,
  socket: WebSocket,
  lastSeenSeq: number,
): void {
  replayBoundedHistory(socket, lastSeenSeq, {
    membership: host.desktopReplayingClients,
    get headSeq() {
      return host.desktopSeq;
    },
    get buffer() {
      return host.desktopEventBuffer;
    },
    send: host.send,
    sendRaw: host.sendRaw,
    get resync() {
      return {
        seq: host.seq,
        reason: "Desktop event replay window expired; request a fresh snapshot.",
      };
    },
    frameFor: (entry) => ({
      kind: "frame",
      data: `{"type":"desktop-event","seq":${entry.seq},"space":"ipc","event":${entry.json}}`,
    }),
  });
}

/** The slice of `RemoteAccessServer` state the desktop replay pump reads. */
export interface DesktopInternalReplayContext {
  /** Shared-stream sequence, reported inside `resync-required` frames. */
  readonly seq: number;
  readonly desktopSeq: number;
  readonly desktopEventBuffer: readonly BufferedSupervisorEvent[];
  readonly desktopReplayingClients: Set<WebSocket>;
  send(ws: WebSocket, message: RemoteWebSocketServerMessage): void;
  sendRaw(ws: WebSocket, data: string, onSent?: (error?: Error) => void): boolean;
}

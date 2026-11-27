import { REMOTE_SOCKET_POLICY } from "@/shared/remote/socketPolicy";
import { getRemoteServerEventSocketEntry } from "./eventSocketRegistry";
import type { RemoteSocketLike } from "./types";

/** An open socket (a test double without `readyState` counts as open). */
function isOpenSocket(socket: RemoteSocketLike | null | undefined): socket is RemoteSocketLike {
  return (
    socket !== null &&
    socket !== undefined &&
    (socket.readyState === undefined || socket.readyState === 1)
  );
}

/** The connection's current event socket finished its handshake and is open. */
export function hasLiveRemoteServerEventSocket(connectionKey: string): boolean {
  const socket = getRemoteServerEventSocketEntry(connectionKey)?.socket;
  return isOpenSocket(socket) && typeof socket.send === "function";
}

/**
 * An HTTP request to this host failed in transport. While the event socket is
 * open it is the liveness authority: ask it with a bounded ping (a probe that
 * is already pending keeps its own deadline) instead of declaring the host
 * offline. A dead socket then reconnects through its own ladder. Returns true
 * when a live socket took over the verdict.
 */
export function deferTransportFailureToLiveEventSocket(connectionKey: string): boolean {
  const entry = getRemoteServerEventSocketEntry(connectionKey);
  const socket = entry?.socket;
  if (!entry || !socket || !hasLiveRemoteServerEventSocket(connectionKey)) return false;
  entry.health?.probe(socket, { timeoutMs: REMOTE_SOCKET_POLICY.healthPingTimeoutMs });
  return true;
}

/**
 * Evidence the host is reachable again (an HTTP success, a foreground resume)
 * while this connection's event socket session is down: run its next attempt
 * now. The socket's activation, not the HTTP success, marks the host online,
 * so a host whose live channel keeps failing does not flap online/offline.
 * Returns true when a socket session without an open socket took the signal.
 */
export function nudgeRemoteServerEventSocket(connectionKey: string): boolean {
  const entry = getRemoteServerEventSocketEntry(connectionKey);
  if (!entry || isOpenSocket(entry.socket)) return false;
  entry.nudge?.();
  return true;
}

import { WebSocket } from "ws";

/**
 * RFC 6455 §7.4.1 status code 1001 ("going away"). The managed host uses it to
 * tell connected clients that the endpoint is going down. It is the
 * standards-defined close reason, needs no new application protocol message,
 * and every compliant client surfaces it as an ordinary close.
 */
export const GOING_AWAY_CLOSE_CODE = 1001;

/** Fixed close reason. RFC 6455 caps a control frame payload at 125 bytes. */
export const SHUTDOWN_CLOSE_REASON = "Server shutting down.";

/** The slice of the managed host the announcement reads. */
export interface ShutdownAnnouncementHost {
  readonly clients: ReadonlyMap<WebSocket, unknown>;
}

/**
 * Announces managed-host shutdown to every established WebSocket client with
 * one going-away close frame, without waiting for a single handshake. This is
 * deliberately the whole announcement: no new protocol event is added, and a
 * client that ignores the frame (or cannot receive it behind its retained
 * queue) is destroyed by the transport grace that follows
 * (`HttpServerConnections.close`), not by a second shutdown path here.
 *
 * `ws.close` only queues the frame on the socket's existing send path. Bytes
 * the transport already retained stay retained: queued-byte reservations are
 * released by the actual send callbacks or the socket `close` event, never by
 * this call, so the announcement cannot shorten or extend either the
 * retention window or the overall transport budget.
 *
 * Returns how many sockets the announcement was queued for.
 */
export function announceRemoteServerShutdown(host: ShutdownAnnouncementHost): number {
  let announced = 0;
  for (const client of host.clients.keys()) {
    if (client.readyState !== WebSocket.OPEN) continue;
    try {
      client.close(GOING_AWAY_CLOSE_CODE, SHUTDOWN_CLOSE_REASON);
      announced += 1;
    } catch {
      // A socket can race its own close between the state check and the call.
      // The transport grace still terminates it, so a failed announcement is
      // not a shutdown failure.
    }
  }
  return announced;
}

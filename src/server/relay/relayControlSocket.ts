import { WebSocket } from "ws";

const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;

/** Liveness for the production host-control hop, independent of TCP timeout.
 * Application payload framing and per-visitor flow control are unchanged. */
export function createRelayControlSocket(
  url: string,
  maxPayload: number,
  heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS,
): WebSocket {
  const socket = new WebSocket(url, { maxPayload, handshakeTimeout: 30_000 });
  let timer: ReturnType<typeof setInterval> | undefined;
  let alive = true;
  socket.on("pong", () => {
    alive = true;
  });
  socket.once("open", () => {
    if (heartbeatIntervalMs <= 0) return;
    timer = setInterval(() => {
      if (!alive || socket.readyState !== WebSocket.OPEN) {
        socket.terminate();
        return;
      }
      alive = false;
      try {
        socket.ping();
      } catch {
        socket.terminate();
      }
    }, heartbeatIntervalMs);
    timer.unref?.();
  });
  socket.once("close", () => {
    if (timer) clearInterval(timer);
  });
  return socket;
}

import { WebSocket } from "ws";
import type { RelayServerFrame } from "@/shared/remote/relayProtocol";
import { RELAY_WS_PAYLOAD_TOO_LARGE_REASON } from "@/shared/remote/relayLimits";
import {
  DEFAULT_WEBSOCKET_HEARTBEAT_INTERVAL_MS,
  type RegisteredHost,
  type RelayServerRuntime,
} from "./relayServerTypes";

export function sendToHost(
  rt: RelayServerRuntime,
  host: RegisteredHost,
  frame: RelayServerFrame,
): boolean {
  return sendFrame(rt, host.control, frame);
}

export function sendFrame(
  rt: RelayServerRuntime,
  control: WebSocket,
  frame: RelayServerFrame,
): boolean {
  return sendRaw(rt, control, JSON.stringify(frame), false);
}

export function sendRaw(
  rt: RelayServerRuntime,
  socket: WebSocket,
  data: string | Uint8Array,
  closeOnOverflow = true,
): boolean {
  if (socket.readyState !== WebSocket.OPEN) return false;
  // Buffer.byteLength counts UTF-8 bytes for strings and .byteLength for views.
  if (socket.bufferedAmount + Buffer.byteLength(data) > rt.outboundBufferLimit) {
    if (closeOnOverflow) {
      rt.socketLiveness.delete(socket);
      try {
        socket.terminate();
      } catch {
        // ignore
      }
    }
    return false;
  }
  try {
    socket.send(data);
    return true;
  } catch {
    try {
      socket.terminate();
    } catch {
      // ignore
    }
    return false;
  }
}

/** Enqueue a tiny terminal notice through a bounded reserve. Never used for
 * bulk channel traffic; exhausting the reserve tears down this host so the
 * peer cannot retain a stale channel or request forever. */
export function sendFrameForced(
  rt: RelayServerRuntime,
  host: RegisteredHost,
  frame: RelayServerFrame,
): boolean {
  const control = host.control;
  if (control.readyState !== WebSocket.OPEN) return false;
  const data = JSON.stringify(frame);
  const bytes = Buffer.byteLength(data);
  if (control.bufferedAmount === 0) host.forcedControlBytes = 0;
  if (
    host.forcedControlBytes + bytes > rt.forcedControlReserveBytes ||
    control.bufferedAmount + bytes > rt.outboundBufferLimit + rt.forcedControlReserveBytes
  ) {
    rt.socketLiveness.delete(control);
    try {
      control.terminate();
    } catch {
      // ignore
    }
    return false;
  }
  try {
    control.send(data);
    host.forcedControlBytes += bytes;
    return true;
  } catch {
    rt.socketLiveness.delete(control);
    try {
      control.terminate();
    } catch {
      // ignore
    }
    return false;
  }
}

export function trackWebSocket(rt: RelayServerRuntime, socket: WebSocket): void {
  rt.socketLiveness.set(socket, true);
  socket.on("pong", () => {
    rt.socketLiveness.set(socket, true);
  });
  socket.on("close", () => {
    rt.socketLiveness.delete(socket);
  });
  socket.on("error", () => {
    socket.terminate();
  });
}

export function startWebSocketHeartbeat(rt: RelayServerRuntime): void {
  if (rt.heartbeatTimer) return;
  const intervalMs =
    rt.options.webSocketHeartbeatIntervalMs ?? DEFAULT_WEBSOCKET_HEARTBEAT_INTERVAL_MS;
  if (intervalMs <= 0) return;
  rt.heartbeatTimer = setInterval(() => sweepWebSocketLiveness(rt), intervalMs);
  rt.heartbeatTimer.unref?.();
}

export function stopWebSocketHeartbeat(rt: RelayServerRuntime): void {
  if (!rt.heartbeatTimer) return;
  clearInterval(rt.heartbeatTimer);
  rt.heartbeatTimer = null;
}

function sweepWebSocketLiveness(rt: RelayServerRuntime): void {
  for (const socket of rt.socketLiveness.keys()) {
    if (socket.readyState !== WebSocket.OPEN) {
      socket.terminate();
      continue;
    }
    if (rt.socketLiveness.get(socket) === false) {
      socket.terminate();
      continue;
    }
    rt.socketLiveness.set(socket, false);
    try {
      socket.ping();
    } catch {
      socket.terminate();
    }
  }
}

/** Reject one message that cannot be forwarded inside the control budget by
 * closing ITS channel with 1009 ("message too big") and the explicit reason,
 * telling the host to drop the channel too. The control connection, every
 * other channel, and in-flight requests are untouched. */
export function rejectOversizeVisitor(
  rt: RelayServerRuntime,
  host: RegisteredHost,
  id: string,
  visitor: WebSocket,
): void {
  if (!rt.visitors.delete(id)) return;
  sendFrameForced(rt, host, { t: "ws-close", id, reason: RELAY_WS_PAYLOAD_TOO_LARGE_REASON });
  visitor.close(1009, RELAY_WS_PAYLOAD_TOO_LARGE_REASON);
}

/**
 * P1-5: forward one visitor-channel frame onto the SHARED host control
 * socket with per-channel byte accounting. When the control budget is
 * exhausted the worst contributor (usually the flooding channel itself) is
 * evicted — its visitor terminated and the host told to drop the channel —
 * instead of terminating the control socket, which would disconnect every
 * other channel and in-flight request of the host. `sendRaw`'s kill remains
 * only for closed/dead sockets; a host that never drains eventually loses
 * each flooding channel and nothing else.
 */
export function forwardChannelFrame(
  rt: RelayServerRuntime,
  host: RegisteredHost,
  serverId: string,
  channelId: string,
  data: string | Uint8Array,
): boolean {
  const bytes = typeof data === "string" ? Buffer.byteLength(data) : data.byteLength;
  const control = host.control;
  if (control.readyState !== WebSocket.OPEN) return false;
  if (control.bufferedAmount + bytes > rt.outboundBufferLimit) {
    const worst = worstChannelId(host, channelId);
    evictChannel(rt, host, serverId, worst);
    if (worst !== channelId) evictChannel(rt, host, serverId, channelId);
    return false;
  }
  if (!sendRaw(rt, control, data, false)) return false;
  if (control.bufferedAmount === 0) {
    host.channelBytes.clear(); // fully drained: start the accounting window fresh
  }
  host.channelBytes.set(channelId, (host.channelBytes.get(channelId) ?? 0) + bytes);
  return true;
}

function worstChannelId(host: RegisteredHost, fallback: string): string {
  let worst: string = fallback;
  let worstBytes = -1;
  for (const [id, bytes] of host.channelBytes) {
    if (bytes > worstBytes) {
      worst = id;
      worstBytes = bytes;
    }
  }
  return worst;
}

/** Channel-only eviction: stop forwarding, tell the host to drop the channel
 * (a tiny frame that is enqueued even while the buffer is over its soft
 * limit — the host reads it as soon as the flood drains), then cut the
 * visitor socket so its close cannot double-report. */
function evictChannel(
  rt: RelayServerRuntime,
  host: RegisteredHost,
  serverId: string,
  channelId: string,
): void {
  const visitor = rt.visitors.get(channelId);
  if (!visitor || visitor.serverId !== serverId) {
    host.channelBytes.delete(channelId);
    return;
  }
  rt.visitors.delete(channelId);
  host.channelBytes.delete(channelId);
  sendFrameForced(rt, host, {
    t: "ws-close",
    id: channelId,
    reason: "relay link congestion",
  });
  visitor.socket.terminate();
}

import type { RelayHostFrame } from "@/shared/remote/relayProtocol";
import { WEB_SOCKET_OPEN, type RelayHostRuntime } from "./relayHostTypes";
import type { RelaySocket } from "./relayHost";

export function closeSocket(socket: RelaySocket): void {
  try {
    socket.close();
  } catch {
    // ignore
  }
}

export function sendRaw(
  rt: RelayHostRuntime,
  socket: RelaySocket,
  data: string | Uint8Array,
  closeOnOverflow = false,
): boolean {
  // Buffer.byteLength counts UTF-8 bytes for strings and .byteLength for views.
  if ((socket.bufferedAmount ?? 0) + Buffer.byteLength(data) > rt.maxWebSocketOutboundBufferBytes) {
    if (closeOnOverflow) closeSocket(socket);
    return false;
  }
  try {
    socket.send(data);
    return true;
  } catch (error) {
    rt.options.reportError?.(error);
    closeSocket(socket);
    return false;
  }
}

export function sendOn(rt: RelayHostRuntime, socket: RelaySocket, frame: RelayHostFrame): boolean {
  return sendRaw(rt, socket, JSON.stringify(frame));
}

/** Tiny channel-control notices must still cross a congested control link;
 * otherwise the relay keeps a visitor/channel entry after this host has
 * already evicted its local socket. Bulk frames continue to use sendRaw's
 * bounded admission. */
export function sendOnForced(
  rt: RelayHostRuntime,
  socket: RelaySocket,
  frame: RelayHostFrame,
): boolean {
  if (socket.readyState !== undefined && socket.readyState !== WEB_SOCKET_OPEN) return false;
  const data = JSON.stringify(frame);
  const bytes = Buffer.byteLength(data);
  if ((socket.bufferedAmount ?? 0) === 0) rt.forcedControlBytes = 0;
  if (
    rt.forcedControlBytes + bytes > rt.forcedControlReserveBytes ||
    (socket.bufferedAmount ?? 0) + bytes >
      rt.maxWebSocketOutboundBufferBytes + rt.forcedControlReserveBytes
  ) {
    closeSocket(socket);
    return false;
  }
  try {
    socket.send(data);
    rt.forcedControlBytes += bytes;
    return true;
  } catch {
    closeSocket(socket);
    return false;
  }
}

export function send(rt: RelayHostRuntime, frame: RelayHostFrame): void {
  if (rt.control) sendRaw(rt, rt.control, JSON.stringify(frame), true);
}

/**
 * Backpressure pacing for streaming chunk sends: when the control socket's
 * outbound buffer is congested (slow relay→visitor consumer behind it),
 * stop reading the upstream body until it drains. Bounded total wait — a
 * dead socket fails the send itself rather than parking here forever, and
 * an aborted exchange (idle deadline, req-cancel) stops pacing immediately.
 */
export async function waitForControlRoom(
  rt: RelayHostRuntime,
  socket: RelaySocket,
  signal: AbortSignal,
): Promise<void> {
  for (
    let waited = 0;
    !signal.aborted &&
    (socket.bufferedAmount ?? 0) > rt.droppableStreamSoftBufferBytes &&
    waited < 10_000;
    waited += 20
  ) {
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
  }
}

export function closeAllChannels(rt: RelayHostRuntime): void {
  for (const channel of rt.wsChannels.values()) {
    closeSocket(channel.socket);
  }
  rt.wsChannels.clear();
}

/** Abort one pending local request because the relay told us to (`req-cancel`:
 * the visitor disconnected, or the relay's deadline expired first). The
 * in-flight `handleRequest` observes the missing entry and stays quiet — no
 * `res`/`req-error` goes out for a canceled id. Unknown ids are a no-op so a
 * cancel that races a completion (or arrives from a stale relay) is inert. */
export function cancelPendingRequest(rt: RelayHostRuntime, id: string): void {
  const entry = rt.pendingRequests.get(id);
  if (!entry) return;
  rt.pendingRequests.delete(id);
  clearTimeout(entry.timeout);
  entry.controller.abort();
}

/** The control socket is gone (closed, replaced, or the host was disposed):
 * nothing this socket's requests produced could reach the relay anymore, so
 * stop every local fetch it asked for rather than letting each one run to
 * its own timeout. */
export function abortAllPendingRequests(rt: RelayHostRuntime): void {
  for (const [id, entry] of rt.pendingRequests) {
    rt.pendingRequests.delete(id);
    clearTimeout(entry.timeout);
    entry.controller.abort();
  }
}

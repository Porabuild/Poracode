import { WebSocket } from "ws";
import type { RemoteWebSocketServerMessage } from "@/shared/remote";
import { DEFAULT_MAX_WEBSOCKET_OUTBOUND_BUFFER_BYTES } from "./server/wsConnections";
import type { RemoteAccessServerHost } from "./remoteAccessServerTypes";

export function broadcast(
  host: RemoteAccessServerHost,
  message: RemoteWebSocketServerMessage,
): void {
  broadcastRaw(host, JSON.stringify(message));
}

/** Fans an already-serialized message out to every client. Lets the caller
 * serialize a large body once instead of per send. */
export function broadcastRaw(host: RemoteAccessServerHost, data: string): void {
  for (const client of host.clients.keys()) {
    if (host.replayingClients.has(client)) continue;
    sendRaw(host, client, data);
  }
}

export function send(
  host: RemoteAccessServerHost,
  ws: WebSocket,
  message: RemoteWebSocketServerMessage,
): void {
  sendRaw(host, ws, JSON.stringify(message));
}

export function sendRaw(
  host: RemoteAccessServerHost,
  ws: WebSocket,
  data: string,
  onSent?: (error?: Error) => void,
): boolean {
  if (ws.readyState !== WebSocket.OPEN) return false;
  const maxBuffered =
    host.options.maxWebSocketOutboundBufferBytes ?? DEFAULT_MAX_WEBSOCKET_OUTBOUND_BUFFER_BYTES;
  if (ws.bufferedAmount + Buffer.byteLength(data, "utf8") > maxBuffered) {
    dropWebSocketClient(host, ws);
    return false;
  }
  try {
    if (onSent) ws.send(data, onSent);
    else ws.send(data);
    return true;
  } catch {
    dropWebSocketClient(host, ws);
    return false;
  }
}

export function dropWebSocketClient(host: RemoteAccessServerHost, ws: WebSocket): void {
  host.clients.delete(ws);
  host.replayingClients.delete(ws);
  host.clientLiveness.delete(ws);
  host.terminalWatches.delete(ws);
  host.terminalCursorSync.clearConnection(ws);
  host.detachDesktopInternalClient(ws);
  host.gitStateInterests.delete(ws);
  host.itemInterests.delete(ws);
  void Promise.resolve(host.notifyEventInterestsChanged()).catch(() => {});
  try {
    ws.terminate();
  } catch {
    // ignore
  }
}

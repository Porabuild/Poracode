import type { RemoteWebSocketClientMessage } from "@/shared/remote";

interface RemoteSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(): void;
}

const WEB_SOCKET_OPEN = 1;

function closeSocket(socket: RemoteSocketLike): void {
  try {
    socket.close();
  } catch {
    // Closing is best-effort; the caller only needs a failed send result.
  }
}

export function createRemoteSocketSender(socket: RemoteSocketLike) {
  return (outgoing: RemoteWebSocketClientMessage): boolean => {
    if (socket.readyState !== WEB_SOCKET_OPEN) return false;
    const payload = JSON.stringify(outgoing);
    try {
      socket.send(payload);
      return true;
    } catch {
      closeSocket(socket);
      return false;
    }
  };
}

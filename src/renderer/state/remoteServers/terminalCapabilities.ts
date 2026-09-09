import type { TerminalSocketSender } from "@/shared/remote/terminalFeed";
import type { RemoteSocketLike } from "./types";
import {
  TERMINAL_CURSOR_SYNC_VERSION,
  TERMINAL_CURSOR_SYNC_V2_VERSION,
} from "@/shared/remote/protocol";
import type { RemoteDesktopClient } from "@/shared/remote/client";

/** Connection-local, never persisted: a reconnect must revalidate support. */
export interface TerminalConnectionCapabilities {
  readonly cursorSyncVersion?: 1 | 2;
}

type Environment = Awaited<ReturnType<RemoteDesktopClient["environment"]>>;

const SUPPORTED_CURSOR_SYNC_VERSIONS = [
  TERMINAL_CURSOR_SYNC_VERSION,
  TERMINAL_CURSOR_SYNC_V2_VERSION,
] as const;

/**
 * Pick the newest advertised cursor-sync version this build supports.
 * Negotiated from the fresh per-connection descriptor only — never persisted —
 * so an old host keeps v1 and a v2-capable host upgrades on the next connect.
 */
export function terminalCapabilitiesFromEnvironment(
  environment: Environment,
): TerminalConnectionCapabilities {
  const advertised = environment.capabilities?.terminalCursorSync?.versions ?? [];
  const supported = SUPPORTED_CURSOR_SYNC_VERSIONS.filter((version) =>
    advertised.includes(version),
  );
  // Newest supported advertised version; the tuple is ordered ascending.
  const newest = supported[supported.length - 1];
  return newest === undefined ? {} : { cursorSyncVersion: newest };
}

/** Reuse only the descriptor just fetched for this initial connection.
 * Automatic reconnects pass no seed and validate a fresh descriptor in
 * parallel with ticket acquisition, rather than adding another serial RTT. */
export async function prepareTerminalConnection(
  client: Pick<RemoteDesktopClient, "environment" | "websocketTicket">,
  initialCapabilities?: TerminalConnectionCapabilities,
): Promise<{ ticket: string; capabilities: TerminalConnectionCapabilities }> {
  const [ticket, capabilities] = await Promise.all([
    client.websocketTicket(),
    initialCapabilities ?? client.environment().then(terminalCapabilitiesFromEnvironment),
  ]);
  return { ticket, capabilities };
}

/** Retain capability/sender identity only for the lifetime of each socket.
 * Reusing the callback prevents an ordinary thread switch from looking like
 * a reconnect to the shared terminal feed. */
export function createTerminalFeedConnections(
  install: (
    desktopId: string,
    sender: TerminalSocketSender,
    capabilities: TerminalConnectionCapabilities,
  ) => void,
  isCurrent: (desktopId: string, socket: RemoteSocketLike) => boolean,
) {
  const connections = new WeakMap<
    RemoteSocketLike,
    {
      capabilities: TerminalConnectionCapabilities;
      sender?: TerminalSocketSender;
    }
  >();
  return {
    remember(socket: RemoteSocketLike, capabilities: TerminalConnectionCapabilities) {
      connections.set(socket, { capabilities });
    },
    activate(desktopId: string, socket: RemoteSocketLike) {
      if (socket.readyState !== undefined && socket.readyState !== 1) return;
      const connection = connections.get(socket);
      if (!connection) return;
      connection.sender ??= (message) => {
        if (
          !isCurrent(desktopId, socket) ||
          !socket.send ||
          (socket.readyState !== undefined && socket.readyState !== 1)
        ) {
          return false;
        }
        try {
          socket.send(JSON.stringify(message));
          return true;
        } catch {
          return false;
        }
      };
      install(desktopId, connection.sender, connection.capabilities);
    },
  };
}

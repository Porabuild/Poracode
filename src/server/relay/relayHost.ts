import { WebSocket } from "ws";
import { headersToRecord } from "@/shared/http";
import { toWebSocketUrl } from "@/shared/remote";
import {
  LIGHTCODE_RELAY_PROTOCOL_VERSION,
  relayServerFrameSchema,
  safeJsonParse,
  type RelayHostFrame,
  type RelayRequestFrame,
  type RelayWsOpenFrame,
} from "@/shared/remote/relayProtocol";

/**
 * Server-side relay adapter. Dials a relay, registers a server id, and proxies
 * each tunneled visitor request to the server's OWN loopback port — so
 * `RemoteAccessServer` is untouched and the device that connected through the
 * relay is served exactly as a direct LAN client would be. See
 * docs/REMOTE_ARCHITECTURE.md, Phase 5, and relayProtocol.ts.
 */
export interface RelayHostOptions {
  /** Relay host-control URL, e.g. `wss://relay.example.com/host`. */
  readonly relayUrl: string;
  readonly serverId: string;
  /** Proves ownership of `serverId` to the relay. */
  readonly secret: string;
  readonly label?: string;
  /** The server's own loopback HTTP base, e.g. `http://127.0.0.1:38987`. */
  readonly localHttpUrl: string;
  /** Reconnect backoff bounds. */
  readonly minReconnectMs?: number;
  readonly maxReconnectMs?: number;
  reportError?(error: unknown): void;
  onRegistered?(publicUrl: string): void;
  /** Injectable for tests. */
  readonly socketFactory?: (url: string) => RelaySocket;
  readonly fetchImpl?: typeof fetch;
  readonly wsFactory?: (url: string) => RelaySocket;
}

/**
 * Minimal WebSocket shape used for both the host⇄relay control socket and the
 * host → own-server `/ws` sockets. Injectable so tests don't need a real socket.
 */
export interface RelaySocket {
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: ((error: unknown) => void) | null;
}

export interface RelayHostHandle {
  dispose(): void;
}

export function startRelayHost(options: RelayHostOptions): RelayHostHandle {
  const fetchImpl =
    options.fetchImpl ?? ((url: string | URL, init?: RequestInit) => fetch(url, init));
  const localHttpBase = options.localHttpUrl.replace(/\/+$/, "");
  const localWsBase = toWebSocketUrl(localHttpBase).toString().replace(/\/+$/, "");
  const minReconnect = options.minReconnectMs ?? 1000;
  const maxReconnect = options.maxReconnectMs ?? 30_000;

  let disposed = false;
  let control: RelaySocket | null = null;
  let reconnectMs = minReconnect;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  const wsChannels = new Map<string, RelaySocket>();

  const makeControl =
    options.socketFactory ?? ((url: string) => new WebSocket(url) as unknown as RelaySocket);
  const makeLocalWs =
    options.wsFactory ?? ((url: string) => new WebSocket(url) as unknown as RelaySocket);

  const send = (frame: RelayHostFrame) => control?.send(JSON.stringify(frame));

  const closeAllChannels = () => {
    for (const socket of wsChannels.values()) {
      try {
        socket.close();
      } catch {
        // ignore
      }
    }
    wsChannels.clear();
  };

  async function handleRequest(frame: RelayRequestFrame): Promise<void> {
    try {
      const body = frame.body === undefined ? undefined : Buffer.from(frame.body, "base64");
      // Drop hop-by-hop / relay-specific headers; the local fetch sets its own
      // host and content-length for the (re-encoded) body.
      const requestHeaders: Record<string, string> = {};
      for (const [key, value] of Object.entries(frame.headers)) {
        const lower = key.toLowerCase();
        if (lower === "host" || lower === "content-length" || lower === "connection") continue;
        requestHeaders[key] = value;
      }
      const response = await fetchImpl(`${localHttpBase}${frame.path}`, {
        method: frame.method,
        headers: requestHeaders,
        ...(body !== undefined ? { body } : {}),
      });
      const buffer = Buffer.from(await response.arrayBuffer());
      send({
        t: "res",
        id: frame.id,
        status: response.status,
        headers: headersToRecord(response.headers),
        body: buffer.toString("base64"),
      });
    } catch (error) {
      send({
        t: "req-error",
        id: frame.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  function handleWsOpen(frame: RelayWsOpenFrame): void {
    const local = makeLocalWs(`${localWsBase}${frame.path}`);
    wsChannels.set(frame.id, local);
    local.onmessage = (event) => send({ t: "ws-data", id: frame.id, data: String(event.data) });
    local.onclose = () => {
      if (wsChannels.delete(frame.id)) send({ t: "ws-close", id: frame.id });
    };
    local.onerror = () => {
      if (wsChannels.delete(frame.id)) {
        try {
          local.close();
        } catch {
          // ignore
        }
        send({ t: "ws-close", id: frame.id, reason: "local socket error" });
      }
    };
  }

  function handleFrame(raw: unknown): void {
    const parsed = relayServerFrameSchema.safeParse(
      typeof raw === "string" ? safeJsonParse(raw) : raw,
    );
    if (!parsed.success) return;
    const frame = parsed.data;
    switch (frame.t) {
      case "registered":
        options.onRegistered?.(frame.publicUrl);
        return;
      case "req":
        void handleRequest(frame);
        return;
      case "ws-open":
        handleWsOpen(frame);
        return;
      case "ws-data": {
        const socket = wsChannels.get(frame.id);
        socket?.send(frame.data);
        return;
      }
      case "ws-close": {
        const socket = wsChannels.get(frame.id);
        if (socket && wsChannels.delete(frame.id)) {
          try {
            socket.close();
          } catch {
            // ignore
          }
        }
        return;
      }
    }
  }

  function connect(): void {
    if (disposed) return;
    const socket = makeControl(options.relayUrl);
    control = socket;
    socket.onopen = () => {
      reconnectMs = minReconnect;
      send({
        t: "register",
        protocolVersion: LIGHTCODE_RELAY_PROTOCOL_VERSION,
        serverId: options.serverId,
        secret: options.secret,
        ...(options.label ? { label: options.label } : {}),
      });
    };
    socket.onmessage = (event) => {
      try {
        handleFrame(event.data);
      } catch (error) {
        options.reportError?.(error);
      }
    };
    socket.onerror = (error) => options.reportError?.(error);
    socket.onclose = () => {
      control = null;
      closeAllChannels();
      if (disposed) return;
      reconnectTimer = setTimeout(connect, reconnectMs);
      reconnectMs = Math.min(reconnectMs * 2, maxReconnect);
    };
  }

  connect();

  return {
    dispose() {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      closeAllChannels();
      try {
        control?.close();
      } catch {
        // ignore
      }
      control = null;
    },
  };
}

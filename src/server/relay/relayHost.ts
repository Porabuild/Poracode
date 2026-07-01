import { WebSocket } from "ws";
import { headersToRecord, readBoundedResponseBody } from "@/shared/http";
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
  /** Per-request timeout for proxying relay HTTP frames to the local server. */
  readonly requestTimeoutMs?: number;
  /** Maximum local HTTP response body to relay. */
  readonly maxBodyBytes?: number;
  /** Maximum inbound WebSocket payload accepted from the relay/local server. */
  readonly maxWebSocketPayloadBytes?: number;
  /**
   * Maximum bytes queued per outbound WebSocket before closing that socket.
   * Defaults to one configured max HTTP body after relay frame encoding.
   */
  readonly maxWebSocketOutboundBufferBytes?: number;
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
  readonly bufferedAmount?: number | undefined;
  readonly readyState?: number | undefined;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: ((error: unknown) => void) | null;
}

export interface RelayHostHandle {
  dispose(): void;
}

interface LocalWsChannel {
  readonly socket: RelaySocket;
  readonly control: RelaySocket;
  sendToLocal(data: string): void;
}

const DEFAULT_MAX_BODY_BYTES = 64 * 1024 * 1024;
const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
const WEB_SOCKET_OPEN = 1;

function relayHostWebSocketPayloadLimit(maxBodyBytes: number): number {
  return Math.ceil((maxBodyBytes * 4) / 3) + 1024 * 1024;
}

export function startRelayHost(options: RelayHostOptions): RelayHostHandle {
  const fetchImpl =
    options.fetchImpl ?? ((url: string | URL, init?: RequestInit) => fetch(url, init));
  const localHttpBase = options.localHttpUrl.replace(/\/+$/, "");
  const localWsBase = toWebSocketUrl(localHttpBase).toString().replace(/\/+$/, "");
  const minReconnect = options.minReconnectMs ?? 1000;
  const maxReconnect = options.maxReconnectMs ?? 30_000;
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const maxWebSocketPayloadBytes =
    options.maxWebSocketPayloadBytes ?? relayHostWebSocketPayloadLimit(maxBodyBytes);
  const maxWebSocketOutboundBufferBytes =
    options.maxWebSocketOutboundBufferBytes ?? relayHostWebSocketPayloadLimit(maxBodyBytes);

  let disposed = false;
  let control: RelaySocket | null = null;
  let reconnectMs = minReconnect;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  const wsChannels = new Map<string, LocalWsChannel>();

  const makeControl =
    options.socketFactory ??
    ((url: string) =>
      new WebSocket(url, { maxPayload: maxWebSocketPayloadBytes }) as unknown as RelaySocket);
  const makeLocalWs =
    options.wsFactory ??
    ((url: string) =>
      new WebSocket(url, { maxPayload: maxWebSocketPayloadBytes }) as unknown as RelaySocket);

  const closeSocket = (socket: RelaySocket): void => {
    try {
      socket.close();
    } catch {
      // ignore
    }
  };

  const sendRaw = (socket: RelaySocket, data: string): boolean => {
    if (
      (socket.bufferedAmount ?? 0) + Buffer.byteLength(data, "utf8") >
      maxWebSocketOutboundBufferBytes
    ) {
      closeSocket(socket);
      return false;
    }
    try {
      socket.send(data);
      return true;
    } catch (error) {
      options.reportError?.(error);
      closeSocket(socket);
      return false;
    }
  };

  const sendOn = (socket: RelaySocket, frame: RelayHostFrame): boolean =>
    sendRaw(socket, JSON.stringify(frame));

  const send = (frame: RelayHostFrame) => {
    if (control) sendOn(control, frame);
  };

  const closeAllChannels = () => {
    for (const channel of wsChannels.values()) {
      closeSocket(channel.socket);
    }
    wsChannels.clear();
  };

  async function handleRequest(
    frame: RelayRequestFrame,
    sourceControl: RelaySocket,
  ): Promise<void> {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timeoutError = new Error(`local request timed out after ${requestTimeoutMs}ms`);
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(timeoutError);
      }, requestTimeoutMs);
      timeout.unref?.();
    });
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
      const response = await Promise.race([
        fetchImpl(`${localHttpBase}${frame.path}`, {
          method: frame.method,
          headers: requestHeaders,
          signal: controller.signal,
          ...(body !== undefined ? { body } : {}),
        }),
        timeoutPromise,
      ]);
      const buffer = await Promise.race([
        readBoundedResponseBody(response, maxBodyBytes),
        timeoutPromise,
      ]);
      if (control === sourceControl) {
        sendOn(sourceControl, {
          t: "res",
          id: frame.id,
          status: response.status,
          headers: headersToRecord(response.headers),
          body: Buffer.from(buffer).toString("base64"),
        });
      }
    } catch (error) {
      const message =
        controller.signal.aborted && error !== timeoutError
          ? `local request timed out after ${requestTimeoutMs}ms`
          : error instanceof Error
            ? error.message
            : String(error);
      if (control === sourceControl) {
        sendOn(sourceControl, {
          t: "req-error",
          id: frame.id,
          message,
        });
      }
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  function handleWsOpen(frame: RelayWsOpenFrame, sourceControl: RelaySocket): void {
    let local: RelaySocket;
    try {
      local = makeLocalWs(`${localWsBase}${frame.path}`);
    } catch (error) {
      options.reportError?.(error);
      if (control === sourceControl) {
        sendOn(sourceControl, { t: "ws-close", id: frame.id, reason: "local socket error" });
      }
      return;
    }
    let localOpen = local.readyState === undefined || local.readyState === WEB_SOCKET_OPEN;
    let queuedBytes = 0;
    const queuedData: string[] = [];
    const closeRelayChannel = (reason = "local socket error"): void => {
      if (wsChannels.delete(frame.id)) {
        closeSocket(local);
        if (control === sourceControl) {
          sendOn(sourceControl, { t: "ws-close", id: frame.id, reason });
        }
      }
    };
    const sendToLocal = (data: string): void => {
      if (!localOpen) {
        queuedBytes += Buffer.byteLength(data, "utf8");
        if (queuedBytes > maxWebSocketOutboundBufferBytes) {
          closeRelayChannel();
          return;
        }
        queuedData.push(data);
        return;
      }
      if (!sendRaw(local, data)) {
        closeRelayChannel();
      }
    };
    const flushQueuedData = (): void => {
      if (!wsChannels.has(frame.id)) return;
      const pending = queuedData.splice(0);
      queuedBytes = 0;
      for (const data of pending) {
        if (!wsChannels.has(frame.id)) return;
        sendToLocal(data);
      }
    };
    wsChannels.set(frame.id, { socket: local, control: sourceControl, sendToLocal });
    local.onopen = () => {
      localOpen = true;
      flushQueuedData();
    };
    local.onmessage = (event) => {
      if (control === sourceControl) {
        if (!sendOn(sourceControl, { t: "ws-data", id: frame.id, data: String(event.data) })) {
          if (wsChannels.delete(frame.id)) closeSocket(local);
        }
      }
    };
    local.onclose = () => {
      if (wsChannels.delete(frame.id) && control === sourceControl) {
        sendOn(sourceControl, { t: "ws-close", id: frame.id });
      }
    };
    local.onerror = () => {
      closeRelayChannel();
    };
  }

  function handleFrame(raw: unknown, sourceControl: RelaySocket): void {
    const parsed = relayServerFrameSchema.safeParse(
      typeof raw === "string" ? safeJsonParse(raw) : raw,
    );
    if (!parsed.success) return;
    const frame = parsed.data;
    switch (frame.t) {
      case "registered":
        if (control === sourceControl) options.onRegistered?.(frame.publicUrl);
        return;
      case "req":
        void handleRequest(frame, sourceControl);
        return;
      case "ws-open":
        handleWsOpen(frame, sourceControl);
        return;
      case "ws-data": {
        const channel = wsChannels.get(frame.id);
        if (!channel) return;
        if (channel.control === sourceControl) {
          channel.sendToLocal(frame.data);
        }
        return;
      }
      case "ws-close": {
        const channel = wsChannels.get(frame.id);
        if (channel && wsChannels.delete(frame.id)) {
          closeSocket(channel.socket);
        }
        return;
      }
    }
  }

  function connect(): void {
    if (disposed) return;
    let socket: RelaySocket;
    try {
      socket = makeControl(options.relayUrl);
    } catch (error) {
      options.reportError?.(error);
      scheduleReconnect();
      return;
    }
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
        handleFrame(event.data, socket);
      } catch (error) {
        options.reportError?.(error);
      }
    };
    socket.onerror = (error) => options.reportError?.(error);
    socket.onclose = () => {
      if (control === socket) control = null;
      closeAllChannels();
      scheduleReconnect();
    };
  }

  function scheduleReconnect(): void {
    if (disposed) return;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, reconnectMs);
    reconnectMs = Math.min(reconnectMs * 2, maxReconnect);
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

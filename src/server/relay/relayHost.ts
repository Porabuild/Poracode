import { WebSocket } from "ws";
import { headersToRecord, readBoundedResponseBody } from "@/shared/http";
import { toWebSocketUrl } from "@/shared/remote";
import {
  DEFAULT_RELAY_MAX_BODY_BYTES,
  PORACODE_RELAY_PROTOCOL_VERSION,
  RELAY_FORWARD_SESSION_COOKIE_NAME,
  relayServerFrameSchema,
  relayWebSocketPayloadLimit,
  safeJsonParse,
  setCookiesInclude,
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
  /**
   * Dials the server's OWN local WebSocket endpoint for a relayed `ws-open`.
   * `headers` carries the visitor's (routing-cookie-stripped) `Cookie` header
   * when present, e.g. `Cookie: lc_forward=...` so a port-forwarded dev
   * server's session resolves exactly as a direct LAN WS upgrade would.
   */
  readonly wsFactory?: (url: string, headers?: Record<string, string>) => RelaySocket;
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

const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
const WEB_SOCKET_OPEN = 1;
const DROPPABLE_STREAM_SOFT_BUFFER_BYTES = 1_500_000;

function isDroppableStreamFrame(data: string): boolean {
  const parsed = safeJsonParse(data);
  if (!parsed || typeof parsed !== "object") return false;
  const type = (parsed as { type?: unknown }).type;
  return type === "terminal-output" || type === "browser-frame";
}

/**
 * Build the synthetic `x-forwarded-for` value the host forwards to its own
 * loopback server. relayProtocol.ts carries no visitor IP, so we stand in a
 * stable per-visitor-channel identifier (the relay's request/channel id). It is
 * prefixed so it can never be mistaken for or collide with a real client IP,
 * and so distinct visitor channels land in distinct rate-limit buckets instead
 * of collapsing into the single shared loopback bucket.
 */
function forwardedForIdentity(channelId: string): string {
  return `relay:${channelId}`;
}

export function startRelayHost(options: RelayHostOptions): RelayHostHandle {
  const fetchImpl =
    options.fetchImpl ?? ((url: string | URL, init?: RequestInit) => fetch(url, init));
  const localHttpBase = options.localHttpUrl.replace(/\/+$/, "");
  const localWsBase = toWebSocketUrl(localHttpBase).toString().replace(/\/+$/, "");
  const minReconnect = options.minReconnectMs ?? 1000;
  const maxReconnect = options.maxReconnectMs ?? 30_000;
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_RELAY_MAX_BODY_BYTES;
  const maxWebSocketPayloadBytes =
    options.maxWebSocketPayloadBytes ?? relayWebSocketPayloadLimit(maxBodyBytes);
  const maxWebSocketOutboundBufferBytes =
    options.maxWebSocketOutboundBufferBytes ?? relayWebSocketPayloadLimit(maxBodyBytes);
  const droppableStreamSoftBufferBytes = Math.min(
    DROPPABLE_STREAM_SOFT_BUFFER_BYTES,
    Math.floor(maxWebSocketOutboundBufferBytes / 2),
  );

  let disposed = false;
  let control: RelaySocket | null = null;
  let reconnectMs = minReconnect;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  const wsChannels = new Map<string, LocalWsChannel>();

  const defaultSocketFactory = (url: string): RelaySocket =>
    new WebSocket(url, { maxPayload: maxWebSocketPayloadBytes }) as unknown as RelaySocket;
  const defaultLocalWsFactory = (url: string, headers?: Record<string, string>): RelaySocket =>
    new WebSocket(url, {
      maxPayload: maxWebSocketPayloadBytes,
      ...(headers ? { headers } : {}),
    }) as unknown as RelaySocket;
  const makeControl = options.socketFactory ?? defaultSocketFactory;
  const makeLocalWs = options.wsFactory ?? defaultLocalWsFactory;

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
      // host and content-length for the (re-encoded) body. Also drop any
      // client-supplied x-forwarded-for so a visitor can't spoof its own bucket.
      const requestHeaders: Record<string, string> = {};
      for (const [key, value] of Object.entries(frame.headers)) {
        const lower = key.toLowerCase();
        if (
          lower === "host" ||
          lower === "content-length" ||
          lower === "connection" ||
          lower === "x-forwarded-for" ||
          // The hop to the local server is loopback, and `fetch` transparently
          // decodes whatever comes back — so forwarding the visitor's
          // `accept-encoding` would only make the origin spend CPU compressing
          // bytes this process immediately decompresses. The visitor's own hop
          // is compressed by the relay/WS transport instead.
          lower === "accept-encoding"
        )
          continue;
        requestHeaders[key] = value;
      }
      // The relay proxies every visitor request to the server's OWN loopback
      // port, so without this the server's pairing rate-limiter would collapse
      // all remote clients into one loopback bucket. relayProtocol.ts carries no
      // visitor address, so we forward a stable per-visitor-channel identifier
      // (the relay's per-request/-channel id) instead, giving distinct channels
      // distinct buckets. RemoteAccessServer reads x-forwarded-for's first hop.
      requestHeaders["x-forwarded-for"] = forwardedForIdentity(frame.id);
      const response = await Promise.race([
        fetchImpl(`${localHttpBase}${frame.path}`, {
          method: frame.method,
          headers: requestHeaders,
          signal: controller.signal,
          // The local server may reply with a 3xx (e.g. the port-forward
          // `/forward/<id>/enter` route redirecting to `/` after minting its
          // session cookie). Node's fetch (undici) only opaque-redirect-filters
          // "manual" responses when the request came from a Window/Document
          // context — a plain server-side fetch like this one gets the real
          // status/Location/Set-Cookie back, which is exactly what needs to
          // tunnel to the visitor unfollowed.
          redirect: "manual",
          ...(body !== undefined ? { body } : {}),
        }),
        timeoutPromise,
      ]);
      const buffer = await Promise.race([
        readBoundedResponseBody(response, maxBodyBytes),
        timeoutPromise,
      ]);
      // `headersToRecord` iterates the fetch `Headers` API generically, which
      // collapses/loses repeated `set-cookie` entries (the Headers API has no
      // reliable generic multi-value read for it) — so `set-cookie` is dropped
      // from the plain header record and sent separately via `getSetCookie()`,
      // the one API that returns every value intact.
      const responseHeaders = headersToRecord(response.headers);
      delete responseHeaders["set-cookie"];
      // `readBoundedResponseBody` reads the DECODED body (`fetch` undoes any
      // `content-encoding` transparently), so echoing the origin's
      // `content-encoding` would label plaintext bytes as gzip and the visitor
      // would fail to parse them. `content-length` describes the encoded body
      // and is equally stale. Both must go now that the origin can compress.
      delete responseHeaders["content-encoding"];
      delete responseHeaders["content-length"];
      const setCookies = response.headers.getSetCookie();
      if (control === sourceControl) {
        sendOn(sourceControl, {
          t: "res",
          id: frame.id,
          status: response.status,
          headers: responseHeaders,
          ...(setCookies.length > 0 ? { setCookies } : {}),
          // The relay reacts to this flag alone (never sniffs `setCookies`), so
          // the knowledge that this host mints a port-forward session cookie
          // lives here in the host adapter rather than in the transport.
          ...(setCookiesInclude(setCookies, RELAY_FORWARD_SESSION_COOKIE_NAME)
            ? { bindVisitor: true }
            : {}),
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
      local = makeLocalWs(
        `${localWsBase}${frame.path}`,
        frame.cookie ? { cookie: frame.cookie } : undefined,
      );
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
        const data = String(event.data);
        if (
          (sourceControl.bufferedAmount ?? 0) > droppableStreamSoftBufferBytes &&
          isDroppableStreamFrame(data)
        ) {
          return;
        }
        if (!sendOn(sourceControl, { t: "ws-data", id: frame.id, data })) {
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
        protocolVersion: PORACODE_RELAY_PROTOCOL_VERSION,
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

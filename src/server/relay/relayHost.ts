import { WebSocket } from "ws";
import { createRelayControlSocket } from "./relayControlSocket";
import { headersToRecord, readBoundedResponseBody } from "@/shared/http";
import { toWebSocketUrl } from "@/shared/remote";
import { decodeRelayBinaryFrame, encodeRelayBinaryFrame } from "@/shared/remote/relayBinaryFrame";
import {
  relayBinaryMessageLimit,
  RELAY_WS_PAYLOAD_TOO_LARGE_REASON,
} from "@/shared/remote/relayLimits";
import {
  DEFAULT_RELAY_MAX_BODY_BYTES,
  PORACODE_RELAY_PROTOCOL_VERSION,
  relayServerFrameSchema,
  relayWebSocketPayloadLimit,
  safeJsonParse,
  type RelayHostFrame,
  type RelayRequestFrame,
  type RelayWsOpenFrame,
  type RelayForwardContext,
  type RelayForwardOrigin,
} from "@/shared/remote/relayProtocol";
import { deriveForwardOwner, ForwardOriginPolicy } from "@/main/remote/portForward/forwardOrigin";

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
  readonly forwardOriginSecret?: string;
  /** Per-server internal dispatch key, shared only with its local HTTP handler. */
  readonly forwardDispatchKey?: string;
  onForwardOrigin?(origin: RelayForwardOrigin | null): void;
  readonly label?: string;
  /** The server's own loopback HTTP base, e.g. `http://127.0.0.1:38987`. */
  readonly localHttpUrl: string;
  /** Reconnect backoff bounds. */
  readonly minReconnectMs?: number;
  readonly maxReconnectMs?: number;
  /** Production control ping interval; missing a pong by the next interval reconnects. */
  readonly webSocketHeartbeatIntervalMs?: number;
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
   * when present, e.g. `Cookie: __Host-poracode-forward=...` so a port-forwarded dev
   * server's session resolves exactly as a direct LAN WS upgrade would.
   */
  readonly wsFactory?: (url: string, headers?: Record<string, string>) => RelaySocket;
}

/**
 * Minimal WebSocket shape used for both the host⇄relay control socket and the
 * host → own-server `/ws` sockets. Injectable so tests don't need a real socket.
 * Payloads are `string` (text frames) or `Uint8Array` (binary frames); ws's
 * browser-style `onmessage` delivers exactly these, so the text/binary type a
 * message arrives with is the type it is re-sent with.
 */
export interface RelaySocket {
  send(data: string | Uint8Array): void;
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
  sendToLocal(data: string | Uint8Array): void;
}

/**
 * One in-flight `req` frame being proxied to the local server. Kept so a relay
 * `req-cancel` (visitor went away, or the relay's deadline expired first) or
 * the loss of the control socket aborts the local fetch/body read instead of
 * letting it run to this host's own timeout. Bookkeeping only: aborting stops
 * TRANSPORT work — a backend mutation the local server already accepted is
 * never rolled back here.
 */
interface PendingLocalRequest {
  readonly controller: AbortController;
  timeout: ReturnType<typeof setTimeout>;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
const WEB_SOCKET_OPEN = 1;
const DROPPABLE_STREAM_SOFT_BUFFER_BYTES = 1_500_000;

function isDroppableStreamFrame(data: string): boolean {
  const parsed = safeJsonParse(data);
  if (!parsed || typeof parsed !== "object") return false;
  const type = (parsed as { type?: unknown }).type;
  return type === "browser-frame" || (type === "terminal-output" && !("cursorSync" in parsed));
}

/** Binary payloads from ws arrive as Buffers (a Uint8Array view); injectable
 * sockets may hand over plain ArrayBuffers. Returns null for anything that is
 * neither text nor a binary view — there is nothing faithful to forward. */
function toBinaryBytes(data: unknown): Uint8Array | null {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data))
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return null;
}

const RELAY_CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

/** Preserve one rate-limit bucket per relay network peer. Old relays share a
 * conservative bucket; request IDs would give each attempt a fresh limit. */
function forwardedForIdentity(clientId: string | undefined): string {
  return clientId && RELAY_CLIENT_ID_PATTERN.test(clientId) ? `relay:${clientId}` : "relay:legacy";
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
  // Peers use compatible receive limits; a larger outbound queue does not make
  // an oversized control frame acceptable to the receiver.
  const controlFrameLimit = Math.min(maxWebSocketPayloadBytes, maxWebSocketOutboundBufferBytes);
  const binaryMessageLimit = relayBinaryMessageLimit(controlFrameLimit);
  const droppableStreamSoftBufferBytes = Math.min(
    DROPPABLE_STREAM_SOFT_BUFFER_BYTES,
    Math.floor(maxWebSocketOutboundBufferBytes / 2),
  );

  let disposed = false;
  let control: RelaySocket | null = null;
  let forwardOrigin: { ownerId: string; policy: ForwardOriginPolicy } | undefined;
  const expectedOwner = options.forwardOriginSecret
    ? deriveForwardOwner(options.forwardOriginSecret, options.serverId)
    : undefined;
  let reconnectMs = minReconnect;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  const wsChannels = new Map<string, LocalWsChannel>();
  /** frame id → in-flight local request (see `PendingLocalRequest`). */
  const pendingRequests = new Map<string, PendingLocalRequest>();

  function forwardHeaders(forward: RelayForwardContext | undefined): Record<string, string> {
    if (!forward) return {};
    if (!forwardOrigin || !options.forwardDispatchKey)
      throw new Error("Forward routing unavailable.");
    if (
      forwardOrigin.policy.originFor(forwardOrigin.ownerId, forward.forwardId) !== forward.origin
    ) {
      throw new Error("Forward origin does not match registered ownership.");
    }
    return {
      "x-poracode-forward-key": options.forwardDispatchKey,
      "x-poracode-forward-id": forward.forwardId,
      "x-poracode-forward-origin": forward.origin,
    };
  }

  /**
   * Dispatch headers for an ordinary (non-forwarded) relay API request. The
   * visitor's own `x-poracode-forward-*` headers were stripped above, so the
   * key the local server sees is ours alone; `route: api` marks relay API
   * ingress so the host can select its registered relay origin (e.g. for
   * entry-token issuance) without mistaking the request for a browser
   * forward. Child (`forward`) requests keep the full id/origin triple from
   * `forwardHeaders`, ordinary WebSocket upgrades carry neither, and hosts
   * without a dispatch key send nothing — exactly as before.
   */
  const apiDispatchHeaders = (): Record<string, string> =>
    options.forwardDispatchKey
      ? {
          "x-poracode-forward-key": options.forwardDispatchKey,
          "x-poracode-forward-route": "api",
        }
      : {};

  const defaultSocketFactory = (url: string): RelaySocket =>
    createRelayControlSocket(
      url,
      maxWebSocketPayloadBytes,
      options.webSocketHeartbeatIntervalMs,
    ) as unknown as RelaySocket;
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

  const sendRaw = (socket: RelaySocket, data: string | Uint8Array): boolean => {
    // Buffer.byteLength counts UTF-8 bytes for strings and .byteLength for views.
    if ((socket.bufferedAmount ?? 0) + Buffer.byteLength(data) > maxWebSocketOutboundBufferBytes) {
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

  /** Abort one pending local request because the relay told us to (`req-cancel`:
   * the visitor disconnected, or the relay's deadline expired first). The
   * in-flight `handleRequest` observes the missing entry and stays quiet — no
   * `res`/`req-error` goes out for a canceled id. Unknown ids are a no-op so a
   * cancel that races a completion (or arrives from a stale relay) is inert. */
  const cancelPendingRequest = (id: string): void => {
    const entry = pendingRequests.get(id);
    if (!entry) return;
    pendingRequests.delete(id);
    clearTimeout(entry.timeout);
    entry.controller.abort();
  };

  /** The control socket is gone (closed, replaced, or the host was disposed):
   * nothing this socket's requests produced could reach the relay anymore, so
   * stop every local fetch it asked for rather than letting each one run to
   * its own timeout. */
  const abortAllPendingRequests = (): void => {
    for (const [id, entry] of pendingRequests) {
      pendingRequests.delete(id);
      clearTimeout(entry.timeout);
      entry.controller.abort();
    }
  };

  async function handleRequest(
    frame: RelayRequestFrame,
    sourceControl: RelaySocket,
  ): Promise<void> {
    const controller = new AbortController();
    const timeoutError = new Error(`local request timed out after ${requestTimeoutMs}ms`);
    let rejectTimedOut: (error: Error) => void = () => {};
    const timedOut = new Promise<never>((_, reject) => {
      rejectTimedOut = reject;
    });
    const entry: PendingLocalRequest = {
      controller,
      // Only the timeout path leaves the entry registered — the catch below
      // owns deleting it and answering `req-error`. A canceled request's entry
      // is already gone, so its timer (if not yet cleared) finds nothing to do.
      timeout: setTimeout(() => {
        if (pendingRequests.get(frame.id) === entry) {
          controller.abort();
          rejectTimedOut(timeoutError);
        }
      }, requestTimeoutMs),
    };
    pendingRequests.set(frame.id, entry);
    entry.timeout.unref?.();
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
          lower.startsWith("x-poracode-forward-") ||
          lower === "accept-encoding"
        )
          continue;
        requestHeaders[key] = value;
      }
      // Fetch adds gzip/deflate when this header is absent, then immediately
      // decodes the response. Explicit identity avoids that loopback work.
      requestHeaders["accept-encoding"] = "identity";
      // The loopback server trusts this relay-supplied identity. Visitor
      // forwarding headers were removed above so they cannot reset the limit.
      requestHeaders["x-forwarded-for"] = forwardedForIdentity(frame.clientId);
      Object.assign(
        requestHeaders,
        frame.forward ? forwardHeaders(frame.forward) : apiDispatchHeaders(),
      );
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
        timedOut,
      ]);
      const buffer = await Promise.race([
        readBoundedResponseBody(response, maxBodyBytes),
        timedOut,
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
      // The entry check suppresses a late response for a canceled request:
      // once `req-cancel`/control loss removed it, neither the visitor nor the
      // relay's pending entry exists anymore.
      if (pendingRequests.get(frame.id) === entry) {
        pendingRequests.delete(frame.id);
        if (control === sourceControl) {
          // P1-7: pre-measure the exact frame. The body is bounded by
          // maxBodyBytes, but base64 expansion, JSON escaping, and headers can
          // push the frame past the relay's receive limit — which would kill
          // the shared control socket for every channel and request. Fail this
          // one request instead.
          const resFrame = {
            t: "res" as const,
            id: frame.id,
            status: response.status,
            headers: responseHeaders,
            ...(setCookies.length > 0 ? { setCookies } : {}),
            body: Buffer.from(buffer).toString("base64"),
          };
          if (Buffer.byteLength(JSON.stringify(resFrame)) > controlFrameLimit) {
            sendOn(sourceControl, {
              t: "req-error",
              id: frame.id,
              message: "response too large for the relay link",
            });
            return;
          }
          sendOn(sourceControl, resFrame);
        }
      }
    } catch (error) {
      // A canceled request (or one whose control was lost, or the host
      // disposed) has no one left to answer: stay quiet instead of reporting
      // the abort as if it were a local failure.
      if (pendingRequests.get(frame.id) !== entry) return;
      pendingRequests.delete(frame.id);
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
      clearTimeout(entry.timeout);
    }
  }

  function handleWsOpen(frame: RelayWsOpenFrame, sourceControl: RelaySocket): void {
    const isEventStream = !frame.forward && frame.path.split("?")[0] === "/ws";
    // Dial the local server with the same stable per-visitor identity the
    // tunneled HTTP requests carry (cookies unchanged), so the server sees one
    // consistent client across a visitor's HTTP and WebSocket hops.
    let local: RelaySocket;
    try {
      const localHeaders: Record<string, string> = {
        "x-forwarded-for": forwardedForIdentity(frame.clientId),
        ...(frame.cookie ? { cookie: frame.cookie } : {}),
        ...forwardHeaders(frame.forward),
        ...(frame.forward ? { origin: frame.forward.origin } : {}),
      };
      local = makeLocalWs(`${localWsBase}${frame.path}`, localHeaders);
    } catch (error) {
      options.reportError?.(error);
      if (control === sourceControl) {
        sendOn(sourceControl, { t: "ws-close", id: frame.id, reason: "local socket error" });
      }
      return;
    }
    let localOpen = local.readyState === undefined || local.readyState === WEB_SOCKET_OPEN;
    let queuedBytes = 0;
    const queuedData: Array<string | Uint8Array> = [];
    const closeRelayChannel = (reason = "local socket error"): void => {
      if (wsChannels.delete(frame.id)) {
        closeSocket(local);
        if (control === sourceControl) {
          sendOn(sourceControl, { t: "ws-close", id: frame.id, reason });
        }
      }
    };
    const sendToLocal = (data: string | Uint8Array): void => {
      if (!localOpen) {
        queuedBytes += Buffer.byteLength(data);
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
      if (control !== sourceControl) return;
      const data = event.data;
      if (typeof data === "string") {
        // Text keeps the JSON ws-data frame. The droppable-stream soft cap
        // applies only here: it inspects known textual event shapes, and a
        // binary frame is opaque application payload that must never be
        // dropped for congestion.
        if (
          isEventStream &&
          (sourceControl.bufferedAmount ?? 0) > droppableStreamSoftBufferBytes &&
          isDroppableStreamFrame(data)
        ) {
          return;
        }
        // Measure the exact framed bytes before sending: JSON escaping can
        // expand a raw message past the control budget, and sendRaw treats
        // that as a control-socket failure. Oversize closes only this channel.
        const framed = JSON.stringify({ t: "ws-data", id: frame.id, data });
        if (Buffer.byteLength(framed) > controlFrameLimit) {
          closeRelayChannel(RELAY_WS_PAYLOAD_TOO_LARGE_REASON);
          return;
        }
        if (!sendRaw(sourceControl, framed)) {
          if (wsChannels.delete(frame.id)) closeSocket(local);
        }
        return;
      }
      const bytes = toBinaryBytes(data);
      if (!bytes) return;
      // Reserve the largest supported envelope even when this channel's id is
      // shorter. Reject beyond that binary payload budget on this channel only.
      if (bytes.byteLength > binaryMessageLimit) {
        closeRelayChannel(RELAY_WS_PAYLOAD_TOO_LARGE_REASON);
        return;
      }
      // The envelope re-frames this channel's id; ws-open validated it against
      // the codec's id rule (relayChannelIdSchema), so the encode cannot throw.
      if (!sendRaw(sourceControl, encodeRelayBinaryFrame(frame.id, bytes))) {
        if (wsChannels.delete(frame.id)) closeSocket(local);
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

  /** Deliver one ws-data payload to its channel. Only the CURRENT control
   * socket may feed a channel: a replaced control's late frames (or a decoded
   * envelope from one) must be inert. Unknown ids drop. */
  const routeWsData = (id: string, data: string | Uint8Array, sourceControl: RelaySocket): void => {
    const channel = wsChannels.get(id);
    if (channel && channel.control === sourceControl) {
      channel.sendToLocal(data);
    }
  };

  function handleFrame(raw: unknown, sourceControl: RelaySocket): void {
    if (control !== sourceControl) return;
    if (raw instanceof ArrayBuffer || ArrayBuffer.isView(raw)) {
      // Protocol 3: a binary control message is one ws-data payload framed by
      // relayBinaryFrame. Malformed or unknown-channel envelopes drop like any
      // unknown frame.
      const bytes = toBinaryBytes(raw);
      const decoded = bytes === null ? null : decodeRelayBinaryFrame(bytes);
      if (decoded) routeWsData(decoded.id, decoded.data, sourceControl);
      return;
    }
    const parsed = relayServerFrameSchema.safeParse(
      typeof raw === "string" ? safeJsonParse(raw) : raw,
    );
    if (!parsed.success) return;
    const frame = parsed.data;
    switch (frame.t) {
      case "registered": {
        try {
          if (frame.serverId !== options.serverId)
            throw new Error("Relay registered a different host.");
          if (
            frame.forwardOrigin &&
            (!options.forwardDispatchKey || frame.forwardOrigin.ownerId !== expectedOwner)
          ) {
            throw new Error("Relay forward origin ownership mismatch.");
          }
          forwardOrigin = frame.forwardOrigin
            ? {
                ownerId: frame.forwardOrigin.ownerId,
                policy: new ForwardOriginPolicy(frame.forwardOrigin.baseUrl),
              }
            : undefined;
        } catch (error) {
          forwardOrigin = undefined;
          closeAllChannels();
          closeSocket(sourceControl);
          options.onForwardOrigin?.(null);
          throw error;
        }
        options.onForwardOrigin?.(
          forwardOrigin
            ? { ownerId: forwardOrigin.ownerId, baseUrl: forwardOrigin.policy.baseUrl }
            : null,
        );
        options.onRegistered?.(frame.publicUrl);
        return;
      }
      case "req":
        void handleRequest(frame, sourceControl);
        return;
      case "req-cancel":
        cancelPendingRequest(frame.id);
        return;
      case "ws-open":
        handleWsOpen(frame, sourceControl);
        return;
      case "ws-data": {
        routeWsData(frame.id, frame.data, sourceControl);
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
        ...(options.forwardOriginSecret && options.forwardDispatchKey
          ? { originSecret: options.forwardOriginSecret }
          : {}),
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
      if (control !== socket) return;
      control = null;
      forwardOrigin = undefined;
      options.onForwardOrigin?.(null);
      closeAllChannels();
      abortAllPendingRequests();
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
      abortAllPendingRequests();
      closeAllChannels();
      forwardOrigin = undefined;
      options.onForwardOrigin?.(null);
      try {
        control?.close();
      } catch {
        // ignore
      }
      control = null;
    },
  };
}

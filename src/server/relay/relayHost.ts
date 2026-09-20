import { WebSocket } from "ws";
import { createRelayControlSocket } from "./relayControlSocket";
import { toWebSocketUrl } from "@/shared/remote";
import { relayBinaryMessageLimit } from "@/shared/remote/relayLimits";
import {
  DEFAULT_RELAY_MAX_BODY_BYTES,
  RELAY_RES_CHUNK_BYTES,
  relayWebSocketPayloadLimit,
  type RelayForwardOrigin,
} from "@/shared/remote/relayProtocol";
import { deriveForwardOwner } from "@/host/remote/portForward/forwardOrigin";
import { makeRelayChannelBinding } from "./relayChannelBinding";
import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  DROPPABLE_STREAM_SOFT_BUFFER_BYTES,
  type RelayHostRuntime,
} from "./relayHostTypes";
import { connectRelayHost, disposeRelayHost } from "./relayHostDial";

/**
 * Server-side relay adapter. Dials a relay, registers a server id, and proxies
 * each tunneled visitor request to the server's OWN loopback port — so
 * `RemoteAccessServer` is untouched and the device that connected through the
 * relay is served exactly as a direct LAN client would be. See
 * docs/REMOTE_ARCHITECTURE.md, Phase 5, and relayProtocol.ts.
 *
 * Channel binding (plan item 4.8, finding T7): the adapter rewrites the
 * `POST /oauth/token` response, replacing the raw access token with a
 * relay-bound credential (`relayChannelBinding.ts`). Bound credentials are
 * unwrapped back to the raw token here — only for tunneled traffic — so a
 * captured relay-issued bearer fails the server's own bearer check when
 * replayed directly, off the relay.
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

export function startRelayHost(options: RelayHostOptions): RelayHostHandle {
  const fetchImpl = options.fetchImpl ?? fetch;
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
  // Streaming slice bound: the constant default, clamped to what one control
  // frame can actually carry (base64 + JSON overhead) for deployments with
  // small configured limits.
  const resChunkBytes = Math.max(
    1_024,
    Math.min(RELAY_RES_CHUNK_BYTES, Math.floor(((controlFrameLimit - 4_096) * 3) / 4)),
  );
  const droppableStreamSoftBufferBytes = Math.min(
    DROPPABLE_STREAM_SOFT_BUFFER_BYTES,
    Math.floor(maxWebSocketOutboundBufferBytes / 2),
  );

  const expectedOwner = options.forwardOriginSecret
    ? deriveForwardOwner(options.forwardOriginSecret, options.serverId)
    : undefined;
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
  const forcedControlReserveBytes = Math.min(
    64 * 1024,
    Math.max(4 * 1024, maxWebSocketOutboundBufferBytes * 2),
  );

  const rt: RelayHostRuntime = {
    options,
    fetchImpl,
    localHttpBase,
    localWsBase,
    minReconnect,
    maxReconnect,
    requestTimeoutMs,
    maxBodyBytes,
    maxWebSocketPayloadBytes,
    maxWebSocketOutboundBufferBytes,
    controlFrameLimit,
    binaryMessageLimit,
    resChunkBytes,
    droppableStreamSoftBufferBytes,
    channelBinding: makeRelayChannelBinding({
      serverId: options.serverId,
      relaySecret: options.secret,
    }),
    expectedOwner,
    makeControl,
    makeLocalWs,
    forcedControlReserveBytes,
    disposed: false,
    control: null,
    httpStreamingEnabled: false,
    forwardOrigin: undefined,
    reconnectMs: minReconnect,
    reconnectTimer: null,
    wsChannels: new Map(),
    pendingRequests: new Map(),
    forcedControlBytes: 0,
  };

  connectRelayHost(rt);

  return {
    dispose() {
      disposeRelayHost(rt);
    },
  };
}

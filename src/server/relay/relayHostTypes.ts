import type { ForwardOriginPolicy } from "@/host/remote/portForward/forwardOrigin";
import { safeJsonParse, type RelayForwardContext } from "@/shared/remote/relayProtocol";
import type { RelayChannelBinding } from "./relayChannelBinding";
import type { RelayHostOptions, RelaySocket } from "./relayHost";

export interface LocalWsChannel {
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
export interface PendingLocalRequest {
  readonly controller: AbortController;
  timeout: ReturnType<typeof setTimeout>;
}

export const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
export const WEB_SOCKET_OPEN = 1;
export const DROPPABLE_STREAM_SOFT_BUFFER_BYTES = 1_500_000;
/** The token-exchange response this adapter rewrites is a small JSON document;
 * anything larger is not an exchange response and passes through untouched
 * (fail-closed: the rewrite only ever REPLACES the token it can prove). */
export const TOKEN_EXCHANGE_REWRITE_MAX_BYTES = 1_048_576;
/** The exchange route (src/shared/remote/contract/routes/session.ts). */
export const TOKEN_EXCHANGE_PATHNAME = "/oauth/token";

export interface RelayHostRuntime {
  readonly options: RelayHostOptions;
  readonly fetchImpl: typeof fetch;
  readonly localHttpBase: string;
  readonly localWsBase: string;
  readonly minReconnect: number;
  readonly maxReconnect: number;
  readonly requestTimeoutMs: number;
  readonly maxBodyBytes: number;
  readonly maxWebSocketPayloadBytes: number;
  readonly maxWebSocketOutboundBufferBytes: number;
  readonly controlFrameLimit: number;
  readonly binaryMessageLimit: number;
  readonly resChunkBytes: number;
  readonly droppableStreamSoftBufferBytes: number;
  readonly channelBinding: RelayChannelBinding;
  readonly expectedOwner: string | undefined;
  readonly makeControl: (url: string) => RelaySocket;
  readonly makeLocalWs: (url: string, headers?: Record<string, string>) => RelaySocket;
  readonly forcedControlReserveBytes: number;
  disposed: boolean;
  control: RelaySocket | null;
  httpStreamingEnabled: boolean;
  forwardOrigin: { ownerId: string; policy: ForwardOriginPolicy } | undefined;
  reconnectMs: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  readonly wsChannels: Map<string, LocalWsChannel>;
  readonly pendingRequests: Map<string, PendingLocalRequest>;
  forcedControlBytes: number;
}

export function isDroppableStreamFrame(data: string): boolean {
  const parsed = safeJsonParse(data);
  if (!parsed || typeof parsed !== "object") return false;
  const type = (parsed as { type?: unknown }).type;
  return type === "browser-frame" || (type === "terminal-output" && !("cursorSync" in parsed));
}

/** Binary payloads from ws arrive as Buffers (a Uint8Array view); injectable
 * sockets may hand over plain ArrayBuffers. Returns null for anything that is
 * neither text nor a binary view — there is nothing faithful to forward. */
export function toBinaryBytes(data: unknown): Uint8Array | null {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data))
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return null;
}

export function forwardHeaders(
  rt: RelayHostRuntime,
  forward: RelayForwardContext | undefined,
): Record<string, string> {
  if (!forward) return {};
  if (!rt.forwardOrigin || !rt.options.forwardDispatchKey)
    throw new Error("Forward routing unavailable.");
  if (
    rt.forwardOrigin.policy.originFor(rt.forwardOrigin.ownerId, forward.forwardId) !==
    forward.origin
  ) {
    throw new Error("Forward origin does not match registered ownership.");
  }
  return {
    "x-poracode-forward-key": rt.options.forwardDispatchKey,
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
export function apiDispatchHeaders(rt: RelayHostRuntime): Record<string, string> {
  return rt.options.forwardDispatchKey
    ? {
        "x-poracode-forward-key": rt.options.forwardDispatchKey,
        "x-poracode-forward-route": "api",
      }
    : {};
}

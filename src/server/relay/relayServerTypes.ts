import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Server, ServerResponse } from "node:http";
import type { WebSocket, WebSocketServer, RawData } from "ws";
import {
  isForwardOriginAuthority,
  type ForwardOriginPolicy,
} from "@/host/remote/portForward/forwardOrigin";
import { relayPublicUrl } from "@/shared/remote/relayProtocol";

/**
 * Self-hostable relay. A Poracode server dials `/host` and registers a server
 * id; devices reach it at `/s/<serverId>/…`. The relay forwards visitor HTTP +
 * WebSocket traffic to the registered host over a single framed control socket
 * (relayProtocol.ts). Application authentication is enforced by the host;
 * the relay authenticates server registration against its serverId claim.
 * The relay can read forwarded credentials and payloads and must be trusted.
 *
 * The account-scoped "cloud subscription" layer (mapping users → server ids,
 * billing, hosting) sits ON TOP of this and is out of repo scope.
 */
export interface RelayServerOptions {
  readonly host?: string;
  readonly port?: number;
  /** Public base URL advertised to hosts (so they can print a pairing link). */
  readonly publicBaseUrl?: string;
  /** Configured external HTTPS origin whose child hostnames serve forwards. */
  readonly forwardBaseUrl?: string;
  /** Per-request proxy timeout. */
  readonly requestTimeoutMs?: number;
  /** Server-side ping interval for pruning half-open host and visitor sockets. */
  readonly webSocketHeartbeatIntervalMs?: number;
  /** Maximum inbound WebSocket payload accepted by relay host/visitor sockets. */
  readonly maxWebSocketPayloadBytes?: number;
  /**
   * Maximum bytes queued per outbound relay WebSocket before dropping that
   * socket. Defaults to one configured max HTTP body after relay frame encoding.
   */
  readonly maxWebSocketOutboundBufferBytes?: number;
  /** Deadline for `/host` sockets to send their first register frame. */
  readonly hostRegistrationTimeoutMs?: number;
  readonly maxBodyBytes?: number;
  /**
   * How long a serverId→secret binding survives with no live host before the id
   * can be reclaimed by a different secret. The binding is durable across host
   * blips/reconnects (it is NOT cleared when the control socket closes); this
   * TTL only governs eventual reclamation of an abandoned id. Defaults to 24h.
   * Set to 0 to keep bindings until relay shutdown (no reclamation).
   */
  readonly secretBindingTtlMs?: number;
}

export interface RelayServerInfo {
  readonly url: string;
  readonly port: number;
}

export interface RegisteredHost {
  readonly control: WebSocket;
  readonly forwardOwnerId?: string;
  /**
   * P1-5: outbound bytes enqueued per visitor channel on the SHARED control
   * socket since the buffer last fully drained. Identifies the flood source
   * for channel-only eviction so congestion never has to kill the control
   * socket (and every other channel + request with it).
   */
  readonly channelBytes: Map<string, number>;
  /** Bytes consumed from the bounded reserve for terminal control notices. */
  forcedControlBytes: number;
}

/**
 * Durable serverId→secret binding, independent of the live control socket. It
 * survives host disconnects/reconnects so an attacker who knows a public
 * serverId cannot claim it with a different secret while the legitimate host is
 * briefly offline. `lastSeenAt` seeds TTL-based reclamation of abandoned ids.
 */
export interface SecretBinding {
  readonly secret: string;
  lastSeenAt: number;
}

export interface PendingRequest {
  readonly serverId: string;
  readonly clientId: string;
  timer: ReturnType<typeof setTimeout>;
  /**
   * Streaming state, present once the request was dispatched and the visitor
   * response object exists. Until `res-open` arrives (or a buffered `res`
   * resolves the request) only the timer/reject machinery is live; after it,
   * `res-chunk` frames write through `res` under the bounded-buffer policy
   * and the timer is an idle deadline rearmed by every chunk.
   */
  stream?: {
    res: ServerResponse;
    opened: boolean;
  };
  resolve(
    result:
      | {
          status: number;
          headers: Record<string, string>;
          body: Buffer;
          setCookies?: string[];
        }
      | { streamed: true },
  ): void;
  reject(error: Error): void;
}

export interface VisitorChannel {
  readonly serverId: string;
  readonly socket: WebSocket;
  readonly clientId: string;
}

/**
 * Slow-consumer bound for a streaming response: the visitor socket's own
 * writable buffer (Node streams buffer internally when the peer stops
 * reading). Past this, the response is destroyed and the host work canceled —
 * one stalled visitor must never buffer unboundedly on the relay.
 */
export const RELAY_STREAM_MAX_BUFFERED_BYTES = 1024 * 1024;

/**
 * P1-8: per-owner admission caps. One clientId (a stable socket-peer identity)
 * can hold at most 16 concurrent relayed HTTP requests and 32 open channels;
 * the whole relay bounds pending requests globally. Over-cap HTTP gets 429 and
 * an over-cap channel upgrade gets 1013, so one visitor cannot monopolize the
 * shared host link.
 */
export const RELAY_MAX_PENDING_PER_CLIENT = 16;
export const RELAY_MAX_PENDING_TOTAL = 256;
export const RELAY_MAX_CHANNELS_PER_CLIENT = 32;

/** The only 502 bodies a visitor can ever see: the deliberate transport
 * verdicts. Anything else (internal exception text) becomes "relay error". */
export const SAFE_RELAY_502_TEXTS = new Set([
  "Host disconnected.",
  "server offline",
  "Relay request timed out.",
  "Visitor disconnected.",
  "request too large for the relay link",
  "response too large for the relay link",
]);

export const DEFAULT_REQUEST_TIMEOUT_MS = 60_000;
export const DEFAULT_WEBSOCKET_HEARTBEAT_INTERVAL_MS = 30_000;
export const DEFAULT_HOST_REGISTRATION_TIMEOUT_MS = 10_000;
export const DEFAULT_SECRET_BINDING_TTL_MS = 24 * 60 * 60 * 1000;

export interface RelayServerRuntime {
  readonly options: RelayServerOptions;
  readonly now: () => number;
  readonly server: Server;
  readonly wss: WebSocketServer;
  readonly hosts: Map<string, RegisteredHost>;
  readonly forwardOwners: Map<string, string>;
  readonly forwardPolicy: ForwardOriginPolicy | null;
  readonly secretBindings: Map<string, SecretBinding>;
  readonly pending: Map<string, PendingRequest>;
  readonly visitors: Map<string, VisitorChannel>;
  readonly socketLiveness: Map<WebSocket, boolean>;
  readonly visitorIdSalt: Buffer;
  heartbeatTimer: ReturnType<typeof setInterval> | null;
  info: RelayServerInfo | null;
  readonly outboundBufferLimit: number;
  readonly forcedControlReserveBytes: number;
  readonly controlFrameLimit: number;
  readonly binaryMessageLimit: number;
}

/** A received ws message as bytes: ws delivers one Buffer per message for the
 * default `nodebuffer` binaryType, fragments for `binaryType: "fragments"`,
 * or an ArrayBuffer for `binaryType: "arraybuffer"`. Returns a view, not a
 * copy, on the hot path. */
export function asBytes(data: RawData): Uint8Array {
  if (Array.isArray(data)) return Buffer.concat(data);
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return data;
}

/** Derive a stable, opaque identity from the socket peer, never its headers.
 * Peers behind one proxy share a bucket; forwarded headers require a separate
 * trusted-proxy policy. Normalize mapped IPv4 so both address forms agree. */
export function relayVisitorClientId(salt: Buffer, remoteAddress: string | undefined): string {
  const raw = remoteAddress ?? "unknown";
  const normalized = raw.startsWith("::ffff:") ? raw.slice("::ffff:".length) : raw;
  return createHmac("sha256", salt).update(normalized).digest("hex").slice(0, 32);
}

export function normalizePublicBaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("PORACODE_RELAY_PUBLIC_BASE_URL must be an absolute http(s) URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("PORACODE_RELAY_PUBLIC_BASE_URL must be an absolute http(s) URL.");
  }
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/+$/, "");
}

/** Length-independent compare: digest both, then timingSafeEqual, then lengths. */
export function secretsMatch(left: string, right: string): boolean {
  const leftDigest = createHash("sha256").update(left).digest();
  const rightDigest = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest) && left.length === right.length;
}

export function isForwardHostname(rt: RelayServerRuntime, authority: string): boolean {
  return (
    isForwardOriginAuthority(authority) || rt.forwardPolicy?.containsHostname(authority) === true
  );
}

/** Visitor-facing base URL for a server id (what a device points its client at). */
export function publicUrlFor(rt: RelayServerRuntime, serverId: string): string {
  const base =
    rt.info?.url ??
    (rt.options.publicBaseUrl
      ? normalizePublicBaseUrl(rt.options.publicBaseUrl)
      : "http://127.0.0.1");
  return relayPublicUrl(base, serverId);
}

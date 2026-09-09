import { z } from "zod";
import { encodeRelayBinaryFrame } from "./relayBinaryFrame";

/**
 * Relay transport for cross-network access (docs/REMOTE_ARCHITECTURE.md, Phase
 * 5). A Poracode server behind NAT dials OUT to a relay and registers under a
 * server id; a device points its endpoint at `https://<relay>/s/<serverId>/`
 * and the relay tunnels its HTTP + WebSocket traffic to the registered server.
 *
 * This module defines the framing for the single persistent control socket
 * between a server ("host") and the relay. Visitor⇄relay traffic stays plain
 * HTTP/WS — the relay translates it into these frames — so neither the client
 * nor `RemoteAccessServer` needs relay-specific code: the host adapter simply
 * proxies each framed request to the server's own loopback port.
 *
 * The host enforces application authentication. The relay terminates visitor
 * HTTP/WS and can read forwarded credentials and application payloads, so it
 * must be trusted; this framing does not provide end-to-end encryption. The
 * registration secret prevents another process from hijacking a serverId.
 *
 * NOTE: this is the self-hostable transport. The managed, account-scoped
 * "cloud subscription" service (hosting, billing, per-account routing) layers on
 * top and is out of repo scope.
 *
 * Compatibility discipline: while the version is unchanged, frames are added
 * ONLY additively — a new relay→host frame type must be one an older host can
 * drop silently (the framed unions are parsed with `safeParse`, so an unknown
 * discriminator is discarded), and a new host→relay frame must be droppable by
 * an older relay the same way. `req-cancel` followed that rule in v2 (see its
 * doc); anything that changes the meaning of an existing frame requires a
 * version bump at `PORACODE_RELAY_PROTOCOL_VERSION`.
 *
 * Version 3 (binary ws-data fidelity): protocol 2 carried EVERY `ws-data`
 * payload inside the JSON text frame, which UTF-8-coerces binary WebSocket
 * messages (U+FFFD rewriting, inflated bodies, binary delivered as text).
 * Protocol 3 carries binary payloads as binary control-socket messages framed
 * by `relayBinaryFrame.ts` and keeps text payloads on the unchanged JSON
 * frame. The bump is deliberate, not additive: a protocol-2 peer cannot
 * preserve these semantics, so mixed pairing must FAIL at registration — a
 * v3 host's `register` literal is rejected by an old relay, and an old host's
 * `register` literal is rejected here — instead of silently corrupting bytes.
 */
export const PORACODE_RELAY_PROTOCOL_VERSION = 3;

const relayHttpsOriginSchema = z
  .string()
  .url()
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && url.origin === value;
    } catch {
      return false;
    }
  }, "Expected a canonical HTTPS origin.");

/** Relay-derived routing context; visitor headers never supply these fields. */
export const relayForwardContextSchema = z.object({
  forwardId: z.string().regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/),
  origin: relayHttpsOriginSchema,
});
export type RelayForwardContext = z.infer<typeof relayForwardContextSchema>;

export const relayForwardOriginSchema = z.object({
  baseUrl: relayHttpsOriginSchema,
  ownerId: z.string().regex(/^[a-f0-9]{24}$/),
});
export type RelayForwardOrigin = z.infer<typeof relayForwardOriginSchema>;

/** Default cap on a single tunneled HTTP body (request or response) in bytes. */
export const DEFAULT_RELAY_MAX_BODY_BYTES = 64 * 1024 * 1024;

export function relayWebSocketPayloadLimit(maxBodyBytes: number): number {
  // Host HTTP responses are base64 encoded inside a JSON frame over the relay
  // control socket. Leave room for JSON/header overhead around the encoded body.
  return Math.ceil((maxBodyBytes * 4) / 3) + 1024 * 1024;
}

/** Host → relay: claim a server id on this control socket. */
export const relayRegisterFrameSchema = z.object({
  t: z.literal("register"),
  protocolVersion: z.literal(PORACODE_RELAY_PROTOCOL_VERSION),
  serverId: z.string().min(1),
  /** Shared secret proving ownership of `serverId` (prevents hijacking). */
  secret: z.string().min(1),
  /** Dedicated random32-byte namespace secret, independent of the relay password. */
  originSecret: z
    .string()
    .regex(/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/)
    .optional(),
  label: z.string().min(1).optional(),
});

/** Relay → host: registration accepted; `publicUrl` is the visitor base URL. */
export const relayRegisteredFrameSchema = z.object({
  t: z.literal("registered"),
  serverId: z.string().min(1),
  publicUrl: z.string().url(),
  forwardOrigin: relayForwardOriginSchema.optional(),
});

/** Relay → host: a visitor HTTP request to proxy to the local server. */
export const relayRequestFrameSchema = z.object({
  t: z.literal("req"),
  id: z.string().min(1),
  method: z.string().min(1),
  /** Path + query, relative to the server root (the `/s/<id>` prefix stripped). */
  path: z.string().startsWith("/"),
  headers: z.record(z.string(), z.string()),
  forward: relayForwardContextSchema.optional(),
  /** base64 request body, omitted when empty. */
  body: z.string().optional(),
  /** Socket-derived opaque identity, stable across requests from one network
   * peer. Hosts use a shared fallback for absent or unusable identities.
   * Additive in v1: old hosts strip this field; old relays omit it. Updated
   * hosts are required to enforce stable rate-limit buckets. */
  clientId: z.string().min(1).max(128).optional(),
});

/** Host → relay: the response for a `req` frame. */
export const relayResponseFrameSchema = z.object({
  t: z.literal("res"),
  id: z.string().min(1),
  status: z.number().int(),
  headers: z.record(z.string(), z.string()),
  /**
   * Raw `Set-Cookie` header values, one entry each. The fetch `Headers` API
   * collapses/loses multiple `set-cookie` entries when iterated generically
   * (see `headers` above, which is built with a plain iteration and so must
   * never be trusted for cookies), so the host populates this separately from
   * `response.headers.getSetCookie()`. Additive/optional so older hosts that
   * don't send it still work (just without cookie passthrough).
   */
  setCookies: z.array(z.string()).optional(),
  /** base64 response body. */
  body: z.string(),
});

/** Host → relay: the request could not be served locally. */
export const relayRequestErrorFrameSchema = z.object({
  t: z.literal("req-error"),
  id: z.string().min(1),
  message: z.string(),
});

/**
 * Relay → host: stop working on the pending `req` with this id — the visitor
 * went away (its connection closed before the relay could deliver a response)
 * or the relay's own request deadline expired first. This aborts the local
 * fetch/body read only; the host must NOT assume the visitor never received
 * anything, and no already-accepted backend mutation is rolled back by it.
 *
 * Additive in protocol 2: hosts that predate this frame drop it silently (the
 * discriminated union's `safeParse` fails on the unknown `t`), and older
 * relays never send it — in that pairing an aborted visitor's request still
 * unwinds via the host's own request timeout, exactly as before. New hosts
 * handle both worlds, so no version bump.
 */
export const relayRequestCancelFrameSchema = z.object({
  t: z.literal("req-cancel"),
  id: z.string().min(1),
});

/**
 * A relay WebSocket channel id, bounded by the protocol-3 binary envelope's
 * own id rule. The host re-encodes a channel's id into every binary payload
 * envelope (`encodeRelayBinaryFrame`), so the id must be exactly what the
 * codec accepts — 1..128 UTF-8 bytes of well-formed UTF-8. Checked by calling
 * the codec itself so the two boundaries cannot drift (zod's `string().max`
 * counts UTF-16 code units, NOT UTF-8 bytes, and would silently under-count
 * astral ids). Request-frame ids (`req`/`res`/`req-error`) are a separate,
 * pre-existing protocol and stay unbounded.
 */
const relayChannelIdSchema = z.string().refine((value) => {
  try {
    encodeRelayBinaryFrame(value, new Uint8Array(0));
    return true;
  } catch {
    return false;
  }
});

/**
 * Relay → host: a visitor opened a WebSocket.
 *
 * The channel id is validated against the binary envelope's own id rule: the
 * host re-encodes this id into every binary payload envelope it sends, so a
 * channel id the envelope cannot carry would make that encode throw from
 * inside the local socket's message callback. An invalid id drops the whole
 * `ws-open` frame before any channel exists.
 */
export const relayWsOpenFrameSchema = z.object({
  t: z.literal("ws-open"),
  id: relayChannelIdSchema,
  /** Path + query (e.g. `/ws?ticket=...`). */
  path: z.string().startsWith("/"),
  forward: relayForwardContextSchema.optional(),
  /**
   * The visitor's raw `Cookie` header, forwarded so the host's own local
   * WebSocket connection (e.g. a port-forwarded dev server reached through an
   * `__Host-poracode-forward` session) can resolve
   * session auth exactly as a direct LAN WS upgrade would. The relay's own
   * `RELAY_ROUTING_COOKIE_NAME` cookie is stripped before this is populated.
   * Omitted when the visitor sent no cookies.
   */
  cookie: z.string().optional(),
  /**
   * The relay's socket-derived opaque visitor identity, same contract as on
   * `req` frames (see above). Lets the host dial its own server's WebSocket
   * with the same stable `x-forwarded-for` the visitor's HTTP requests carry,
   * so one visitor reads as one client across both hops. Additive/optional;
   * old relays omit it.
   */
  clientId: z.string().min(1).max(128).optional(),
});

/**
 * Bidirectional: a WebSocket TEXT frame for channel `id`. Binary WebSocket
 * payloads do NOT ride this frame — JSON strings cannot carry them losslessly
 * (UTF-8 coercion rewrites invalid sequences). Since protocol 3, binary
 * payloads travel as binary control-socket messages framed by
 * `encodeRelayBinaryFrame`/`decodeRelayBinaryFrame` (relayBinaryFrame.ts).
 */
export const relayWsDataFrameSchema = z.object({
  t: z.literal("ws-data"),
  id: z.string().min(1),
  data: z.string(),
});

/** Bidirectional: close the WebSocket channel `id`. */
export const relayWsCloseFrameSchema = z.object({
  t: z.literal("ws-close"),
  id: z.string().min(1),
  reason: z.string().optional(),
});

export const relayHostFrameSchema = z.discriminatedUnion("t", [
  relayRegisterFrameSchema,
  relayResponseFrameSchema,
  relayRequestErrorFrameSchema,
  relayWsDataFrameSchema,
  relayWsCloseFrameSchema,
]);
export type RelayHostFrame = z.infer<typeof relayHostFrameSchema>;

export const relayServerFrameSchema = z.discriminatedUnion("t", [
  relayRegisteredFrameSchema,
  relayRequestFrameSchema,
  relayRequestCancelFrameSchema,
  relayWsOpenFrameSchema,
  relayWsDataFrameSchema,
  relayWsCloseFrameSchema,
]);
export type RelayServerFrame = z.infer<typeof relayServerFrameSchema>;

export type RelayRequestFrame = z.infer<typeof relayRequestFrameSchema>;
export type RelayRequestCancelFrame = z.infer<typeof relayRequestCancelFrameSchema>;
export type RelayResponseFrame = z.infer<typeof relayResponseFrameSchema>;
export type RelayWsOpenFrame = z.infer<typeof relayWsOpenFrameSchema>;
export type RelayWsDataFrame = z.infer<typeof relayWsDataFrameSchema>;
export type RelayWsCloseFrame = z.infer<typeof relayWsCloseFrameSchema>;

/** Build the visitor-facing base URL for a registered server id. */
export function relayPublicUrl(relayBaseUrl: string, serverId: string): string {
  const base = new URL(relayBaseUrl);
  const prefix = base.pathname.replace(/\/+$/, "");
  base.pathname = `${prefix}/s/${encodeURIComponent(serverId)}/`;
  return base.toString();
}

/** `JSON.parse` that returns null instead of throwing (for framed sockets). */
export function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/** Parse `/s/<serverId>/<rest>` → { serverId, path }. Returns null if no match. */
export function parseRelayVisitorPath(
  pathname: string,
): { readonly serverId: string; readonly path: string } | null {
  const match = /^\/s\/([^/]+)(\/.*)?$/.exec(pathname);
  if (!match) return null;
  let serverId: string;
  try {
    serverId = decodeURIComponent(match[1]!);
  } catch {
    return null;
  }
  if (!serverId) return null;
  return { serverId, path: match[2] && match[2].length > 0 ? match[2] : "/" };
}

/** Legacy cookie names retained only to strip stale routing credentials. */
export const RELAY_FORWARD_SESSION_COOKIE_NAME = "lc_forward";
export const RELAY_ROUTING_COOKIE_NAME = "lc_relay";

/**
 * Removes a single named cookie crumb from a raw `Cookie` header, leaving any
 * other cookies intact. Returns `undefined` when nothing is left (or nothing
 * was passed in).
 */
export function stripCookieCrumb(
  cookieHeader: string | undefined,
  name: string,
): string | undefined {
  if (!cookieHeader) return undefined;
  const remaining = cookieHeader
    .split(";")
    .map((crumb) => crumb.trim())
    .filter((crumb) => {
      const eq = crumb.indexOf("=");
      const key = eq === -1 ? crumb : crumb.slice(0, eq);
      return key !== name;
    });
  return remaining.length > 0 ? remaining.join("; ") : undefined;
}

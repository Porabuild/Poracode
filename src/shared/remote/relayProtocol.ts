import { z } from "zod";

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
 * Auth is unchanged and end-to-end: the relay never sees pairing/bearer secrets
 * in cleartext beyond forwarding the Authorization header, and the host's
 * registration secret only prevents another process from hijacking a serverId.
 *
 * NOTE: this is the self-hostable transport. The managed, account-scoped
 * "cloud subscription" service (hosting, billing, per-account routing) layers on
 * top and is out of repo scope.
 */
export const PORACODE_RELAY_PROTOCOL_VERSION = 1;

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
  label: z.string().min(1).optional(),
});

/** Relay → host: registration accepted; `publicUrl` is the visitor base URL. */
export const relayRegisteredFrameSchema = z.object({
  t: z.literal("registered"),
  serverId: z.string().min(1),
  publicUrl: z.string().url(),
});

/** Relay → host: a visitor HTTP request to proxy to the local server. */
export const relayRequestFrameSchema = z.object({
  t: z.literal("req"),
  id: z.string().min(1),
  method: z.string().min(1),
  /** Path + query, relative to the server root (the `/s/<id>` prefix stripped). */
  path: z.string().min(1),
  headers: z.record(z.string(), z.string()),
  /** base64 request body, omitted when empty. */
  body: z.string().optional(),
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
  /**
   * Set by the host when the visitor's browser should be bound to this host for
   * subsequent prefixless requests (the host mints its own port-forward session
   * cookie in this response). The relay reacts to this flag alone and mints its
   * `RELAY_ROUTING_COOKIE_NAME` routing cookie — it does NOT inspect `setCookies`
   * for the forward-session cookie itself, keeping all port-forward semantics in
   * the host adapter (relayHost.ts) rather than the transport. Additive/optional
   * so older hosts that don't send it still work (just without prefixless
   * routing). */
  bindVisitor: z.boolean().optional(),
  /** base64 response body. */
  body: z.string(),
});

/** Host → relay: the request could not be served locally. */
export const relayRequestErrorFrameSchema = z.object({
  t: z.literal("req-error"),
  id: z.string().min(1),
  message: z.string(),
});

/** Relay → host: a visitor opened a WebSocket. */
export const relayWsOpenFrameSchema = z.object({
  t: z.literal("ws-open"),
  id: z.string().min(1),
  /** Path + query (e.g. `/ws?ticket=...`). */
  path: z.string().min(1),
  /**
   * The visitor's raw `Cookie` header, forwarded so the host's own local
   * WebSocket connection (e.g. a port-forwarded dev server reached through an
   * `lc_forward` session, see `RELAY_FORWARD_SESSION_COOKIE_NAME`) can resolve
   * session auth exactly as a direct LAN WS upgrade would. The relay's own
   * `RELAY_ROUTING_COOKIE_NAME` cookie is stripped before this is populated.
   * Omitted when the visitor sent no cookies.
   */
  cookie: z.string().optional(),
});

/** Bidirectional: a WebSocket text frame for channel `id`. */
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
  relayWsOpenFrameSchema,
  relayWsDataFrameSchema,
  relayWsCloseFrameSchema,
]);
export type RelayServerFrame = z.infer<typeof relayServerFrameSchema>;

export type RelayRequestFrame = z.infer<typeof relayRequestFrameSchema>;
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

/**
 * The desktop's port-forward proxy session cookie (see
 * `src/main/remote/portForward/portProxy.ts`'s `FORWARD_SESSION_COOKIE_NAME`).
 * Duplicated here rather than imported: this module is shared with the
 * standalone self-hosted relay server, which does not depend on `src/main`.
 * Keep the literal in sync if the desktop's cookie name ever changes.
 *
 * Consumed by the HOST adapter (`src/server/relay/relayHost.ts`), NOT the relay:
 * the host detects it in a tunneled response's `Set-Cookie` and signals the
 * relay via the response frame's `bindVisitor` flag to mint its own routing
 * cookie. The relay itself never inspects this cookie, so all port-forward
 * semantics stay in the host adapter that owns the local server's behavior.
 */
export const RELAY_FORWARD_SESSION_COOKIE_NAME = "lc_forward";

/**
 * The relay's own routing cookie. Minted by the relay itself (never by a
 * host) the first time it observes `RELAY_FORWARD_SESSION_COOKIE_NAME` roll by
 * in a tunneled response, binding the visitor's browser to the `serverId` that
 * issued it. This lets prefixless requests/upgrades (e.g. Vite/webpack HMR
 * assets and sockets that don't carry the `/s/<id>` prefix) still route to the
 * right host. Always stripped from the `Cookie` header before a request is
 * framed to a host — hosts never need to see it.
 */
export const RELAY_ROUTING_COOKIE_NAME = "lc_relay";

/** Extracts a single cookie's value from a raw `Cookie` request header. */
export function parseCookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const crumb of cookieHeader.split(";")) {
    const eq = crumb.indexOf("=");
    if (eq === -1) continue;
    const key = crumb.slice(0, eq).trim();
    if (key !== name) continue;
    const value = crumb.slice(eq + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return null;
}

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

/** True when one of the raw `Set-Cookie` header values names cookie `name`. */
export function setCookiesInclude(
  setCookies: readonly string[] | undefined,
  name: string,
): boolean {
  if (!setCookies) return false;
  return setCookies.some((raw) => {
    const eq = raw.indexOf("=");
    const key = (eq === -1 ? raw : raw.slice(0, eq)).trim();
    return key === name;
  });
}

/**
 * Builds the `Set-Cookie` header the relay mints to bind a visitor's browser
 * to `serverId` for prefixless requests (see `RELAY_ROUTING_COOKIE_NAME`). No
 * `Secure` attribute: the relay listens plain HTTP behind a fronting TLS
 * proxy, so `Secure` would make browsers drop the cookie entirely. 12h
 * lifetime matches the desktop's own forward-session TTL.
 *
 * Known limitation (accepted v2 behavior, not a bug): this cookie is
 * `Path=/`, unscoped to a `serverId`, and shares its name across every host
 * registered on this relay origin. If two desktops (A and B) are paired
 * through the *same* relay origin and a browser has tabs open to both, then
 * opening a forward on B overwrites the browser's `lc_forward`/`lc_relay`
 * cookie jar entries that were pointing at A — there is no way to shard a
 * single cookie name per host with prefixless routing on one origin. A's
 * still-open tab keeps working against whatever forward/session was current
 * when it last loaded, then degrades (stale session, wrong upstream) until
 * the user reloads it — after which it too follows B, since the jar now only
 * remembers B. Last-enter-wins, and it self-heals on reload. Scoping relay
 * origins per-account/per-desktop (rather than sharing one relay origin
 * across independent desktops) avoids the collision entirely; that's expected
 * to be the common case, so this is not being fixed for v2.
 */
export function buildRelayRoutingCookieHeader(serverId: string): string {
  return `${RELAY_ROUTING_COOKIE_NAME}=${encodeURIComponent(serverId)}; Max-Age=43200; Path=/; HttpOnly; SameSite=Lax`;
}

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import {
  RELAY_FORWARD_SESSION_COOKIE_NAME,
  RELAY_ROUTING_COOKIE_NAME,
} from "@/shared/remote/relayProtocol";
import type { ForwardLifetime } from "../RemotePortForwardGateway";
import { FORWARD_ORIGIN_SESSION_COOKIE_NAME } from "../portForward/portProxy";
import {
  isHopByHopHeader,
  proxyLoopbackHttpRequest,
  proxyLoopbackWebSocketUpgrade,
} from "./loopbackProxy";

/**
 * The reserved internal-dispatch header namespace (`x-poracode-forward-*`,
 * see `forwardOriginDispatch`). These headers carry the host's trusted
 * dispatch credential and context and are CONSUMED by dispatch authentication
 * — they are internal metadata, never application payload, so both outgoing
 * proxy paths strip every one of them (known names included) and a forwarded
 * dev server can never observe the dispatch key. (Node lowercases inbound
 * header names.)
 */
export const FORWARD_DISPATCH_HEADER_PREFIX = "x-poracode-forward-";

export function isReservedDispatchHeader(name: string): boolean {
  return name.toLowerCase().startsWith(FORWARD_DISPATCH_HEADER_PREFIX);
}

/**
 * Poracode's own credential cookies, stripped from proxied traffic in BOTH
 * directions (request `Cookie` header and upstream `Set-Cookie` response):
 * the isolated child-origin proxy session, the removed legacy shared-origin
 * session (browsers may still carry it), and the relay's routing cookie.
 * Upstream responses can therefore never mint or overwrite Poracode's proxy
 * credentials, and internal dispatch credentials never ride a forwarded
 * request upstream. Filtering is case-sensitive per cookie-name rules.
 *
 * Ordinary application cookies pass through untouched. Known deployment gate
 * (docs/PORT_FORWARD_ORIGIN_ISOLATION.md): sibling hostnames do NOT stop an
 * upstream application's JavaScript from setting a `Domain=parent` cookie —
 * full per-app cookie isolation requires a private-public-suffix tenant base.
 */
export const RESERVED_PROXY_COOKIE_NAMES: ReadonlySet<string> = new Set([
  FORWARD_ORIGIN_SESSION_COOKIE_NAME,
  RELAY_FORWARD_SESSION_COOKIE_NAME,
  RELAY_ROUTING_COOKIE_NAME,
]);

/** Exact-case cookie name from one raw `Set-Cookie`/`Cookie` crumb. */
function cookieName(crumb: string): string {
  const eq = crumb.indexOf("=");
  return (eq === -1 ? crumb : crumb.slice(0, eq)).trim();
}

/** Removes every reserved Poracode cookie crumb from a raw `Cookie` header,
 * leaving ordinary application cookies intact. Returns `undefined` when
 * nothing is left (or nothing was passed in). One pass over the crumbs so a
 * reserved crumb is removed even when it is the ONLY one. */
export function stripReservedProxyCookies(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  const remaining = cookieHeader
    .split(";")
    .map((crumb) => crumb.trim())
    .filter((crumb) => !RESERVED_PROXY_COOKIE_NAMES.has(cookieName(crumb)));
  return remaining.length > 0 ? remaining.join("; ") : undefined;
}

/** Filters reserved Poracode cookie names out of an upstream `Set-Cookie`
 * header array so a forwarded application can never create or overwrite the
 * proxy session (case-sensitive, per cookie-name rules). */
export function filterReservedProxySetCookies(setCookies: readonly string[]): string[] {
  return setCookies.filter((raw) => !RESERVED_PROXY_COOKIE_NAMES.has(cookieName(raw)));
}

/**
 * Builds the `Set-Cookie` header for a freshly-minted forward session on the
 * forward's isolated HTTPS child origin. The `__Host-` prefix makes browsers
 * enforce `Secure`, `Path=/` and the absence of `Domain` — the cookie is bound
 * to that exact origin and can never be scoped to a parent or set over plain
 * HTTP.
 */
export function buildForwardOriginSessionCookieHeader(sessionId: string, maxAgeMs: number): string {
  const maxAgeSeconds = Math.max(0, Math.floor(maxAgeMs / 1000));
  return `${FORWARD_ORIGIN_SESSION_COOKIE_NAME}=${sessionId}; Max-Age=${maxAgeSeconds}; Path=/; Secure; HttpOnly; SameSite=Lax`;
}

/**
 * Builds the upstream request headers shared by the plain-HTTP and WS-upgrade
 * proxy paths: `Host` is rewritten to `localhost:<targetPort>` (Vite/Next
 * `allowedHosts` and HMR origin checks key off it), reserved Poracode cookies
 * are stripped from the forwarded `Cookie` header (other cookies pass
 * through), and internal dispatch metadata is dropped — it was consumed by
 * dispatch authentication and must never reach the (untrusted) upstream. The
 * plain-HTTP path additionally drops hop-by-hop headers; the upgrade path
 * preserves them (`connection`/`upgrade` are exactly what the upstream needs
 * to complete the handshake).
 */
function buildUpstreamRequestHeaders(
  req: IncomingMessage,
  targetPort: number,
  options: { readonly forUpgrade?: boolean } = {},
): Record<string, string | string[]> {
  const headers: Record<string, string | string[]> = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    const lower = name.toLowerCase();
    if (lower === "host" || isReservedDispatchHeader(lower)) continue;
    if (!options.forUpgrade && isHopByHopHeader(lower)) continue;
    if (lower === "cookie") {
      const raw = Array.isArray(value) ? value.join("; ") : value;
      const stripped = stripReservedProxyCookies(raw);
      if (stripped) headers.cookie = stripped;
      continue;
    }
    headers[name] = value;
  }
  headers.host = `localhost:${targetPort}`;
  return headers;
}

/**
 * Reverse-proxies one child-origin HTTP request to the target port on
 * loopback through the shared {@link proxyLoopbackHttpRequest} core: unbuffered
 * both ways, revocation-owned, reserved `Set-Cookie` names filtered, and
 * hop-by-hop headers dropped in both directions.
 */
export async function proxyForwardedHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  lifetime: ForwardLifetime,
): Promise<void> {
  await proxyLoopbackHttpRequest(req, res, lifetime, {
    headers: (request) => buildUpstreamRequestHeaders(request, lifetime.targetPort),
    keepResponseHeader: (name) => !isHopByHopHeader(name),
    setCookie: filterReservedProxySetCookies,
    badGatewayMessage: "Bad Gateway: the forwarded dev server is not reachable.",
  });
}

/**
 * Reverse-proxies a child-origin WebSocket upgrade to the target port on
 * loopback through the shared {@link proxyLoopbackWebSocketUpgrade} core. The
 * port-forward path dials the target root (`/`): only the forwarded app's
 * origin socket is proxied, and reserved Poracode `Set-Cookie` names are
 * filtered from the parsed handshake while every other header rides verbatim.
 */
export async function proxyForwardedWebSocketUpgrade(
  req: IncomingMessage,
  clientSocket: Duplex,
  head: Buffer,
  lifetime: ForwardLifetime,
): Promise<void> {
  await proxyLoopbackWebSocketUpgrade(req, clientSocket, head, lifetime, {
    headers: (request) =>
      buildUpstreamRequestHeaders(request, lifetime.targetPort, { forUpgrade: true }),
    setCookie: filterReservedProxySetCookies,
  });
}

import { request as httpRequest, type IncomingMessage, type ServerResponse } from "node:http";
import { type Socket } from "node:net";
import { pipeline, type Duplex } from "node:stream";
import {
  connectLoopback,
  orderedLoopbackHosts,
  rememberLoopbackHost,
  type LoopbackHost,
} from "../portForward/loopback";
import { stripCookieCrumb } from "@/shared/remote/relayProtocol";
import { FORWARD_SESSION_COOKIE_NAME } from "../portForward/portProxy";
import { writeText } from "./httpResponses";

/** Headers that must never be copied verbatim across a hop (RFC 7230 §6.1),
 * plus `upgrade`/`connection` since the plain-HTTP proxy path never upgrades
 * (the WS proxy path in this module handles upgrades separately and preserves
 * these deliberately). */
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "te",
  "trailer",
]);

function isHopByHopHeader(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.startsWith("proxy-") || HOP_BY_HOP_HEADERS.has(lower);
}

/**
 * Path prefixes/exact paths `handleHttp` already routes explicitly. The proxy
 * fallthrough only ever runs for a request that fell through every route
 * above it, but a request under one of these can still reach the bottom of
 * that function without an explicit `return` — this list makes sure such a
 * request 404s instead of silently being proxied to a forwarded dev server.
 *
 * `/assets/` is deliberately NOT reserved here: an active `lc_forward` session
 * wins over the bundled canonical client for that prefix (see `handleHttp`'s
 * `/assets/` branch, which proxies to the forward before ever trying
 * `tryServeBuiltClientApp`), so this list must not also cause it to 404 in the
 * fallthrough when no earlier branch returned.
 */
const RESERVED_EXACT_PATHS = new Set([
  "/",
  "/index.html",
  "/mobile.html",
  "/ws",
  "/pair",
  "/app",
  "/desktop",
  "/forward",
  "/manifest.webmanifest",
  "/service-worker.js",
  "/app-icon.svg",
]);
const RESERVED_PATH_PREFIXES = [
  "/api/",
  "/oauth/",
  "/.well-known/",
  "/forward/",
  "/app/",
  "/desktop/",
];

export function isReservedForwardProxyPath(pathname: string): boolean {
  if (RESERVED_EXACT_PATHS.has(pathname)) return true;
  return RESERVED_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Builds the `Set-Cookie` header for a freshly-minted forward session.
 * Deliberately no `Secure` (must round-trip over plain LAN http) and no
 * `Domain` (must work behind an https reverse proxy on a different host than
 * the desktop binds to) — see {@link FORWARD_SESSION_COOKIE_NAME}.
 */
export function buildForwardSessionCookieHeader(sessionId: string, maxAgeMs: number): string {
  const maxAgeSeconds = Math.max(0, Math.floor(maxAgeMs / 1000));
  return `${FORWARD_SESSION_COOKIE_NAME}=${sessionId}; Max-Age=${maxAgeSeconds}; Path=/; HttpOnly; SameSite=Lax`;
}

/**
 * Reverse-proxies one HTTP request to the target port on loopback,
 * unbuffered: request body streams to the upstream dev server as it arrives,
 * and the upstream's response streams back as it arrives. `Host` is rewritten
 * to `localhost:<targetPort>` (Vite/Next `allowedHosts` and HMR origin checks
 * key off it), the `lc_forward` session cookie is stripped from the forwarded
 * `Cookie` header (other cookies pass through), and hop-by-hop headers are
 * dropped in both directions.
 *
 * Tries `127.0.0.1` first, then falls back to `::1` (cached family first, see
 * {@link orderedLoopbackHosts}) — a dev server bound to the bare hostname
 * `localhost` can end up IPv6-only. The request body is only piped to the
 * upstream once its socket has actually connected, so on a connect failure
 * `req` is guaranteed untouched and safe to retry against the next family; a
 * failure once connected (or after every family has been tried) yields a
 * plain-text 502.
 */
export function proxyForwardedHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  targetPort: number,
): void {
  const headers: Record<string, string | string[]> = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined || isHopByHopHeader(name)) continue;
    if (name.toLowerCase() === "cookie") {
      const raw = Array.isArray(value) ? value.join("; ") : value;
      const stripped = stripCookieCrumb(raw, FORWARD_SESSION_COOKIE_NAME);
      if (stripped) headers.cookie = stripped;
      continue;
    }
    headers[name] = value;
  }
  headers.host = `localhost:${targetPort}`;

  const sendBadGateway = () => {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    writeText(
      res,
      502,
      "Bad Gateway: the forwarded dev server is not reachable.",
      "text/plain; charset=utf-8",
    );
  };

  let current: ReturnType<typeof httpRequest> | undefined;
  // The client disconnecting mid-request must not leave the upstream
  // connection dangling, whichever attempt/family is currently in flight.
  res.on("close", () => current?.destroy());

  const attempt = (hosts: readonly LoopbackHost[], index: number): void => {
    const host = hosts[index]!;
    const upstreamReq = httpRequest(
      { host, port: targetPort, method: req.method, path: req.url, headers },
      (upstreamRes) => {
        rememberLoopbackHost(targetPort, host);
        const responseHeaders: Record<string, string | string[]> = {};
        for (const [name, value] of Object.entries(upstreamRes.headers)) {
          if (value === undefined || isHopByHopHeader(name)) continue;
          responseHeaders[name] = value;
        }
        res.writeHead(upstreamRes.statusCode ?? 502, responseHeaders);
        // `pipeline` (unlike bare `.pipe()`) forwards an error from either
        // side by destroying the other, so an upstream response reset or the
        // client disconnecting mid-download can't leave a dangling stream or
        // an unhandled 'error' event.
        pipeline(upstreamRes, res, () => {});
      },
    );
    current = upstreamReq;

    let connected = false;
    const pipeBody = () => {
      connected = true;
      // Same rationale as the response side above: a bare
      // `req.pipe(upstreamReq)` never forwards a client-request stream error
      // (e.g. an aborted upload or malformed chunked body), which would
      // otherwise be an unhandled 'error' on `req` — a crash vector.
      // `pipeline` destroys `upstreamReq` on any `req` error instead.
      pipeline(req, upstreamReq, () => {});
    };
    upstreamReq.once("socket", (socket: Socket) => {
      if (!socket.connecting && !socket.destroyed) {
        pipeBody();
        return;
      }
      socket.once("connect", pipeBody);
    });

    upstreamReq.on("error", () => {
      if (!connected && index + 1 < hosts.length) {
        attempt(hosts, index + 1);
        return;
      }
      sendBadGateway();
    });
  };

  attempt(orderedLoopbackHosts(targetPort), 0);
}

/**
 * Reverse-proxies a non-`/ws` upgrade (WebSocket handshake) request to the
 * target port on loopback — this is what makes Vite/webpack HMR (and any
 * other app-level WebSocket) work through the authenticated proxy path. Opens
 * a raw TCP connection via {@link connectLoopback} (tries `127.0.0.1` then
 * falls back to `::1`, cached family first, since a dev server bound to the
 * bare hostname `localhost` can end up IPv6-only), reconstructs the HTTP
 * upgrade request line + headers (rewriting `Host`, stripping the
 * `lc_forward` cookie crumb, and otherwise forwarding headers verbatim —
 * `connection`/`upgrade`/`sec-websocket-*` pass through unmodified since they
 * are exactly what the upstream needs to complete the handshake), replays any
 * already-buffered `head` bytes, then pipes both sockets bidirectionally.
 * Either side erroring or closing tears down both.
 */
export function proxyForwardedWebSocketUpgrade(
  req: IncomingMessage,
  clientSocket: Duplex,
  head: Buffer,
  targetPort: number,
): void {
  let settled = false;
  let upstream: Socket | undefined;
  const teardown = () => {
    if (settled) return;
    settled = true;
    clientSocket.destroy();
    upstream?.destroy();
  };
  clientSocket.on("error", teardown);
  clientSocket.on("close", teardown);

  connectLoopback(targetPort)
    .then((connection) => {
      // The client (or the whole upgrade) may have torn down while the
      // outbound connect/fallback was in flight.
      if (settled) {
        connection.socket.destroy();
        return;
      }
      upstream = connection.socket;
      upstream.on("error", teardown);
      upstream.on("close", teardown);

      const lines: string[] = [`${req.method} ${req.url} HTTP/1.1`];
      for (const [name, value] of Object.entries(req.headers)) {
        if (value === undefined) continue;
        const lower = name.toLowerCase();
        if (lower === "host") continue;
        if (lower === "cookie") {
          const raw = Array.isArray(value) ? value.join("; ") : value;
          const stripped = stripCookieCrumb(raw, FORWARD_SESSION_COOKIE_NAME);
          if (stripped) lines.push(`Cookie: ${stripped}`);
          continue;
        }
        for (const single of Array.isArray(value) ? value : [value]) {
          lines.push(`${name}: ${single}`);
        }
      }
      lines.push(`Host: localhost:${targetPort}`);
      upstream.write(`${lines.join("\r\n")}\r\n\r\n`);
      if (head.length > 0) upstream.write(head);
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    })
    .catch(teardown);
}

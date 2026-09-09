import {
  request as httpRequest,
  type ClientRequest,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { type Socket } from "node:net";
import { pipeline, type Duplex } from "node:stream";
import {
  orderedLoopbackHosts,
  rememberLoopbackHost,
  type LoopbackHost,
} from "../portForward/loopback";
import {
  RELAY_FORWARD_SESSION_COOKIE_NAME,
  RELAY_ROUTING_COOKIE_NAME,
} from "@/shared/remote/relayProtocol";
import type { ForwardLifetime } from "../RemotePortForwardGateway";
import { FORWARD_ORIGIN_SESSION_COOKIE_NAME } from "../portForward/portProxy";
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
 * loopback, unbuffered: request body streams to the upstream dev server as it
 * arrives, and the upstream's response streams back as it arrives. Reserved
 * cookie names are filtered from upstream `Set-Cookie`, and hop-by-hop headers
 * are dropped in both directions (see {@link buildUpstreamRequestHeaders}).
 *
 * The whole request rides `lifetime` (see {@link ForwardLifetime}): if the
 * forward stops mid-connect, mid-fallback, or mid-stream, both legs are
 * destroyed and the family fallback is abandoned; a lifetime already aborted
 * on entry never dials the target. The abort registration is released when
 * the response closes. Upstream dials go through `lifetime.agent` — the
 * forward's private keep-alive pool, never the shared global agent, whose
 * idle sockets would outlive the forward that created them.
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
  lifetime: ForwardLifetime,
): void {
  const { targetPort, signal, agent } = lifetime;
  const headers = buildUpstreamRequestHeaders(req, targetPort);

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
  // Forward revocation tears down both legs synchronously with `stopForward`;
  // destroying `current` here too leaves no window where the attempt chain
  // could consider a fallback family.
  const onRevoke = (): void => {
    res.destroy();
    current?.destroy();
  };
  // A forward stopped between session resolution and this call must not attach.
  if (signal.aborted) {
    res.destroy();
    return;
  }
  signal.addEventListener("abort", onRevoke, { once: true });

  // The client disconnecting mid-request must not leave the upstream
  // connection dangling, whichever attempt/family is in flight; it also ends
  // this operation, releasing the revocation registration.
  res.on("close", () => {
    signal.removeEventListener("abort", onRevoke);
    current?.destroy();
  });

  const attempt = (hosts: readonly LoopbackHost[], index: number): void => {
    const host = hosts[index]!;
    const upstreamReq = httpRequest(
      { host, port: targetPort, method: req.method, path: req.url, headers, agent },
      (upstreamRes) => {
        rememberLoopbackHost(targetPort, host);
        const responseHeaders: Record<string, string | string[]> = {};
        for (const [name, value] of Object.entries(upstreamRes.headers)) {
          if (value === undefined || isHopByHopHeader(name)) continue;
          if (name === "set-cookie") {
            const filtered = filterReservedProxySetCookies(Array.isArray(value) ? value : [value]);
            if (filtered.length > 0) responseHeaders[name] = filtered;
            continue;
          }
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
      // Revocation or the client going away destroyed this request out from
      // under the attempt chain — neither is a connect failure: never fall
      // back to the next family, and there is nobody left to answer 502.
      if (signal.aborted || res.destroyed) return;
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
 * Reverse-proxies a child-origin WebSocket upgrade to the target port on
 * loopback — this is what makes Vite/webpack HMR (and any other app-level
 * WebSocket, `/ws` included) work on the forward's isolated origin.
 *
 * The upstream handshake is issued through Node's HTTP client (upgrade
 * semantics, `agent: false` — an upgrade socket must never be pooled), so the
 * 101 — or the upstream's non-101 rejection — is a fully PARSED response,
 * never an opaque byte pipe. The parsed handshake is re-serialized to the
 * visitor with reserved Poracode `Set-Cookie` names filtered out (a forwarded
 * application can never mint proxy credentials through its own handshake)
 * while `sec-websocket-accept` and every other header ride verbatim, keeping
 * the handshake verifiable. After the handshake the raw socket pair is piped
 * bidirectionally with any buffered `head` bytes replayed, so WebSocket
 * frames stay byte-transparent. Request headers go through
 * {@link buildUpstreamRequestHeaders} (Host rewrite, reserved-cookie stripping,
 * dispatch-metadata stripping) with `connection`/`upgrade`/`sec-websocket-*`
 * preserved.
 *
 * The whole operation — pending dial included — is revoked when `lifetime`
 * aborts (forward stopped, gateway disposed): teardown destroys the visitor
 * socket and the upstream request/socket exactly once. A client that goes
 * away cancels its own pending dial the same way, without touching the
 * forward's shared signal, which other proxy operations are riding. A
 * lifetime already aborted on entry never dials the target. Connect attempts
 * try `127.0.0.1` then fall back to `::1` (cached family first, see
 * {@link orderedLoopbackHosts}) — a dev server bound to the bare hostname
 * `localhost` can end up IPv6-only — and a connect failure is retried only
 * while nothing has been answered yet, so an established connection can never
 * be re-dialed against another family.
 */
export function proxyForwardedWebSocketUpgrade(
  req: IncomingMessage,
  clientSocket: Duplex,
  head: Buffer,
  lifetime: ForwardLifetime,
): void {
  const { targetPort, signal } = lifetime;
  let settled = false;
  /** The upstream answered (101 or rejection): no more family fallbacks. */
  let answered = false;
  let upstream: Socket | undefined;
  let upstreamReq: ClientRequest | undefined;

  const teardown = (): void => {
    if (settled) return;
    settled = true;
    signal.removeEventListener("abort", onRevoke);
    // Normal destroy (FIN) on both legs. The proxy releases its handle and
    // the peer observes the half-close; what the peer then does with its own
    // write half (an `http.Server` socket defaults to `allowHalfOpen`) is peer
    // policy, not proxy-owned state. RST is deliberately not used — it would
    // discard queued final bytes and change close semantics.
    clientSocket.destroy();
    upstreamReq?.destroy();
    upstream?.destroy();
  };
  const onRevoke = (): void => teardown();
  signal.addEventListener("abort", onRevoke);
  clientSocket.on("error", teardown);
  clientSocket.on("close", teardown);
  // `abort` doesn't dispatch retroactively: a forward stopped between session
  // resolution and this upgrade must not attach — or dial — at all.
  if (signal.aborted) {
    teardown();
    return;
  }

  /** Re-serializes the parsed upstream handshake/rejection to the visitor,
   * filtering reserved cookie names from `rawHeaders` pairwise (order and
   * multiplicity of every other header preserved). Returns the status code. */
  const writeParsedResponse = (res: IncomingMessage): number => {
    answered = true;
    const lines = [`HTTP/1.1 ${res.statusCode} ${res.statusMessage ?? ""}`.trimEnd()];
    for (let index = 0; index < res.rawHeaders.length; index += 2) {
      const name = res.rawHeaders[index]!;
      const value = res.rawHeaders[index + 1]!;
      if (name.toLowerCase() === "set-cookie") {
        if (!RESERVED_PROXY_COOKIE_NAMES.has(cookieName(value))) lines.push(`${name}: ${value}`);
        continue;
      }
      lines.push(`${name}: ${value}`);
    }
    clientSocket.write(`${lines.join("\r\n")}\r\n\r\n`);
    return res.statusCode ?? 0;
  };

  const attempt = (hosts: readonly LoopbackHost[], index: number): void => {
    if (settled) return;
    const host = hosts[index]!;
    const upgradeReq = httpRequest({
      host,
      port: targetPort,
      agent: false,
      headers: buildUpstreamRequestHeaders(req, targetPort, { forUpgrade: true }),
    });
    upstreamReq = upgradeReq;

    upgradeReq.once("upgrade", (res, socket, handshakeHead) => {
      rememberLoopbackHost(targetPort, host);
      if (settled) {
        socket.destroy();
        return;
      }
      if (writeParsedResponse(res) !== 101) {
        // Node only emits 'upgrade' for a 101; anything else is a protocol
        // violation — fail closed rather than piping an unvalidated stream.
        teardown();
        return;
      }
      upstream = socket;
      socket.on("error", teardown);
      socket.on("close", teardown);
      if (handshakeHead.length > 0) clientSocket.write(handshakeHead);
      if (head.length > 0) socket.write(head);
      socket.pipe(clientSocket);
      clientSocket.pipe(socket);
    });

    upgradeReq.once("response", (res) => {
      // Non-101: the upstream refused the upgrade. Relay the parsed rejection
      // (reserved cookies filtered) plus its error body, then end the visitor
      // leg — its WS client reports the unexpected status itself. The
      // client-socket 'close' listener drives the final teardown.
      rememberLoopbackHost(targetPort, host);
      if (settled) return;
      writeParsedResponse(res);
      res.on("error", teardown);
      res.pipe(clientSocket);
      res.on("end", () => clientSocket.end());
    });

    upgradeReq.on("error", () => {
      // Revocation or the client going away destroyed this request out from
      // under the attempt chain — neither is a connect failure: never fall
      // back, and there is nobody left to answer.
      if (settled || answered) return;
      if (index + 1 < hosts.length) {
        attempt(hosts, index + 1);
        return;
      }
      teardown();
    });

    upgradeReq.end();
  };

  attempt(orderedLoopbackHosts(targetPort), 0);
}

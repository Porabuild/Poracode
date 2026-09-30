import {
  request as httpRequest,
  type Agent,
  type ClientRequest,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { type Socket } from "node:net";
import { pipeline, type Duplex } from "node:stream";
import { AsyncWorkTracker } from "@/shared/asyncWorkTracker";
import {
  orderedLoopbackHosts,
  rememberLoopbackHost,
  type LoopbackHost,
} from "../portForward/loopback";
import { writeText } from "./httpResponses";

/**
 * The shared loopback reverse-proxy core.
 *
 * Both consumers (the browser port-forward child-origin proxy and the
 * environment parent proxy) forward to a loopback target over an owned
 * lifetime: every stream rides an abort signal that fires synchronously on
 * revocation, dials go through a private keep-alive agent, the `127.0.0.1` →
 * `::1` family fallback is shared, and both directions pipe without buffering.
 * Only the per-consumer policy differs:
 *
 * - how the upstream request path and header set are built (Host rewrite,
 *   cookie stripping, internal-header stripping, hop-by-hop handling),
 * - which upstream response headers reach the visitor (`set-cookie` policy,
 *   CORS authority),
 * - an optional bounded replacement of small JSON responses (the environment
 *   descriptor rewrite).
 *
 * The public port-forward entry points (`portForwardProxy.ts`) are thin
 * wrappers over this module, so both paths share one proxy implementation —
 * never a parallel stack.
 */

/** The narrow lifetime both consumers must supply. Structurally satisfied by
 * `ForwardLifetime` (port forwarding) and by the environment proxy's
 * per-leg handle, so revocation and pool ownership stay with each owner. */
export interface LoopbackProxyLifetime {
  readonly targetPort: number;
  readonly signal: AbortSignal;
  /** The owner's private keep-alive pool. Idle sockets never outlive the
   * owner; revocation destroys the owner's agent separately. */
  readonly agent: Agent;
  /** The loopback family this owner's own listener shadows, if any — excluded
   * from the dial fallback chain so the proxy can never dial itself. */
  readonly shadowedLoopback?: LoopbackHost | null;
}

/** A fully buffered upstream response used by a bounded transform. */
export interface LoopbackProxyReplacement {
  readonly status: number;
  readonly headers: Record<string, string | string[]>;
  readonly body: Buffer;
}

/** Hop-by-hop headers (RFC 7230 §6.1) plus `upgrade`/`connection`, which the
 * plain-HTTP path never forwards (the WS path preserves them deliberately). */
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "te",
  "trailer",
]);

export function isHopByHopHeader(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.startsWith("proxy-") || HOP_BY_HOP_HEADERS.has(lower);
}

export interface LoopbackProxyResponsePolicy {
  /**
   * Whether one streamed upstream response header is copied to the visitor.
   * Defaults to dropping hop-by-hop headers; `set-cookie` is handled by
   * {@link setCookie} instead.
   */
  readonly keepResponseHeader?: (name: string, value: string | string[]) => boolean;
  /**
   * Filters `set-cookie` values on both the streamed response path and the
   * parsed WS handshake. Return `null` or an empty array to drop the header
   * entirely. Defaults to passing every value through.
   */
  readonly setCookie?: (values: readonly string[]) => readonly string[] | null;
  /**
   * Optional filter for the PARSED WebSocket responses (the 101 handshake and
   * any non-101 rejection). It complements {@link keepResponseHeader}, which
   * only governs the streamed HTTP path: an upgrade's required headers
   * (`connection`, `upgrade`, `sec-websocket-accept`) must always ride
   * verbatim, so a consumer uses this only to drop response policy headers
   * such as a child's `access-control-*`. Unset keeps the historical
   * pass-through behavior (both port-forward consumers).
   */
  readonly keepUpgradeResponseHeader?: (name: string, value: string) => boolean;
}

export interface LoopbackProxyRequestPlan extends LoopbackProxyResponsePolicy {
  /** Upstream path for one HTTP request. Defaults to the visitor's raw URL. */
  readonly httpPath?: (req: IncomingMessage) => string;
  /** Upstream path for one WS upgrade. Defaults to `/` (the port-forward
   * behavior: only the origin's root socket is proxied). */
  readonly upgradePath?: (req: IncomingMessage) => string;
  /** The complete upstream request header set. The consumer owns Host rewrite,
   * cookie policy, and internal-header stripping. */
  readonly headers: (
    req: IncomingMessage,
    options: { readonly forUpgrade: boolean },
  ) => Record<string, string | string[]>;
  /** Bounded replacement hook for small JSON responses (descriptor rewrite).
   * Returning `null` streams the response unchanged; a returned replacement is
   * written in place of the upstream response. The hook owns its byte/time
   * bounds and must never read a body it will stream. */
  readonly transformResponse?: (
    upstreamRes: IncomingMessage,
    signal: AbortSignal,
  ) => Promise<LoopbackProxyReplacement | null>;
  /** Plain-text 502 body when the upstream cannot be reached. */
  readonly badGatewayMessage?: string;
}

const DEFAULT_BAD_GATEWAY_MESSAGE = "Bad Gateway: the upstream server is not reachable.";

function trackProxyStream(
  work: AsyncWorkTracker,
  stream: ClientRequest | IncomingMessage | ServerResponse | Duplex,
): void {
  void work.run(() => {
    if (stream.closed) return;
    return new Promise<void>((resolve) => stream.once("close", () => resolve()));
  });
}

/**
 * The loopback families the proxy may dial for this lifetime: the cached
 * fallback chain minus the family the owner's own listener shadows.
 */
function dialHosts(lifetime: LoopbackProxyLifetime): readonly LoopbackHost[] {
  return orderedLoopbackHosts(lifetime.targetPort).filter(
    (host) => host !== lifetime.shadowedLoopback,
  );
}

/** Copies an upstream response's headers to a visitor-bound record under the
 * plan's policy. `set-cookie` goes through the cookie filter; everything else
 * through `keepResponseHeader` (hop-by-hop dropped by default). Exported so a
 * bounded transform can build replacement headers from the same policy. */
export function copyLoopbackResponseHeaders(
  upstreamRes: IncomingMessage,
  policy: LoopbackProxyResponsePolicy,
): Record<string, string | string[]> {
  const keep = policy.keepResponseHeader ?? ((name: string) => !isHopByHopHeader(name));
  const filterSetCookie = policy.setCookie ?? ((values: readonly string[]) => values);
  const headers: Record<string, string | string[]> = {};
  for (const [name, value] of Object.entries(upstreamRes.headers)) {
    if (value === undefined) continue;
    if (name === "set-cookie") {
      const filtered = filterSetCookie(Array.isArray(value) ? value : [value]);
      if (filtered && filtered.length > 0) headers[name] = [...filtered];
      continue;
    }
    if (!keep(name, value)) continue;
    headers[name] = value;
  }
  return headers;
}

/**
 * Reverse-proxies one HTTP request to the target port on loopback, unbuffered:
 * the request body streams upstream as it arrives and the upstream response
 * streams back. The whole operation rides `lifetime` — an aborted lifetime on
 * entry never dials, and revocation mid-connect/mid-stream destroys both legs.
 * Dials go through `lifetime.agent`, the owner's private pool; the fallback
 * chain tries the cached family first, then the other loopback family, and a
 * connect failure is retried only before the body was piped.
 */
export async function proxyLoopbackHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  lifetime: LoopbackProxyLifetime,
  plan: LoopbackProxyRequestPlan,
): Promise<void> {
  const work = new AsyncWorkTracker();
  trackProxyStream(work, res);
  const { targetPort, signal, agent } = lifetime;
  const headers = plan.headers(req, { forUpgrade: false });
  const upstreamPath = plan.httpPath ? plan.httpPath(req) : (req.url ?? "/");
  const badGatewayMessage = plan.badGatewayMessage ?? DEFAULT_BAD_GATEWAY_MESSAGE;

  const sendBadGateway = () => {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    writeText(res, 502, badGatewayMessage, "text/plain; charset=utf-8");
  };

  let current: ReturnType<typeof httpRequest> | undefined;
  // Revocation tears down both legs synchronously; destroying `current` here
  // also leaves no window where the attempt chain could consider a fallback.
  const onRevoke = (): void => {
    res.destroy();
    current?.destroy();
  };
  if (signal.aborted) {
    res.destroy();
    await work.drain();
    return;
  }
  signal.addEventListener("abort", onRevoke, { once: true });

  // The visitor disconnecting mid-request must not leave the upstream
  // connection dangling, whichever attempt/family is in flight; it also ends
  // this operation, releasing the revocation registration.
  res.on("close", () => {
    signal.removeEventListener("abort", onRevoke);
    current?.destroy();
  });

  const attempt = (hosts: readonly LoopbackHost[], index: number): void => {
    const host = hosts[index]!;
    const upstreamReq = httpRequest(
      { host, port: targetPort, method: req.method, path: upstreamPath, headers, agent },
      (upstreamRes) => {
        trackProxyStream(work, upstreamRes);
        rememberLoopbackHost(targetPort, host);
        const writeUpstreamResponse = (): void => {
          const responseHeaders = copyLoopbackResponseHeaders(upstreamRes, plan);
          res.writeHead(upstreamRes.statusCode ?? 502, responseHeaders);
          // `pipeline` (unlike bare `.pipe()`) forwards an error from either
          // side by destroying the other, so a reset on either leg can't leave
          // a dangling stream or an unhandled 'error' event.
          pipeline(upstreamRes, res, () => {});
        };
        if (!plan.transformResponse) {
          writeUpstreamResponse();
          return;
        }
        void plan
          .transformResponse(upstreamRes, signal)
          .then((replacement) => {
            if (res.destroyed || res.headersSent) return;
            if (!replacement) {
              writeUpstreamResponse();
              return;
            }
            res.writeHead(replacement.status, replacement.headers);
            res.end(replacement.body);
          })
          .catch(() => {
            // A transform that cannot complete consumed nothing usable in the
            // streaming contract: fail the response closed before headers.
            if (res.destroyed || res.headersSent) {
              res.destroy();
              return;
            }
            sendBadGateway();
          });
      },
    );
    trackProxyStream(work, upstreamReq);
    current = upstreamReq;

    let connected = false;
    const pipeBody = () => {
      connected = true;
      // `pipeline` destroys `upstreamReq` on any `req` error instead of
      // leaving an unhandled 'error' on `req` (an aborted upload vector).
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
      // Revocation or the visitor going away destroyed this request out from
      // under the attempt chain — never a connect failure.
      if (signal.aborted || res.destroyed) return;
      if (!connected && index + 1 < hosts.length) {
        attempt(hosts, index + 1);
        return;
      }
      sendBadGateway();
    });
  };

  attempt(dialHosts(lifetime), 0);
  await work.drain();
}

/**
 * Reverse-proxies one WebSocket upgrade to the target port on loopback. The
 * upstream handshake is a fully PARSED response, re-serialized to the visitor
 * under the plan's `set-cookie` policy while every other header rides verbatim
 * (keeping `sec-websocket-accept` verifiable). After the handshake the raw
 * socket pair is piped bidirectionally with buffered `head` bytes replayed, so
 * frames stay byte-transparent. The pending dial and both legs are revoked by
 * `lifetime`; a client going away cancels only its own operation.
 */
export async function proxyLoopbackWebSocketUpgrade(
  req: IncomingMessage,
  clientSocket: Duplex,
  head: Buffer,
  lifetime: LoopbackProxyLifetime,
  plan: LoopbackProxyRequestPlan,
): Promise<void> {
  const work = new AsyncWorkTracker();
  trackProxyStream(work, clientSocket);
  const { targetPort, signal } = lifetime;
  const headers = plan.headers(req, { forUpgrade: true });
  const upstreamPath = plan.upgradePath ? plan.upgradePath(req) : "/";
  const filterSetCookie = plan.setCookie ?? ((values: readonly string[]) => values);
  let settled = false;
  /** The upstream answered (101 or rejection): no more family fallbacks. */
  let answered = false;
  let upstream: Socket | undefined;
  let upstreamReq: ClientRequest | undefined;

  const teardown = (): void => {
    if (settled) return;
    settled = true;
    signal.removeEventListener("abort", onRevoke);
    // Normal destroy (FIN) on both legs. RST is deliberately not used: it
    // would discard queued final bytes and change close semantics.
    clientSocket.destroy();
    upstreamReq?.destroy();
    upstream?.destroy();
  };
  const onRevoke = (): void => teardown();
  signal.addEventListener("abort", onRevoke);
  clientSocket.on("error", teardown);
  clientSocket.on("close", teardown);
  // `abort` doesn't dispatch retroactively: a lifetime already revoked between
  // session resolution and this upgrade must not attach — or dial — at all.
  if (signal.aborted || clientSocket.destroyed) {
    teardown();
    await work.drain();
    return;
  }

  /** Re-serializes the parsed upstream handshake/rejection to the visitor,
   * filtering cookies pairwise and applying the optional upgrade header
   * policy (order and multiplicity of kept headers preserved). Returns the
   * status code. */
  const writeParsedResponse = (res: IncomingMessage): number => {
    answered = true;
    const keepUpgradeHeader = plan.keepUpgradeResponseHeader;
    const lines = [`HTTP/1.1 ${res.statusCode} ${res.statusMessage ?? ""}`.trimEnd()];
    for (let index = 0; index < res.rawHeaders.length; index += 2) {
      const name = res.rawHeaders[index]!;
      const value = res.rawHeaders[index + 1]!;
      if (name.toLowerCase() === "set-cookie") {
        const filtered = filterSetCookie([value]);
        if (filtered && filtered.length > 0) lines.push(`${name}: ${value}`);
        continue;
      }
      if (keepUpgradeHeader && !keepUpgradeHeader(name, value)) continue;
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
      path: upstreamPath,
      agent: false,
      headers,
    });
    trackProxyStream(work, upgradeReq);
    upstreamReq = upgradeReq;

    upgradeReq.once("upgrade", (res, socket, handshakeHead) => {
      trackProxyStream(work, socket);
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
      trackProxyStream(work, res);
      // Non-101: the upstream refused the upgrade. Relay the parsed rejection
      // (cookies filtered) plus its error body, then end the visitor leg.
      rememberLoopbackHost(targetPort, host);
      if (settled) return;
      writeParsedResponse(res);
      res.on("error", teardown);
      res.pipe(clientSocket);
      res.on("end", () => clientSocket.end());
    });

    upgradeReq.on("error", () => {
      // Revocation or the client going away destroyed this request out from
      // under the attempt chain — neither is a connect failure.
      if (settled || answered) return;
      if (index + 1 < hosts.length) {
        attempt(hosts, index + 1);
        return;
      }
      teardown();
    });

    upgradeReq.end();
  };

  attempt(dialHosts(lifetime), 0);
  await work.drain();
}

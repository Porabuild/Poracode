import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { RemoteHttpError } from "../auth";
import { ForwardOriginPolicy, isForwardOriginAuthority } from "../portForward/forwardOrigin";
import type { ForwardOriginIdentity } from "../portForward/forwardOriginIdentity";
import { FORWARD_ORIGIN_EXCHANGE_PATH, PortProxy } from "../portForward/portProxy";
import type { RemoteServerContext } from "./context";
import { handleHttp } from "./httpRouter";
import { writeError } from "./httpResponses";
import { isLocalDispatchPeer } from "./localDispatchPeer";
import {
  buildForwardOriginSessionCookieHeader,
  isReservedDispatchHeader,
  proxyForwardedHttpRequest,
  proxyForwardedWebSocketUpgrade,
} from "./portForwardProxy";
import { handleUpgrade, rejectUpgrade } from "./wsConnections";

/**
 * Trusted internal dispatch (relay v2 local adapter → host): reserved request
 * headers carrying a forward context the visitor can never set. Presence of
 * any of them makes the request forward-dispatch traffic — it must then fully
 * validate against this server's dispatch key from a loopback peer, or it is
 * rejected outright, never routed as ordinary API traffic. The adapter strips
 * them from ordinary visitor input and sets them only from validated frame
 * fields; both outgoing proxy paths strip them again (see
 * `portForwardProxy`), so the credential never reaches an upstream app.
 * Header names are frozen with the relay lane.
 */
export const FORWARD_DISPATCH_ROUTE_HEADER = "x-poracode-forward-route";
export const FORWARD_DISPATCH_KEY_HEADER = "x-poracode-forward-key";
export const FORWARD_DISPATCH_ID_HEADER = "x-poracode-forward-id";
export const FORWARD_DISPATCH_ORIGIN_HEADER = "x-poracode-forward-origin";

/** Canonical lowercase forward UUID (the gateway's `randomUUID()` shape). */
const FORWARD_ID_PATTERN = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

type ChildResolution =
  | { readonly kind: "ordinary" }
  | { readonly kind: "relay-api" }
  /** A live child identity: exact external origin + canonical forward UUID. */
  | { readonly kind: "child"; readonly forwardId: string; readonly origin: string }
  /** Inside the configured forward namespace (or trusted-dispatch traffic)
   * but not a valid child: bounded error, never Poracode API/PWA fallback. */
  | { readonly kind: "invalid"; readonly error: RemoteHttpError };

interface ChildTarget {
  readonly forwardId: string;
  readonly origin: string;
}

type TrustedDispatchContext =
  | { readonly kind: "relay-api" }
  | { readonly kind: "child"; readonly forwardId: string; readonly origin: string };

/** One `ForwardOriginPolicy` per identity, cached across requests (the
 * constructor validates and parses the base URL). */
const policyCache = new WeakMap<ForwardOriginIdentity, ForwardOriginPolicy>();

function policyFor(identity: ForwardOriginIdentity): ForwardOriginPolicy {
  let policy = policyCache.get(identity);
  if (!policy) {
    policy = new ForwardOriginPolicy(identity.baseUrl);
    policyCache.set(identity, policy);
  }
  return policy;
}

function activeForwardOrigins(ctx: RemoteServerContext): ForwardOriginIdentity[] {
  const direct = ctx.options.forwardOrigin;
  const relay = ctx.options.getRelayForwardOrigin?.();
  return [...(direct ? [direct] : []), ...(relay ? [relay] : [])];
}

function firstHeader(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

/**
 * ANY request header in the reserved `x-poracode-forward-` namespace marks the
 * request as forward-dispatch traffic — including unknown or misspelled names.
 * Partial, forged, or unrecognized reserved metadata must never fall through
 * to ordinary routing, so detection is prefix-based, not a fixed name list.
 * (Node lowercases inbound header names.)
 */
function hasReservedDispatchHeader(req: IncomingMessage): boolean {
  return Object.keys(req.headers).some((name) => isReservedDispatchHeader(name));
}

/** Length-safe constant-time string equality (digests mask length differences). */
function constantTimeEqual(left: string, right: string): boolean {
  return timingSafeEqual(
    createHash("sha256").update(left).digest(),
    createHash("sha256").update(right).digest(),
  );
}

/**
 * Validates reserved dispatch headers into a forward context. Returns `null`
 * when no reserved header is present (ordinary traffic — the host-derived
 * path decides), a context when fully validated against this server's active
 * forward-origin identities, or `"rejected"` for any partial/forged/unknown
 * attempt — including reserved headers on a host with no configured dispatch
 * key (bounded error, never ordinary routing).
 *
 */
function readTrustedDispatchContext(
  ctx: RemoteServerContext,
  req: IncomingMessage,
): TrustedDispatchContext | "rejected" | null {
  if (!hasReservedDispatchHeader(req)) return null;
  const key = ctx.options.forwardDispatchKey;
  if (!key || !isLocalDispatchPeer(req.socket.remoteAddress, req.socket.localAddress))
    return "rejected";
  const providedKey = firstHeader(req.headers[FORWARD_DISPATCH_KEY_HEADER]);
  if (!providedKey || !constantTimeEqual(providedKey, key)) return "rejected";
  const route = firstHeader(req.headers[FORWARD_DISPATCH_ROUTE_HEADER]);
  const allowed =
    route === "api"
      ? [FORWARD_DISPATCH_KEY_HEADER, FORWARD_DISPATCH_ROUTE_HEADER]
      : [FORWARD_DISPATCH_KEY_HEADER, FORWARD_DISPATCH_ID_HEADER, FORWARD_DISPATCH_ORIGIN_HEADER];
  if (
    Object.keys(req.headers).some(
      (name) => isReservedDispatchHeader(name) && !allowed.includes(name),
    )
  ) {
    return "rejected";
  }
  if (route === "api") return { kind: "relay-api" };
  const identities = activeForwardOrigins(ctx);
  const forwardId = firstHeader(req.headers[FORWARD_DISPATCH_ID_HEADER]);
  const origin = firstHeader(req.headers[FORWARD_DISPATCH_ORIGIN_HEADER]);
  if (!forwardId || !FORWARD_ID_PATTERN.test(forwardId) || !origin) return "rejected";
  if (
    !identities.some(
      (identity) => origin === policyFor(identity).originFor(identity.ownerId, forwardId),
    )
  )
    return "rejected";
  return { kind: "child", forwardId, origin };
}

/**
 * Resolves one inbound request against the configured forward-origin
 * namespace. Reserved dispatch metadata is validated FIRST (on every host,
 * configured or not) so partial/forged internal dispatch never falls through.
 * Host-derived children resolve only for this host's exact owner label
 * (`resolveAuthority` + ownerId equality); every other authority under the
 * configured base — foreign-owner labels, malformed labels, wrong ports, the
 * bare base itself — is namespace traffic and gets a bounded error rather
 * than falling through to Poracode API/PWA handlers. The same applies, with
 * no active policy at all, to any minted `f-<owner>-<forward>` authority:
 * when ingress configuration is removed or changed, previously served child
 * origins stay reserved (an old forwarded app's origin must never start
 * serving Poracode content onto its own storage/service-worker scope).
 * Hosts outside those shapes are ordinary traffic.
 */
function resolveChildRequest(ctx: RemoteServerContext, req: IncomingMessage): ChildResolution {
  const dispatch = readTrustedDispatchContext(ctx, req);
  if (dispatch === "rejected") {
    return {
      kind: "invalid",
      error: new RemoteHttpError(
        "forward_dispatch_rejected",
        "Forward dispatch metadata is invalid.",
        403,
      ),
    };
  }
  if (dispatch) return dispatch;

  const host = firstHeader(req.headers.host);
  if (!host) return { kind: "ordinary" };

  let reserved = false;
  for (const identity of activeForwardOrigins(ctx)) {
    const policy = policyFor(identity);
    if (!policy.containsHostname(host)) continue;
    reserved = true;
    const resolved = policy.resolveAuthority(host);
    if (resolved?.ownerId === identity.ownerId) {
      return {
        kind: "child",
        forwardId: resolved.forwardId,
        origin: policy.originFor(identity.ownerId, resolved.forwardId),
      };
    }
  }
  if (reserved) {
    return {
      kind: "invalid",
      error: new RemoteHttpError(
        "forward_not_found",
        "No port forward is served on this origin.",
        404,
      ),
    };
  }

  // No active policy matched: a minted child authority from a removed or
  // changed ingress configuration stays reserved — bounded error, never the
  // host's own API/PWA on an old forwarded app's origin.
  if (isForwardOriginAuthority(host)) {
    return {
      kind: "invalid",
      error: new RemoteHttpError(
        "forward_not_found",
        "No port forward is served on this origin.",
        404,
      ),
    };
  }
  return { kind: "ordinary" };
}

/** Safety headers for every Poracode-generated child-origin response (bounded
 * errors and the exchange redirect): never cached, never sniffed, never
 * leaking the entry context through a referrer. */
function applyForwardResponseSecurityHeaders(res: ServerResponse): void {
  res.setHeader("cache-control", "no-store");
  res.setHeader("referrer-policy", "no-referrer");
  res.setHeader("x-content-type-options", "nosniff");
}

function writeForwardError(res: ServerResponse, error: unknown): void {
  applyForwardResponseSecurityHeaders(res);
  writeError(res, error);
}

/**
 * A supplied `Origin` must equal the child's exact external origin — a
 * browser always sends it on state-changing requests and WebSocket upgrades,
 * and a caller-supplied Origin can never assert trusted dispatch context.
 * Absent (non-browser) origins pass on HTTP; WS upgrades require presence.
 */
function requireExactOrigin(req: IncomingMessage, childOrigin: string): void {
  const origin = firstHeader(req.headers.origin);
  if (origin && origin !== childOrigin) {
    throw new RemoteHttpError(
      "forward_origin_mismatch",
      "This forward origin does not match the requesting origin.",
      403,
    );
  }
}

function requireLiveForward(ctx: RemoteServerContext, forwardId: string): void {
  const gateway = ctx.options.portForward;
  if (!gateway || gateway.getForward(forwardId) === null) {
    throw new RemoteHttpError("forward_not_found", "Port forward not found.", 404);
  }
}

function requirePortProxy(ctx: RemoteServerContext): PortProxy {
  const proxy = ctx.options.portProxy;
  if (!proxy) {
    throw new RemoteHttpError(
      "ports_unavailable",
      "Port forwarding is not available on this desktop.",
      503,
    );
  }
  return proxy;
}

/**
 * The child-origin entry exchange: validates the one-use capability against
 * this exact (forwardId, origin) and a live forward, consumes it, and mints
 * the `__Host-` cookie session bound to both.
 */
function handleExchange(
  ctx: RemoteServerContext,
  child: ChildTarget,
  req: IncomingMessage,
  res: ServerResponse,
): void {
  requireExactOrigin(req, child.origin);
  requireLiveForward(ctx, child.forwardId);
  const capability = new URL(req.url ?? "/", child.origin).searchParams.get("fx") ?? "";
  const consumed =
    requirePortProxy(ctx).consumeExchangeCapability(child.forwardId, child.origin, capability) ??
    null;
  if (!consumed) {
    throw new RemoteHttpError(
      "forward_exchange_invalid",
      "This forward entry exchange is invalid or expired.",
      403,
    );
  }
  applyForwardResponseSecurityHeaders(res);
  res.writeHead(302, {
    location: "/",
    "set-cookie": buildForwardOriginSessionCookieHeader(consumed.sessionId, consumed.maxAgeMs),
  });
  res.end();
}

/** Shared child-origin gates for ordinary (non-exchange) traffic: exact
 * origin (whenever supplied), live forward, then the origin-bound cookie
 * session. */
function resolveChildLifetime(ctx: RemoteServerContext, child: ChildTarget, req: IncomingMessage) {
  requireExactOrigin(req, child.origin);
  requireLiveForward(ctx, child.forwardId);
  const lifetime = requirePortProxy(ctx).resolveOriginSession(req.headers.cookie, child);
  if (!lifetime) {
    throw new RemoteHttpError(
      "forward_session_required",
      "A valid forward session is required on this origin.",
      403,
    );
  }
  return lifetime;
}

/**
 * The HTTP entry point `RemoteAccessServer` wires in front of
 * {@link handleHttp}: recognized child-origin traffic is dispatched (or
 * bounded-errored) here and NEVER reaches Poracode API/PWA routes. The only
 * Poracode-owned path on a child origin is the reserved entry exchange;
 * everything else — `/`, `/api/*`, `/ws` — belongs to the forwarded
 * application.
 */
export async function handleRemoteAccessHttpRequest(
  ctx: RemoteServerContext,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const child = resolveChildRequest(ctx, req);
  if (child.kind === "relay-api") {
    await handleHttp(ctx, req, res, ctx.options.getRelayForwardOrigin?.() ?? null);
    return;
  }
  if (child.kind === "ordinary") {
    await handleHttp(ctx, req, res);
    return;
  }
  try {
    if (child.kind === "invalid") throw child.error;
    const target: ChildTarget = { forwardId: child.forwardId, origin: child.origin };
    const url = new URL(req.url ?? "/", target.origin);
    if (req.method === "OPTIONS") {
      // Same-origin preflights only: cross-origin ones carry a foreign Origin,
      // rejected above. No CORS reflection on child origins.
      requireExactOrigin(req, target.origin);
      res.writeHead(204);
      res.end();
      return;
    }
    if (req.method === "GET" && url.pathname === FORWARD_ORIGIN_EXCHANGE_PATH) {
      handleExchange(ctx, target, req, res);
      return;
    }
    const lifetime = resolveChildLifetime(ctx, target, req);
    proxyForwardedHttpRequest(req, res, lifetime);
  } catch (error) {
    writeForwardError(res, error);
  }
}

/**
 * The upgrade entry point `RemoteAccessServer` wires in front of
 * {@link handleUpgrade} (wsConnections). Browser WebSocket upgrades on a
 * child origin REQUIRE an `Origin` exactly equal to that origin (browsers
 * always send one; its absence is not a browser) plus the origin-bound cookie
 * session and a live forward — then the upgrade, established or still
 * dialing, rides the forward's lifetime.
 */
export function handleRemoteAccessUpgrade(
  ctx: RemoteServerContext,
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
): void {
  const child = resolveChildRequest(ctx, req);
  if (child.kind === "relay-api") {
    rejectUpgrade(socket, 403, "Forbidden");
    return;
  }
  if (child.kind === "ordinary") {
    void handleUpgrade(ctx, req, socket, head);
    return;
  }
  try {
    if (child.kind === "invalid") throw child.error;
    const target: ChildTarget = { forwardId: child.forwardId, origin: child.origin };
    const origin = firstHeader(req.headers.origin);
    if (!origin || origin !== target.origin) {
      throw new RemoteHttpError(
        "forward_origin_mismatch",
        "This forward origin does not match the requesting origin.",
        403,
      );
    }
    const lifetime = resolveChildLifetime(ctx, target, req);
    proxyForwardedWebSocketUpgrade(req, socket, head, lifetime);
  } catch (error) {
    if (error instanceof RemoteHttpError) {
      rejectUpgrade(socket, error.status, error.status === 401 ? "Unauthorized" : "Forbidden");
      return;
    }
    socket.destroy();
  }
}

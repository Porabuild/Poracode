import { isIP } from "node:net";
import type { IncomingHttpHeaders, IncomingMessage, ServerResponse } from "node:http";
import { isLoopbackHostname } from "@/shared/http";
import { REMOTE_COMMAND_ID_HEADER, type RemoteAccessScope } from "@/shared/remote";
import { remoteTrustedProxyAddresses } from "../config";
import { hasRelayLoopbackHopMarker } from "./relayHopSecret";
import { socketMatchesTrustedProxy } from "./trustedProxy";
import {
  parseBearerAuthorizationHeader,
  RemoteHttpError,
  type AuthenticatedRemoteSession,
  type RemoteAuthStore,
} from "../auth";
import type { RemoteAccessServerOptions } from "../RemoteAccessServer";

// Webview origins trusted for CORS. The `capacitor://` and `ionic://` schemes
// exist solely for backward compatibility with the retired Capacitor mobile
// shell, which may still be installed on a user's device. Capacitor itself is
// fully removed from this repository and must not be reintroduced.
const NATIVE_WEBVIEW_ORIGINS = new Set([
  "capacitor://localhost",
  "ionic://localhost",
  "http://localhost",
  "https://localhost",
]);

export const DEFAULT_TOKEN_EXCHANGE_RATE_LIMIT = {
  maxAttempts: 20,
  windowMs: 5 * 60 * 1000,
} as const;

interface RateLimitBucket {
  count: number;
  resetAtMs: number;
}

export function normalizeHostForUrl(host: string): string {
  return host.includes(":") && !host.startsWith("[") ? `[${host}]` : host;
}

/**
 * The ONE socket-address loopback classifier for peer-gating (deep-review
 * consolidation: httpRouteHandlers, security, and desktopInternalStream each
 * kept a slightly divergent copy). `undefined` means no socket address was
 * reported (never admit); an empty address is a unix-domain socket (local by
 * construction).
 */
export function isLoopbackSocketAddress(address: string | undefined): boolean {
  if (address === undefined) return false;
  const normalized = address.trim().toLowerCase();
  if (normalized === "") return true;
  if (normalized === "::1" || normalized === "[::1]") return true;
  const mapped = normalized.startsWith("::ffff:") ? normalized.slice("::ffff:".length) : normalized;
  const host = mapped.startsWith("[") ? mapped.slice(1, mapped.indexOf("]")) : mapped;
  return host === "127.0.0.1" || host.startsWith("127.");
}

export { RELAY_LOOPBACK_HOP_HEADER, hasRelayLoopbackHopMarker } from "./relayHopSecret";

/**
 * Whether the request is a DIRECT loopback peer: socket address loopback AND
 * not a relay-proxied dial (the relay adapter connects from loopback, which
 * alone would make every remote visitor 'local' to address-based gates).
 */
export function isDirectLoopbackPeer(req: {
  readonly headers: IncomingHttpHeaders;
  readonly socket: { readonly remoteAddress?: string | undefined };
}): boolean {
  return isLoopbackSocketAddress(req.socket.remoteAddress) && !hasRelayLoopbackHopMarker(req);
}

/**
 * Keys the rate-limit bucket on the real visitor. Behind the relay, every
 * request arrives from loopback (`relayHost` proxies to the server's own
 * loopback port), which would collapse all remote devices into one shared
 * bucket and defeat per-client throttling.
 *
 * `X-Forwarded-For` is honored only when the request carries this process's
 * relay hop secret (the in-process adapter stamps it) or the socket matches
 * `PORACODE_REMOTE_TRUSTED_PROXIES` (exact address or CIDR). A client-set
 * hop marker is stripped at ingress and never grants a budget (V6 A.6).
 */
function resolveRateLimitClient(
  req: IncomingMessage,
  trustedProxies: readonly string[] = [],
): string {
  const remoteAddress = req.socket.remoteAddress ?? "unknown";
  const mayTrustXff =
    hasRelayLoopbackHopMarker(req) ||
    socketMatchesTrustedProxy(req.socket.remoteAddress, trustedProxies);
  if (!mayTrustXff) return remoteAddress;
  const forwarded = req.headers["x-forwarded-for"];
  const rawForwarded = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const firstHop = rawForwarded?.split(",")[0]?.trim();
  return firstHop && firstHop.length > 0 ? firstHop : remoteAddress;
}

/**
 * A loopback web origin (any port), e.g. `http://localhost:3100` or
 * `http://127.0.0.1:8080`. The page itself is local, but its target Poracode
 * app may be any paired desktop/headless host. Pairing still requires the
 * one-time credential, and the resulting access token remains isolated to the
 * page's exact browser origin.
 */
function isLoopbackWebOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    return isLoopbackHostname(url.hostname);
  } catch {
    return false;
  }
}

function normalizeCorsOrigin(rawOrigin: string): string | null {
  const trimmed = rawOrigin.trim().replace(/\/+$/, "");
  if (!trimmed || trimmed === "null") return null;
  try {
    const url = new URL(trimmed);
    if (url.origin !== "null") return url.origin;
    if (url.protocol === "capacitor:" || url.protocol === "ionic:") {
      return `${url.protocol}//${url.host}`;
    }
    return null;
  } catch {
    return null;
  }
}

/** State + accessors the security helpers need from the orchestrator. */
export interface SecurityContext {
  /** The advertised HTTP base URL once the server has started (the CORS key). */
  getHttpBaseUrl(): string | undefined;
  /**
   * The local (this listener's) base URL once the server has started — carries
   * the actual bound port even when the advertised origin is a reverse proxy.
   */
  getLocalHttpBaseUrl(): string | undefined;
  readonly options: RemoteAccessServerOptions;
  readonly auth: RemoteAuthStore;
}

/**
 * Owns the CORS trust decision, the per-client rate-limit buckets, and bearer
 * authentication for the remote HTTP surface. Keeps its mutable caches
 * (`trustedCorsOrigins`, `rateLimitBuckets`) private so the orchestrator only
 * delegates rather than reaching into them.
 */
export class RemoteServerSecurity {
  private readonly rateLimitBuckets = new Map<string, RateLimitBucket>();
  /** Cached normalized allow-list, keyed on the (only) mutable input `httpBaseUrl`. */
  private trustedCorsOrigins: { key: string | undefined; origins: ReadonlySet<string> } | null =
    null;
  /**
   * Cached Host-header allowlist (Gate 6 item 4.7), keyed on the advertised
   * base URL — the only input that changes after startup.
   */
  private allowedHostForms: { key: string | undefined; forms: AllowedHostForms } | null = null;

  constructor(private readonly ctx: SecurityContext) {}

  applyCors(req: IncomingMessage, res: ServerResponse): boolean {
    res.setHeader(
      "Access-Control-Allow-Headers",
      `authorization, content-type, ${REMOTE_COMMAND_ID_HEADER}`,
    );
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    // An absent Origin is a distinct cache variant too (native vs browser).
    res.setHeader("Vary", "Origin");
    const origin = this.trustedRequestOrigin(req);
    if (origin === false) return false;
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    }
    if (req.method === "OPTIONS" && origin) {
      // Reuse the CORS permission check without another network round trip.
      // Every actual request still validates its origin and bearer credential.
      res.setHeader("Access-Control-Max-Age", "600");
    }
    return true;
  }

  private trustedRequestOrigin(req: IncomingMessage): string | null | false {
    const rawOrigin = Array.isArray(req.headers.origin)
      ? req.headers.origin[0]
      : req.headers.origin;
    if (!rawOrigin) return null;
    const origin = normalizeCorsOrigin(rawOrigin);
    if (!origin || !this.isTrustedCorsOrigin(origin)) return false;
    return origin;
  }

  private isTrustedCorsOrigin(origin: string): boolean {
    if (NATIVE_WEBVIEW_ORIGINS.has(origin)) return true;
    if (isLoopbackWebOrigin(origin)) return true;
    const relayOrigin = this.ctx.options.getRelayPublicOrigin?.();
    if (relayOrigin && normalizeCorsOrigin(relayOrigin) === origin) return true;
    const key = this.ctx.getHttpBaseUrl();
    let cache = this.trustedCorsOrigins;
    if (!cache || cache.key !== key) {
      const origins = new Set<string>();
      for (const value of [
        key,
        this.ctx.options.pairingAppUrl,
        this.ctx.options.devWebAppUrl,
        ...(this.ctx.options.trustedCorsOrigins ?? []),
      ]) {
        if (!value) continue;
        const normalized = normalizeCorsOrigin(value);
        if (normalized) origins.add(normalized);
      }
      cache = { key, origins };
      this.trustedCorsOrigins = cache;
    }
    return cache.origins.has(origin);
  }

  enforceRateLimit(
    req: IncomingMessage,
    bucketName: string,
    config: { readonly maxAttempts: number; readonly windowMs: number },
  ): void {
    const now = Date.now();
    for (const [key, bucket] of this.rateLimitBuckets) {
      if (bucket.resetAtMs <= now) {
        this.rateLimitBuckets.delete(key);
      }
    }
    const client = resolveRateLimitClient(
      req,
      this.ctx.options.trustedProxies ?? remoteTrustedProxyAddresses(),
    );
    const key = `${bucketName}:${client}`;
    const bucket = this.rateLimitBuckets.get(key);
    if (!bucket || bucket.resetAtMs <= now) {
      this.rateLimitBuckets.set(key, { count: 1, resetAtMs: now + config.windowMs });
      return;
    }
    if (bucket.count >= config.maxAttempts) {
      throw new RemoteHttpError(
        "rate_limited",
        "Too many remote access attempts. Try again shortly.",
        429,
      );
    }
    bucket.count += 1;
  }

  requireBearer(req: IncomingMessage, scopes: readonly RemoteAccessScope[]): string {
    return this.requireBearerSession(req, scopes).token;
  }

  /**
   * Bearer authentication that also hands back the authenticated session, so
   * the dispatcher can attach it to the route call (audit trail, per-session
   * decisions) without re-hashing the token. Same checks as
   * {@link requireBearer}.
   */
  requireBearerSession(
    req: IncomingMessage,
    scopes: readonly RemoteAccessScope[],
  ): { token: string; session: AuthenticatedRemoteSession } {
    const header = Array.isArray(req.headers.authorization)
      ? req.headers.authorization[0]
      : req.headers.authorization;
    const token = parseBearerAuthorizationHeader(header);
    if (!token) {
      throw new RemoteHttpError("missing_access_token", "Missing access token.", 401);
    }
    const session = this.ctx.auth.authenticateBearerToken(token, scopes);
    return { token, session };
  }

  /**
   * Gate 6 item 4.7 (S7): DNS-rebinding defense on the remote server, same
   * posture as the MCP ingress (`StreamableHttpMcpIngress.isAllowedHost`): a
   * browser that resolves an attacker-controlled DNS name to this server sends
   * that name in `Host`, so only the server's own advertised host/port forms
   * are admitted — loopback names, raw IP literals (direct LAN/tailnet and
   * relay-proxy dials), and the explicitly advertised hostnames
   * (`advertisedHost`, `advertisedBaseUrl`, `tailscaleHttpBaseUrl`). When the
   * `Host` header carries a port it must be the bound port (or, for an
   * advertised hostname, that origin's own proxy port). Fails closed.
   *
   * Runs on the Poracode API/PWA request path only: forward child-origin
   * traffic is dispatched (or bounded-errored) before this router, and the
   * relay's local adapter dials the server by its loopback address, which the
   * IP-literal rule admits.
   */
  enforceHostHeader(req: IncomingMessage): void {
    const hostHeader = Array.isArray(req.headers.host) ? req.headers.host[0] : req.headers.host;
    const trimmed = hostHeader?.trim();
    if (!trimmed) {
      throw new RemoteHttpError(
        "host_not_allowed",
        "Request host is not allowed for this server.",
        403,
      );
    }
    let parsed: URL;
    try {
      parsed = new URL(`http://${trimmed}`);
    } catch {
      throw new RemoteHttpError(
        "host_not_allowed",
        "Request host is not allowed for this server.",
        403,
      );
    }
    let hostname = parsed.hostname.toLowerCase();
    if (hostname.startsWith("[") && hostname.endsWith("]")) {
      hostname = hostname.slice(1, -1);
    }
    const headerPort = parsed.port === "" ? null : Number(parsed.port);
    const forms = this.resolveAllowedHostForms();
    if (isIP(hostname) !== 0 || hostname === "localhost") {
      // Loopback and raw IP dials must target the bound port when they say one.
      if (headerPort !== null && headerPort !== forms.localPort) {
        throw new RemoteHttpError(
          "host_not_allowed",
          "Request host is not allowed for this server.",
          403,
        );
      }
      return;
    }
    if (forms.hostnames.has(hostname)) {
      const allowedPorts = forms.hostnamePorts.get(hostname);
      // Hostnames of advertised origins may arrive without a port (proxied
      // default-port requests); an explicit port must be one that origin is
      // actually advertised on (or the bound port).
      if (headerPort !== null && !allowedPorts?.includes(headerPort)) {
        throw new RemoteHttpError(
          "host_not_allowed",
          "Request host is not allowed for this server.",
          403,
        );
      }
      return;
    }
    throw new RemoteHttpError(
      "host_not_allowed",
      "Request host is not allowed for this server.",
      403,
    );
  }

  private resolveAllowedHostForms(): AllowedHostForms {
    const key = this.ctx.getHttpBaseUrl();
    let cache = this.allowedHostForms;
    if (!cache || cache.key !== key) {
      const localPort = portOf(this.ctx.getLocalHttpBaseUrl());
      const hostnames = new Set<string>();
      const hostnamePorts = new Map<string, number[]>();
      const addHostnameForm = (rawOrigin: string | undefined, includeDefaultPort: boolean) => {
        if (!rawOrigin) return;
        try {
          const origin = new URL(rawOrigin);
          const hostname = origin.hostname.toLowerCase();
          if (!hostname || isIP(hostname) !== 0 || hostname === "localhost") return;
          if (hostnames.has(hostname)) return;
          hostnames.add(hostname);
          const ports = new Set<number>();
          if (localPort !== null) ports.add(localPort);
          if (origin.port !== "") ports.add(Number(origin.port));
          // A proxied origin advertised without an explicit port is reached
          // with the scheme's default port (https → 443); a Host header that
          // spells it out must still be admitted.
          else if (includeDefaultPort && origin.protocol === "https:") ports.add(443);
          else if (includeDefaultPort && origin.protocol === "http:") ports.add(80);
          hostnamePorts.set(hostname, [...ports]);
        } catch {
          // A malformed advertised origin contributes nothing.
        }
      };
      addHostnameForm(
        this.ctx.options.advertisedHost ? `http://${this.ctx.options.advertisedHost}` : undefined,
        false,
      );
      addHostnameForm(this.ctx.options.advertisedBaseUrl, true);
      addHostnameForm(this.ctx.options.tailscaleHttpBaseUrl, true);
      cache = { key, forms: { localPort, hostnames, hostnamePorts } };
      this.allowedHostForms = cache;
    }
    return cache.forms;
  }
}

/** Port the listener is actually bound to, parsed from the local base URL. */
function portOf(baseUrl: string | undefined): number | null {
  if (!baseUrl) return null;
  try {
    const parsed = new URL(baseUrl);
    return parsed.port === "" ? null : Number(parsed.port);
  } catch {
    return null;
  }
}

/** The cached Host-header allowlist: bound port plus advertised hostname forms. */
interface AllowedHostForms {
  readonly localPort: number | null;
  readonly hostnames: ReadonlySet<string>;
  readonly hostnamePorts: ReadonlyMap<string, readonly number[]>;
}

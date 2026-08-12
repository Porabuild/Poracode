import type { IncomingMessage, ServerResponse } from "node:http";
import { isLoopbackHostname } from "@/shared/http";
import { REMOTE_COMMAND_ID_HEADER, type RemoteAccessScope } from "@/shared/remote";
import { parseBearerAuthorizationHeader, RemoteHttpError, type RemoteAuthStore } from "../auth";
import type { RemoteAccessServerOptions } from "../RemoteAccessServer";

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

/** IPv4/IPv6 loopback (relay proxies to loopback, so these are the relay hop). */
function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  const normalized = address.startsWith("::ffff:") ? address.slice("::ffff:".length) : address;
  return normalized === "127.0.0.1" || normalized === "::1" || normalized.startsWith("127.");
}

/**
 * Keys the rate-limit bucket on the real visitor. Behind the relay, every
 * request arrives from loopback (`relayHost` proxies to the server's own
 * loopback port), which would collapse all remote devices into one shared
 * bucket and defeat per-client throttling. When the socket is loopback we trust
 * a forwarding header and take its first hop (the original client) instead;
 * direct LAN connections fall back to the socket's remote address.
 *
 * NOTE: `relayHost` (owned by another agent, `src/server`) must populate
 * `x-forwarded-for` with the visitor address for this to distinguish devices;
 * if the header is absent this degrades gracefully to the loopback address.
 */
function resolveRateLimitClient(req: IncomingMessage): string {
  const remoteAddress = req.socket.remoteAddress ?? "unknown";
  if (!isLoopbackAddress(req.socket.remoteAddress)) {
    return remoteAddress;
  }
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

  constructor(private readonly ctx: SecurityContext) {}

  applyCors(req: IncomingMessage, res: ServerResponse): boolean {
    res.setHeader(
      "Access-Control-Allow-Headers",
      `authorization, content-type, ${REMOTE_COMMAND_ID_HEADER}`,
    );
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    const origin = this.trustedRequestOrigin(req);
    if (origin === false) return false;
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
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
    const client = resolveRateLimitClient(req);
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
    const header = Array.isArray(req.headers.authorization)
      ? req.headers.authorization[0]
      : req.headers.authorization;
    const token = parseBearerAuthorizationHeader(header);
    if (!token) {
      throw new RemoteHttpError("missing_access_token", "Missing access token.", 401);
    }
    this.ctx.auth.authenticateBearerToken(token, scopes);
    return token;
  }
}

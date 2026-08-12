import { randomBytes } from "node:crypto";
import { parseCookieValue } from "@/shared/remote/relayProtocol";
import type { RemotePortForwardGateway } from "../RemotePortForwardGateway";

/** Enter tokens (one-time-ish, but multi-use within TTL) let a `GET
 * /forward/<id>/enter` browser navigation mint a cookie session without a
 * bearer header (browsers can't attach one to a navigation). */
const DEFAULT_ENTER_TOKEN_TTL_MS = 10 * 60 * 1000;
/** Cookie sessions are long-lived (a phone may keep a forwarded tab open for a
 * whole workday) and slide forward on every use. */
const DEFAULT_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/** Cookie name the desktop mints on a successful `/forward/<id>/enter` and the
 * HTTP/WS proxy paths key their session lookup on. No `Secure`/`Domain`
 * attribute (see {@link PortProxy}) so it round-trips over plain LAN http and
 * behind an https reverse proxy (Tailscale serve, the self-hosted relay)
 * alike. When multiple desktops share one relay origin, this cookie's name is
 * shared across all of them too — see `buildRelayRoutingCookieHeader` in
 * `src/shared/remote/relayProtocol.ts` for the accepted last-enter-wins
 * limitation that follows from that. */
export const FORWARD_SESSION_COOKIE_NAME = "lc_forward";

interface EnterTokenEntry {
  readonly forwardId: string;
  readonly expiresAtMs: number;
}

interface ForwardSessionEntry {
  readonly forwardId: string;
  expiresAtMs: number;
}

export interface PortProxyOptions {
  /** The forward registry: {@link resolveSession} and {@link consumeEnterToken}
   * both re-check that the forward is still open, so stopping a forward
   * invalidates every enter token/session minted for it without this class
   * needing its own teardown hook into the gateway. */
  readonly gateway: RemotePortForwardGateway;
  readonly enterTokenTtlMs?: number;
  readonly sessionTtlMs?: number;
}

export interface IssuedEnterToken {
  readonly token: string;
  /** `/forward/<forwardId>/enter?fwt=<token>` — a full path (no origin), ready
   * to resolve against the desktop's advertised host. */
  readonly path: string;
}

export interface ConsumedEnterToken {
  /** The freshly-minted session id; the caller wraps it in the `lc_forward`
   * Set-Cookie header. */
  readonly sessionId: string;
  readonly maxAgeMs: number;
}

function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Authenticated HTTP/WS reverse-proxy session layer sitting in front of
 * {@link RemotePortForwardGateway}'s raw TCP forwards. A forward's raw TCP
 * listener only helps a device on the same LAN; this class is what lets a
 * forwarded dev server be reached through the remote-access server itself
 * (LAN without a second port, tailscale-serve HTTPS, the self-hosted relay) —
 * see `httpRouter`'s `/forward/<id>/enter` route and its proxy fallthrough,
 * and `wsConnections`'s upgrade-proxy branch.
 *
 * Two short-lived, in-memory maps, both pruned lazily (no timers):
 * - `enterTokens`: minted per forward by {@link issueEnterToken} (desktop
 *   `POST /api/ports/forward`/`POST /api/ports/enter`), consumed by a browser
 *   navigation to `GET /forward/<id>/enter?fwt=<token>`. Multi-use within its
 *   TTL — the phone may reopen the same forward's tab more than once — so
 *   consuming a token does not delete it.
 * - `sessions`: minted on a successful enter-token consume, looked up by
 *   {@link resolveSession} on every proxied request/upgrade. Sliding TTL: a
 *   live tab keeps refreshing its session's expiry.
 *
 * Electron-free by design, like {@link RemotePortForwardGateway} — constructed
 * and injected the same way in the Electron main composition root and the
 * headless server.
 */
export class PortProxy {
  private readonly enterTokens = new Map<string, EnterTokenEntry>();
  private readonly sessions = new Map<string, ForwardSessionEntry>();
  private disposed = false;

  constructor(private readonly options: PortProxyOptions) {}

  /** Mints a fresh enter token for `forwardId`. Safe to call repeatedly for the
   * same forward (e.g. once at `POST /api/ports/forward` time and again from
   * `POST /api/ports/enter` right before the browser opens the tab, so the
   * token used is always fresh) — old tokens for the forward stay valid until
   * their own TTL elapses. */
  issueEnterToken(forwardId: string): IssuedEnterToken {
    this.pruneEnterTokens();
    const token = randomToken();
    const expiresAtMs = Date.now() + (this.options.enterTokenTtlMs ?? DEFAULT_ENTER_TOKEN_TTL_MS);
    this.enterTokens.set(token, { forwardId, expiresAtMs });
    return { token, path: `/forward/${encodeURIComponent(forwardId)}/enter?fwt=${token}` };
  }

  /**
   * Validates an enter token against the forward id it was issued for and
   * mints a cookie session on success. Returns `null` on a missing/expired
   * token, a token minted for a different forward, or a forward the gateway no
   * longer has open (stopped since the token was issued) — the caller renders
   * a plain error page in every `null` case, never distinguishing why.
   */
  consumeEnterToken(forwardId: string, token: string): ConsumedEnterToken | null {
    if (this.disposed || !token) return null;
    this.pruneEnterTokens();
    const entry = this.enterTokens.get(token);
    if (!entry || entry.forwardId !== forwardId) return null;
    if (!this.forwardIsOpen(forwardId)) return null;

    const sessionId = randomToken();
    const maxAgeMs = this.options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
    this.sessions.set(sessionId, { forwardId, expiresAtMs: Date.now() + maxAgeMs });
    return { sessionId, maxAgeMs };
  }

  /**
   * Resolves an inbound `Cookie` header to the active forward's target port,
   * or `null` when there is no valid session — including when the session's
   * forward has since been stopped, which invalidates it immediately rather
   * than waiting out its TTL. Slides the session's expiry forward on success.
   */
  resolveSession(cookieHeader: string | undefined): number | null {
    if (this.disposed) return null;
    const sessionId = parseCookieValue(cookieHeader, FORWARD_SESSION_COOKIE_NAME);
    if (!sessionId) return null;
    this.pruneSessions();
    const session = this.sessions.get(sessionId);
    if (!session || session.expiresAtMs <= Date.now()) return null;

    const forward = this.forwardIsOpen(session.forwardId);
    if (!forward) {
      this.sessions.delete(sessionId);
      return null;
    }
    session.expiresAtMs = Date.now() + (this.options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS);
    return forward.targetPort;
  }

  /** Closes every in-memory token/session; safe to call multiple times. Does
   * not touch the gateway (owned/disposed separately). */
  dispose(): void {
    this.disposed = true;
    this.enterTokens.clear();
    this.sessions.clear();
  }

  private forwardIsOpen(forwardId: string): { readonly targetPort: number } | null {
    return this.options.gateway.getForward(forwardId);
  }

  private pruneEnterTokens(): void {
    const now = Date.now();
    for (const [token, entry] of this.enterTokens) {
      if (entry.expiresAtMs <= now) this.enterTokens.delete(token);
    }
  }

  private pruneSessions(): void {
    const now = Date.now();
    for (const [sessionId, entry] of this.sessions) {
      if (entry.expiresAtMs <= now) this.sessions.delete(sessionId);
    }
  }
}

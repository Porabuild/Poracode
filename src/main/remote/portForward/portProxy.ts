import { randomBytes } from "node:crypto";
import type { ForwardLifetime, RemotePortForwardGateway } from "../RemotePortForwardGateway";
import { ForwardOriginPolicy } from "./forwardOrigin";
import {
  type ForwardOriginAvailability,
  type ForwardOriginIdentity,
} from "./forwardOriginIdentity";

/** Enter tokens (one-time-ish, but multi-use within TTL) let a `GET
 * /forward/<id>/enter` browser navigation start the two-hop entry into a
 * forward's isolated child origin without a bearer header (browsers can't
 * attach one to a navigation). */
const DEFAULT_ENTER_TOKEN_TTL_MS = 10 * 60 * 1000;
/** Cookie sessions are long-lived (a phone may keep a forwarded tab open for a
 * whole workday) and slide forward on every use. */
const DEFAULT_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
/** Exchange capabilities bridge the API-origin entry redirect to the child
 * origin's cookie mint; one use, short TTL, bound to forward + origin. */
const DEFAULT_EXCHANGE_TTL_MS = 60 * 1000;

/**
 * Cookie name the host mints on a forward's isolated HTTPS child origin
 * (`__Host-` prefix: Secure, Path=/, no Domain — the browser enforces all
 * three, so a sibling or parent origin can neither read nor overwrite it). The
 * session it names is bound server-side to BOTH the forward UUID and the exact
 * external child origin, so a copied cookie cannot authenticate a different
 * forward or the PWA/API origin. Never minted on the API origin: the legacy
 * shared `lc_forward` API-origin session is gone.
 */
export const FORWARD_ORIGIN_SESSION_COOKIE_NAME = "__Host-poracode-forward";

/**
 * The one narrowly reserved path on a child origin. Everything else — `/`,
 * `/api/*`, `/ws`, dotfiles — belongs to the forwarded application and is
 * proxied upstream verbatim.
 */
export const FORWARD_ORIGIN_EXCHANGE_PATH = "/.poracode-forward/exchange";

/** Session/capability values are opaque 32-byte base64url tokens (43 chars);
 * the strict shape check doubles as canonicalization defense (no percent
 * decoding) when parsing them out of a raw Cookie header. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

interface EnterTokenEntry {
  readonly forwardId: string;
  /** The exact external child origin this entry may exchange on; `null` only
   * when browser forwarding is unconfigured (raw-forward create). */
  readonly origin: string | null;
  expiresAtMs: number;
}

interface ExchangeEntry {
  readonly forwardId: string;
  readonly origin: string;
  expiresAtMs: number;
}

interface ForwardSessionEntry {
  readonly forwardId: string;
  readonly origin: string;
  expiresAtMs: number;
}

export interface PortProxyOptions {
  /** The forward registry: session/exchange resolution re-checks that the
   * forward is still open, so stopping a forward invalidates every minted
   * credential for it without this class needing its own teardown hook into
   * the gateway. */
  readonly gateway: RemotePortForwardGateway;
  /** Configured child-origin identity. Absent = browser-origin forwarding
   * unavailable: enter tokens are still issued for raw-forward bookkeeping but
   * never exchange into a session. */
  readonly forwardOrigin?: ForwardOriginIdentity;
  readonly enterTokenTtlMs?: number;
  readonly sessionTtlMs?: number;
  readonly exchangeTtlMs?: number;
}

export interface IssuedEnterToken {
  readonly token: string;
  /** `/forward/<forwardId>/enter?fwt=<token>` — a full path (no origin), ready
   * to resolve against the host's advertised API origin. The browser flow then
   * redirects off-origin to the isolated child origin. */
  readonly path: string;
}

export interface BegunExchange {
  /** The exact external child origin the exchange lives on. */
  readonly childOrigin: string;
  /** Full `https://<child>/.poracode-forward/exchange?fx=<capability>` URL —
   * the no-store redirect target for the API-origin enter route. */
  readonly exchangeUrl: string;
}

export interface ConsumedExchange {
  /** The freshly-minted session id; the caller wraps it in the
   * `__Host-poracode-forward` Set-Cookie header on the child origin. */
  readonly sessionId: string;
  readonly maxAgeMs: number;
}

function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Authenticated HTTP/WS reverse-proxy session layer for port forwards,
 * isolated per browser origin ({@link ForwardOriginIdentity}): a forwarded dev
 * server is reached on its own generated HTTPS child origin — never on the
 * PWA/API origin — with the whole credential chain (enter token → one-use
 * exchange capability → `__Host-` cookie session) bound to the exact forward
 * instance and external origin.
 *
 * Three short-lived, in-memory maps, all pruned lazily (no timers):
 * - `enterTokens`: minted per forward by {@link issueEnterToken} (bearer-gated
 *   `POST /api/ports/forward` / `POST /api/ports/enter`), validated by the
 *   API-origin `GET /forward/<id>/enter` route. Multi-use within its TTL so a
 *   phone can reopen the same forward; each use mints a fresh exchange
 *   capability, never a cookie directly.
 * - `exchanges`: one-use capabilities minted by {@link beginExchange} and
 *   consumed by {@link consumeExchangeCapability} on the child origin.
 * - `sessions`: minted only by a successful exchange, resolved by
 *   {@link resolveOriginSession} on every child-origin request/upgrade against
 *   BOTH the forward UUID and the exact external origin. Sliding TTL.
 *
 * Electron-free by design, like {@link RemotePortForwardGateway} — constructed
 * and injected the same way in the Electron main composition root and the
 * headless server.
 */
export class PortProxy {
  private readonly enterTokens = new Map<string, EnterTokenEntry>();
  private readonly exchanges = new Map<string, ExchangeEntry>();
  private readonly sessions = new Map<string, ForwardSessionEntry>();
  /** Rebuilt once from `forwardOrigin`; `null` when browser forwarding is
   * unconfigured. */
  private readonly policy: ForwardOriginPolicy | null;
  private disposed = false;

  constructor(private readonly options: PortProxyOptions) {
    this.policy = options.forwardOrigin
      ? new ForwardOriginPolicy(options.forwardOrigin.baseUrl)
      : null;
  }

  /** Mints a fresh enter token for `forwardId`. Safe to call repeatedly for the
   * same forward (e.g. once at `POST /api/ports/forward` time and again from
   * `POST /api/ports/enter` right before the browser opens the tab, so the
   * token used is always fresh) — old tokens for the forward stay valid until
   * their own TTL elapses. The token binds the forward's intended child origin;
   * without a configured forward origin it can never exchange into a session. */
  issueEnterToken(
    forwardId: string,
    identity: ForwardOriginIdentity | null = this.options.forwardOrigin ?? null,
  ): IssuedEnterToken {
    this.pruneEnterTokens();
    const token = randomToken();
    const expiresAtMs = Date.now() + (this.options.enterTokenTtlMs ?? DEFAULT_ENTER_TOKEN_TTL_MS);
    const origin = this.childOrigin(forwardId, identity);
    this.enterTokens.set(token, { forwardId, origin, expiresAtMs });
    return { token, path: `/forward/${encodeURIComponent(forwardId)}/enter?fwt=${token}` };
  }

  /**
   * Validates an API-origin enter token and mints the ONE-USE exchange
   * capability for its bound child origin: the redirect target the enter route
   * sends the browser to. Returns `null` on a missing/expired/mismatched
   * token, no configured forward origin, or a forward that is no longer open.
   * The token itself stays valid (legitimate reopening re-runs the flow);
   * only the exchange capability is single-shot.
   */
  beginExchange(forwardId: string, token: string): BegunExchange | null {
    if (this.disposed || !token || !TOKEN_PATTERN.test(token)) return null;
    this.pruneEnterTokens();
    const entry = this.enterTokens.get(token);
    if (!entry || entry.forwardId !== forwardId || !entry.origin) return null;
    if (entry.expiresAtMs <= Date.now()) return null;
    if (!this.forwardIsOpen(forwardId)) return null;

    const capability = randomToken();
    this.exchanges.set(capability, {
      forwardId,
      origin: entry.origin,
      expiresAtMs: Date.now() + (this.options.exchangeTtlMs ?? DEFAULT_EXCHANGE_TTL_MS),
    });
    return {
      childOrigin: entry.origin,
      exchangeUrl: `${entry.origin}${FORWARD_ORIGIN_EXCHANGE_PATH}?fx=${capability}`,
    };
  }

  /**
   * Consumes an exchange capability on the child origin: one use, exact
   * (forwardId, origin) binding, live forward, unexpired. Mints the
   * `__Host-poracode-forward` cookie session on success. Any failure returns
   * `null` and leaves the invalid capability unusable.
   */
  consumeExchangeCapability(
    forwardId: string,
    origin: string,
    capability: string,
  ): ConsumedExchange | null {
    if (this.disposed || !capability || !TOKEN_PATTERN.test(capability)) return null;
    this.pruneExchanges();
    const entry = this.exchanges.get(capability);
    if (!entry || entry.forwardId !== forwardId || entry.origin !== origin) return null;
    if (entry.expiresAtMs <= Date.now()) {
      this.exchanges.delete(capability);
      return null;
    }
    if (!this.forwardIsOpen(forwardId)) return null;

    // One use: gone before anything else can observe it.
    this.exchanges.delete(capability);
    const sessionId = randomToken();
    const maxAgeMs = this.options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
    this.sessions.set(sessionId, { forwardId, origin, expiresAtMs: Date.now() + maxAgeMs });
    return { sessionId, maxAgeMs };
  }

  /**
   * Resolves an inbound `Cookie` header to a forward's {@link ForwardLifetime}
   * — the exact forward instance and revocation signal — for the child origin
   * asking. Every gate applies on every operation:
   * - strict reserved-name parsing: case-sensitive name, canonical value
   *   shape, and AMBIGUOUS DUPLICATES REJECTED (two crumbs with the reserved
   *   name yield no session rather than first/last-wins);
   * - the session must match BOTH the forward UUID and the exact external
   *   origin, so a cookie for A cannot authenticate B even if manually copied,
   *   and no cookie authenticates anything on the PWA/API origin;
   * - the forward must still be open (a stopped forward's session resolves to
   *   `null` immediately and is deleted rather than waiting out its TTL);
   * - a successful resolution slides the session's expiry forward.
   */
  resolveOriginSession(
    cookieHeader: string | undefined,
    expected: { readonly forwardId: string; readonly origin: string },
  ): ForwardLifetime | null {
    if (this.disposed) return null;
    const sessionId = this.readStrictSessionCookie(cookieHeader);
    if (!sessionId) return null;
    this.pruneSessions();
    const session = this.sessions.get(sessionId);
    if (!session || session.expiresAtMs <= Date.now()) return null;
    if (session.forwardId !== expected.forwardId || session.origin !== expected.origin) {
      return null;
    }

    const lifetime = this.options.gateway.acquireForwardLifetime(session.forwardId);
    if (!lifetime) {
      this.sessions.delete(sessionId);
      return null;
    }
    session.expiresAtMs = Date.now() + (this.options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS);
    return lifetime;
  }

  /** Availability facts for the browser-forward capability descriptor. */
  forwardOriginAvailability(
    identity: ForwardOriginIdentity | null = this.options.forwardOrigin ?? null,
  ): ForwardOriginAvailability {
    return identity
      ? { available: true, baseUrl: identity.baseUrl, ownerId: identity.ownerId }
      : { available: false, baseUrl: null, ownerId: null };
  }

  /** Closes every in-memory token/capability/session; safe to call multiple
   * times. Does not touch the gateway (owned/disposed separately). */
  dispose(): void {
    this.disposed = true;
    this.enterTokens.clear();
    this.exchanges.clear();
    this.sessions.clear();
  }

  /** The selected ingress identity is supplied by authenticated server routing. */
  private childOrigin(forwardId: string, identity: ForwardOriginIdentity | null): string | null {
    if (!identity) return null;
    const policy =
      identity === this.options.forwardOrigin
        ? this.policy!
        : new ForwardOriginPolicy(identity.baseUrl);
    return policy.originFor(identity.ownerId, forwardId);
  }

  /**
   * Parses the reserved session cookie out of a raw `Cookie` header without
   * percent-decoding (our values are canonical base64url). Duplicate crumbs
   * with the reserved name are ambiguous — rejected outright, never
   * first/last-wins.
   */
  private readStrictSessionCookie(cookieHeader: string | undefined): string | null {
    if (!cookieHeader) return null;
    let count = 0;
    let value: string | null = null;
    for (const crumb of cookieHeader.split(";")) {
      const eq = crumb.indexOf("=");
      if (eq === -1) continue;
      if (crumb.slice(0, eq).trim() !== FORWARD_ORIGIN_SESSION_COOKIE_NAME) continue;
      count += 1;
      const candidate = crumb.slice(eq + 1).trim();
      if (TOKEN_PATTERN.test(candidate)) value = candidate;
    }
    return count === 1 ? value : null;
  }

  private forwardIsOpen(forwardId: string): boolean {
    return this.options.gateway.getForward(forwardId) !== null;
  }

  private pruneEnterTokens(): void {
    const now = Date.now();
    for (const [token, entry] of this.enterTokens) {
      if (entry.expiresAtMs <= now) this.enterTokens.delete(token);
    }
  }

  private pruneExchanges(): void {
    const now = Date.now();
    for (const [capability, entry] of this.exchanges) {
      if (entry.expiresAtMs <= now) this.exchanges.delete(capability);
    }
  }

  private pruneSessions(): void {
    const now = Date.now();
    for (const [sessionId, entry] of this.sessions) {
      if (entry.expiresAtMs <= now) this.sessions.delete(sessionId);
    }
  }
}

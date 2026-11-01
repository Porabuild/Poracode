import { createHash, randomBytes } from "node:crypto";
import { RemoteHttpError } from "../auth";

export const PLAYBACK_GRANT_TTL_MS = 120_000;
const MAX_PLAYBACK_GRANTS = 256;
const MAX_SESSION_PLAYBACK_GRANTS = 32;

interface PlaybackGrant<T> {
  readonly value: T;
  readonly sessionId: string;
  /** Admission expiry: new reads/renews are refused at and past this instant. */
  expiresAtMs: number;
  /** Session authority hard expiry: retirement at this instant, holds or not. */
  hardAuthorityExpiresAtMs: number;
  /** Already-running transfers pinning retirement (never admission). */
  holds: number;
  readonly controller: AbortController;
  timer: ReturnType<typeof setTimeout>;
  readonly onRetire?: () => void;
}

/** Volatile hashed grants. Retirement also stops transfers already using the grant. */
export class PlaybackGrants<T> {
  private readonly grants = new Map<string, PlaybackGrant<T>>();

  issue(
    value: T,
    sessionId: string,
    sessionExpiresAtMs: number,
    onRetire?: () => void,
    admissionExpiresAtMs = Number.POSITIVE_INFINITY,
  ): { ticket: string; expiresAt: string } {
    this.prune();
    if (
      this.grants.size >= MAX_PLAYBACK_GRANTS ||
      [...this.grants.values()].filter((entry) => entry.sessionId === sessionId).length >=
        MAX_SESSION_PLAYBACK_GRANTS
    ) {
      throw new RemoteHttpError("media_grants_busy", "Too many media previews are open.", 429);
    }
    const hardAuthorityExpiresAtMs = sessionExpiresAtMs;
    const expiresAtMs = Math.min(
      Date.now() + PLAYBACK_GRANT_TTL_MS,
      hardAuthorityExpiresAtMs,
      admissionExpiresAtMs,
    );
    if (expiresAtMs <= Date.now()) throw this.invalid();
    const ticket = `pc_media_${randomBytes(32).toString("base64url")}`;
    const key = this.key(ticket);
    const entry: PlaybackGrant<T> = {
      value,
      sessionId,
      expiresAtMs,
      hardAuthorityExpiresAtMs,
      holds: 0,
      controller: new AbortController(),
      timer: setTimeout(() => undefined, 0),
      ...(onRetire ? { onRetire } : {}),
    };
    clearTimeout(entry.timer);
    entry.timer = this.arm(entry, key, expiresAtMs);
    this.grants.set(key, entry);
    return { ticket, expiresAt: new Date(expiresAtMs).toISOString() };
  }

  /**
   * At the admission deadline a held grant is not retired: its active transfer
   * keeps running until the last hold is released or the hard session-authority
   * expiry. Without holds, or at hard expiry, retirement is immediate.
   */
  private arm(entry: PlaybackGrant<T>, key: string, atMs: number) {
    clearTimeout(entry.timer);
    const timer = setTimeout(() => this.expire(key), Math.max(0, atMs - Date.now()));
    timer.unref();
    return timer;
  }

  private expire(key: string): void {
    const entry = this.grants.get(key);
    if (!entry) return;
    const now = Date.now();
    if (entry.hardAuthorityExpiresAtMs <= now) {
      this.retire(key);
      return;
    }
    if (entry.expiresAtMs <= now && entry.holds === 0) {
      this.retire(key);
      return;
    }
    // Alive: the next boundary is admission expiry, or the hard expiry when a
    // held transfer survives past admission.
    const next = entry.expiresAtMs > now ? entry.expiresAtMs : entry.hardAuthorityExpiresAtMs;
    entry.timer = this.arm(entry, key, next);
  }

  read(ticket: string): { value: T; sessionId: string; signal: AbortSignal; expiresAtMs: number } {
    const key = this.key(ticket);
    const entry = this.grants.get(key);
    if (!entry) throw this.invalid();
    if (entry.hardAuthorityExpiresAtMs <= Date.now()) {
      this.retire(key);
      throw this.invalid();
    }
    if (entry.expiresAtMs <= Date.now()) {
      // A held stream survives admission expiry; only unheld grants retire.
      if (entry.holds > 0) throw this.invalid();
      this.retire(key);
      throw this.invalid();
    }
    return {
      value: entry.value,
      sessionId: entry.sessionId,
      signal: entry.controller.signal,
      expiresAtMs: entry.expiresAtMs,
    };
  }

  /**
   * Pin an already-authorized in-flight transfer past the admission deadline.
   * Does not extend admission: new reads/renews still refuse at expiresAtMs.
   * The returned release is idempotent; the last release after expiry retires.
   */
  hold(ticket: string): () => void {
    const key = this.key(ticket);
    const entry = this.grants.get(key);
    if (!entry || entry.expiresAtMs <= Date.now()) throw this.invalid();
    entry.holds += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      entry.holds = Math.max(0, entry.holds - 1);
      if (entry.holds === 0 && this.grants.get(key) === entry && entry.expiresAtMs <= Date.now())
        this.retire(key);
    };
  }

  /** The caller must revalidate authority and value before renewing. Never resurrect a retired grant. */
  renew(
    ticket: string,
    sessionId: string,
    authorityExpiresAtMs: number,
    admissionExpiresAtMs = Number.POSITIVE_INFINITY,
  ): { ticket: string; expiresAt: string } {
    const grant = this.read(ticket);
    if (grant.sessionId !== sessionId) throw this.invalid();
    const expiresAtMs = Math.min(
      Date.now() + PLAYBACK_GRANT_TTL_MS,
      authorityExpiresAtMs,
      admissionExpiresAtMs,
    );
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) throw this.invalid();
    const key = this.key(ticket);
    const entry = this.grants.get(key)!;
    clearTimeout(entry.timer);
    entry.expiresAtMs = expiresAtMs;
    entry.hardAuthorityExpiresAtMs = authorityExpiresAtMs;
    entry.timer = this.arm(entry, key, expiresAtMs);
    // The controller, value, and retirement hook stay owned by the original ticket.
    return { ticket, expiresAt: new Date(expiresAtMs).toISOString() };
  }

  release(ticket: string, sessionId: string, accept?: (value: T) => boolean): void {
    const key = this.key(ticket);
    const entry = this.grants.get(key);
    if (entry?.sessionId !== sessionId) return;
    if (accept && !accept(entry.value)) return;
    this.retire(key);
  }

  revokeSession(sessionId: string): void {
    for (const [key, entry] of this.grants) if (entry.sessionId === sessionId) this.retire(key);
  }

  clear(): void {
    for (const key of this.grants.keys()) this.retire(key);
  }

  private prune(): void {
    // Reuses the same hold-aware expiry: a held in-flight transfer is never
    // force-retired just because a new grant was issued.
    for (const key of this.grants.keys()) this.expire(key);
  }

  private retire(key: string): void {
    const entry = this.grants.get(key);
    if (!entry) return;
    this.grants.delete(key);
    clearTimeout(entry.timer);
    entry.onRetire?.();
    entry.controller.abort();
  }

  private key(ticket: string): string {
    return createHash("sha256").update(ticket).digest("hex");
  }

  private invalid(): RemoteHttpError {
    return new RemoteHttpError("invalid_media_ticket", "The media preview has expired.", 401);
  }
}

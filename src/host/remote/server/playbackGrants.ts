import { createHash, randomBytes } from "node:crypto";
import { RemoteHttpError } from "../auth";

export const PLAYBACK_GRANT_TTL_MS = 120_000;
const MAX_PLAYBACK_GRANTS = 256;
const MAX_SESSION_PLAYBACK_GRANTS = 32;

interface PlaybackGrant<T> {
  readonly value: T;
  readonly sessionId: string;
  readonly expiresAtMs: number;
  readonly controller: AbortController;
  readonly timer: ReturnType<typeof setTimeout>;
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
  ): { ticket: string; expiresAt: string } {
    this.prune();
    if (
      this.grants.size >= MAX_PLAYBACK_GRANTS ||
      [...this.grants.values()].filter((entry) => entry.sessionId === sessionId).length >=
        MAX_SESSION_PLAYBACK_GRANTS
    ) {
      throw new RemoteHttpError("media_grants_busy", "Too many media previews are open.", 429);
    }
    const expiresAtMs = Math.min(Date.now() + PLAYBACK_GRANT_TTL_MS, sessionExpiresAtMs);
    if (expiresAtMs <= Date.now()) throw this.invalid();
    const ticket = `pc_media_${randomBytes(32).toString("base64url")}`;
    const key = this.key(ticket);
    const timer = setTimeout(() => this.retire(key), expiresAtMs - Date.now());
    timer.unref();
    this.grants.set(key, {
      value,
      sessionId,
      expiresAtMs,
      controller: new AbortController(),
      timer,
      ...(onRetire ? { onRetire } : {}),
    });
    return { ticket, expiresAt: new Date(expiresAtMs).toISOString() };
  }

  read(ticket: string): { value: T; sessionId: string; signal: AbortSignal } {
    const key = this.key(ticket);
    const entry = this.grants.get(key);
    if (!entry || entry.expiresAtMs <= Date.now()) {
      this.retire(key);
      throw this.invalid();
    }
    return { value: entry.value, sessionId: entry.sessionId, signal: entry.controller.signal };
  }

  release(ticket: string, sessionId: string): void {
    const key = this.key(ticket);
    if (this.grants.get(key)?.sessionId === sessionId) this.retire(key);
  }

  revokeSession(sessionId: string): void {
    for (const [key, entry] of this.grants) if (entry.sessionId === sessionId) this.retire(key);
  }

  clear(): void {
    for (const key of this.grants.keys()) this.retire(key);
  }

  private prune(): void {
    for (const [key, entry] of this.grants) if (entry.expiresAtMs <= Date.now()) this.retire(key);
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

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { writeFileAtomic } from "@/shared/atomicFile";
import {
  REMOTE_OPERATOR_SCOPES,
  remoteAccessScopeSchema,
  remoteClientMetadataSchema,
  type RemoteAccessScope,
  type RemoteAccessSessionSummary,
  type RemoteAccessTokenResult,
  type RemoteClientMetadata,
  type RemoteWebSocketTicketResult,
} from "@/shared/remote";

/**
 * How long a one-time pairing credential stays redeemable. The expiry travels to
 * the settings UI as `pairingExpiresAt`, so a shown code can be replaced before
 * it lapses — a code redeemed past its TTL fails as `invalid_pairing_token`,
 * which reads to the user as an unreachable desktop.
 */
const DEFAULT_PAIRING_TTL_MS = 10 * 60 * 1000;
/**
 * Gate 6 item 4.6 (S6): the long-lived 30-day non-rotating bearer is gone.
 * Access tokens now live 24 hours; the 30-day lifetime moved to the refresh
 * token, so a captured bearer is worthless after a day instead of a month.
 */
const DEFAULT_ACCESS_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_WEBSOCKET_TICKET_TTL_MS = 30 * 1000;

/** Error surfaced to remote clients as an HTTP status plus a JSON error body. */
export class RemoteHttpError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "RemoteHttpError";
  }
}

/** V6 A.7: a previously rotated refresh token was presented again. The
 * caller MUST revoke the session family (and close live sockets) before
 * surfacing the 401 — the store itself leaves the row in place so the
 * server's single revoke path owns WebSocket teardown. */
export class RefreshTokenReuseError extends RemoteHttpError {
  constructor(readonly sessionId: string) {
    super(
      "refresh_token_reused",
      "Refresh token reuse detected; the session family was revoked.",
      401,
    );
    this.name = "RefreshTokenReuseError";
  }
}

interface StoredPairingCredential {
  readonly id: string;
  readonly tokenHash: string;
  readonly scopes: readonly RemoteAccessScope[];
  readonly label: string | undefined;
  readonly expiresAtMs: number;
}

interface StoredAccessSession {
  readonly id: string;
  readonly tokenHash: string;
  readonly scopes: readonly RemoteAccessScope[];
  readonly client: RemoteClientMetadata | undefined;
  readonly issuedAtMs: number;
  readonly expiresAtMs: number;
  /** Hash of the session's refresh token (Gate 6 item 4.6). Absent on sessions
   * persisted by a host that predates the refresh lifecycle — those keep their
   * long-lived access token and simply never refresh. */
  readonly refreshTokenHash?: string | undefined;
  /** Absolute expiry of the refresh token; the token VALUE rotates on every
   * refresh but its deadline is fixed at pairing. */
  readonly refreshExpiresAtMs?: number | undefined;
}

const persistedAccessSessionSchema = z.object({
  id: z.string().min(1),
  tokenHash: z.string().min(1),
  scopes: z.array(remoteAccessScopeSchema),
  client: remoteClientMetadataSchema.optional(),
  issuedAtMs: z.number().int().nonnegative(),
  expiresAtMs: z.number().int().nonnegative(),
  refreshTokenHash: z.string().min(1).optional(),
  refreshExpiresAtMs: z.number().int().nonnegative().optional(),
});

/**
 * Server-side revocation list (Gate 6 item 4.6): hashes of access AND refresh
 * tokens that were explicitly revoked. Rows are deleted on revoke, but the
 * hash is also remembered until its natural expiry so a replayed token stays
 * rejected across restarts even if a same-hash row ever reappeared.
 */
const persistedRevokedTokenSchema = z.object({
  tokenHash: z.string().min(1),
  expiresAtMs: z.number().int().nonnegative(),
});

/** Hashes of refresh tokens that have already been rotated out of a live
 * session (V6 A.7). A later presentation of one of these hashes is reuse:
 * the family is revoked rather than treated as an unknown token. */
const persistedRotatedRefreshHashSchema = z.object({
  tokenHash: z.string().min(1),
  sessionId: z.string().min(1),
  expiresAtMs: z.number().int().nonnegative(),
});

const remoteAuthFileSchema = z.object({
  accessSessions: z.array(persistedAccessSessionSchema),
  revokedTokenHashes: z.array(persistedRevokedTokenSchema).default([]),
  rotatedRefreshHashes: z.array(persistedRotatedRefreshHashSchema).default([]),
});

type PersistedAccessSession = z.infer<typeof persistedAccessSessionSchema>;
type PersistedRevokedToken = z.infer<typeof persistedRevokedTokenSchema>;
type PersistedRotatedRefreshHash = z.infer<typeof persistedRotatedRefreshHashSchema>;

export interface PersistedRemoteAuthFile {
  readonly accessSessions: readonly PersistedAccessSession[];
  readonly revokedTokenHashes: readonly PersistedRevokedToken[];
  readonly rotatedRefreshHashes?: readonly PersistedRotatedRefreshHash[];
}

interface StoredWebSocketTicket {
  readonly ticketHash: string;
  readonly sessionId: string;
  readonly expiresAtMs: number;
}

export interface IssuedPairingCredential {
  readonly id: string;
  readonly credential: string;
  readonly scopes: readonly RemoteAccessScope[];
  readonly label: string | undefined;
  readonly expiresAt: string;
}

export interface AuthenticatedRemoteSession {
  readonly sessionId: string;
  readonly scopes: readonly RemoteAccessScope[];
  readonly client: RemoteClientMetadata | undefined;
  readonly expiresAtMs: number;
}

interface RemoteAuthStoreOptions {
  readonly accessSessions?: readonly PersistedAccessSession[];
  readonly revokedTokenHashes?: readonly PersistedRevokedToken[];
  readonly rotatedRefreshHashes?: readonly PersistedRotatedRefreshHash[];
  onAccessSessionsChanged?(sessions: readonly PersistedAccessSession[]): void;
  onPersistedStateChanged?(state: PersistedRemoteAuthFile): void;
}

function randomCredential(prefix: string): string {
  return `${prefix}_${randomBytes(32).toString("base64url")}`;
}

function hashCredential(credential: string): string {
  return createHash("sha256").update(credential).digest("hex");
}

function toIso(expiresAtMs: number): string {
  return new Date(expiresAtMs).toISOString();
}

function hasScopes(granted: readonly RemoteAccessScope[], required: readonly RemoteAccessScope[]) {
  return required.every((scope) => granted.includes(scope));
}

/** Keep a refreshable session after its bearer expires; authentication still
 * enforces the access deadline separately. Legacy rows have no refresh grant. */
function sessionRetentionDeadline(
  session: Pick<StoredAccessSession, "expiresAtMs" | "refreshTokenHash" | "refreshExpiresAtMs">,
): number {
  return Math.max(
    session.expiresAtMs,
    session.refreshTokenHash ? (session.refreshExpiresAtMs ?? 0) : 0,
  );
}

function toAuthenticatedSession(session: StoredAccessSession): AuthenticatedRemoteSession {
  return {
    sessionId: session.id,
    scopes: session.scopes,
    client: session.client,
    expiresAtMs: session.expiresAtMs,
  };
}

export class RemoteAuthStore {
  private readonly pairingCredentials = new Map<string, StoredPairingCredential>();
  private readonly accessSessions = new Map<string, StoredAccessSession>();
  private readonly websocketTickets = new Map<string, StoredWebSocketTicket>();
  /** Revoked token hashes (access AND refresh) until their natural expiry. */
  private readonly revokedTokenHashes = new Map<string, number>();
  /** Rotated-out refresh hashes → owning session (V6 A.7 reuse detection). */
  private readonly rotatedRefreshHashes = new Map<
    string,
    { readonly sessionId: string; readonly expiresAtMs: number }
  >();

  constructor(private readonly options: RemoteAuthStoreOptions = {}) {
    for (const session of options.accessSessions ?? []) {
      if (sessionRetentionDeadline(session) <= Date.now()) continue;
      this.accessSessions.set(session.tokenHash, {
        ...session,
        client: session.client,
      });
    }
    for (const entry of options.revokedTokenHashes ?? []) {
      if (entry.expiresAtMs <= Date.now()) continue;
      this.revokedTokenHashes.set(entry.tokenHash, entry.expiresAtMs);
    }
    for (const entry of options.rotatedRefreshHashes ?? []) {
      if (entry.expiresAtMs <= Date.now()) continue;
      this.rotatedRefreshHashes.set(entry.tokenHash, {
        sessionId: entry.sessionId,
        expiresAtMs: entry.expiresAtMs,
      });
    }
  }

  issuePairingCredential(input?: {
    readonly scopes?: readonly RemoteAccessScope[];
    readonly label?: string;
    readonly ttlMs?: number;
  }): IssuedPairingCredential {
    this.pruneExpired();
    const credential = randomCredential("lc_pair");
    const expiresAtMs = Date.now() + (input?.ttlMs ?? DEFAULT_PAIRING_TTL_MS);
    const id = randomUUID();
    const stored: StoredPairingCredential = {
      id,
      tokenHash: hashCredential(credential),
      // Gate 6 item 4.3 (S2): the pairing credential is the scope ceiling. The
      // default grant is the operator preset (the historical full mutating
      // set); a host deliberately issuing a read-only device passes the
      // viewer preset (see REMOTE_ACCESS_SCOPE_PRESETS) and the exchange can
      // never widen beyond what the credential carries.
      scopes: input?.scopes ?? REMOTE_OPERATOR_SCOPES,
      label: input?.label,
      expiresAtMs,
    };
    this.pairingCredentials.set(stored.tokenHash, stored);
    return {
      id,
      credential,
      scopes: stored.scopes,
      label: stored.label,
      expiresAt: toIso(expiresAtMs),
    };
  }

  revokePairingCredential(credential: string): boolean {
    return this.pairingCredentials.delete(hashCredential(credential));
  }

  exchangePairingCredential(input: {
    readonly credential: string;
    readonly scopes?: readonly RemoteAccessScope[];
    readonly client?: RemoteClientMetadata;
    readonly ttlMs?: number;
  }): RemoteAccessTokenResult {
    this.pruneExpired();
    const tokenHash = hashCredential(input.credential);
    const grant = this.pairingCredentials.get(tokenHash);
    if (!grant) {
      throw new RemoteHttpError("invalid_pairing_token", "Invalid pairing token.", 401);
    }

    // The exchange request may narrow (or, when omitted, inherit the
    // credential's scopes) but never widen them: over-requests are rejected so
    // a client can never hold more than the issued pairing grant.
    const requestedScopes = input.scopes ?? grant.scopes;
    if (!hasScopes(grant.scopes, requestedScopes)) {
      throw new RemoteHttpError(
        "scope_not_granted",
        "Pairing token does not grant the requested scopes.",
        403,
      );
    }

    this.pairingCredentials.delete(tokenHash);
    const accessToken = randomCredential("lc_access");
    const refreshToken = randomCredential("lc_refresh");
    const now = Date.now();
    const expiresAtMs = now + (input.ttlMs ?? DEFAULT_ACCESS_TOKEN_TTL_MS);
    const refreshExpiresAtMs = now + DEFAULT_REFRESH_TOKEN_TTL_MS;
    const session: StoredAccessSession = {
      id: randomUUID(),
      tokenHash: hashCredential(accessToken),
      scopes: requestedScopes,
      client: input.client,
      issuedAtMs: now,
      expiresAtMs,
      refreshTokenHash: hashCredential(refreshToken),
      refreshExpiresAtMs,
    };
    this.accessSessions.set(session.tokenHash, session);
    this.persistAccessSessions();

    return {
      accessToken,
      tokenType: "Bearer",
      expiresAt: toIso(expiresAtMs),
      scopes: [...requestedScopes],
      refreshToken,
      refreshTokenExpiresAt: toIso(refreshExpiresAtMs),
    };
  }

  /**
   * Gate 6 item 4.6 (S6): exchanges a live refresh token for a fresh
   * 24-hour access token. The refresh token VALUE rotates on every use
   * (old value stops working) while its absolute 30-day deadline is fixed at
   * pairing, so a client that keeps refreshing re-pairs monthly and a captured
   * refresh token window is one use. Revoked refresh tokens are rejected even
   * before their row would have been found.
   */
  refreshAccessToken(input: {
    readonly refreshToken: string;
    readonly accessTtlMs?: number;
  }): RemoteAccessTokenResult {
    this.pruneExpired();
    const refreshTokenHash = hashCredential(input.refreshToken);
    const reused = this.rotatedRefreshHashes.get(refreshTokenHash);
    if (reused && reused.expiresAtMs > Date.now()) {
      throw new RefreshTokenReuseError(reused.sessionId);
    }
    const session = [...this.accessSessions.values()].find(
      (entry) => entry.refreshTokenHash === refreshTokenHash,
    );
    if (
      !session ||
      (session.refreshExpiresAtMs ?? 0) <= Date.now() ||
      this.isRevoked(refreshTokenHash) ||
      this.isRevoked(session.tokenHash)
    ) {
      throw new RemoteHttpError("invalid_refresh_token", "Invalid refresh token.", 401);
    }

    this.accessSessions.delete(session.tokenHash);
    const accessToken = randomCredential("lc_access");
    const refreshToken = randomCredential("lc_refresh");
    const rotated: StoredAccessSession = {
      ...session,
      tokenHash: hashCredential(accessToken),
      expiresAtMs: Date.now() + (input.accessTtlMs ?? DEFAULT_ACCESS_TOKEN_TTL_MS),
      refreshTokenHash: hashCredential(refreshToken),
    };
    this.accessSessions.set(rotated.tokenHash, rotated);
    if (session.refreshTokenHash) {
      this.rotatedRefreshHashes.set(session.refreshTokenHash, {
        sessionId: session.id,
        expiresAtMs: session.refreshExpiresAtMs ?? rotated.expiresAtMs,
      });
    }
    this.persistAccessSessions();

    return {
      accessToken,
      tokenType: "Bearer",
      expiresAt: toIso(rotated.expiresAtMs),
      scopes: [...session.scopes],
      refreshToken,
      refreshTokenExpiresAt: toIso(session.refreshExpiresAtMs ?? rotated.expiresAtMs),
    };
  }

  /** Whether a token hash sits on the revocation list (unexpired). */
  private isRevoked(tokenHash: string): boolean {
    const expiresAtMs = this.revokedTokenHashes.get(tokenHash);
    if (expiresAtMs === undefined) return false;
    if (expiresAtMs <= Date.now()) {
      this.revokedTokenHashes.delete(tokenHash);
      return false;
    }
    return true;
  }

  authenticateBearerToken(
    accessToken: string,
    requiredScopes: readonly RemoteAccessScope[] = [],
  ): AuthenticatedRemoteSession {
    this.pruneExpired();
    const tokenHash = hashCredential(accessToken);
    // An explicitly revoked token is rejected outright — even if its session
    // row were ever restored (restart races, restores from backup).
    if (this.isRevoked(tokenHash)) {
      throw new RemoteHttpError("invalid_access_token", "Invalid access token.", 401);
    }
    const session = this.accessSessions.get(tokenHash);
    if (!session || session.expiresAtMs <= Date.now()) {
      throw new RemoteHttpError("invalid_access_token", "Invalid access token.", 401);
    }
    if (!hasScopes(session.scopes, requiredScopes)) {
      throw new RemoteHttpError(
        "missing_scope",
        "Access token does not grant this operation.",
        403,
      );
    }
    return toAuthenticatedSession(session);
  }

  listAccessSessions(): RemoteAccessSessionSummary[] {
    this.pruneExpired();
    return [...this.accessSessions.values()]
      .sort((a, b) => b.issuedAtMs - a.issuedAtMs)
      .map((session) => ({
        id: session.id,
        scopes: [...session.scopes],
        ...(session.client ? { client: session.client } : {}),
        issuedAt: toIso(session.issuedAtMs),
        expiresAt: toIso(session.expiresAtMs),
      }));
  }

  revokeAccessSession(sessionId: string): boolean {
    this.pruneExpired();
    for (const [hash, session] of this.accessSessions) {
      if (session.id !== sessionId) continue;
      this.accessSessions.delete(hash);
      // Gate 6 item 4.6: revocation is remembered for the lifetime of what it
      // kills — the access token AND its refresh token — so a replayed bearer
      // or a saved refresh token stays dead across restarts.
      this.revokedTokenHashes.set(hash, session.expiresAtMs);
      if (session.refreshTokenHash) {
        this.revokedTokenHashes.set(
          session.refreshTokenHash,
          session.refreshExpiresAtMs ?? session.expiresAtMs,
        );
      }
      for (const [rotatedHash, rotated] of this.rotatedRefreshHashes) {
        if (rotated.sessionId === sessionId) this.rotatedRefreshHashes.delete(rotatedHash);
      }
      for (const [ticketHash, ticket] of this.websocketTickets) {
        if (ticket.sessionId === sessionId) {
          this.websocketTickets.delete(ticketHash);
        }
      }
      this.persistAccessSessions();
      return true;
    }
    return false;
  }

  issueWebSocketTicket(input: {
    readonly accessToken: string;
    readonly ttlMs?: number;
  }): RemoteWebSocketTicketResult {
    const session = this.authenticateBearerToken(input.accessToken, ["session:read"]);
    const ticket = randomCredential("lc_ws");
    const expiresAtMs = Date.now() + (input.ttlMs ?? DEFAULT_WEBSOCKET_TICKET_TTL_MS);
    const ticketHash = hashCredential(ticket);
    this.websocketTickets.set(ticketHash, {
      ticketHash,
      sessionId: session.sessionId,
      expiresAtMs,
    });
    return {
      ticket,
      expiresAt: toIso(expiresAtMs),
    };
  }

  consumeWebSocketTicket(ticket: string): AuthenticatedRemoteSession {
    this.pruneExpired();
    const ticketHash = hashCredential(ticket);
    const stored = this.websocketTickets.get(ticketHash);
    if (!stored) {
      throw new RemoteHttpError("invalid_websocket_ticket", "Invalid WebSocket ticket.", 401);
    }
    this.websocketTickets.delete(ticketHash);
    const session = [...this.accessSessions.values()].find(
      (entry) => entry.id === stored.sessionId,
    );
    if (!session || session.expiresAtMs <= Date.now()) {
      throw new RemoteHttpError("invalid_access_token", "Invalid access token.", 401);
    }
    return toAuthenticatedSession(session);
  }

  private pruneExpired(): void {
    const now = Date.now();
    let accessSessionsChanged = false;
    for (const [hash, credential] of this.pairingCredentials) {
      if (credential.expiresAtMs <= now) {
        this.pairingCredentials.delete(hash);
      }
    }
    for (const [hash, session] of this.accessSessions) {
      if (sessionRetentionDeadline(session) <= now) {
        this.accessSessions.delete(hash);
        accessSessionsChanged = true;
      }
    }
    for (const [hash, ticket] of this.websocketTickets) {
      if (ticket.expiresAtMs <= now) {
        this.websocketTickets.delete(hash);
      }
    }
    for (const [hash, expiresAtMs] of this.revokedTokenHashes) {
      if (expiresAtMs <= now) this.revokedTokenHashes.delete(hash);
    }
    for (const [hash, rotated] of this.rotatedRefreshHashes) {
      if (rotated.expiresAtMs <= now) this.rotatedRefreshHashes.delete(hash);
    }
    if (accessSessionsChanged) {
      this.persistAccessSessions();
    }
  }

  private persistAccessSessions(): void {
    const sessions = [...this.accessSessions.values()].map((session) =>
      persistedAccessSessionSchema.parse(session),
    );
    // Legacy seam first (an injected callback on tests/compositions predating
    // the revocation list), then the full file shape.
    this.options.onAccessSessionsChanged?.(sessions);
    this.options.onPersistedStateChanged?.({
      accessSessions: sessions,
      revokedTokenHashes: [...this.revokedTokenHashes].map(([tokenHash, expiresAtMs]) => ({
        tokenHash,
        expiresAtMs,
      })),
      rotatedRefreshHashes: [...this.rotatedRefreshHashes].map(([tokenHash, rotated]) => ({
        tokenHash,
        sessionId: rotated.sessionId,
        expiresAtMs: rotated.expiresAtMs,
      })),
    });
  }
}

export function parseBearerAuthorizationHeader(value: string | undefined): string | null {
  const match = /^bearer\s+(.+)$/i.exec(value?.trim() ?? "");
  if (!match) {
    return null;
  }
  const token = match[1]?.trim() ?? "";
  return token.length > 0 ? token : null;
}

export function remoteAuthFilePath(baseDir: string): string {
  return join(baseDir, "remote-access-auth.json");
}

export function readRemoteAccessAuthFile(baseDir: string): PersistedRemoteAuthFile {
  const path = remoteAuthFilePath(baseDir);
  if (!existsSync(path)) {
    return { accessSessions: [], revokedTokenHashes: [], rotatedRefreshHashes: [] };
  }
  try {
    const parsed = remoteAuthFileSchema.parse(JSON.parse(readFileSync(path, "utf8")));
    const now = Date.now();
    return {
      accessSessions: parsed.accessSessions.filter(
        (session) => sessionRetentionDeadline(session) > now,
      ),
      revokedTokenHashes: parsed.revokedTokenHashes.filter((entry) => entry.expiresAtMs > now),
      rotatedRefreshHashes: parsed.rotatedRefreshHashes.filter((entry) => entry.expiresAtMs > now),
    };
  } catch {
    return { accessSessions: [], revokedTokenHashes: [], rotatedRefreshHashes: [] };
  }
}

export function writeRemoteAccessAuthFile(baseDir: string, state: PersistedRemoteAuthFile): void {
  writeFileAtomic(
    remoteAuthFilePath(baseDir),
    `${JSON.stringify(remoteAuthFileSchema.parse(state), null, 2)}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
}

export function createPersistentRemoteAuthStore(baseDir: string): RemoteAuthStore {
  const persisted = readRemoteAccessAuthFile(baseDir);
  return new RemoteAuthStore({
    accessSessions: persisted.accessSessions,
    revokedTokenHashes: persisted.revokedTokenHashes,
    rotatedRefreshHashes: persisted.rotatedRefreshHashes ?? [],
    onPersistedStateChanged: (state) => writeRemoteAccessAuthFile(baseDir, state),
  });
}

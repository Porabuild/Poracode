import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { writeFileAtomic } from "@/shared/atomicFile";
import {
  REMOTE_STANDARD_SCOPES,
  remoteAccessScopeSchema,
  remoteClientMetadataSchema,
  type RemoteAccessScope,
  type RemoteAccessSessionSummary,
  type RemoteAccessTokenResult,
  type RemoteClientMetadata,
  type RemoteWebSocketTicketResult,
} from "@/shared/remote";

const DEFAULT_PAIRING_TTL_MS = 10 * 60 * 1000;
const DEFAULT_ACCESS_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
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
}

const persistedAccessSessionSchema = z.object({
  id: z.string().min(1),
  tokenHash: z.string().min(1),
  scopes: z.array(remoteAccessScopeSchema),
  client: remoteClientMetadataSchema.optional(),
  issuedAtMs: z.number().int().nonnegative(),
  expiresAtMs: z.number().int().nonnegative(),
});

const remoteAuthFileSchema = z.object({
  accessSessions: z.array(persistedAccessSessionSchema),
});

type PersistedAccessSession = z.infer<typeof persistedAccessSessionSchema>;

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
}

interface RemoteAuthStoreOptions {
  readonly accessSessions?: readonly PersistedAccessSession[];
  onAccessSessionsChanged?(sessions: readonly PersistedAccessSession[]): void;
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

export class RemoteAuthStore {
  private readonly pairingCredentials = new Map<string, StoredPairingCredential>();
  private readonly accessSessions = new Map<string, StoredAccessSession>();
  private readonly websocketTickets = new Map<string, StoredWebSocketTicket>();

  constructor(private readonly options: RemoteAuthStoreOptions = {}) {
    for (const session of options.accessSessions ?? []) {
      if (session.expiresAtMs <= Date.now()) continue;
      this.accessSessions.set(session.tokenHash, {
        ...session,
        client: session.client,
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
      scopes: input?.scopes ?? REMOTE_STANDARD_SCOPES,
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
    const expiresAtMs = Date.now() + (input.ttlMs ?? DEFAULT_ACCESS_TOKEN_TTL_MS);
    const session: StoredAccessSession = {
      id: randomUUID(),
      tokenHash: hashCredential(accessToken),
      scopes: requestedScopes,
      client: input.client,
      issuedAtMs: Date.now(),
      expiresAtMs,
    };
    this.accessSessions.set(session.tokenHash, session);
    this.persistAccessSessions();

    return {
      accessToken,
      tokenType: "Bearer",
      expiresAt: toIso(expiresAtMs),
      scopes: [...requestedScopes],
    };
  }

  authenticateBearerToken(
    accessToken: string,
    requiredScopes: readonly RemoteAccessScope[] = [],
  ): AuthenticatedRemoteSession {
    this.pruneExpired();
    const session = this.accessSessions.get(hashCredential(accessToken));
    if (!session) {
      throw new RemoteHttpError("invalid_access_token", "Invalid access token.", 401);
    }
    if (!hasScopes(session.scopes, requiredScopes)) {
      throw new RemoteHttpError(
        "missing_scope",
        "Access token does not grant this operation.",
        403,
      );
    }
    return {
      sessionId: session.id,
      scopes: session.scopes,
      client: session.client,
    };
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
    if (!session) {
      throw new RemoteHttpError("invalid_access_token", "Invalid access token.", 401);
    }
    return {
      sessionId: session.id,
      scopes: session.scopes,
      client: session.client,
    };
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
      if (session.expiresAtMs <= now) {
        this.accessSessions.delete(hash);
        accessSessionsChanged = true;
      }
    }
    for (const [hash, ticket] of this.websocketTickets) {
      if (ticket.expiresAtMs <= now) {
        this.websocketTickets.delete(hash);
      }
    }
    if (accessSessionsChanged) {
      this.persistAccessSessions();
    }
  }

  private persistAccessSessions(): void {
    this.options.onAccessSessionsChanged?.(
      [...this.accessSessions.values()].map((session) =>
        persistedAccessSessionSchema.parse(session),
      ),
    );
  }
}

export function parseBearerAuthorizationHeader(value: string | undefined): string | null {
  if (!value?.startsWith("Bearer ")) {
    return null;
  }
  const token = value.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

export function remoteAuthFilePath(baseDir: string): string {
  return join(baseDir, "remote-access-auth.json");
}

export function readRemoteAccessSessions(baseDir: string): PersistedAccessSession[] {
  const path = remoteAuthFilePath(baseDir);
  if (!existsSync(path)) {
    return [];
  }
  try {
    const parsed = remoteAuthFileSchema.parse(JSON.parse(readFileSync(path, "utf8")));
    return parsed.accessSessions.filter((session) => session.expiresAtMs > Date.now());
  } catch {
    return [];
  }
}

export function writeRemoteAccessSessions(
  baseDir: string,
  sessions: readonly PersistedAccessSession[],
): void {
  writeFileAtomic(
    remoteAuthFilePath(baseDir),
    `${JSON.stringify(remoteAuthFileSchema.parse({ accessSessions: sessions }), null, 2)}\n`,
    { encoding: "utf8" },
  );
}

export function createPersistentRemoteAuthStore(baseDir: string): RemoteAuthStore {
  return new RemoteAuthStore({
    accessSessions: readRemoteAccessSessions(baseDir),
    onAccessSessionsChanged: (sessions) => writeRemoteAccessSessions(baseDir, sessions),
  });
}

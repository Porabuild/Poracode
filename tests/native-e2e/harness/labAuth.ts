import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  ACCESS_TOKEN_PREFIX,
  DEFAULT_ACCESS_TOKEN_TTL_MS,
  DEFAULT_PAIRING_TTL_MS,
  DEFAULT_SCOPES,
  DEFAULT_WEBSOCKET_TICKET_TTL_MS,
  PAIRING_TOKEN_PREFIX,
  WEBSOCKET_TICKET_PREFIX,
  type RemoteScope,
} from "./constants.ts";
import type { LabClientMetadata } from "./types.ts";

export class LabHttpError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "LabHttpError";
  }
}

interface StoredPairing {
  readonly tokenHash: string;
  readonly scopes: readonly RemoteScope[];
  readonly expiresAtMs: number;
}

interface StoredSession {
  readonly id: string;
  readonly tokenHash: string;
  readonly scopes: readonly RemoteScope[];
  readonly issuedAtMs: number;
  readonly expiresAtMs: number;
}

interface StoredTicket {
  readonly ticketHash: string;
  readonly sessionId: string;
  readonly expiresAtMs: number;
}

export interface IssuedPairing {
  readonly credential: string;
  readonly scopes: readonly RemoteScope[];
  readonly expiresAt: string;
}

export interface AccessTokenResult {
  readonly accessToken: string;
  readonly tokenType: "Bearer";
  readonly expiresAt: string;
  readonly scopes: readonly RemoteScope[];
}

export interface AuthenticatedSession {
  readonly sessionId: string;
  readonly scopes: readonly RemoteScope[];
  readonly expiresAtMs: number;
}

function randomCredential(prefix: string): string {
  return `${prefix}${randomBytes(32).toString("base64url")}`;
}

function hashCredential(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function toIso(ms: number): string {
  return new Date(ms).toISOString();
}

function isRemoteScope(value: string): value is RemoteScope {
  return (DEFAULT_SCOPES as readonly string[]).includes(value);
}

function hasScopes(granted: readonly RemoteScope[], required: readonly string[]): boolean {
  return required.every((scope) => granted.includes(scope as RemoteScope));
}

export class LabAuthStore {
  private readonly pairing = new Map<string, StoredPairing>();
  private readonly sessions = new Map<string, StoredSession>();
  private readonly tickets = new Map<string, StoredTicket>();

  reset(): void {
    this.pairing.clear();
    this.sessions.clear();
    this.tickets.clear();
  }

  get pairingOutstanding(): boolean {
    this.prune();
    return this.pairing.size > 0;
  }

  get accessSessionCount(): number {
    this.prune();
    return this.sessions.size;
  }

  get ticketOutstandingCount(): number {
    this.prune();
    return this.tickets.size;
  }

  issuePairingCredential(input?: {
    readonly scopes?: readonly RemoteScope[];
    readonly ttlMs?: number;
  }): IssuedPairing {
    this.prune();
    const credential = randomCredential(PAIRING_TOKEN_PREFIX);
    const expiresAtMs = Date.now() + (input?.ttlMs ?? DEFAULT_PAIRING_TTL_MS);
    const stored: StoredPairing = {
      tokenHash: hashCredential(credential),
      scopes: input?.scopes ?? [...DEFAULT_SCOPES],
      expiresAtMs,
    };
    this.pairing.set(stored.tokenHash, stored);
    return {
      credential,
      scopes: stored.scopes,
      expiresAt: toIso(expiresAtMs),
    };
  }

  revokePairingCredential(credential: string): boolean {
    return this.pairing.delete(hashCredential(credential));
  }

  exchangePairingCredential(input: {
    readonly credential: string;
    readonly scopes?: readonly string[];
    readonly client?: LabClientMetadata;
    readonly knownScopes: readonly string[];
  }): AccessTokenResult {
    this.prune();
    const grant = this.pairing.get(hashCredential(input.credential));
    if (!grant) {
      throw new LabHttpError("invalid_pairing_token", "Invalid pairing token.", 401);
    }

    const requested = input.scopes ?? [...grant.scopes];
    if (requested.some((scope) => !input.knownScopes.includes(scope))) {
      throw new LabHttpError("unknown_scope", "Pairing request includes an unknown scope.", 403);
    }
    if (requested.some((scope) => !isRemoteScope(scope))) {
      throw new LabHttpError("unknown_scope", "Pairing request includes an unknown scope.", 403);
    }
    if (!hasScopes(grant.scopes, requested)) {
      throw new LabHttpError(
        "scope_not_granted",
        "Pairing token does not grant the requested scopes.",
        403,
      );
    }

    this.pairing.delete(hashCredential(input.credential));
    const accessToken = randomCredential(ACCESS_TOKEN_PREFIX);
    const expiresAtMs = Date.now() + DEFAULT_ACCESS_TOKEN_TTL_MS;
    const session: StoredSession = {
      id: randomUUID(),
      tokenHash: hashCredential(accessToken),
      scopes: requested as RemoteScope[],
      issuedAtMs: Date.now(),
      expiresAtMs,
    };
    this.sessions.set(session.tokenHash, session);
    return {
      accessToken,
      tokenType: "Bearer",
      expiresAt: toIso(expiresAtMs),
      scopes: session.scopes,
    };
  }

  authenticateBearer(
    accessToken: string,
    requiredScopes: readonly string[] = [],
  ): AuthenticatedSession {
    this.prune();
    const session = this.sessions.get(hashCredential(accessToken));
    if (!session) {
      throw new LabHttpError("invalid_access_token", "Invalid access token.", 401);
    }
    if (!hasScopes(session.scopes, requiredScopes)) {
      throw new LabHttpError("missing_scope", "Access token does not grant this operation.", 403);
    }
    return {
      sessionId: session.id,
      scopes: session.scopes,
      expiresAtMs: session.expiresAtMs,
    };
  }

  expireAllPairing(): void {
    this.pairing.clear();
  }

  expireAllTickets(): void {
    this.tickets.clear();
  }

  issueWebSocketTicket(
    accessToken: string,
    options?: { readonly ttlMs?: number },
  ): { ticket: string; expiresAt: string } {
    const session = this.authenticateBearer(accessToken, ["session:read"]);
    const ticket = randomCredential(WEBSOCKET_TICKET_PREFIX);
    const expiresAtMs = Date.now() + (options?.ttlMs ?? DEFAULT_WEBSOCKET_TICKET_TTL_MS);
    this.tickets.set(hashCredential(ticket), {
      ticketHash: hashCredential(ticket),
      sessionId: session.sessionId,
      expiresAtMs,
    });
    return { ticket, expiresAt: toIso(expiresAtMs) };
  }

  consumeWebSocketTicket(ticket: string): AuthenticatedSession {
    this.prune();
    const stored = this.tickets.get(hashCredential(ticket));
    if (!stored) {
      throw new LabHttpError("invalid_websocket_ticket", "Invalid WebSocket ticket.", 401);
    }
    this.tickets.delete(hashCredential(ticket));
    const session = [...this.sessions.values()].find((entry) => entry.id === stored.sessionId);
    if (!session) {
      throw new LabHttpError("invalid_access_token", "Invalid access token.", 401);
    }
    return {
      sessionId: session.id,
      scopes: session.scopes,
      expiresAtMs: session.expiresAtMs,
    };
  }

  private prune(): void {
    const now = Date.now();
    for (const [hash, credential] of this.pairing) {
      if (credential.expiresAtMs <= now) this.pairing.delete(hash);
    }
    for (const [hash, session] of this.sessions) {
      if (session.expiresAtMs <= now) this.sessions.delete(hash);
    }
    for (const [hash, ticket] of this.tickets) {
      if (ticket.expiresAtMs <= now) this.tickets.delete(hash);
    }
  }
}

export function parseBearerAuthorizationHeader(value: string | undefined): string | null {
  const match = /^bearer\s+(.+)$/i.exec(value?.trim() ?? "");
  if (!match) return null;
  const token = match[1]?.trim() ?? "";
  return token.length > 0 ? token : null;
}

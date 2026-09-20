import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { RemoteHttpError } from "../auth";

/**
 * Short-lived, one-time, path-scoped tickets for `GET /api/files/image`
 * (B5b). `<img>` tags cannot send an Authorization header, and putting the
 * long-lived bearer access token in the query string leaks it into proxy and
 * relay access logs. Instead an authenticated client mints a 30-second ticket
 * bound to ONE absolute path, which the image route consumes exactly once.
 * Tickets are hashed at rest and the store is bounded.
 */

const IMAGE_TICKET_TTL_MS = 30 * 1000;
const MAX_LIVE_IMAGE_TICKETS = 256;
const TICKET_BYTES = 32;

export const IMAGE_TICKET_QUERY_PARAM = "ticket";

export const imageTicketRequestBodySchema = z.object({
  path: z.string().min(1).max(4096),
});

export interface IssuedImageTicket {
  readonly ticket: string;
  /** ISO expiry so a client knows when to re-mint. */
  readonly expiresAt: string;
}

interface StoredImageTicket {
  readonly tokenHash: string;
  readonly path: string;
  readonly sessionId?: string;
  readonly expiresAtMs: number;
}

function hashTicket(ticket: string): string {
  return createHash("sha256").update(ticket).digest("hex");
}

export class ImageTicketStore {
  private readonly tickets = new Map<string, StoredImageTicket>();

  issue(rawPath: string, nowMs: number = Date.now(), sessionId?: string): IssuedImageTicket {
    this.prune(nowMs);
    const ticket = `lc_img_${randomBytes(TICKET_BYTES).toString("base64url")}`;
    this.tickets.set(hashTicket(ticket), {
      tokenHash: hashTicket(ticket),
      path: rawPath,
      ...(sessionId ? { sessionId } : {}),
      expiresAtMs: nowMs + IMAGE_TICKET_TTL_MS,
    });
    while (this.tickets.size > MAX_LIVE_IMAGE_TICKETS) {
      // Map iteration is insertion order: drop the oldest mint first.
      const oldest = this.tickets.keys().next().value;
      if (oldest === undefined) break;
      this.tickets.delete(oldest);
    }
    return { ticket, expiresAt: new Date(nowMs + IMAGE_TICKET_TTL_MS).toISOString() };
  }

  /** One-time consumption bound to the exact path the ticket was minted for. */
  consume(ticket: string, rawPath: string, nowMs: number = Date.now()): void {
    const tokenHash = hashTicket(ticket);
    const stored = this.tickets.get(tokenHash);
    if (!stored || stored.path !== rawPath || stored.expiresAtMs <= nowMs) {
      this.tickets.delete(tokenHash);
      throw new RemoteHttpError(
        "invalid_image_ticket",
        "The image link has expired; reload the conversation.",
        401,
      );
    }
    this.tickets.delete(tokenHash);
  }

  /** Burns every unused image ticket minted for `sessionId` (V6 A.10). */
  revokeSession(sessionId: string): void {
    for (const [hash, stored] of this.tickets) {
      if (stored.sessionId === sessionId) this.tickets.delete(hash);
    }
  }

  private prune(nowMs: number): void {
    for (const [hash, stored] of this.tickets) {
      if (stored.expiresAtMs <= nowMs) this.tickets.delete(hash);
    }
  }

  size(): number {
    return this.tickets.size;
  }
}

/** One host process serves one remote surface, so the store is module-scoped. */
export const imageTickets = new ImageTicketStore();

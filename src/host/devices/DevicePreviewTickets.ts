import { createHash, randomBytes } from "node:crypto";
import {
  DEVICE_PREVIEW_TICKET_PREFIX,
  DEVICE_PREVIEW_TICKET_TTL_MS,
  DEVICE_PREVIEW_VERSION,
  type DevicePreviewChannel,
  type DevicePreviewTicket,
} from "@/shared/devicePreview";
import { DeviceWorkspaceError } from "./deviceProcess";

export interface DevicePreviewTicketBinding {
  principal: string;
  threadId: string;
  sessionId: string;
  previewId: string;
  generation: string;
  channel: DevicePreviewChannel;
}

/** One-use preview upgrade grants. Neither app-event nor file-media tickets
 * authorize this feature; only hashes and stable session identities are kept. */
export class DevicePreviewTickets {
  private readonly tickets = new Map<
    string,
    { binding: DevicePreviewTicketBinding; expiresAt: number }
  >();

  constructor(private readonly now = Date.now) {}

  issue(binding: DevicePreviewTicketBinding, authorityExpiresAt: number): DevicePreviewTicket {
    this.prune();
    const expiresAt = Math.min(this.now() + DEVICE_PREVIEW_TICKET_TTL_MS, authorityExpiresAt);
    if (!Number.isFinite(expiresAt) || expiresAt <= this.now()) throw this.invalid();
    if (
      this.tickets.size >= 256 ||
      [...this.tickets.values()].filter((entry) => entry.binding.principal === binding.principal)
        .length >= 32
    )
      throw new DeviceWorkspaceError(
        "device_preview_busy",
        "Too many pending device-preview connections.",
        429,
      );
    const ticket = `${DEVICE_PREVIEW_TICKET_PREFIX}${randomBytes(32).toString("base64url")}`;
    this.tickets.set(this.key(ticket), { binding: { ...binding }, expiresAt });
    return { version: DEVICE_PREVIEW_VERSION, ticket, expiresAt };
  }

  consume(ticket: string): DevicePreviewTicketBinding {
    if (!/^dwp1_[A-Za-z0-9_-]{43}$/u.test(ticket)) throw this.invalid();
    const key = this.key(ticket);
    const entry = this.tickets.get(key);
    this.tickets.delete(key);
    if (!entry || entry.expiresAt <= this.now()) throw this.invalid();
    return { ...entry.binding };
  }

  clear(): void {
    this.tickets.clear();
  }

  private prune(): void {
    for (const [key, entry] of this.tickets)
      if (entry.expiresAt <= this.now()) this.tickets.delete(key);
  }
  private key(ticket: string): string {
    return createHash("sha256").update(ticket).digest("hex");
  }
  private invalid(): DeviceWorkspaceError {
    return new DeviceWorkspaceError(
      "invalid_device_preview_ticket",
      "Device-preview connection authorization expired.",
      401,
    );
  }
}

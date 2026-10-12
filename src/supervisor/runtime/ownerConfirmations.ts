import { randomUUID } from "node:crypto";

interface PendingConfirmation {
  resolve: () => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export interface OwnerConfirmationMessages {
  timeout: string;
  refused: string;
  disposed: string;
}

/**
 * Supervisor-side half of an event/confirm round trip with the backend owner:
 * `request` emits one event carrying a fresh request id and resolves when the
 * owner confirms that id. Timeouts and shutdown reject instead of hanging.
 */
export class OwnerConfirmations {
  private readonly pending = new Map<string, PendingConfirmation>();

  constructor(
    private readonly messages: OwnerConfirmationMessages,
    private readonly timeoutMs = 10_000,
  ) {}

  request(send: (requestId: string) => void): Promise<void> {
    const requestId = randomUUID();
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(this.messages.timeout));
      }, this.timeoutMs);
      this.pending.set(requestId, { resolve, reject, timeout });
      send(requestId);
    });
  }

  confirm(payload: { requestId: string; ok: boolean; error?: string | undefined }): void {
    const pending = this.pending.get(payload.requestId);
    if (!pending) return;
    this.pending.delete(payload.requestId);
    clearTimeout(pending.timeout);
    if (payload.ok) pending.resolve();
    else pending.reject(new Error(payload.error ?? this.messages.refused));
  }

  dispose(): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(this.messages.disposed));
    }
    this.pending.clear();
  }
}

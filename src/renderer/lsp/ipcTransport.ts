import type { SupervisorEvent } from "@/shared/ipc";
import type { LspMessagePayload } from "@/shared/lsp";
import { readBridge } from "../bridge";

/**
 * Thin IPC transport that relays JSON-RPC messages between the renderer
 * and the supervisor's language server via Electron IPC.
 */
export class LspIpcTransport {
  private disposed = false;
  private unsubscribe: (() => void) | null = null;
  private messageHandler: ((message: unknown) => void) | null = null;
  private statusHandler: ((status: string, error?: string) => void) | null = null;

  constructor(readonly sessionId: string) {
    this.unsubscribe = readBridge().onSupervisorEvent((event: SupervisorEvent) => {
      if (this.disposed) return;
      if (event.type === "lsp-message" && event.sessionId === this.sessionId) {
        this.messageHandler?.(event.message);
      }
      if (event.type === "lsp-status" && event.sessionId === this.sessionId) {
        this.statusHandler?.(event.status, event.error);
      }
    });
  }

  /** Send a JSON-RPC message (request or notification) to the language server. */
  async sendMessage(message: unknown): Promise<unknown> {
    if (this.disposed) return undefined;
    const payload: LspMessagePayload = { sessionId: this.sessionId, message };
    try {
      const result = await readBridge().lspSendMessage(payload);
      return this.disposed ? undefined : result;
    } catch (error) {
      if (this.disposed) return undefined;
      throw error;
    }
  }

  /** Subscribe to JSON-RPC messages from the language server. */
  onMessage(handler: (message: unknown) => void): void {
    if (!this.disposed) this.messageHandler = handler;
  }

  /** Subscribe to server status changes. */
  onStatus(handler: (status: string, error?: string) => void): void {
    if (!this.disposed) this.statusHandler = handler;
  }

  isDisposed(): boolean {
    return this.disposed;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.messageHandler = null;
    this.statusHandler = null;
  }
}

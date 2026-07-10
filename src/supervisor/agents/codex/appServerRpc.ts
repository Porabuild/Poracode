import type { RuntimeEvent, ThreadServerRequestId } from "@/shared/contracts";
import { mapCodexServerRequest, translateCodexCanonicalResponse } from "./canonicalMapping";
import { parseCodexSocketMessage } from "./acpProtocol";
import { buildCodexQuestionAnswerEvents } from "./acpQuestionAnswer";
import type { CodexStdioTransport } from "./stdioTransport";

export type CodexRpcDebugDirection = "codex->lightcode" | "lightcode->codex" | "transport";

export type CodexAppServerRpcTransport = Pick<
  CodexStdioTransport,
  "setListener" | "write" | "dispose" | "formatOutput"
>;

export interface CodexAppServerRpcListener {
  onNotification(method: string, params: Record<string, unknown> | undefined): void;
  onRuntimeEvents(events: RuntimeEvent[]): void;
  onClose(): void;
  onError(error: Error): void;
  onDebug?(direction: CodexRpcDebugDirection, payload: unknown): void;
}

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timeout: NodeJS.Timeout;
};

type InboundRequest = {
  id: string | number;
  method: string;
  params: Record<string, unknown> | undefined;
};

/** Owns JSON-RPC correlation and server-request bookkeeping above stdio framing. */
export class CodexAppServerRpc {
  private listener: CodexAppServerRpcListener | undefined;
  private requestSequence = 0;
  private readonly pendingRequests = new Map<string, PendingRequest>();
  private readonly inboundRequests = new Map<string, InboundRequest>();

  constructor(
    private readonly transport: CodexAppServerRpcTransport,
    private readonly localThreadId: string,
  ) {}

  setListener(listener: CodexAppServerRpcListener): void {
    this.listener = listener;
    this.transport.setListener({
      onMessage: (payload) => this.handleMessage(payload),
      onClose: () => this.handleClose(),
      onError: (error) => this.handleError(error),
    });
  }

  request(method: string, params: Record<string, unknown>, timeoutMs = 30_000): Promise<unknown> {
    const id = `lightcode-${this.requestSequence++}`;

    const pending = new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Timed out waiting for Codex app-server response to ${method}.`));
      }, timeoutMs);

      this.pendingRequests.set(id, {
        resolve,
        reject,
        timeout,
      });
    });

    this.write({
      jsonrpc: "2.0",
      id,
      method,
      params,
    });

    return pending;
  }

  notify(method: string): void {
    this.write({
      jsonrpc: "2.0",
      method,
    });
  }

  resolveServerRequest(requestId: ThreadServerRequestId, response: unknown): void {
    const inbound = this.inboundRequests.get(String(requestId));
    this.inboundRequests.delete(String(requestId));
    const result = inbound
      ? translateCodexCanonicalResponse(inbound.method, inbound.params, response)
      : response;
    this.write({
      jsonrpc: "2.0",
      id: inbound?.id ?? requestId,
      result,
    });
    if (inbound?.method === "item/tool/requestUserInput") {
      this.listener?.onRuntimeEvents(
        buildCodexQuestionAnswerEvents({
          threadId: this.localThreadId,
          params: inbound.params,
          response,
        }),
      );
    }
  }

  dispose(error: Error): void {
    this.transport.dispose();
    this.rejectPendingRequests(error);
  }

  private handleMessage(payload: unknown): void {
    this.listener?.onDebug?.("codex->lightcode", payload);
    const message = parseCodexSocketMessage(payload);

    if (message.kind === "response") {
      const pending = this.pendingRequests.get(message.id);
      if (!pending) {
        return;
      }

      this.pendingRequests.delete(message.id);
      clearTimeout(pending.timeout);

      if (message.error !== undefined) {
        const error = message.error;
        const messageText =
          typeof error === "object" && error !== null && "message" in error
            ? String((error as Record<string, unknown>).message)
            : String(error);
        pending.reject(new Error(messageText));
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    if (message.kind === "request") {
      const canonical = mapCodexServerRequest(
        this.localThreadId,
        String(message.id),
        message.method,
        message.params,
      );
      if (canonical) {
        this.inboundRequests.set(String(message.id), {
          id: message.id,
          method: message.method,
          params: message.params,
        });
        this.listener?.onRuntimeEvents([canonical]);
      } else {
        console.warn(
          `[codex] no canonical mapping for app-server request method "${message.method}"; replying method not found.`,
        );
        this.write({
          jsonrpc: "2.0",
          id: message.id,
          error: {
            code: -32601,
            message: `Unsupported Codex app-server request method "${message.method}".`,
          },
        });
      }
      return;
    }

    if (message.kind === "notification") {
      this.listener?.onNotification(message.method, message.params);
    }
  }

  private handleClose(): void {
    const output = this.transport.formatOutput();
    this.listener?.onDebug?.("transport", { event: "close", output });
    this.rejectPendingRequests(new Error(`Codex app-server exited.${output}`));
    this.listener?.onClose();
  }

  private handleError(error: Error): void {
    this.listener?.onDebug?.("transport", { event: "error", message: error.message });
    this.rejectPendingRequests(error);
    this.listener?.onError(error);
  }

  private write(message: Record<string, unknown>): void {
    this.listener?.onDebug?.("lightcode->codex", message);
    this.transport.write(message);
  }

  private rejectPendingRequests(error: Error): void {
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }
}

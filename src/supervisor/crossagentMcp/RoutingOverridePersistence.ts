import { randomUUID } from "node:crypto";
import type { SupervisorEvent } from "@/shared/ipc";
import type { ConfirmCrossagentRoutingOverridePayload } from "@/shared/ipc/procedures/mcp";

type RoutingOverrideChange = Extract<
  SupervisorEvent,
  { type: "crossagent-routing-override-changed" }
>["change"];

interface PendingChange {
  resolve: () => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export class RoutingOverridePersistence {
  private readonly pending = new Map<string, PendingChange>();

  constructor(
    private readonly deps: {
      emit: (event: SupervisorEvent) => void;
      invalidateSettings: () => void;
      timeoutMs?: number;
    },
  ) {}

  persist(change: RoutingOverrideChange): Promise<void> {
    const requestId = randomUUID();
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error("Timed out while saving the manual routing preference"));
      }, this.deps.timeoutMs ?? 10_000);
      this.pending.set(requestId, { resolve, reject, timeout });
      this.deps.emit({
        type: "crossagent-routing-override-changed",
        requestId,
        change,
      });
    });
  }

  confirm(payload: ConfirmCrossagentRoutingOverridePayload): void {
    // A late confirmation still means main touched the settings file. Refresh
    // even when the MCP caller already timed out and discarded its request.
    this.deps.invalidateSettings();
    const pending = this.pending.get(payload.requestId);
    if (!pending) return;
    this.pending.delete(payload.requestId);
    clearTimeout(pending.timeout);
    if (payload.ok) {
      pending.resolve();
    } else {
      pending.reject(new Error(payload.error ?? "Unable to save the manual routing preference"));
    }
  }

  dispose(): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Supervisor exited before saving the manual routing preference"));
    }
    this.pending.clear();
  }
}

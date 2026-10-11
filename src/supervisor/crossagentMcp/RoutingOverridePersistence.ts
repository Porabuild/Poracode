import type { SupervisorEvent } from "@/shared/ipc";
import type { ConfirmCrossagentRoutingOverridePayload } from "@/shared/ipc/procedures/mcp";
import { OwnerConfirmations } from "../runtime/ownerConfirmations";

type RoutingOverrideChange = Extract<
  SupervisorEvent,
  { type: "crossagent-routing-override-changed" }
>["change"];

export class RoutingOverridePersistence {
  private readonly confirmations: OwnerConfirmations;

  constructor(
    private readonly deps: {
      emit: (event: SupervisorEvent) => void;
      invalidateSettings: () => void;
      timeoutMs?: number;
    },
  ) {
    this.confirmations = new OwnerConfirmations(
      {
        timeout: "Timed out while saving the manual routing preference",
        refused: "Unable to save the manual routing preference",
        disposed: "Supervisor exited before saving the manual routing preference",
      },
      deps.timeoutMs,
    );
  }

  persist(change: RoutingOverrideChange): Promise<void> {
    return this.confirmations.request((requestId) =>
      this.deps.emit({ type: "crossagent-routing-override-changed", requestId, change }),
    );
  }

  confirm(payload: ConfirmCrossagentRoutingOverridePayload): void {
    // A late confirmation still means the backend touched the settings file. Refresh
    // even when the MCP caller already timed out and discarded its request.
    this.deps.invalidateSettings();
    this.confirmations.confirm(payload);
  }

  dispose(): void {
    this.confirmations.dispose();
  }
}

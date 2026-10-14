import type { MuseMspClient } from "./client";
import { MspRpcError } from "./protocol";
import type { PendingApproval } from "./requestMapping";
import { mintMspCommandId } from "./uuidv7";

/** One decision per requirement across MSP's request and view-event deliveries. */
export class MuseMspApprovalDecisions {
  private readonly decisions = new Map<string, Map<unknown, Promise<void>>>();
  private readonly resolved = new Set<string>();

  constructor(
    private readonly client: Pick<MuseMspClient, "request">,
    private readonly sessionId: () => string,
    private readonly onResolved: (approvalId: string, decision: string) => void,
  ) {}

  isResolved(approvalId: string): boolean {
    return this.resolved.has(approvalId);
  }

  markResolved(approvalId: string): void {
    this.resolved.add(approvalId);
    this.decisions.delete(approvalId);
  }

  decide(
    pending: Pick<PendingApproval, "approvalId" | "requirementId">,
    choiceId: string,
  ): Promise<void> {
    const { approvalId, requirementId } = pending;
    if (this.isResolved(approvalId)) return Promise.resolve();
    const sourceIndex = requirementId["sourceIndex"];
    let requirements = this.decisions.get(approvalId);
    const existing = requirements?.get(sourceIndex);
    if (existing) return existing;
    if (!requirements) {
      requirements = new Map();
      this.decisions.set(approvalId, requirements);
    }
    const decision = Promise.resolve()
      .then(async () => {
        if (this.isResolved(approvalId)) return;
        await this.client.request("approval/decide", {
          commandId: mintMspCommandId(),
          sessionId: this.sessionId(),
          approvalId,
          requirementId,
          choiceId,
        });
      })
      .catch((error: unknown) => {
        // Another connection or the host's reviewer may win the decision race.
        // The typed conflict carries the authoritative terminal outcome.
        if (error instanceof MspRpcError && error.kind === "approvalAlreadyResolved") {
          const resolution = error.data?.["resolution"];
          if (
            resolution &&
            typeof resolution === "object" &&
            "decision" in resolution &&
            typeof resolution.decision === "string"
          ) {
            this.markResolved(approvalId);
            this.onResolved(approvalId, resolution.decision);
            return;
          }
        }
        // Failed admission remains retryable; a successful ack stays deduplicated
        // until approval/resolved, since admission alone does not settle a stage.
        requirements.delete(sourceIndex);
        throw error;
      });
    requirements.set(sourceIndex, decision);
    return decision;
  }
}

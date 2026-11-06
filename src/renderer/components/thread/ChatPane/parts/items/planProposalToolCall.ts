import type { ToolCallPayload } from "@/shared/contracts";
import type { RuntimeChatItem } from "@/renderer/state/slices/runtimeEventSlice";

/**
 * Kept out of the PlanProposal component so classification code, and the
 * node-run native-e2e suites that import it, never load the component's UI
 * dependencies (which touch browser globals at module load).
 */
export function isPlanProposalToolCall(item: RuntimeChatItem): boolean {
  if (item.type !== "tool_call") return false;
  const name = (item.payload as ToolCallPayload | undefined)?.name;
  return name === "ExitPlanMode" || name === "exit_plan_mode";
}

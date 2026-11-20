import type { ToolCallPayload } from "@/shared/contracts";
import { museRecord, museString } from "./subagentDiscovery";

/** MSP workflow summaries use the generic delegated row, not a foreign manifest format. */
export function museWorkflowPayload(item: Record<string, unknown>): ToolCallPayload {
  const title = museString(item["fallbackText"]) ?? museString(item["entryId"]) ?? "workflow";
  const status =
    item["status"] === "inProgress"
      ? "running"
      : item["status"] === "completed"
        ? "success"
        : "error";
  const children = Array.isArray(item["children"]) ? item["children"].map(museRecord) : [];
  const summary = museString(item["finalSummary"]);
  let result: unknown = summary;
  if (summary) {
    try {
      result = JSON.parse(summary);
    } catch {
      /* Native summaries may be ordinary text. */
    }
  }
  const durationMs = typeof item["durationMs"] === "number" ? item["durationMs"] : undefined;
  return {
    name: "workflow",
    title,
    kind: "other",
    isSubAgent: true,
    subAgentStatus:
      status === "running"
        ? item["paused"] === true
          ? "paused"
          : "running"
        : item["status"] === "cancelled"
          ? "cancelled"
          : status === "success"
            ? "completed"
            : "failed",
    status,
    args: {
      ...(museString(item["entryId"]) ? { name: item["entryId"] } : {}),
      ...(museString(item["scriptId"]) ? { scriptId: item["scriptId"] } : {}),
    },
    result: {
      ...(result !== undefined ? { summary: result } : {}),
      ...(!summary && museString(item["message"]) ? { message: item["message"] } : {}),
      children,
      ...(typeof item["stopAvailable"] === "boolean"
        ? { stopAvailable: item["stopAvailable"] }
        : {}),
    },
    progress: { description: title, ...(durationMs !== undefined ? { durationMs } : {}) },
  };
}

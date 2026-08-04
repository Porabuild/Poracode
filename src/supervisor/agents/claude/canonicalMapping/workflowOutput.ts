import type { ToolCallWorkflow } from "@/shared/contracts";

/**
 * Normalize the SDK's structured `WorkflowOutput` (the `tool_use_result` of a
 * `Workflow` tool launch) into the provider-agnostic `ToolCallWorkflow` shape.
 * The launch tool_result text is swallowed by the subagent keepalive, so this
 * structured record is the only durable source of the run's manifest and
 * transcript locations.
 */
export function workflowFromToolUseResult(toolUseResult: unknown): ToolCallWorkflow | undefined {
  if (!toolUseResult || typeof toolUseResult !== "object" || Array.isArray(toolUseResult)) {
    return undefined;
  }
  const obj = toolUseResult as Record<string, unknown>;
  const read = (key: string): string | undefined => {
    const value = obj[key];
    return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
  };
  const name = read("workflowName");
  const runId = read("runId");
  const summary = read("summary");
  const transcriptDir = read("transcriptDir");
  const scriptPath = read("scriptPath");
  if (!name && !runId && !summary && !transcriptDir && !scriptPath) return undefined;
  return {
    ...(name ? { name } : {}),
    ...(runId ? { runId } : {}),
    ...(summary ? { summary } : {}),
    ...(transcriptDir ? { transcriptDir } : {}),
    ...(scriptPath ? { scriptPath } : {}),
  };
}

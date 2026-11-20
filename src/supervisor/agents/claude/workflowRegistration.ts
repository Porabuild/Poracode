import type { ToolCallPayload, ToolCallWorkflow } from "@/shared/contracts";
import { workflowRunReference } from "@/shared/workflowRunReference";

/** SDK result-text compatibility. Display recovery never executes scripts or
 * mutates the canonical item, including a pre-upgrade persisted item. */
export function workflowReferenceFields(payload: ToolCallPayload) {
  const result = typeof payload.result === "string" ? payload.result : "";
  return {
    runId: payload.workflow?.runId ?? /(?:^|\n)Run ID:\s*(\S+)/.exec(result)?.[1]?.trim(),
    transcriptDir:
      payload.workflow?.transcriptDir ?? /(?:^|\n)Transcript dir:\s*(.+)/.exec(result)?.[1]?.trim(),
  };
}

export function recoverWorkflowRegistration(
  payload: ToolCallPayload,
): ToolCallWorkflow | undefined {
  if (payload.name !== "Workflow" && payload.workflow === undefined) return undefined;
  const reference = workflowRunReference(workflowReferenceFields(payload));
  if (!reference) return undefined;
  const result = typeof payload.result === "string" ? payload.result : "";
  const summary =
    payload.workflow?.summary?.trim() ||
    payload.progress?.description?.trim() ||
    /(?:^|\n)Summary:\s*(.+)/.exec(result)?.[1]?.trim();
  return {
    ...payload.workflow,
    runId: reference.runId,
    transcriptDir: reference.transcriptDir,
    ...(summary ? { summary } : {}),
  };
}

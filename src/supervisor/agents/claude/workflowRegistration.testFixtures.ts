import type { ToolCallWorkflow } from "@/shared/contracts";

export function canonicalWorkflowPayload(reference: ToolCallWorkflow) {
  return { name: "Workflow", status: "success" as const, workflow: reference };
}

export function rejectedWorkflowPayload(reference: ToolCallWorkflow, message: string) {
  return {
    ...canonicalWorkflowPayload(reference),
    status: "error" as const,
    result: `<tool_use_error>${message}</tool_use_error>`,
  };
}

/** A pre-normalization SDK launch result, shared by provider integration QA. */
export function legacyWorkflowPayload(reference: ToolCallWorkflow) {
  return {
    name: "Workflow",
    status: "success" as const,
    result: [
      "Workflow launched in background.",
      reference.summary ? `Summary: ${reference.summary}` : "",
      reference.transcriptDir ? `Transcript dir: ${reference.transcriptDir}` : "",
      reference.runId ? `Run ID: ${reference.runId}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

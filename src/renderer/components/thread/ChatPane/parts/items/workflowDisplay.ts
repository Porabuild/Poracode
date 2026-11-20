import type { ToolCallPayload } from "@/shared/contracts";
import { deriveWorkflowPresentation } from "@/shared/toolPresentationAdapters";

export type { WorkflowPhase, WorkflowPlannedAgent } from "@/shared/workflowPresentation";
export type { WorkflowPresentation as WorkflowInfo } from "@/shared/workflowPresentation";

/** Same provider-owned interpretation used by native advisory history reads. */
export const parseWorkflowInfo = (payload: ToolCallPayload) => deriveWorkflowPresentation(payload);

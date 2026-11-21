import type { RuntimeToolPresentationAdapter } from "@/shared/toolPresentationAdapters";
import { parseWorkflowPresentation } from "./workflowPresentation";
import { recoverWorkflowRegistration } from "./workflowRegistration";

/** SDK-added transport namespaces are display decoration, never server identity. */
export const toolPresentationAdapter: RuntimeToolPresentationAdapter = {
  workflowResultErrorText(text) {
    return /<tool_use_error>([\s\S]*?)<\/tool_use_error>/i.exec(text)?.[1]?.trim();
  },
  workflowRegistrationNames: ["Workflow"],
  workflowRegistration: recoverWorkflowRegistration,
  workflowPresentation(payload) {
    if (payload.name !== "Workflow" && payload.workflow === undefined) return undefined;
    return parseWorkflowPresentation(payload);
  },
  normalizeMcpServerIdentifier(server) {
    const normalized = server.replace(/^claude_ai_/, "").replace(/^plugin_[^_]+_/, "");
    return normalized === server ? undefined : normalized;
  },
};

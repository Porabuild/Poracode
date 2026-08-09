import { readDiffSummary, readFileChangePath } from "../../fileChangeSummary";
import type { ToolItemState } from "../sdkCanonicalMappingState";
import { extractPlanSteps, summarizeToolRequest } from "./helpers";
import { inferFileChangeKind, inferToolKind, isSubAgentParentTool } from "./toolClassification";

export function toolPayload(
  tool: ToolItemState,
  status: "running" | "success" | "error",
  result?: unknown,
  images?: string[],
): unknown {
  const errorMessage =
    status === "error" && result && typeof result === "object"
      ? (result as { message?: unknown }).message
      : undefined;
  const errorFields =
    status === "error"
      ? {
          status,
          ...(typeof errorMessage === "string" && errorMessage.length > 0 ? { errorMessage } : {}),
          ...(result !== undefined ? { result } : {}),
        }
      : {};
  if (tool.itemType === "command_execution") {
    return {
      command:
        typeof tool.input.command === "string"
          ? tool.input.command
          : summarizeToolRequest(tool.toolName, tool.input),
      ...errorFields,
    };
  }
  if (tool.itemType === "file_change") {
    const path = readFileChangePath(tool.input) ?? "";
    const diffSummary = readDiffSummary(tool.input, result);
    return {
      name: tool.toolName,
      path,
      changeKind: inferFileChangeKind(tool.toolName),
      ...(diffSummary ? { diffSummary } : {}),
      args: tool.input,
      ...(result !== undefined ? { result } : {}),
      ...(tool.fileChangeMetadata ? { metadata: tool.fileChangeMetadata } : {}),
      ...errorFields,
    };
  }
  if (tool.itemType === "web_search") {
    const query =
      typeof tool.input.query === "string"
        ? tool.input.query
        : summarizeToolRequest(tool.toolName, tool.input);
    return { query };
  }
  if (tool.itemType === "plan") {
    return { steps: extractPlanSteps(tool.input) };
  }
  const kind = inferToolKind(tool.toolName);
  return {
    name: tool.toolName,
    ...(tool.subAgentTitle ? { title: tool.subAgentTitle } : {}),
    ...(kind ? { kind } : {}),
    args: tool.input,
    result,
    ...(images && images.length > 0 ? { images } : {}),
    status,
    ...(tool.progress ? { progress: tool.progress } : {}),
    ...(isSubAgentParentTool(tool) ? { isSubAgent: true } : {}),
    // Only a promoted row is a resume; a native Agent/Task/Workflow launch is not.
    ...(tool.subAgentParent === true ? { isSubAgentResume: true } : {}),
    ...(tool.subAgentType ? { subAgentType: tool.subAgentType } : {}),
    ...(tool.workflow ? { workflow: tool.workflow } : {}),
  };
}

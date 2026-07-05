import type { CanonicalItemType, CanonicalRequestType } from "@/shared/contracts";
import type { PlanAggregatorRole, ToolItemState } from "../sdkCanonicalMappingState";
import { inputFingerprint } from "./helpers";

/**
 * Whether a tool name launches a sub-agent (Claude `Agent`/`Task`, workflow
 * orchestration, or any *subagent* variant). Single source of truth shared by
 * `classifyToolItemType`, `syncSubAgentModelProgress`, the `isSubAgent` payload
 * flag, and the background-subagent keep-alive registry so they never drift.
 */
export function isSubAgentToolName(toolName: string): boolean {
  const name = toolName.toLowerCase();
  return (
    name === "task" ||
    name === "workflow" ||
    name === "agent" ||
    name.includes("subagent") ||
    name.includes("sub-agent")
  );
}

export function classifyToolItemType(toolName: string): CanonicalItemType {
  const name = toolName.toLowerCase();
  if (name === "todowrite" || name.includes("todo")) return "plan";
  if (isSubAgentToolName(name)) {
    return "tool_call";
  }
  if (
    name === "exitplanmode" ||
    name === "exit_plan_mode" ||
    name === "enterplanmode" ||
    name === "enter_plan_mode"
  ) {
    return "tool_call";
  }
  if (
    name.includes("bash") ||
    name.includes("shell") ||
    name.includes("command") ||
    name.includes("terminal")
  ) {
    return "command_execution";
  }
  if (
    name === "edit" ||
    name === "write" ||
    name === "multiedit" ||
    name === "notebookedit" ||
    name.includes("patch") ||
    name.includes("replace")
  ) {
    return "file_change";
  }
  if (name === "websearch" || name === "webfetch") {
    return "web_search";
  }
  if (name.includes("mcp")) return "mcp_tool_call";
  if (name.includes("image")) return "image_view";
  return "dynamic_tool_call";
}

export function createToolItemState(input: {
  itemId: string;
  toolName: string;
  input: Record<string, unknown>;
}): ToolItemState {
  const fingerprint =
    Object.keys(input.input).length > 0 ? inputFingerprint(input.input) : undefined;
  const planAggregatorRole = classifyPlanAggregatorRole(input.toolName);
  return {
    itemId: input.itemId,
    itemType: classifyToolItemType(input.toolName),
    toolName: input.toolName,
    input: input.input,
    partialInputJson: "",
    ...(fingerprint ? { lastInputFingerprint: fingerprint } : {}),
    ...(planAggregatorRole ? { planAggregatorRole } : {}),
  };
}

function classifyPlanAggregatorRole(toolName: string): PlanAggregatorRole | undefined {
  switch (toolName) {
    case "TodoWrite":
      return "TodoWrite";
    case "TaskCreate":
      return "TaskCreate";
    case "TaskUpdate":
      return "TaskUpdate";
    case "TaskStop":
      return "TaskStop";
    default:
      return undefined;
  }
}

export function classifyRequestType(toolName: string): CanonicalRequestType {
  if (isReadOnlyToolName(toolName)) return "file_read_approval";
  const itemType = classifyToolItemType(toolName);
  if (itemType === "command_execution") return "command_execution_approval";
  if (itemType === "file_change") return "file_change_approval";
  return "tool_user_input";
}

function isReadOnlyToolName(toolName: string): boolean {
  const name = toolName.toLowerCase();
  return (
    name === "read" ||
    name === "notebookread" ||
    name === "ls" ||
    name === "list" ||
    name === "glob" ||
    name === "grep" ||
    name.includes("search") ||
    name.includes("view") ||
    name === "listmcpresources" ||
    name === "readmcpresource"
  );
}

export function isExitPlanModeToolName(toolName: string): boolean {
  return toolName === "ExitPlanMode" || toolName === "exit_plan_mode";
}

export function inferToolKind(toolName: string): "read" | undefined {
  const n = toolName.toLowerCase();
  if (n === "read" || n === "notebookread") return "read";
  return undefined;
}

export function inferFileChangeKind(toolName: string): "create" | "edit" | "delete" {
  const n = toolName.toLowerCase();
  if (n.includes("write")) return "create";
  if (n.includes("delete") || n.includes("remove")) return "delete";
  return "edit";
}

export function hasToolCallPayload(itemType: CanonicalItemType): boolean {
  return (
    itemType === "tool_call" ||
    itemType === "mcp_tool_call" ||
    itemType === "image_view" ||
    itemType === "dynamic_tool_call"
  );
}

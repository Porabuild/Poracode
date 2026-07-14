import type { ToolCallPayload } from "./contracts";

export interface McpInfo {
  server: string;
  tool: string;
}

export function parseMcpName(payload: ToolCallPayload): McpInfo | null {
  const m1 = /^mcp__(.+?)__(.+)$/.exec(payload.name);
  if (m1) return { server: m1[1]!, tool: m1[2]! };
  const m2 = /^(.+?)-mcp-server-(.+)$/.exec(payload.name);
  if (m2) return { server: m2[1]!, tool: m2[2]! };
  if (payload.serverId && payload.serverId.length > 0) {
    return { server: payload.serverId, tool: payload.name };
  }
  return null;
}

export function isWorkflowTool(payload: ToolCallPayload | undefined): boolean {
  return payload?.name === "Workflow";
}

export function isSubAgentTool(payload: ToolCallPayload | undefined): boolean {
  if (!payload || parseMcpName(payload)) return false;
  if (payload.isSubAgent === true || isWorkflowTool(payload)) return true;
  if (!payload.args || typeof payload.args !== "object" || Array.isArray(payload.args))
    return false;
  const args = payload.args as Record<string, unknown>;
  return ["subagent_type", "agent_type", "agentType"].some((key) => {
    const value = args[key];
    return typeof value === "string" && value.length > 0;
  });
}

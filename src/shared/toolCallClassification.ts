import { BUILT_IN_MCP_SERVER_NAMES, type ToolCallPayload } from "./contracts";

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

/**
 * Question tools are interaction plumbing: the canonical request form and the
 * resulting question_answer item are their user-facing surfaces. Some ACP
 * agents name the tool only in a later update, so this check also protects
 * persisted transcripts that already contain the redundant tool row.
 */
export function isAskUserQuestionToolName(candidate: unknown): boolean {
  return (
    typeof candidate === "string" &&
    /^(?:ask[_ ]?user[_ ]?question|ask user \d+ questions?)(?::|\b)/iu.test(candidate.trim())
  );
}

export function isSubAgentTool(payload: ToolCallPayload | undefined): boolean {
  if (!payload || parseMcpName(payload)) return false;
  if (payload.isCrossagent === true) return false;
  if (payload.isSubAgent === true || isWorkflowTool(payload)) return true;
  if (!payload.args || typeof payload.args !== "object" || Array.isArray(payload.args))
    return false;
  const args = payload.args as Record<string, unknown>;
  return ["subagent_type", "agent_type", "agentType"].some((key) => {
    const value = args[key];
    return typeof value === "string" && value.length > 0;
  });
}

export function isCrossagentTool(payload: ToolCallPayload | undefined): boolean {
  return payload?.isCrossagent === true && !parseMcpName(payload);
}

export function isCrossagentRunAgentTool(payload: ToolCallPayload | undefined): boolean {
  if (!payload?.name) return false;
  const crossagentName = BUILT_IN_MCP_SERVER_NAMES.crossagents;
  const mcp = parseMcpName(payload);
  if (mcp?.server.toLowerCase() === crossagentName && mcp.tool.toLowerCase() === "run_agent") {
    return true;
  }
  const name = payload.name.toLowerCase();
  return name === `${crossagentName}__run_agent` || name === `${crossagentName}_run_agent`;
}

export function isDelegatedAgentTool(payload: ToolCallPayload | undefined): boolean {
  return payload?.isCrossagent === true ? isCrossagentTool(payload) : isSubAgentTool(payload);
}

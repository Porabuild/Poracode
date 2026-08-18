import { BUILT_IN_MCP_SERVER_NAMES, type ToolCallPayload } from "./contracts";

export interface McpInfo {
  server: string;
  tool: string;
}

const CROSSAGENT_SPAWN_TOOL_NAMES = new Set(["spawn_agent", "run_agent"]);

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
 * persisted transcripts that already contain the redundant tool row. Covers
 * the ACP spellings in the wild: "AskUserQuestion", "Ask user N questions",
 * and Factory droid's bare "AskUser" / "ask_user" (no "question" suffix).
 */
export function isAskUserQuestionToolName(candidate: unknown): boolean {
  return (
    typeof candidate === "string" &&
    /^(?:ask[_ ]?user[_ ]?question|ask[_ ]?user\b|ask user \d+ questions?)(?::|\b)/iu.test(
      candidate.trim(),
    )
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

export function isCrossagentSpawnAgentTool(payload: ToolCallPayload | undefined): boolean {
  if (!payload?.name) return false;
  const crossagentName = BUILT_IN_MCP_SERVER_NAMES.crossagents;
  const mcp = parseMcpName(payload);
  if (
    mcp?.server.toLowerCase() === crossagentName &&
    CROSSAGENT_SPAWN_TOOL_NAMES.has(mcp.tool.toLowerCase())
  ) {
    return true;
  }
  const name = payload.name.toLowerCase();
  for (const tool of CROSSAGENT_SPAWN_TOOL_NAMES) {
    if (name === `${crossagentName}__${tool}` || name === `${crossagentName}_${tool}`) {
      return true;
    }
  }
  return false;
}

export function isDelegatedAgentTool(payload: ToolCallPayload | undefined): boolean {
  return payload?.isCrossagent === true ? isCrossagentTool(payload) : isSubAgentTool(payload);
}

export function interruptDelegatedAgentToolPayload(
  payload: ToolCallPayload,
  errorMessage: string,
): ToolCallPayload {
  return {
    ...payload,
    status: "error",
    ...(payload.isCrossagent &&
    (payload.crossagentStatus === undefined || payload.crossagentStatus === "running")
      ? { crossagentStatus: "failed" as const }
      : {}),
    ...(payload.result === undefined ? { result: { error: errorMessage } } : {}),
  };
}

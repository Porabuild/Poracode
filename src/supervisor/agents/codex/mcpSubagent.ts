import {
  SUBAGENT_MCP_SERVER_NAME,
  type SubagentMcpHttpConfig,
} from "@/supervisor/agents/subagentMcp";

/**
 * Distinct from the browser MCP token env var so the two servers can never
 * collide on a single Codex invocation.
 */
export const CODEX_SUBAGENT_MCP_TOKEN_ENV = "PORACODE_SUBAGENT_MCP_TOKEN";

/**
 * Codex CLI accepts inline TOML overrides via `-c key.path=value`. Build the
 * override sequence registering the Poracode cross-provider subagents MCP
 * server for a single Codex invocation, using Codex's streamable-HTTP MCP
 * transport.
 *
 * Codex enables the rmcp client (which speaks streamable HTTP + SSE) when
 * `experimental_use_rmcp_client = true`. For older Codex builds that don't
 * recognize the flag, the override is harmlessly ignored.
 *
 * Codex streamable-HTTP config reads bearer tokens from an env var; passing
 * the token literal as `bearer_token` makes current Codex builds reject the
 * whole config.
 *
 * The subagents endpoint is delivered pre-resolved via the launch input, so
 * there is no location/WSL fallback here. Returns an empty array if MCP is
 * disabled.
 */
export function buildCodexSubagentMcpArgs(
  enabled: boolean,
  subagentMcp?: SubagentMcpHttpConfig,
): string[] {
  if (!enabled) return [];
  if (!subagentMcp) return [];

  const name = SUBAGENT_MCP_SERVER_NAME;

  return [
    "-c",
    `experimental_use_rmcp_client=true`,
    "-c",
    `mcp_servers.${name}.url=${JSON.stringify(subagentMcp.url)}`,
    "-c",
    `mcp_servers.${name}.bearer_token_env_var="${CODEX_SUBAGENT_MCP_TOKEN_ENV}"`,
    // Codex kills MCP tool calls after tool_timeout_sec (default 60s);
    // wait_for_agent/run_agent block up to MAX_WAIT_TIMEOUT_MS (240s).
    "-c",
    `mcp_servers.${name}.tool_timeout_sec=300`,
  ];
}

export function buildCodexSubagentMcpEnv(
  subagentMcp: SubagentMcpHttpConfig | undefined,
): Record<string, string> | undefined {
  return subagentMcp ? { [CODEX_SUBAGENT_MCP_TOKEN_ENV]: subagentMcp.token } : undefined;
}

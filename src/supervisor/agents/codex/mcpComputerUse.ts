import {
  COMPUTER_USE_MCP_SERVER_NAME,
  COMPUTER_USE_MCP_TOKEN_ENV,
  resolveOrFallbackComputerUseMcpConfig,
  type ComputerUseMcpHttpConfig,
  type ComputerUseMcpLocation,
} from "@/supervisor/agents/computerUseMcp";

export const CODEX_COMPUTER_USE_MCP_TOKEN_ENV = COMPUTER_USE_MCP_TOKEN_ENV;

export function buildCodexComputerUseMcpArgs(
  location: ComputerUseMcpLocation,
  enabled: boolean,
  computerUseMcp?: ComputerUseMcpHttpConfig,
): string[] {
  if (!enabled) return [];
  const cfg = resolveOrFallbackComputerUseMcpConfig(location, computerUseMcp);
  if (!cfg) return [];

  const name = COMPUTER_USE_MCP_SERVER_NAME;

  return [
    "-c",
    `experimental_use_rmcp_client=true`,
    "-c",
    `mcp_servers.${name}.url=${JSON.stringify(cfg.url)}`,
    "-c",
    `mcp_servers.${name}.bearer_token_env_var="${CODEX_COMPUTER_USE_MCP_TOKEN_ENV}"`,
  ];
}

export function buildCodexComputerUseMcpEnv(
  computerUseMcp: ComputerUseMcpHttpConfig | undefined,
): Record<string, string> | undefined {
  return computerUseMcp ? { [CODEX_COMPUTER_USE_MCP_TOKEN_ENV]: computerUseMcp.token } : undefined;
}

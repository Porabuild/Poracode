import {
  CHROME_MCP_SERVER_NAME,
  CHROME_MCP_TOKEN_ENV,
  resolveOrFallbackChromeMcpConfig,
  type ChromeMcpHttpConfig,
  type ChromeMcpLocation,
} from "@/supervisor/agents/chromeMcp";

export const CODEX_CHROME_MCP_TOKEN_ENV = CHROME_MCP_TOKEN_ENV;

/**
 * Codex CLI inline TOML overrides (`-c key.path=value`) registering the
 * external-Chrome MCP server for a single invocation. Mirrors
 * `./mcpComputerUse.ts`; the bearer token is read from an env var (passing the
 * literal makes current Codex builds reject the whole config). Returns an empty
 * array when the thread did not opt in or no config resolves.
 */
export function buildCodexChromeMcpArgs(
  location: ChromeMcpLocation,
  enabled: boolean,
  chromeMcp?: ChromeMcpHttpConfig,
): string[] {
  if (!enabled) return [];
  const cfg = resolveOrFallbackChromeMcpConfig(location, chromeMcp);
  if (!cfg) return [];

  const name = CHROME_MCP_SERVER_NAME;

  return [
    "-c",
    `experimental_use_rmcp_client=true`,
    "-c",
    `mcp_servers.${name}.url=${JSON.stringify(cfg.url)}`,
    "-c",
    `mcp_servers.${name}.bearer_token_env_var="${CODEX_CHROME_MCP_TOKEN_ENV}"`,
  ];
}

export function buildCodexChromeMcpEnv(
  chromeMcp: ChromeMcpHttpConfig | undefined,
): Record<string, string> | undefined {
  return chromeMcp ? { [CODEX_CHROME_MCP_TOKEN_ENV]: chromeMcp.token } : undefined;
}

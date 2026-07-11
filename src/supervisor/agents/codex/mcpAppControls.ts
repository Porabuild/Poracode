import {
  APP_CONTROLS_MCP_SERVER_NAME,
  APP_CONTROLS_MCP_TOKEN_ENV,
  resolveOrFallbackAppControlsMcpConfig,
  type AppControlsMcpHttpConfig,
  type AppControlsMcpLocation,
} from "../appControlsMcp";

export function buildCodexAppControlsMcpArgs(
  location: AppControlsMcpLocation,
  appControlsMcp?: AppControlsMcpHttpConfig,
): string[] {
  const cfg = resolveOrFallbackAppControlsMcpConfig(location, appControlsMcp);
  if (!cfg) return [];
  return [
    "-c",
    "experimental_use_rmcp_client=true",
    "-c",
    `mcp_servers.${APP_CONTROLS_MCP_SERVER_NAME}.url=${JSON.stringify(cfg.url)}`,
    "-c",
    `mcp_servers.${APP_CONTROLS_MCP_SERVER_NAME}.bearer_token_env_var=${JSON.stringify(APP_CONTROLS_MCP_TOKEN_ENV)}`,
  ];
}

export function buildCodexAppControlsMcpEnv(
  appControlsMcp: AppControlsMcpHttpConfig | undefined,
): Record<string, string> | undefined {
  return appControlsMcp ? { [APP_CONTROLS_MCP_TOKEN_ENV]: appControlsMcp.token } : undefined;
}

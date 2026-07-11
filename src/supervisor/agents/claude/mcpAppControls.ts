import {
  APP_CONTROLS_MCP_SERVER_NAME,
  resolveOrFallbackAppControlsMcpConfig,
  type AppControlsMcpHttpConfig,
  type AppControlsMcpLocation,
} from "../appControlsMcp";

export function buildClaudeAppControlsMcpServers(
  location: AppControlsMcpLocation,
  appControlsMcp?: AppControlsMcpHttpConfig,
): Record<string, { type: "http"; url: string; headers: Record<string, string> }> | undefined {
  const cfg = resolveOrFallbackAppControlsMcpConfig(location, appControlsMcp);
  if (!cfg) return undefined;
  return {
    [APP_CONTROLS_MCP_SERVER_NAME]: { type: "http", url: cfg.url, headers: cfg.headers },
  };
}

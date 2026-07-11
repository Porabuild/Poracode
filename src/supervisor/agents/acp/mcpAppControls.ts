import {
  APP_CONTROLS_MCP_SERVER_NAME,
  resolveOrFallbackAppControlsMcpConfig,
  type AppControlsMcpHttpConfig,
  type AppControlsMcpLocation,
} from "../appControlsMcp";
import type { AcpHttpMcpServer } from "./mcpBrowser";

export function buildAcpAppControlsMcpServers(
  location: AppControlsMcpLocation,
  appControlsMcp?: AppControlsMcpHttpConfig,
): AcpHttpMcpServer[] {
  const cfg = resolveOrFallbackAppControlsMcpConfig(location, appControlsMcp);
  if (!cfg) return [];
  return [
    {
      type: "http",
      name: APP_CONTROLS_MCP_SERVER_NAME,
      url: cfg.url,
      headers: Object.entries(cfg.headers).map(([name, value]) => ({ name, value })),
    },
  ];
}

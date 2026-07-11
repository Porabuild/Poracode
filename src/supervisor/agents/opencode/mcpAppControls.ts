import {
  APP_CONTROLS_MCP_SERVER_NAME,
  resolveOrFallbackAppControlsMcpConfig,
  type AppControlsMcpHttpConfig,
  type AppControlsMcpLocation,
} from "../appControlsMcp";
import type { OpenCodeMcpServers } from "./mcpBrowser";

export function buildOpenCodeAppControlsMcp(
  location: AppControlsMcpLocation,
  appControlsMcp?: AppControlsMcpHttpConfig,
): OpenCodeMcpServers | undefined {
  const cfg = resolveOrFallbackAppControlsMcpConfig(location, appControlsMcp);
  if (!cfg) return undefined;
  return {
    [APP_CONTROLS_MCP_SERVER_NAME]: {
      type: "remote",
      url: cfg.url,
      headers: cfg.headers,
      enabled: true,
    },
  };
}

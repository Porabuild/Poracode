import {
  APP_CONTROLS_MCP_SERVER_NAME,
  resolveOrFallbackAppControlsMcpConfig,
  type AppControlsMcpHttpConfig,
  type AppControlsMcpLocation,
} from "../appControlsMcp";
import type { GeminiMcpServers } from "./mcpBrowser";

export function buildGeminiAppControlsMcpServers(
  location: AppControlsMcpLocation,
  appControlsMcp?: AppControlsMcpHttpConfig,
): GeminiMcpServers | undefined {
  const cfg = resolveOrFallbackAppControlsMcpConfig(location, appControlsMcp);
  if (!cfg) return undefined;
  return {
    [APP_CONTROLS_MCP_SERVER_NAME]: {
      httpUrl: cfg.url,
      headers: cfg.headers,
      timeout: 30_000,
    },
  };
}

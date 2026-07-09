import {
  CHROME_MCP_SERVER_NAME,
  resolveOrFallbackChromeMcpConfig,
  type ChromeMcpHttpConfig,
  type ChromeMcpLocation,
} from "@/supervisor/agents/chromeMcp";
import type { OpenCodeMcpServers } from "./mcpBrowser";

export function buildOpenCodeChromeMcp(
  location: ChromeMcpLocation,
  enabled: boolean,
  chromeMcp?: ChromeMcpHttpConfig,
): OpenCodeMcpServers | undefined {
  if (!enabled) return undefined;
  const cfg = resolveOrFallbackChromeMcpConfig(location, chromeMcp);
  if (!cfg) return undefined;
  return {
    [CHROME_MCP_SERVER_NAME]: {
      type: "remote",
      url: cfg.url,
      headers: cfg.headers,
      enabled: true,
    },
  };
}

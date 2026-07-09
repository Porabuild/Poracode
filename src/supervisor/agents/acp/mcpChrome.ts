import {
  CHROME_MCP_SERVER_NAME,
  resolveOrFallbackChromeMcpConfig,
  type ChromeMcpHttpConfig,
  type ChromeMcpLocation,
} from "@/supervisor/agents/chromeMcp";
import type { AcpHttpMcpServer } from "./mcpBrowser";

export function buildAcpChromeMcpServers(
  location: ChromeMcpLocation,
  enabled: boolean,
  chromeMcp?: ChromeMcpHttpConfig,
): AcpHttpMcpServer[] {
  if (!enabled) return [];
  const cfg = resolveOrFallbackChromeMcpConfig(location, chromeMcp);
  if (!cfg) return [];
  return [
    {
      type: "http",
      name: CHROME_MCP_SERVER_NAME,
      url: cfg.url,
      headers: Object.entries(cfg.headers).map(([name, value]) => ({ name, value })),
    },
  ];
}

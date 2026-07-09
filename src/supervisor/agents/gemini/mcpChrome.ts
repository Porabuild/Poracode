import {
  CHROME_MCP_SERVER_NAME,
  resolveOrFallbackChromeMcpConfig,
  type ChromeMcpHttpConfig,
  type ChromeMcpLocation,
} from "@/supervisor/agents/chromeMcp";
import type { GeminiMcpServers } from "./mcpBrowser";

export function buildGeminiChromeMcpServers(
  location: ChromeMcpLocation,
  enabled: boolean,
  chromeMcp?: ChromeMcpHttpConfig,
): GeminiMcpServers | undefined {
  if (!enabled) return undefined;
  const cfg = resolveOrFallbackChromeMcpConfig(location, chromeMcp);
  if (!cfg) return undefined;
  return {
    [CHROME_MCP_SERVER_NAME]: {
      httpUrl: cfg.url,
      headers: cfg.headers,
      timeout: 30_000,
    },
  };
}

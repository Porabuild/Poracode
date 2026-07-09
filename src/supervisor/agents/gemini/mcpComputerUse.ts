import {
  COMPUTER_USE_MCP_SERVER_NAME,
  resolveOrFallbackComputerUseMcpConfig,
  type ComputerUseMcpHttpConfig,
  type ComputerUseMcpLocation,
} from "@/supervisor/agents/computerUseMcp";
import type { GeminiMcpServers } from "./mcpBrowser";

export function buildGeminiComputerUseMcpServers(
  location: ComputerUseMcpLocation,
  enabled: boolean,
  computerUseMcp?: ComputerUseMcpHttpConfig,
): GeminiMcpServers | undefined {
  if (!enabled) return undefined;
  const cfg = resolveOrFallbackComputerUseMcpConfig(location, computerUseMcp);
  if (!cfg) return undefined;
  return {
    [COMPUTER_USE_MCP_SERVER_NAME]: {
      httpUrl: cfg.url,
      headers: cfg.headers,
      timeout: 30_000,
    },
  };
}

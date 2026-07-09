import {
  COMPUTER_USE_MCP_SERVER_NAME,
  resolveOrFallbackComputerUseMcpConfig,
  type ComputerUseMcpHttpConfig,
  type ComputerUseMcpLocation,
} from "@/supervisor/agents/computerUseMcp";
import type { OpenCodeMcpServers } from "./mcpBrowser";

export function buildOpenCodeComputerUseMcp(
  location: ComputerUseMcpLocation,
  enabled: boolean,
  computerUseMcp?: ComputerUseMcpHttpConfig,
): OpenCodeMcpServers | undefined {
  if (!enabled) return undefined;
  const cfg = resolveOrFallbackComputerUseMcpConfig(location, computerUseMcp);
  if (!cfg) return undefined;
  return {
    [COMPUTER_USE_MCP_SERVER_NAME]: {
      type: "remote",
      url: cfg.url,
      headers: cfg.headers,
      enabled: true,
    },
  };
}

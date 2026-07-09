import {
  COMPUTER_USE_MCP_SERVER_NAME,
  resolveOrFallbackComputerUseMcpConfig,
  type ComputerUseMcpHttpConfig,
  type ComputerUseMcpLocation,
} from "@/supervisor/agents/computerUseMcp";
import type { AcpHttpMcpServer } from "./mcpBrowser";

export function buildAcpComputerUseMcpServers(
  location: ComputerUseMcpLocation,
  enabled: boolean,
  computerUseMcp?: ComputerUseMcpHttpConfig,
): AcpHttpMcpServer[] {
  if (!enabled) return [];
  const cfg = resolveOrFallbackComputerUseMcpConfig(location, computerUseMcp);
  if (!cfg) return [];
  return [
    {
      type: "http",
      name: COMPUTER_USE_MCP_SERVER_NAME,
      url: cfg.url,
      headers: Object.entries(cfg.headers).map(([name, value]) => ({ name, value })),
    },
  ];
}

import {
  COMPUTER_USE_MCP_SERVER_NAME,
  resolveComputerUseMcpHttpConfig,
  type ComputerUseMcpHttpConfig,
  type ComputerUseMcpLocation,
} from "@/supervisor/agents/computerUseMcp";
import type { OpenCodeMcpServers } from "./mcpBrowser";

export function buildOpenCodeComputerUseMcp(
  location: ComputerUseMcpLocation,
  computerUseMcp?: ComputerUseMcpHttpConfig,
): OpenCodeMcpServers | undefined {
  if (location.kind === "wsl" && !computerUseMcp) return undefined;
  const cfg = computerUseMcp ?? resolveComputerUseMcpHttpConfig(location);
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

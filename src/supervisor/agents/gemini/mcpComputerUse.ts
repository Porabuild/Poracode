import {
  COMPUTER_USE_MCP_SERVER_NAME,
  resolveComputerUseMcpHttpConfig,
  type ComputerUseMcpHttpConfig,
  type ComputerUseMcpLocation,
} from "@/supervisor/agents/computerUseMcp";
import type { GeminiMcpServers } from "./mcpBrowser";

export function buildGeminiComputerUseMcpServers(
  location: ComputerUseMcpLocation,
  computerUseMcp?: ComputerUseMcpHttpConfig,
): GeminiMcpServers | undefined {
  if (location.kind === "wsl" && !computerUseMcp) return undefined;
  const cfg = computerUseMcp ?? resolveComputerUseMcpHttpConfig(location);
  if (!cfg) return undefined;
  return {
    [COMPUTER_USE_MCP_SERVER_NAME]: {
      httpUrl: cfg.url,
      headers: cfg.headers,
      timeout: 30_000,
    },
  };
}

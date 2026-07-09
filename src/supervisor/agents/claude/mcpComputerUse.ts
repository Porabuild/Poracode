import {
  COMPUTER_USE_MCP_SERVER_NAME,
  resolveOrFallbackComputerUseMcpConfig,
  type ComputerUseMcpHttpConfig,
  type ComputerUseMcpLocation,
} from "@/supervisor/agents/computerUseMcp";

interface ClaudeMcpServers {
  [name: string]: {
    type: "http";
    url: string;
    headers: Record<string, string>;
  };
}

export function buildClaudeComputerUseMcpServers(
  location: ComputerUseMcpLocation,
  enabled: boolean,
  computerUseMcp?: ComputerUseMcpHttpConfig,
): ClaudeMcpServers | undefined {
  if (!enabled) return undefined;
  const cfg = resolveOrFallbackComputerUseMcpConfig(location, computerUseMcp);
  if (!cfg) return undefined;
  return {
    [COMPUTER_USE_MCP_SERVER_NAME]: {
      type: "http",
      url: cfg.url,
      headers: cfg.headers,
    },
  };
}

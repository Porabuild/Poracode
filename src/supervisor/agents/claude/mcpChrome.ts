import {
  CHROME_MCP_SERVER_NAME,
  resolveOrFallbackChromeMcpConfig,
  type ChromeMcpHttpConfig,
  type ChromeMcpLocation,
} from "@/supervisor/agents/chromeMcp";

/**
 * Claude Agent SDK `mcpServers` entry for the external-Chrome control server.
 * Mirrors `./mcpComputerUse.ts` but for the `chrome` ingress. Returns
 * `undefined` when the thread did not opt in, the ingress is not running (env
 * absent), or the location is unsupported (WSL declines).
 */
interface ClaudeMcpServers {
  [name: string]: {
    type: "http";
    url: string;
    headers: Record<string, string>;
  };
}

export function buildClaudeChromeMcpServers(
  location: ChromeMcpLocation,
  enabled: boolean,
  chromeMcp?: ChromeMcpHttpConfig,
): ClaudeMcpServers | undefined {
  if (!enabled) return undefined;
  const cfg = resolveOrFallbackChromeMcpConfig(location, chromeMcp);
  if (!cfg) return undefined;
  return {
    [CHROME_MCP_SERVER_NAME]: {
      type: "http",
      url: cfg.url,
      headers: cfg.headers,
    },
  };
}

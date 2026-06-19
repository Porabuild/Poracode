import {
  BROWSER_MCP_SERVER_NAME,
  resolveOrFallbackBrowserMcpConfig,
  type BrowserMcpHttpConfig,
  type BrowserMcpLocation,
} from "@/supervisor/agents/browserMcp";

/**
 * Claude Agent SDK `mcpServers` entry shape for HTTP transport.
 * See @anthropic-ai/claude-agent-sdk's `McpHttpServerConfig`.
 */
interface ClaudeMcpServers {
  [name: string]: {
    type: "http";
    url: string;
    headers: Record<string, string>;
  };
}

export function buildClaudeBrowserMcpServers(
  location: BrowserMcpLocation,
  enabled: boolean,
  browserMcp?: BrowserMcpHttpConfig,
): ClaudeMcpServers | undefined {
  if (!enabled) return undefined;
  const cfg = resolveOrFallbackBrowserMcpConfig(location, browserMcp);
  if (!cfg) return undefined;
  return {
    [BROWSER_MCP_SERVER_NAME]: {
      type: "http",
      url: cfg.url,
      headers: cfg.headers,
    },
  };
}

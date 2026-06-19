import {
  BROWSER_MCP_SERVER_NAME,
  resolveOrFallbackBrowserMcpConfig,
  type BrowserMcpHttpConfig,
  type BrowserMcpLocation,
} from "@/supervisor/agents/browserMcp";

/**
 * OpenCode `opencode.json` `mcp` entry — remote (Streamable-HTTP) variant.
 * See @opencode-ai/sdk McpRemoteConfig.
 */
export interface OpenCodeMcpRemoteServer {
  type: "remote";
  url: string;
  headers: Record<string, string>;
  enabled?: boolean;
}

export type OpenCodeMcpServers = Record<string, OpenCodeMcpRemoteServer>;

export function buildOpenCodeBrowserMcp(
  location: BrowserMcpLocation,
  browserMcp?: BrowserMcpHttpConfig,
): OpenCodeMcpServers | undefined {
  const cfg = resolveOrFallbackBrowserMcpConfig(location, browserMcp);
  if (!cfg) return undefined;
  return {
    [BROWSER_MCP_SERVER_NAME]: {
      type: "remote",
      url: cfg.url,
      headers: cfg.headers,
      enabled: true,
    },
  };
}

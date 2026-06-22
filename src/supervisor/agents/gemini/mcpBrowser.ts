import {
  BROWSER_MCP_SERVER_NAME,
  resolveOrFallbackBrowserMcpConfig,
  type BrowserMcpHttpConfig,
  type BrowserMcpLocation,
} from "@/supervisor/agents/browserMcp";

/**
 * Gemini CLI mcpServers entry shape. The HTTP transport is selected by the
 * `httpUrl` field (vs `command` for stdio). Headers are passed verbatim.
 */
export interface GeminiMcpServerEntry {
  httpUrl?: string;
  headers?: Record<string, string>;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  timeout?: number;
}

export type GeminiMcpServers = Record<string, GeminiMcpServerEntry>;

export function buildGeminiBrowserMcpServers(
  location: BrowserMcpLocation,
  browserMcp?: BrowserMcpHttpConfig,
): GeminiMcpServers | undefined {
  const cfg = resolveOrFallbackBrowserMcpConfig(location, browserMcp);
  if (!cfg) return undefined;
  return {
    [BROWSER_MCP_SERVER_NAME]: {
      httpUrl: cfg.url,
      headers: cfg.headers,
      timeout: 30_000,
    },
  };
}

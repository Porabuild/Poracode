import {
  BROWSER_MCP_SERVER_NAME,
  resolveOrFallbackBrowserMcpConfig,
  type BrowserMcpHttpConfig,
  type BrowserMcpLocation,
} from "@/supervisor/agents/browserMcp";

/**
 * ACP `newSession`/`loadSession`/`resumeSession` accept an `mcpServers` array.
 * The HTTP variant in @agentclientprotocol/sdk is `McpServerHttp`:
 *   { type: "http", name, url, headers: HttpHeader[] }
 *
 * Returns the array (possibly empty when MCP is disabled), so call sites can
 * unconditionally pass `mcpServers: buildAcpBrowserMcpServers(...)`.
 */
export interface AcpHttpHeader {
  name: string;
  value: string;
}

export interface AcpHttpMcpServer {
  type: "http";
  name: string;
  url: string;
  headers: AcpHttpHeader[];
}

export function buildAcpBrowserMcpServers(
  location: BrowserMcpLocation,
  enabled: boolean,
  browserMcp?: BrowserMcpHttpConfig,
): AcpHttpMcpServer[] {
  if (!enabled) return [];
  const cfg = resolveOrFallbackBrowserMcpConfig(location, browserMcp);
  if (!cfg) return [];
  return [
    {
      type: "http",
      name: BROWSER_MCP_SERVER_NAME,
      url: cfg.url,
      headers: Object.entries(cfg.headers).map(([name, value]) => ({ name, value })),
    },
  ];
}

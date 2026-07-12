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

/**
 * Advertised MCP transport support from the ACP `initialize` response
 * (`agentCapabilities.mcpCapabilities`). Redeclared structurally so this
 * provider-boundary module doesn't depend on the SDK types directly.
 */
export interface AcpMcpCapabilities {
  http?: boolean;
  sse?: boolean;
}

/**
 * Gate remote (http/sse) MCP servers on the agent's advertised
 * `mcpCapabilities`; stdio servers (which carry no `type` field in the ACP
 * protocol shape) always pass.
 *
 * Some ACP agents (e.g. Factory Droid via `droid exec --output-format
 * acp-daemon`) fail `newSession` with an internal error when passed a remote
 * MCP server they don't support, instead of ignoring it — which kills the
 * thread launch. Agents that advertise the transport (Cursor, Grok, Gemini)
 * keep their servers. This is provider-agnostic: it keys purely off the
 * capability.
 *
 * Returns the (possibly empty) surviving list, so callers can inspect the
 * length delta to log/report what was dropped.
 */
export function gateAcpMcpServers<T extends object>(
  servers: T[],
  mcpCapabilities: AcpMcpCapabilities | undefined,
): T[] {
  return servers.filter((server) => {
    if (!("type" in server)) return true;
    if (server.type === "http") return mcpCapabilities?.http === true;
    if (server.type === "sse") return mcpCapabilities?.sse === true;
    return true;
  });
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

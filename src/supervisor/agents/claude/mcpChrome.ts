import type { McpThreadIdentity } from "@/shared/browserMcpThread";
import type { BrowserMcpLocation } from "@/supervisor/agents/browserMcp";
import { CHROME_MCP_SERVER_NAME, resolveChromeMcpHttpConfig } from "@/supervisor/agents/chromeMcp";

/**
 * Claude Agent SDK `mcpServers` entry for the external-Chrome control server.
 * Mirrors `./mcpBrowser.ts` but for the `chrome` ingress. Returns `undefined`
 * when the ingress is not running (env absent) or the location is unsupported.
 */
interface ClaudeMcpServers {
  [name: string]: {
    type: "http";
    url: string;
    headers: Record<string, string>;
  };
}

export function buildClaudeChromeMcpServers(
  location: BrowserMcpLocation,
  identity?: McpThreadIdentity,
): ClaudeMcpServers | undefined {
  const cfg = resolveChromeMcpHttpConfig(location, identity);
  if (!cfg) return undefined;
  return {
    [CHROME_MCP_SERVER_NAME]: {
      type: "http",
      url: cfg.url,
      headers: cfg.headers,
    },
  };
}

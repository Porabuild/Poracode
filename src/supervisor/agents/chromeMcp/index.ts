/**
 * External-Chrome MCP wiring — the sibling of `../browserMcp`. Where
 * `browserMcp` points agents at the embedded browser panel, this points them at
 * the `chrome` Streamable-HTTP ingress that relays to the user's REAL Chrome via
 * the companion extension. The main process injects the URL + token at launch.
 *
 * Native (windows/posix) only for now: a WSL agent would need the in-distro
 * bridge reverse-proxy, matching the embedded browser MCP path.
 */

import { encodeThreadQuery, type McpThreadIdentity } from "@/shared/browserMcpThread";
import type { BrowserMcpLocation } from "@/supervisor/agents/browserMcp";

export const CHROME_MCP_SERVER_NAME = "chrome";

export interface ChromeMcpHttpConfig {
  url: string;
  token: string;
  headers: Record<string, string>;
}

export function readChromeMcpEnv(): { url: string; token: string } | null {
  const url = process.env.LIGHTCODE_CHROME_MCP_URL;
  const token = process.env.LIGHTCODE_CHROME_MCP_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

export function resolveChromeMcpHttpConfig(
  location: BrowserMcpLocation,
  identity?: McpThreadIdentity,
): ChromeMcpHttpConfig | null {
  const env = readChromeMcpEnv();
  if (!env) return null;
  if (location.kind === "wsl") return null;
  const mcpUrl = encodeThreadQuery(`${env.url.replace(/\/$/, "")}/mcp`, identity);
  return {
    url: mcpUrl,
    token: env.token,
    headers: { Authorization: `Bearer ${env.token}` },
  };
}

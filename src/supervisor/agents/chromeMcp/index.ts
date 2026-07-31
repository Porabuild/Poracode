/**
 * External-Chrome MCP wiring — the sibling of `../browserMcp` and
 * `../computerUseMcp`. Where `browserMcp` points agents at the embedded browser
 * panel, this points them at the `chrome` Streamable-HTTP ingress that relays to
 * the user's REAL Chrome via the companion extension. The main process injects
 * the URL + token at launch. Wired per-thread across every provider (Claude SDK,
 * The runtime gates it behind `config.chromeMcp` and adds it to the generic
 * resolved MCP collection.
 *
 * Native (windows/posix) only: a WSL agent would need the in-distro bridge
 * reverse-proxy, matching the embedded browser MCP path — so WSL declines.
 */

import { encodeThreadQuery, type McpThreadIdentity } from "@/shared/browserMcpThread";
import type { BrowserMcpLocation } from "@/supervisor/agents/browserMcp";

export type ChromeMcpLocation = BrowserMcpLocation;

export const CHROME_MCP_URL_ENV = "PORACODE_CHROME_MCP_URL";
export const CHROME_MCP_TOKEN_ENV = "PORACODE_CHROME_MCP_TOKEN";

export interface ChromeMcpHttpConfig {
  url: string;
  token: string;
  headers: Record<string, string>;
}

export function readChromeMcpEnv(): { url: string; token: string } | null {
  const url = process.env[CHROME_MCP_URL_ENV];
  const token = process.env[CHROME_MCP_TOKEN_ENV];
  if (!url || !token) return null;
  return { url, token };
}

export function resolveChromeMcpHttpConfig(
  location: ChromeMcpLocation,
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

export function resolveChromeMcpHttpConfigForLaunch(
  location: ChromeMcpLocation,
  enabled: boolean,
  identity?: McpThreadIdentity,
): ChromeMcpHttpConfig | undefined {
  if (!enabled) return undefined;
  return resolveChromeMcpHttpConfig(location, identity) ?? undefined;
}

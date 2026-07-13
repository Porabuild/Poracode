/**
 * Shared helper for injecting the Poracode in-app browser MCP server into
 * agent CLIs. The main process hosts a single Streamable-HTTP MCP endpoint
 * (BrowserMcpIngress); each agent receives a URL + bearer token at launch.
 * No per-thread Node child process.
 *
 * Each provider adapter calls one of these functions to assemble the
 * provider-native config (Claude SDK `mcpServers` http entry, Codex `-c`
 * overrides, Gemini `mcpServers` httpUrl, OpenCode `mcp` remote, ACP
 * `mcpServers` http variant).
 */

import type { ProjectLocation } from "@/shared/contracts";
import { encodeThreadQuery, type McpThreadIdentity } from "@/shared/browserMcpThread";

/** Minimal shape needed to pick native-vs-WSL - accepts a `ProjectLocation` or
 *  a stripped-down `{ kind, distro? }` so internal installers can call without
 *  fabricating UNC paths. */
export type BrowserMcpLocation =
  | ProjectLocation
  | { kind: "windows" }
  | { kind: "posix" }
  | { kind: "wsl"; distro: string };

export interface BrowserMcpEnv {
  url: string;
  token: string;
}

export function readBrowserMcpEnv(): BrowserMcpEnv | null {
  const url = process.env.PORACODE_BROWSER_MCP_URL;
  const token = process.env.PORACODE_BROWSER_MCP_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

export const BROWSER_MCP_SERVER_NAME = "browser";

export interface BrowserMcpHttpConfig {
  /** MCP endpoint URL ready for the given location. WSL -> host gateway IP. */
  url: string;
  /** Authorization bearer token. */
  token: string;
  /** Headers map (always includes Authorization). */
  headers: Record<string, string>;
}

export interface BrowserMcpBridge {
  ensureBridge(distro: string): Promise<{ baseUrl: string; secret: string } | undefined>;
}

/**
 * Resolve an HTTP MCP server config suitable for the given project location.
 * For native (windows/posix) projects, the loopback URL is returned as-is.
 * For WSL projects this returns null — WSL agents reach the host ingress
 * through the in-distro bridge's `/mcp` reverse proxy instead (see
 * `resolveBrowserMcpHttpConfigForLaunch`).
 *
 * Returns null when the MCP ingress is not running (env vars absent) or a
 * WSL distro cannot be reached. Per-thread opt-in is enforced by callers —
 * they pass `config.browserMcp` from the thread config.
 */
export function resolveBrowserMcpHttpConfig(
  location: BrowserMcpLocation,
): BrowserMcpHttpConfig | null {
  const env = readBrowserMcpEnv();
  if (!env) return null;
  if (location.kind === "wsl") return null;
  const url = env.url;
  // Append `/mcp` so the agent hits the Streamable-HTTP endpoint directly.
  const mcpUrl = `${url.replace(/\/$/, "")}/mcp`;
  return {
    url: mcpUrl,
    token: env.token,
    headers: { Authorization: `Bearer ${env.token}` },
  };
}

/**
 * Resolve a BrowserMcpHttpConfig from an optional pre-resolved config or by
 * falling back to the environment. Returns `undefined` when the config cannot
 * be resolved (WSL without a pre-resolved bridge, or env vars absent).
 *
 * Shared guard used by every provider's `buildXxxBrowserMcp*()` function.
 */
export function resolveOrFallbackBrowserMcpConfig(
  location: BrowserMcpLocation,
  browserMcp?: BrowserMcpHttpConfig,
): BrowserMcpHttpConfig | undefined {
  if (location.kind === "wsl" && !browserMcp) return undefined;
  return browserMcp ?? resolveBrowserMcpHttpConfig(location) ?? undefined;
}

export async function resolveBrowserMcpHttpConfigForLaunch(
  location: BrowserMcpLocation,
  enabled: boolean,
  bridge?: BrowserMcpBridge,
  identity?: McpThreadIdentity,
): Promise<BrowserMcpHttpConfig | undefined> {
  if (!enabled) return undefined;
  if (location.kind === "wsl") {
    if (!bridge) return undefined;
    const env = readBrowserMcpEnv();
    if (!env) return undefined;
    const handle = await bridge.ensureBridge(location.distro);
    if (!handle) return undefined;
    const url = encodeThreadQuery(`${handle.baseUrl.replace(/\/$/, "")}/mcp`, identity);
    return {
      url,
      token: handle.secret,
      headers: { Authorization: `Bearer ${handle.secret}` },
    };
  }
  const cfg = resolveBrowserMcpHttpConfig(location);
  if (!cfg) return undefined;
  return { ...cfg, url: encodeThreadQuery(cfg.url, identity) };
}

/**
 * Shared helper for injecting the Lightcode in-app browser MCP server into
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
  const url = process.env.LIGHTCODE_BROWSER_MCP_URL;
  const token = process.env.LIGHTCODE_BROWSER_MCP_TOKEN;
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
  ensureSshBridge?(
    location: Extract<ProjectLocation, { kind: "ssh" }>,
    upstream: BrowserMcpEnv,
  ): Promise<{ baseUrl: string; secret: string } | undefined>;
}

/**
 * Resolve an HTTP MCP server config suitable for the given project location.
 * For native (windows/posix) projects, the loopback URL is returned as-is.
 * For WSL projects, `127.0.0.1` is rewritten to the WSL->host gateway IP
 * resolved from `\\wsl.localhost\<distro>\etc\resolv.conf`.
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
  if (location.kind === "ssh") return null;
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

export async function resolveBrowserMcpHttpConfigForLaunch(
  location: BrowserMcpLocation,
  enabled: boolean,
  bridge?: BrowserMcpBridge,
): Promise<BrowserMcpHttpConfig | undefined> {
  if (!enabled) return undefined;
  if (location.kind === "wsl") {
    if (!bridge) return undefined;
    const env = readBrowserMcpEnv();
    if (!env) return undefined;
    const handle = await bridge.ensureBridge(location.distro);
    if (!handle) return undefined;
    const url = `${handle.baseUrl.replace(/\/$/, "")}/mcp`;
    return {
      url,
      token: handle.secret,
      headers: { Authorization: `Bearer ${handle.secret}` },
    };
  }
  if (location.kind === "ssh") {
    if (!bridge?.ensureSshBridge) return undefined;
    const env = readBrowserMcpEnv();
    if (!env) return undefined;
    const handle = await bridge.ensureSshBridge(location, env);
    if (!handle) return undefined;
    const url = `${handle.baseUrl.replace(/\/$/, "")}/mcp`;
    return {
      url,
      token: handle.secret,
      headers: { Authorization: `Bearer ${handle.secret}` },
    };
  }
  return resolveBrowserMcpHttpConfig(location) ?? undefined;
}

import type { ProjectLocation } from "@/shared/contracts";
import { encodeThreadQuery, type McpThreadIdentity } from "@/shared/browserMcpThread";
import type { WslHostAccessResolver } from "@/supervisor/wsl/hostAccess";

export type AppControlsMcpLocation =
  | ProjectLocation
  | { kind: "windows" }
  | { kind: "posix" }
  | { kind: "wsl"; distro: string };

export interface AppControlsMcpHttpConfig {
  url: string;
  token: string;
  headers: Record<string, string>;
}

export const APP_CONTROLS_MCP_URL_ENV = "PORACODE_APP_CONTROLS_MCP_URL";
export const APP_CONTROLS_MCP_TOKEN_ENV = "PORACODE_APP_CONTROLS_MCP_TOKEN";

export function resolveAppControlsMcpHttpConfig(
  location: AppControlsMcpLocation,
  identity?: McpThreadIdentity,
): AppControlsMcpHttpConfig | null {
  const url = process.env[APP_CONTROLS_MCP_URL_ENV];
  const token = process.env[APP_CONTROLS_MCP_TOKEN_ENV];
  if (!url || !token || location.kind === "wsl") return null;
  return createConfig(encodeThreadQuery(`${url.replace(/\/$/u, "")}/mcp`, identity), token);
}

export async function resolveAppControlsMcpHttpConfigForLaunch(
  location: AppControlsMcpLocation,
  hostAccess: WslHostAccessResolver | undefined,
  identity?: McpThreadIdentity,
): Promise<AppControlsMcpHttpConfig | undefined> {
  if (location.kind !== "wsl") {
    return resolveAppControlsMcpHttpConfig(location, identity) ?? undefined;
  }
  const url = process.env[APP_CONTROLS_MCP_URL_ENV];
  const token = process.env[APP_CONTROLS_MCP_TOKEN_ENV];
  if (!url || !token || !hostAccess) return undefined;
  const access = await hostAccess.resolveHostAccess(location.distro);
  if (!access) return undefined;
  const nativeUrl = encodeThreadQuery(`${url.replace(/\/$/u, "")}/mcp`, identity);
  if (access.kind === "loopback") return createConfig(nativeUrl, token);
  const parsed = new URL(nativeUrl);
  parsed.hostname = access.ip;
  return createConfig(parsed.toString(), token);
}

function createConfig(url: string, token: string): AppControlsMcpHttpConfig {
  return { url, token, headers: { Authorization: `Bearer ${token}` } };
}

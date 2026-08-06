import type { ProjectLocation } from "@/shared/contracts";
import { encodeThreadQuery, type McpThreadIdentity } from "@/shared/browserMcpThread";

export type ComputerUseMcpLocation =
  | ProjectLocation
  | { kind: "windows" }
  | { kind: "posix" }
  | { kind: "wsl"; distro: string };

export interface ComputerUseMcpEnv {
  url: string;
  token: string;
}

export const COMPUTER_USE_MCP_URL_ENV = "PORACODE_COMPUTER_USE_MCP_URL";
export const COMPUTER_USE_MCP_TOKEN_ENV = "PORACODE_COMPUTER_USE_MCP_TOKEN";

export function readComputerUseMcpEnv(): ComputerUseMcpEnv | null {
  const url = process.env[COMPUTER_USE_MCP_URL_ENV];
  const token = process.env[COMPUTER_USE_MCP_TOKEN_ENV];
  if (!url || !token) return null;
  return { url, token };
}

export interface ComputerUseMcpHttpConfig {
  url: string;
  token: string;
  headers: Record<string, string>;
}

export function resolveComputerUseMcpHttpConfig(
  location: ComputerUseMcpLocation,
  identity?: McpThreadIdentity,
): ComputerUseMcpHttpConfig | null {
  const env = readComputerUseMcpEnv();
  if (!env) return null;
  // WSL projects can't reach the host MCP endpoint over loopback; the
  // host-gateway rewrite was removed when WSL exec moved to the supervisor
  // bridge. Mirror browserMcp and decline here — callers short-circuit WSL
  // unless a launch-time config is supplied.
  if (location.kind === "wsl") return null;
  const mcpUrl = encodeThreadQuery(`${env.url.replace(/\/$/, "")}/mcp`, identity);
  return {
    url: mcpUrl,
    token: env.token,
    headers: { Authorization: `Bearer ${env.token}` },
  };
}

export function resolveComputerUseMcpHttpConfigForLaunch(
  location: ComputerUseMcpLocation,
  enabled: boolean,
  identity?: McpThreadIdentity,
): ComputerUseMcpHttpConfig | undefined {
  if (!enabled) return undefined;
  return resolveComputerUseMcpHttpConfig(location, identity) ?? undefined;
}

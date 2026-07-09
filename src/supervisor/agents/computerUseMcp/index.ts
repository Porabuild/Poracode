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

export const COMPUTER_USE_MCP_URL_ENV = "LIGHTCODE_COMPUTER_USE_MCP_URL";
export const COMPUTER_USE_MCP_TOKEN_ENV = "LIGHTCODE_COMPUTER_USE_MCP_TOKEN";

export function readComputerUseMcpEnv(): ComputerUseMcpEnv | null {
  const url = process.env[COMPUTER_USE_MCP_URL_ENV];
  const token = process.env[COMPUTER_USE_MCP_TOKEN_ENV];
  if (!url || !token) return null;
  return { url, token };
}

export const COMPUTER_USE_MCP_SERVER_NAME = "computer_use";

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

/**
 * Resolve a ComputerUseMcpHttpConfig from an optional pre-resolved config or by
 * falling back to the environment. Returns `undefined` when the config cannot
 * be resolved (WSL without a launch-time config, or env vars absent).
 *
 * Shared guard used by every provider's `buildXxxComputerUseMcp*()` function.
 */
export function resolveOrFallbackComputerUseMcpConfig(
  location: ComputerUseMcpLocation,
  computerUseMcp?: ComputerUseMcpHttpConfig,
): ComputerUseMcpHttpConfig | undefined {
  if (location.kind === "wsl" && !computerUseMcp) return undefined;
  return computerUseMcp ?? resolveComputerUseMcpHttpConfig(location) ?? undefined;
}

export function resolveComputerUseMcpHttpConfigForLaunch(
  location: ComputerUseMcpLocation,
  enabled: boolean,
  identity?: McpThreadIdentity,
): ComputerUseMcpHttpConfig | undefined {
  if (!enabled) return undefined;
  return resolveComputerUseMcpHttpConfig(location, identity) ?? undefined;
}

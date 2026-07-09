import type { ProjectLocation } from "@/shared/contracts";

export type ComputerUseMcpLocation =
  | ProjectLocation
  | { kind: "windows" }
  | { kind: "posix" }
  | { kind: "wsl"; distro: string };

export interface ComputerUseMcpEnv {
  url: string;
  token: string;
}

export function readComputerUseMcpEnv(): ComputerUseMcpEnv | null {
  const url = process.env.LIGHTCODE_COMPUTER_USE_MCP_URL;
  const token = process.env.LIGHTCODE_COMPUTER_USE_MCP_TOKEN;
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
): ComputerUseMcpHttpConfig | null {
  const env = readComputerUseMcpEnv();
  if (!env) return null;
  // WSL projects can't reach the host MCP endpoint over loopback; the
  // host-gateway rewrite was removed when WSL exec moved to the supervisor
  // bridge. Mirror browserMcp and decline here — callers short-circuit WSL
  // unless a launch-time config is supplied.
  if (location.kind === "wsl") return null;
  const mcpUrl = `${env.url.replace(/\/$/, "")}/mcp`;
  return {
    url: mcpUrl,
    token: env.token,
    headers: { Authorization: `Bearer ${env.token}` },
  };
}

export function resolveComputerUseMcpHttpConfigForLaunch(
  location: ComputerUseMcpLocation,
  enabled: boolean,
): ComputerUseMcpHttpConfig | undefined {
  if (!enabled) return undefined;
  return resolveComputerUseMcpHttpConfig(location) ?? undefined;
}

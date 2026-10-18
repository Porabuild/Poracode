import type { McpServer } from "@/shared/contracts";

export const MCP_FILTER_CONFIG_ENV = "PORACODE_MCP_FILTER_CONFIG";
// A different key makes older workers reject the new policy before connecting.
export const MCP_FILTER_CONFIG_V1_ENV = "PORACODE_MCP_FILTER_CONFIG_V1";

export interface McpToolFilterConfig {
  server: McpServer;
  disabledTools: string[];
  isolateConnectionFailures?: boolean;
}

export function readMcpToolFilterConfig(env: NodeJS.ProcessEnv): McpToolFilterConfig {
  const versioned = env[MCP_FILTER_CONFIG_V1_ENV];
  const encoded = versioned ?? env[MCP_FILTER_CONFIG_ENV];
  if (!encoded) throw new Error("Missing MCP filter configuration");
  const config = JSON.parse(
    Buffer.from(encoded, "base64url").toString("utf8"),
  ) as McpToolFilterConfig & {
    version?: number;
  };
  if (versioned !== undefined && config.version !== 1) {
    throw new Error("Unsupported MCP filter configuration version");
  }
  // Unversioned workers predate failure isolation; their configurations stay valid.
  return config;
}

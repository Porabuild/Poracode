import type { McpServer } from "@/shared/contracts";

export const MCP_FILTER_CONFIG_ENV = "PORACODE_MCP_FILTER_CONFIG";
// A different key makes older workers reject the new policy before connecting.
export const MCP_FILTER_CONFIG_V1_ENV = "PORACODE_MCP_FILTER_CONFIG_V1";
// Schema normalization requires a new worker. Older workers fail before connecting
// because no legacy configuration key is supplied; v0/v1 configurations stay valid.
export const MCP_FILTER_CONFIG_V2_ENV = "PORACODE_MCP_FILTER_CONFIG_V2";
export const MCP_STDIO_CONFIG_ENV = "PORACODE_MCP_STDIO_CONFIG";

export interface McpToolFilterConfig {
  server: McpServer;
  disabledTools: string[];
  isolateConnectionFailures?: boolean;
  omitInvalidSchemaPatterns?: boolean;
  schemaOnly?: boolean;
}

export function readMcpToolFilterConfig(env: NodeJS.ProcessEnv): McpToolFilterConfig {
  const v2 = env[MCP_FILTER_CONFIG_V2_ENV];
  const versioned = v2 ?? env[MCP_FILTER_CONFIG_V1_ENV];
  const encoded = versioned ?? env[MCP_FILTER_CONFIG_ENV];
  if (!encoded) throw new Error("Missing MCP filter configuration");
  const config = JSON.parse(
    Buffer.from(encoded, "base64url").toString("utf8"),
  ) as McpToolFilterConfig & {
    version?: number;
  };
  if (versioned !== undefined && config.version !== (v2 !== undefined ? 2 : 1)) {
    throw new Error("Unsupported MCP filter configuration version");
  }
  if (
    config.schemaOnly &&
    (v2 === undefined || config.disabledTools.length > 0 || config.isolateConnectionFailures)
  ) {
    throw new Error("Schema-only MCP configuration cannot filter tools or isolate failures");
  }
  // Unversioned workers predate failure isolation; their configurations stay valid.
  return config;
}

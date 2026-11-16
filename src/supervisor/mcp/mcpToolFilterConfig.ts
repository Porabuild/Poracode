import type { McpServer } from "@/shared/contracts";

export const MCP_FILTER_CONFIG_ENV = "PORACODE_MCP_FILTER_CONFIG";
// A different key makes older workers reject the new policy before connecting.
export const MCP_FILTER_CONFIG_V1_ENV = "PORACODE_MCP_FILTER_CONFIG_V1";
// Schema normalization requires a new worker. Older workers fail before connecting
// because no legacy configuration key is supplied; v0/v1 configurations stay valid.
export const MCP_FILTER_CONFIG_V2_ENV = "PORACODE_MCP_FILTER_CONFIG_V2";
// Depth-limited schemas need a worker that understands the new policy.
export const MCP_FILTER_CONFIG_V3_ENV = "PORACODE_MCP_FILTER_CONFIG_V3";
export const MCP_STDIO_CONFIG_ENV = "PORACODE_MCP_STDIO_CONFIG";
export const MCP_HTTP_RELAY_CONFIG_ENV = "PORACODE_MCP_HTTP_RELAY_CONFIG";
// v1 is the first relay envelope. A changed shape takes a new version, and the
// relay refuses any other version before connecting.
export const MCP_HTTP_RELAY_CONFIG_VERSION = 1;

/** Envelope keys of every Poracode MCP launch helper. */
export const MCP_HELPER_CONFIG_ENVS = [
  MCP_FILTER_CONFIG_ENV,
  MCP_FILTER_CONFIG_V1_ENV,
  MCP_FILTER_CONFIG_V2_ENV,
  MCP_FILTER_CONFIG_V3_ENV,
  MCP_STDIO_CONFIG_ENV,
  MCP_HTTP_RELAY_CONFIG_ENV,
] as const;

/** Stdio relay to a Poracode-served HTTP endpoint that applies its own tool policy. */
export interface McpHttpRelayConfig {
  version: typeof MCP_HTTP_RELAY_CONFIG_VERSION;
  url: string;
  headers: Record<string, string>;
  timeoutMs: number;
  /** Defense in depth; the endpoint already hides and rejects these tools. */
  disabledTools: string[];
}

export function encodeMcpHttpRelayConfig(config: Omit<McpHttpRelayConfig, "version">): string {
  return Buffer.from(
    JSON.stringify({ version: MCP_HTTP_RELAY_CONFIG_VERSION, ...config }),
    "utf8",
  ).toString("base64url");
}

export function readMcpHttpRelayConfig(env: NodeJS.ProcessEnv): McpHttpRelayConfig {
  const encoded = env[MCP_HTTP_RELAY_CONFIG_ENV];
  if (!encoded) throw new Error("Missing MCP relay configuration");
  const config = JSON.parse(
    Buffer.from(encoded, "base64url").toString("utf8"),
  ) as Partial<McpHttpRelayConfig> | null;
  if (
    config?.version !== MCP_HTTP_RELAY_CONFIG_VERSION ||
    typeof config.url !== "string" ||
    !/^https?:$/u.test(new URL(config.url).protocol) ||
    !config.headers ||
    typeof config.headers !== "object" ||
    Array.isArray(config.headers) ||
    !Object.values(config.headers).every((value) => typeof value === "string") ||
    !Number.isSafeInteger(config.timeoutMs) ||
    config.timeoutMs! <= 0 ||
    !Array.isArray(config.disabledTools)
  ) {
    throw new Error("Unsupported MCP relay configuration");
  }
  return config as McpHttpRelayConfig;
}

export interface McpToolFilterConfig {
  server: McpServer;
  disabledTools: string[];
  isolateConnectionFailures?: boolean;
  omitInvalidSchemaPatterns?: boolean;
  maxSchemaDepth?: number;
  schemaOnly?: boolean;
}

export function readMcpToolFilterConfig(env: NodeJS.ProcessEnv): McpToolFilterConfig {
  const v3 = env[MCP_FILTER_CONFIG_V3_ENV];
  const v2 = env[MCP_FILTER_CONFIG_V2_ENV];
  const versioned = v3 ?? v2 ?? env[MCP_FILTER_CONFIG_V1_ENV];
  const encoded = versioned ?? env[MCP_FILTER_CONFIG_ENV];
  if (!encoded) throw new Error("Missing MCP filter configuration");
  const config = JSON.parse(
    Buffer.from(encoded, "base64url").toString("utf8"),
  ) as McpToolFilterConfig & {
    version?: number;
  };
  if (
    versioned !== undefined &&
    config.version !== (v3 !== undefined ? 3 : v2 !== undefined ? 2 : 1)
  ) {
    throw new Error("Unsupported MCP filter configuration version");
  }
  if (
    config.maxSchemaDepth !== undefined &&
    (v3 === undefined || !Number.isSafeInteger(config.maxSchemaDepth) || config.maxSchemaDepth < 1)
  ) {
    throw new Error("Unsupported MCP schema depth limit");
  }
  if (
    config.schemaOnly &&
    ((v3 === undefined && v2 === undefined) ||
      config.disabledTools.length > 0 ||
      config.isolateConnectionFailures)
  ) {
    throw new Error("Schema-only MCP configuration cannot filter tools or isolate failures");
  }
  // Unversioned workers predate failure isolation; their configurations stay valid.
  return config;
}

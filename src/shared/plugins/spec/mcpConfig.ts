import { z } from "zod";
import { pluginDiagnostic, type PluginDiagnostic } from "./diagnostics";
import { AGENT_PLUGINS_SCHEMA_BASE, AGENT_PLUGINS_VERSION } from "./manifest";

/**
 * Agent Plugins Specification 1.0.0 — root `mcp.json` document.
 *
 * The document and each server entry are validated independently: a malformed
 * entry is skipped while its siblings still load.
 *
 * @see https://agent-plugins.org/client-implementers/mcp-runtime
 */

export const AGENT_PLUGINS_MCP_SCHEMA_URL = `${AGENT_PLUGINS_SCHEMA_BASE}/${AGENT_PLUGINS_VERSION}/mcp.schema.json`;

const SUPPORTED_MCP_SCHEMA_URLS = new Set([AGENT_PLUGINS_MCP_SCHEMA_URL]);

/** Transports declared by `type`. Selection is explicit — never negotiated. */
export const PLUGIN_MCP_TRANSPORT_TYPES = ["stdio", "streamable-http", "sse"] as const;
export type PluginMcpTransportType = (typeof PLUGIN_MCP_TRANSPORT_TYPES)[number];

/**
 * Remote servers must be absolute HTTPS. Plain HTTP is permitted only for
 * loopback, where there is no network to eavesdrop on.
 */
export function isPluginMcpUrlAllowed(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return false;
  }
  if (url.protocol === "https:") return true;
  if (url.protocol !== "http:") return false;
  const host = url.hostname.toLowerCase();
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "[::1]" ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/u.test(host)
  );
}

const pluginMcpUrlSchema = z.string().refine(isPluginMcpUrlAllowed, {
  message: "MCP server url must be an absolute https URL (http is allowed only for localhost)",
});

export const pluginMcpStdioEntrySchema = z
  .object({
    type: z.literal("stdio"),
    command: z.string().min(1),
    args: z.array(z.string()).default([]),
    env: z.record(z.string().min(1), z.string()).default({}),
    cwd: z.string().min(1).optional(),
  })
  .strict();
export type PluginMcpStdioEntry = z.infer<typeof pluginMcpStdioEntrySchema>;

export const pluginMcpStreamableHttpEntrySchema = z
  .object({
    type: z.literal("streamable-http"),
    url: pluginMcpUrlSchema,
    headers: z.record(z.string().min(1), z.string()).default({}),
  })
  .strict();
export type PluginMcpStreamableHttpEntry = z.infer<typeof pluginMcpStreamableHttpEntrySchema>;

/** Legacy HTTP+SSE. Optional per the spec; supported here for plugin compatibility. */
export const pluginMcpSseEntrySchema = z
  .object({
    type: z.literal("sse"),
    url: pluginMcpUrlSchema,
    headers: z.record(z.string().min(1), z.string()).default({}),
  })
  .strict();
export type PluginMcpSseEntry = z.infer<typeof pluginMcpSseEntrySchema>;

export const pluginMcpEntrySchema = z.discriminatedUnion("type", [
  pluginMcpStdioEntrySchema,
  pluginMcpStreamableHttpEntrySchema,
  pluginMcpSseEntrySchema,
]);
export type PluginMcpEntry = z.infer<typeof pluginMcpEntrySchema>;

export interface PluginMcpServerDeclaration {
  /** Key from `mcpServers`, as authored by the plugin. */
  name: string;
  entry: PluginMcpEntry;
}

export interface ParsedPluginMcpConfig {
  servers: PluginMcpServerDeclaration[];
  diagnostics: PluginDiagnostic[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validates an `mcp.json` document.
 *
 * @param manifestSchemaVersion Agent Plugins version declared by `plugin.json`.
 *   The conformance checklist requires the two documents to agree.
 */
export function parsePluginMcpConfig(
  value: unknown,
  manifestSchemaVersion: string,
): ParsedPluginMcpConfig {
  const diagnostics: PluginDiagnostic[] = [];

  if (!isPlainObject(value)) {
    diagnostics.push(
      pluginDiagnostic(
        "error",
        "component-type",
        "mcp-document-not-object",
        "mcp.json is not a JSON object",
      ),
    );
    return { servers: [], diagnostics };
  }

  const schemaUrl = typeof value.$schema === "string" ? value.$schema.trim() : "";
  if (!SUPPORTED_MCP_SCHEMA_URLS.has(schemaUrl)) {
    diagnostics.push(
      pluginDiagnostic(
        "error",
        "component-type",
        "mcp-schema-unsupported",
        `Unsupported mcp.json $schema '${schemaUrl}'; this build understands ${AGENT_PLUGINS_MCP_SCHEMA_URL}`,
        "$schema",
      ),
    );
    return { servers: [], diagnostics };
  }
  if (manifestSchemaVersion !== AGENT_PLUGINS_VERSION) {
    diagnostics.push(
      pluginDiagnostic(
        "error",
        "component-type",
        "mcp-schema-version-mismatch",
        `mcp.json declares Agent Plugins ${AGENT_PLUGINS_VERSION} but plugin.json declares ${manifestSchemaVersion}`,
        "$schema",
      ),
    );
    return { servers: [], diagnostics };
  }

  if (value.mcpServers === undefined) return { servers: [], diagnostics };
  if (!isPlainObject(value.mcpServers)) {
    diagnostics.push(
      pluginDiagnostic(
        "error",
        "component-type",
        "mcp-servers-not-object",
        "mcp.json 'mcpServers' is not a JSON object",
        "mcpServers",
      ),
    );
    return { servers: [], diagnostics };
  }

  const servers: PluginMcpServerDeclaration[] = [];
  for (const [name, rawEntry] of Object.entries(value.mcpServers)) {
    if (name.trim() === "") {
      diagnostics.push(
        pluginDiagnostic(
          "error",
          "mcp-server",
          "mcp-entry-invalid",
          "Server name must not be empty",
          name,
        ),
      );
      continue;
    }
    const parsed = pluginMcpEntrySchema.safeParse(rawEntry);
    if (!parsed.success) {
      const reason = parsed.error.issues[0]?.message ?? "invalid server entry";
      diagnostics.push(pluginDiagnostic("error", "mcp-server", "mcp-entry-invalid", reason, name));
      continue;
    }
    servers.push({ name, entry: parsed.data });
  }
  return { servers, diagnostics };
}

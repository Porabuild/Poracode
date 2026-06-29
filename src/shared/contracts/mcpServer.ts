import { z } from "zod";

/**
 * Canonical, provider-agnostic MCP server definition managed by Lightcode.
 *
 * This is the single source of truth the user edits in the MCP Manager UI
 * (global Settings + per-project Settings). At launch the supervisor projects
 * each enabled server into the native config format of whichever agent is
 * starting (Claude `mcpServers`, Codex `-c mcp_servers.*`, Gemini `mcpServers`,
 * ACP `mcpServers[]`, OpenCode `mcp`) — the same path the built-in browser MCP
 * already travels. See `src/supervisor/agents/userMcp/`.
 *
 * Detected, read-only servers found in other tools' config files (e.g.
 * `~/.claude.json`, `.cursor/mcp.json`, `~/.codex/config.toml`) are represented
 * by {@link DetectedMcpServer}; they can be imported into a {@link McpServer}.
 */

/** Stdio transport: Lightcode/the agent spawns a child process. */
export const mcpStdioTransportSchema = z.object({
  type: z.literal("stdio"),
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  /** Extra env passed to the spawned server. Plaintext — avoid long-lived secrets. */
  env: z.record(z.string(), z.string()).default({}),
  /** Working directory; defaults to the project/cwd when omitted. */
  cwd: z.string().optional(),
});
export type McpStdioTransport = z.infer<typeof mcpStdioTransportSchema>;

/** Streamable-HTTP transport: a remote MCP endpoint. */
export const mcpHttpTransportSchema = z.object({
  type: z.literal("http"),
  url: z.string().min(1),
  headers: z.record(z.string(), z.string()).default({}),
});
export type McpHttpTransport = z.infer<typeof mcpHttpTransportSchema>;

/** Legacy SSE transport: a remote MCP endpoint speaking server-sent events. */
export const mcpSseTransportSchema = z.object({
  type: z.literal("sse"),
  url: z.string().min(1),
  headers: z.record(z.string(), z.string()).default({}),
});
export type McpSseTransport = z.infer<typeof mcpSseTransportSchema>;

export const mcpTransportSchema = z.discriminatedUnion("type", [
  mcpStdioTransportSchema,
  mcpHttpTransportSchema,
  mcpSseTransportSchema,
]);
export type McpTransport = z.infer<typeof mcpTransportSchema>;
export type McpTransportKind = McpTransport["type"];

/** Server name characters that are safe to use as a config key across all agents. */
export const MCP_SERVER_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/u;

export function isValidMcpServerName(name: string): boolean {
  return MCP_SERVER_NAME_PATTERN.test(name);
}

export const mcpServerSchema = z.object({
  /** Stable Lightcode id (uuid). Never written into an agent config. */
  id: z.string().min(1),
  /** Server key used as the entry name in every agent's native config. */
  name: z.string().min(1).regex(MCP_SERVER_NAME_PATTERN),
  /** Human label; falls back to `name` in the UI when absent. */
  label: z.string().optional(),
  description: z.string().optional(),
  /** When false the server is kept in the list but never injected. */
  enabled: z.boolean().default(true),
  transport: mcpTransportSchema,
  /**
   * Agent kinds this server should be injected into. Empty/undefined means
   * "all agents". Lets a user scope, say, a Playwright server to Claude only.
   */
  agentKinds: z.array(z.string()).optional(),
  /** Marketplace catalog id this server was installed from, if any. */
  catalogId: z.string().optional(),
});
export type McpServer = z.infer<typeof mcpServerSchema>;

export const mcpServerListSchema = z.array(mcpServerSchema).default([]);

/**
 * Origin of a server discovered on disk. `*-project` variants live inside the
 * project tree; the rest are user/global level. `mcp-json` is the shared
 * `<project>/.mcp.json` understood by Claude Code and several other tools.
 */
export const mcpSourceSchema = z.enum([
  "lightcode-global",
  "lightcode-project",
  "claude-global",
  "claude-project",
  "mcp-json",
  "codex-global",
  "cursor-global",
  "cursor-project",
  "gemini-global",
  "gemini-project",
  "vscode-project",
  "opencode-global",
  "opencode-project",
]);
export type McpSource = z.infer<typeof mcpSourceSchema>;

export const MCP_SOURCE_META: Record<
  McpSource,
  { label: string; scope: "global" | "project"; shared: boolean; agentKind?: string }
> = {
  "lightcode-global": { label: "Lightcode · Global", scope: "global", shared: true },
  "lightcode-project": { label: "Lightcode · Project", scope: "project", shared: true },
  "claude-global": {
    label: "Claude Code · User",
    scope: "global",
    shared: false,
    agentKind: "claude",
  },
  "claude-project": {
    label: "Claude Code · Project",
    scope: "project",
    shared: false,
    agentKind: "claude",
  },
  "mcp-json": { label: ".mcp.json (shared)", scope: "project", shared: true },
  "codex-global": {
    label: "Codex · ~/.codex/config.toml",
    scope: "global",
    shared: false,
    agentKind: "codex",
  },
  "cursor-global": { label: "Cursor · User", scope: "global", shared: false, agentKind: "cursor" },
  "cursor-project": {
    label: "Cursor · .cursor/mcp.json",
    scope: "project",
    shared: false,
    agentKind: "cursor",
  },
  "gemini-global": {
    label: "Gemini · ~/.gemini/settings.json",
    scope: "global",
    shared: false,
    agentKind: "gemini",
  },
  "gemini-project": {
    label: "Gemini · .gemini/settings.json",
    scope: "project",
    shared: false,
    agentKind: "gemini",
  },
  "vscode-project": { label: "VS Code · .vscode/mcp.json", scope: "project", shared: false },
  "opencode-global": {
    label: "OpenCode · User",
    scope: "global",
    shared: false,
    agentKind: "opencode",
  },
  "opencode-project": {
    label: "OpenCode · opencode.json",
    scope: "project",
    shared: false,
    agentKind: "opencode",
  },
};

/** A server discovered in some other tool's config file. Read-only. */
export const detectedMcpServerSchema = z.object({
  name: z.string(),
  source: mcpSourceSchema,
  /** Absolute path of the config file the entry came from. */
  filePath: z.string(),
  /** Parsed transport, when Lightcode could map it; absent for unsupported shapes. */
  transport: mcpTransportSchema.optional(),
  /** Whether the source marks this entry as disabled. */
  disabled: z.boolean().optional(),
  /** Raw entry as read, for display/debugging when transport can't be mapped. */
  raw: z.unknown().optional(),
});
export type DetectedMcpServer = z.infer<typeof detectedMcpServerSchema>;

export const detectedMcpGroupSchema = z.object({
  source: mcpSourceSchema,
  label: z.string(),
  scope: z.enum(["global", "project"]),
  shared: z.boolean(),
  filePath: z.string(),
  servers: z.array(detectedMcpServerSchema),
});
export type DetectedMcpGroup = z.infer<typeof detectedMcpGroupSchema>;

export const detectMcpServersResultSchema = z.object({
  groups: z.array(detectedMcpGroupSchema),
});
export type DetectMcpServersResult = z.infer<typeof detectMcpServersResultSchema>;

/** True when the server is injected into the given agent kind. */
export function mcpServerAppliesToAgent(server: McpServer, agentKind: string): boolean {
  if (!server.agentKinds || server.agentKinds.length === 0) return true;
  return server.agentKinds.includes(agentKind);
}

/** Filter a list down to the enabled servers that apply to `agentKind`. */
export function resolveMcpServersForAgent(
  servers: readonly McpServer[],
  agentKind: string,
): McpServer[] {
  return servers.filter(
    (server) => server.enabled !== false && mcpServerAppliesToAgent(server, agentKind),
  );
}

/**
 * Merge global + project servers, project winning on duplicate `name` so a
 * project can override a global server. The result is deduped by `name`.
 */
export function mergeMcpServers(
  global: readonly McpServer[],
  project: readonly McpServer[],
): McpServer[] {
  const byName = new Map<string, McpServer>();
  for (const server of global) byName.set(server.name, server);
  for (const server of project) byName.set(server.name, server);
  return [...byName.values()];
}

/** Build a fresh managed server from a detected one (for the Import action). */
export function detectedToManagedServer(
  detected: DetectedMcpServer,
  id: string,
): McpServer | undefined {
  if (!detected.transport) return undefined;
  if (!isValidMcpServerName(detected.name)) return undefined;
  return {
    id,
    name: detected.name,
    enabled: !detected.disabled,
    transport: detected.transport,
  };
}

import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  isReservedMcpServerName,
  isValidMcpServerName,
  type McpServer,
  mcpServerSchema,
  mcpTransportSchema,
} from "@/shared/contracts";
import type { SharedSettings } from "@/shared/settings";
import { mergeManagedSharedSettings } from "../../../sharedSettingsFile";
import { redactMcpServer, restoreRedactedTransport } from "./settings";
import type { AppControlsToolContext, ToolDomain } from "./types";

const listArgsSchema = z.object({});
const probeArgsSchema = z.object({ config: z.record(z.string(), z.unknown()) });
const addArgsSchema = z.object({
  server: z.record(z.string(), z.unknown()),
  reloadCallingThread: z.boolean().optional(),
});
const updateArgsSchema = z.object({
  id: z.string().min(1),
  patch: z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    enabled: z.boolean().optional(),
    timeoutMs: z.number().optional(),
    transport: z.unknown().optional(),
  }),
  reloadCallingThread: z.boolean().optional(),
});
const removeArgsSchema = z.object({
  id: z.string().min(1),
  reloadCallingThread: z.boolean().optional(),
});

const NEXT_LAUNCH_NOTE =
  "Running threads keep their current MCP set and pick this change up on their next launch; " +
  "pass reloadCallingThread: true to hot-reload the calling thread's provider sessions now " +
  "(only providers that support live MCP reloads apply it immediately).";

export const mcpServerTools: ToolDomain = {
  specs: [
    {
      name: "list_mcp_servers",
      description:
        "List the user's configured MCP servers (id, name, description, enabled, transport type, and whether OAuth is authenticated). Secret transport header/env values are redacted — only their key names are shown. Read-only.",
      inputSchema: { type: "object", additionalProperties: false, properties: {} },
    },
    {
      name: "probe_mcp_server",
      description:
        "Validate a candidate MCP server config by connecting to it and reporting its reachability, latency, and advertised tools. Provide the full server config (id, name, transport). Read-only — the config is validated, not saved, and any secret header/env values are redacted from the echoed config.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["config"],
        properties: { config: { type: "object" } },
      },
    },
    {
      name: "add_mcp_server",
      description:
        "Add a new MCP server to the user's shared settings. CONSEQUENTIAL: a stdio server's command will run on the user's machine the next time a thread launches — explain what the server is and does, and confirm with the user before adding. Provide the full server config (name, transport, optional description/enabled/timeoutMs); an id is generated when omitted. Reserved built-in names and duplicate ids/names are rejected. Returns the redacted server summary.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["server"],
        properties: {
          server: { type: "object" },
          reloadCallingThread: { type: "boolean" },
        },
      },
    },
    {
      name: "update_mcp_server",
      description:
        "Update one configured MCP server by id, shallow-patching name/description/enabled/timeoutMs/transport. To toggle a server on or off, patch only `enabled`. When a transport value read from list_mcp_servers/get_settings is still redacted (the «redacted» marker), the existing stored secret is preserved instead of being overwritten, so you can safely echo back a redacted read. The merged result is validated before saving. Returns the redacted server summary.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["id", "patch"],
        properties: {
          id: { type: "string" },
          patch: { type: "object" },
          reloadCallingThread: { type: "boolean" },
        },
      },
    },
    {
      name: "remove_mcp_server",
      description:
        "Remove one configured MCP server by id. DESTRUCTIVE: the server's entire configuration — including its stored credentials — is deleted and cannot be recovered. Confirm with the user before removing. Errors when the id is unknown.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["id"],
        properties: {
          id: { type: "string" },
          reloadCallingThread: { type: "boolean" },
        },
      },
    },
  ],
  handlers: {
    list_mcp_servers: async (_args, ctx) => {
      listArgsSchema.parse(_args);
      const servers = ctx.settings.read().mcpServers;
      const { authenticatedUrls } = await ctx.supervisor.getMcpOauthStatus();
      const authenticated = new Set(authenticatedUrls);
      return {
        count: servers.length,
        servers: servers.map((server) => summarizeServer(server, authenticated)),
      };
    },
    probe_mcp_server: async (args, ctx) => {
      const { config } = probeArgsSchema.parse(args);
      const server = parseServer(config, "Invalid MCP server config");
      const result = await ctx.supervisor.probeMcpServer({ server });
      // Never echo the submitted secrets back — return only a redacted summary.
      return { server: summarizeServer(server), result };
    },
    add_mcp_server: async (args, ctx) => {
      const { server: raw, reloadCallingThread } = addArgsSchema.parse(args);
      const candidate: Record<string, unknown> = { ...raw };
      if (typeof candidate.id !== "string" || candidate.id.trim() === "") {
        candidate.id = randomUUID();
      }
      if (typeof candidate.name === "string" && !isValidMcpServerName(candidate.name)) {
        throw new Error(nameError(candidate.name));
      }
      const server = parseServer(candidate, "Invalid MCP server config");

      const settings = ctx.settings.read();
      const existing = settings.mcpServers;
      if (existing.some((entry) => entry.id === server.id)) {
        throw new Error(`An MCP server with id "${server.id}" already exists.`);
      }
      if (existing.some((entry) => sameName(entry.name, server.name))) {
        throw new Error(`An MCP server named "${server.name}" already exists.`);
      }

      writeMcpServers(ctx, settings, [...existing, server]);
      const reloadedCallingThread = await maybeReloadCallingThread(ctx, reloadCallingThread);
      return {
        added: true,
        server: summarizeServer(server),
        reloadedCallingThread,
        note: NEXT_LAUNCH_NOTE,
      };
    },
    update_mcp_server: async (args, ctx) => {
      const { id, patch, reloadCallingThread } = updateArgsSchema.parse(args);
      const settings = ctx.settings.read();
      const existing = settings.mcpServers.find((entry) => entry.id === id);
      if (!existing) {
        throw new Error(`Unknown MCP server id: ${id}. Call list_mcp_servers to see valid ids.`);
      }
      if (patch.name !== undefined && !isValidMcpServerName(patch.name)) {
        throw new Error(nameError(patch.name));
      }

      let transport = existing.transport;
      if (patch.transport !== undefined) {
        const parsedTransport = mcpTransportSchema.safeParse(patch.transport);
        if (!parsedTransport.success) {
          throw new Error(formatSchemaError("Invalid MCP transport", parsedTransport.error));
        }
        // Preserve any real stored secret the agent echoed back as «redacted».
        transport = restoreRedactedTransport(parsedTransport.data, existing.transport);
      }

      const merged: McpServer = {
        ...existing,
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(patch.timeoutMs !== undefined ? { timeoutMs: patch.timeoutMs } : {}),
        transport,
      };
      const server = parseServer(merged, "Invalid MCP server config");
      if (
        settings.mcpServers.some(
          (entry) => entry.id !== server.id && sameName(entry.name, server.name),
        )
      ) {
        throw new Error(`An MCP server named "${server.name}" already exists.`);
      }

      writeMcpServers(
        ctx,
        settings,
        settings.mcpServers.map((entry) => (entry.id === server.id ? server : entry)),
      );
      const reloadedCallingThread = await maybeReloadCallingThread(ctx, reloadCallingThread);
      return {
        updated: true,
        server: summarizeServer(server),
        reloadedCallingThread,
        note: NEXT_LAUNCH_NOTE,
      };
    },
    remove_mcp_server: async (args, ctx) => {
      const { id, reloadCallingThread } = removeArgsSchema.parse(args);
      const settings = ctx.settings.read();
      const next = settings.mcpServers.filter((entry) => entry.id !== id);
      if (next.length === settings.mcpServers.length) {
        throw new Error(`Unknown MCP server id: ${id}. Call list_mcp_servers to see valid ids.`);
      }
      writeMcpServers(ctx, settings, next);
      const reloadedCallingThread = await maybeReloadCallingThread(ctx, reloadCallingThread);
      return { removed: true, id, reloadedCallingThread, note: NEXT_LAUNCH_NOTE };
    },
  },
};

/** Validate an untrusted server config, throwing a readable aggregate error. */
function parseServer(value: unknown, prefix: string): McpServer {
  const parsed = mcpServerSchema.safeParse(value);
  if (!parsed.success) throw new Error(formatSchemaError(prefix, parsed.error));
  return parsed.data;
}

/** Flatten Zod issues into a single-line `path: message; …` string. */
function formatSchemaError(prefix: string, error: z.ZodError): string {
  return `${prefix}: ${error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ")}`;
}

/** Clear message for a name that fails the pattern or collides with a built-in. */
function nameError(name: string): string {
  return isReservedMcpServerName(name)
    ? `MCP server name "${name}" is reserved by a built-in server. Choose a different name.`
    : `Invalid MCP server name "${name}". Names must start with a letter or digit and contain only letters, digits, ".", "_", or "-".`;
}

/** Case-insensitive name comparison, matching launch-time server merge semantics. */
function sameName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Persist a new server list through the guarded settings write gateway. */
function writeMcpServers(
  ctx: AppControlsToolContext,
  onDisk: SharedSettings,
  mcpServers: McpServer[],
): void {
  // Defense in depth: re-pin supervisor-managed fields exactly like update_settings.
  const merged = mergeManagedSharedSettings(onDisk, { ...onDisk, mcpServers });
  ctx.settings.write(merged);
}

/**
 * Optionally hot-reload the calling thread's provider live sessions so the MCP
 * change applies without a relaunch. The supervisor RPC is agent-kind scoped
 * and a no-op for providers without live MCP reload, so failures are swallowed.
 * Returns whether the reload RPC was dispatched.
 */
async function maybeReloadCallingThread(
  ctx: AppControlsToolContext,
  reload: boolean | undefined,
): Promise<boolean> {
  if (reload !== true) return false;
  const threadId = ctx.identity.threadId;
  if (!threadId) return false;
  const thread = ctx.getThread(threadId);
  if (!thread) return false;
  await ctx.supervisor.reloadAgentMcpServers({ agentKind: thread.agentKind });
  return true;
}

/** A secret-free view of one MCP server (transport values masked, key names kept). */
function summarizeServer(server: McpServer, authenticated?: Set<string>): Record<string, unknown> {
  const redacted = redactMcpServer(server);
  // Match against the original URL: redaction may mask query-string values.
  const url = server.transport.type === "stdio" ? undefined : server.transport.url;
  return {
    id: redacted.id,
    name: redacted.name,
    description: redacted.description,
    enabled: redacted.enabled,
    transport: redacted.transport,
    ...(url !== undefined ? { authenticated: authenticated?.has(url) ?? false } : {}),
  };
}

import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  isReservedMcpServerName,
  isValidMcpServerName,
  type McpServer,
  mcpServerSchema,
  mcpTransportSchema,
} from "@/shared/contracts";
import { containsMcpRedaction, sameMcpServerName } from "@/host/mcpSettings";
import {
  authenticatedUrls,
  DEFAULT_WAIT_SECONDS,
  ensureFlowWait,
  MAX_WAIT_SECONDS,
  waitForFlow,
} from "./mcpServerOauth";
import {
  callingProjectScope,
  label,
  locateServer,
  readScope,
  requireProjectScope,
  resolveScope,
  sameScope,
  scopeLocation,
  scopeOwner,
  scopeView,
  writeScope,
  type McpScope,
} from "./mcpServerScopes";
import { redactMcpServer, restoreRedactedTransport } from "./settings";
import { projectIdProp, type AppControlsToolContext, type ToolDomain } from "./types";

const scopeArgs = {
  scope: z.enum(["global", "project"]).optional(),
  projectId: z.string().min(1).optional(),
};
const listArgsSchema = z.object({ projectId: z.string().min(1).optional() });
const probeArgsSchema = z
  .object({
    config: z.record(z.string(), z.unknown()).optional(),
    id: z.string().min(1).optional(),
    ...scopeArgs,
  })
  .refine((args) => (args.config === undefined) !== (args.id === undefined), {
    message: "Provide exactly one of `config` (a candidate) or `id` (a saved server).",
  });
const addArgsSchema = z.object({
  server: z.record(z.string(), z.unknown()),
  ...scopeArgs,
  reloadCallingThread: z.boolean().optional(),
});
const updateArgsSchema = z.object({
  id: z.string().min(1),
  ...scopeArgs,
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
  ...scopeArgs,
  reloadCallingThread: z.boolean().optional(),
});
const moveArgsSchema = z.object({
  id: z.string().min(1),
  scope: z.enum(["global", "project"]),
  projectId: z.string().min(1).optional(),
  fromScope: z.enum(["global", "project"]).optional(),
  fromProjectId: z.string().min(1).optional(),
  reloadCallingThread: z.boolean().optional(),
});
const authenticateArgsSchema = z.object({
  action: z.enum(["begin", "wait", "sign-out"]).default("begin"),
  id: z.string().min(1).optional(),
  ...scopeArgs,
  flowId: z.string().min(1).optional(),
  waitSeconds: z.number().int().min(1).max(MAX_WAIT_SECONDS).optional(),
});

const NEXT_LAUNCH_NOTE =
  "Running threads keep their current MCP set and pick this change up on their next launch; " +
  "pass reloadCallingThread: true to hot-reload the calling thread's provider sessions now " +
  "(only providers that support live MCP reloads apply it immediately).";

const SCOPE_JSON_PROPS = {
  scope: {
    type: "string",
    enum: ["global", "project"],
    description:
      "global = the user's shared settings (every project). project = one project's own servers, which override global servers with the same name there.",
  },
  projectId: {
    ...projectIdProp,
    description:
      "Project for scope=project (implies it when scope is omitted). Defaults to the calling thread's project. The Home project has no project servers.",
  },
};

export const mcpServerTools: ToolDomain = {
  specs: [
    {
      name: "list_mcp_servers",
      description:
        "List the user's configured MCP servers: the global ones plus the project's own servers (projectId, defaulting to the calling thread's project). Each entry has id, name, description, enabled, scope (global/project), transport, and whether OAuth is authenticated; a project entry that overrides a global entry with the same name is flagged. Secret transport header/env values are redacted — only their key names are shown. Read-only.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: { projectId: SCOPE_JSON_PROPS.projectId },
      },
    },
    {
      name: "probe_mcp_server",
      description:
        "Connect to an MCP server and report its reachability, latency, and advertised tools. Pass `config` (full candidate: id, name, transport) to validate before saving, or `id` to probe a saved server with its stored credentials. Project scope runs the probe in the project's runtime (for example inside its WSL distro). Read-only — nothing is saved, and secret values are redacted from the echoed config.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: { config: { type: "object" }, id: { type: "string" }, ...SCOPE_JSON_PROPS },
      },
    },
    {
      name: "add_mcp_server",
      description:
        "Add a new MCP server, globally (default) or to one project (scope=project). CONSEQUENTIAL: a stdio server's command will run on the user's machine the next time a thread launches — explain what the server is and does, and confirm with the user (including the scope) before adding. Provide the full server config (name, transport, optional description/enabled/timeoutMs); an id is generated when omitted. Reserved built-in names and duplicate ids/names within the scope are rejected; a project server may reuse a global name to override it in that project. Returns the redacted server summary.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["server"],
        properties: {
          server: { type: "object" },
          ...SCOPE_JSON_PROPS,
          reloadCallingThread: { type: "boolean" },
        },
      },
    },
    {
      name: "update_mcp_server",
      description:
        "Update one configured MCP server by id, shallow-patching name/description/enabled/timeoutMs/transport. The server is found in the given scope, or else in global settings and then the calling thread's project. To toggle a server on or off, patch only `enabled`. When a transport value read from list_mcp_servers/get_settings is still redacted (the «redacted» marker), the existing stored secret is preserved instead of being overwritten, so you can safely echo back a redacted read. The merged result is validated before saving. Returns the redacted server summary.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["id", "patch"],
        properties: {
          id: { type: "string" },
          ...SCOPE_JSON_PROPS,
          patch: { type: "object" },
          reloadCallingThread: { type: "boolean" },
        },
      },
    },
    {
      name: "remove_mcp_server",
      description:
        "Remove one configured MCP server by id (found in the given scope, or else globally and then in the calling thread's project). DESTRUCTIVE: the server's entire configuration — including its stored credentials — is deleted and cannot be recovered. Confirm with the user before removing. Errors when the id is unknown.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["id"],
        properties: {
          id: { type: "string" },
          ...SCOPE_JSON_PROPS,
          reloadCallingThread: { type: "boolean" },
        },
      },
    },
    {
      name: "move_mcp_server",
      description:
        "Move one configured MCP server between global settings and a project (or between projects), keeping its id and stored secrets. `scope`/`projectId` name the destination; the source is found by id (fromScope/fromProjectId narrow it). The destination is written before the source is removed, so an interruption can duplicate but never lose the server. Rejected when the destination already has a server with the same name. OAuth sign-ins are per runtime: moving between a Windows and a WSL scope needs a new sign-in. Confirm with the user before moving.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["id", "scope"],
        properties: {
          id: { type: "string" },
          ...SCOPE_JSON_PROPS,
          fromScope: { type: "string", enum: ["global", "project"] },
          fromProjectId: { type: "string" },
          reloadCallingThread: { type: "boolean" },
        },
      },
    },
    {
      name: "authenticate_mcp_server",
      description:
        "OAuth sign-in for a saved HTTP/SSE MCP server. action=begin (default) starts sign-in for `id` and returns either authorized or an authorizationUrl plus flowId: give the user that URL to open in their browser, then call again with action=wait and the flowId (waitSeconds, default 60, up to 280) until it reports authorized or an error; pending means keep waiting. action=sign-out forgets the stored OAuth credential for `id` (confirm with the user first). Project scope uses the project's runtime token store (for example its WSL distro). Tokens are never returned.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          action: { type: "string", enum: ["begin", "wait", "sign-out"] },
          id: { type: "string" },
          ...SCOPE_JSON_PROPS,
          flowId: { type: "string" },
          waitSeconds: { type: "integer", minimum: 1, maximum: MAX_WAIT_SECONDS },
        },
      },
    },
  ],
  handlers: {
    list_mcp_servers: async (args, ctx) => {
      const { projectId } = listArgsSchema.parse(args);
      const project = projectId
        ? requireProjectScope(ctx, projectId)
        : callingProjectScope(ctx, { required: false });
      const globalServers = ctx.settings.read().mcpServers;
      const projectServers = project ? readScope(ctx, project) : [];
      const [globalAuth, projectAuth] = await Promise.all([
        authenticatedUrls(ctx, { kind: "global" }),
        project ? authenticatedUrls(ctx, project) : Promise.resolve(new Set<string>()),
      ]);
      const overridden = (name: string) =>
        projectServers.some((server) => sameMcpServerName(server.name, name));
      const shadows = (name: string) =>
        globalServers.some((server) => sameMcpServerName(server.name, name));
      const servers = [
        ...globalServers.map((server) => ({
          ...summarizeServer(server, { kind: "global" }, globalAuth),
          ...(overridden(server.name) ? { overriddenByProject: true } : {}),
        })),
        ...(project
          ? projectServers.map((server) => ({
              ...summarizeServer(server, project, projectAuth),
              ...(shadows(server.name) ? { overridesGlobal: true } : {}),
            }))
          : []),
      ];
      return {
        count: servers.length,
        ...(project ? { project: { id: project.projectId, name: project.projectName } } : {}),
        servers,
      };
    },
    probe_mcp_server: async (args, ctx) => {
      const parsed = probeArgsSchema.parse(args);
      let server: McpServer;
      let scope: McpScope;
      if (parsed.id !== undefined) {
        ({ server, scope } = locateServer(ctx, parsed.id, parsed));
      } else {
        server = parseServer(parsed.config, "Invalid MCP server config");
        scope = resolveScope(ctx, parsed) ?? { kind: "global" };
      }
      const result = await ctx.supervisor.probeMcpServer({ server, ...scopeOwner(ctx, scope) });
      // Never echo the submitted secrets back — return only a redacted summary.
      return { server: summarizeServer(server, scope), result };
    },
    add_mcp_server: async (args, ctx) => {
      const { server: raw, reloadCallingThread, ...scopeInput } = addArgsSchema.parse(args);
      const scope = resolveScope(ctx, scopeInput) ?? { kind: "global" };
      const candidate: Record<string, unknown> = { ...raw };
      if (typeof candidate.id !== "string" || candidate.id.trim() === "") {
        candidate.id = randomUUID();
      }
      if (typeof candidate.name === "string" && !isValidMcpServerName(candidate.name)) {
        throw new Error(nameError(candidate.name));
      }
      const server = parseServer(candidate, "Invalid MCP server config");
      if (containsMcpRedaction(server.transport)) {
        throw new Error(
          "A new MCP server cannot contain «redacted» values; provide the real values.",
        );
      }

      const existing = readScope(ctx, scope);
      const idTaken =
        existing.some((entry) => entry.id === server.id) ||
        (scope.kind === "project" &&
          ctx.settings.read().mcpServers.some((entry) => entry.id === server.id));
      if (idTaken) throw new Error(`An MCP server with id "${server.id}" already exists.`);
      if (existing.some((entry) => sameMcpServerName(entry.name, server.name))) {
        throw new Error(`An MCP server named "${server.name}" already exists in ${label(scope)}.`);
      }

      writeScope(ctx, scope, [...existing, server]);
      const reloadedCallingThread = await maybeReloadCallingThread(ctx, reloadCallingThread);
      return {
        added: true,
        server: summarizeServer(server, scope),
        reloadedCallingThread,
        note: NEXT_LAUNCH_NOTE,
      };
    },
    update_mcp_server: async (args, ctx) => {
      const { id, patch, reloadCallingThread, ...scopeInput } = updateArgsSchema.parse(args);
      const { server: existing, scope } = locateServer(ctx, id, scopeInput);
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
      const servers = readScope(ctx, scope);
      if (
        servers.some(
          (entry) => entry.id !== server.id && sameMcpServerName(entry.name, server.name),
        )
      ) {
        throw new Error(`An MCP server named "${server.name}" already exists in ${label(scope)}.`);
      }

      writeScope(
        ctx,
        scope,
        servers.map((entry) => (entry.id === server.id ? server : entry)),
      );
      const reloadedCallingThread = await maybeReloadCallingThread(ctx, reloadCallingThread);
      return {
        updated: true,
        server: summarizeServer(server, scope),
        reloadedCallingThread,
        note: NEXT_LAUNCH_NOTE,
      };
    },
    remove_mcp_server: async (args, ctx) => {
      const { id, reloadCallingThread, ...scopeInput } = removeArgsSchema.parse(args);
      const { scope } = locateServer(ctx, id, scopeInput);
      writeScope(
        ctx,
        scope,
        readScope(ctx, scope).filter((entry) => entry.id !== id),
      );
      const reloadedCallingThread = await maybeReloadCallingThread(ctx, reloadCallingThread);
      return {
        removed: true,
        id,
        scope: scope.kind,
        ...(scope.kind === "project" ? { projectId: scope.projectId } : {}),
        reloadedCallingThread,
        note: NEXT_LAUNCH_NOTE,
      };
    },
    move_mcp_server: async (args, ctx) => {
      const parsed = moveArgsSchema.parse(args);
      const destination = resolveScope(ctx, parsed)!;
      const source = locateServer(ctx, parsed.id, {
        ...(parsed.fromScope !== undefined ? { scope: parsed.fromScope } : {}),
        ...(parsed.fromProjectId !== undefined ? { projectId: parsed.fromProjectId } : {}),
      });
      if (sameScope(source.scope, destination)) {
        throw new Error(`The MCP server is already in ${label(destination)}.`);
      }
      const destinationServers = readScope(ctx, destination);
      if (
        destinationServers.some(
          (entry) =>
            entry.id !== source.server.id && sameMcpServerName(entry.name, source.server.name),
        )
      ) {
        throw new Error(
          `${label(destination)} already has an MCP server named "${source.server.name}".`,
        );
      }
      // Destination first: an interrupted move can duplicate a server, but never
      // lose its credential-bearing configuration. A retry sees the matching id
      // and completes the source removal.
      const sameId = destinationServers.find((entry) => entry.id === source.server.id);
      if (sameId && JSON.stringify(sameId) !== JSON.stringify(source.server)) {
        throw new Error(
          `${label(destination)} already has a different MCP server with id "${source.server.id}"; nothing was moved.`,
        );
      }
      if (!sameId) writeScope(ctx, destination, [...destinationServers, source.server]);
      writeScope(
        ctx,
        source.scope,
        readScope(ctx, source.scope).filter((entry) => entry.id !== source.server.id),
      );
      const reloadedCallingThread = await maybeReloadCallingThread(ctx, parsed.reloadCallingThread);
      const runtimeChanged =
        scopeLocation(ctx, source.scope)?.kind === "wsl" ||
        scopeLocation(ctx, destination)?.kind === "wsl";
      return {
        moved: true,
        from: scopeView(source.scope),
        server: summarizeServer(source.server, destination),
        reloadedCallingThread,
        note:
          NEXT_LAUNCH_NOTE +
          (runtimeChanged && source.server.transport.type !== "stdio"
            ? " The source or destination is a WSL project, whose OAuth sign-ins are separate; re-authenticate if the server needs OAuth."
            : ""),
      };
    },
    authenticate_mcp_server: async (args, ctx) => {
      const parsed = authenticateArgsSchema.parse(args);
      if (parsed.action === "wait") {
        if (!parsed.flowId) throw new Error("action=wait requires the flowId returned by begin.");
        const scope = resolveScope(ctx, parsed);
        return waitForFlow(
          ctx,
          parsed.flowId,
          scope ? scopeOwner(ctx, scope) : {},
          parsed.waitSeconds ?? DEFAULT_WAIT_SECONDS,
        );
      }
      if (!parsed.id) throw new Error(`action=${parsed.action} requires the MCP server id.`);
      const { server, scope } = locateServer(ctx, parsed.id, parsed);
      if (server.transport.type === "stdio") {
        throw new Error(
          "OAuth sign-in applies only to HTTP/SSE MCP servers; stdio servers authenticate through their own env or args.",
        );
      }
      const owner = scopeOwner(ctx, scope);
      if (parsed.action === "sign-out") {
        await ctx.supervisor.clearMcpServerOauth({ url: server.transport.url, ...owner });
        return { signedOut: true, server: summarizeServer(server, scope) };
      }
      const result = await ctx.supervisor.beginMcpServerOauth({ server, ...owner });
      if (result.status !== "redirect")
        return { ...result, server: summarizeServer(server, scope) };
      // Start waiting immediately so the flow completes even if the agent's
      // next `wait` call arrives late; later waits share this result.
      ensureFlowWait(ctx, result.flowId, owner);
      return {
        status: "redirect",
        flowId: result.flowId,
        authorizationUrl: result.authorizationUrl,
        server: summarizeServer(server, scope),
        note: "Give the user the authorizationUrl to open in their browser, then call authenticate_mcp_server with action=wait and this flowId. The sign-in expires after 5 minutes.",
      };
    },
  },
};

/* --------------------------------------------------------------- helpers -- */

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
function summarizeServer(
  server: McpServer,
  scope: McpScope,
  authenticated?: Set<string>,
): Record<string, unknown> {
  const redacted = redactMcpServer(server);
  // Match against the original URL: redaction may mask query-string values.
  const url = server.transport.type === "stdio" ? undefined : server.transport.url;
  return {
    id: redacted.id,
    name: redacted.name,
    description: redacted.description,
    enabled: redacted.enabled,
    ...scopeView(scope),
    transport: redacted.transport,
    ...(url !== undefined && authenticated ? { authenticated: authenticated.has(url) } : {}),
  };
}

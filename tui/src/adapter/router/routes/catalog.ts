import { openCodeEvent } from "../../events";
import { threadId } from "../../ids";
import { json, record, supportsGui, supportsMode } from "../helpers";
import { isThreadTurnActive, type AgentStatus } from "@/shared/contracts";
import type {
  AgentInfo,
  AgentListOutput,
  IntegrationInfo,
  IntegrationListOutput,
  McpListOutput,
  ModelDefaultOutput,
  ModelInfo,
  ModelListOutput,
  ProjectListOutput,
  ProviderInfo,
  ProviderListOutput,
} from "@opencode/client";
import type { RouteArgs } from "../context";

/** Agent/provider/integration/model catalog routes plus MCP and skill. */
export async function handleCatalogRoutes({
  ctx,
  url,
  method,
  path,
}: RouteArgs): Promise<Response | undefined> {
  const {
    input,
    states,
    sessionMcpPending,
    remoteSettings,
    resolveDefaultModel,
    resolveProject,
    requestLocation,
    agentStatuses,
    hasGuiAuthentication,
    directoryOf,
    visibleThread,
  } = ctx;

  if (path === "/api/agent" && method === "GET") {
    await resolveProject();
    const guiStatuses = (await agentStatuses()).filter(supportsGui);
    const buildAgent: AgentInfo = {
      id: "build",
      name: "Build",
      request: { settings: {}, headers: {}, body: {} },
      mode: "primary",
      hidden: false,
      permissions: [],
    };
    const planAgent: AgentInfo = {
      id: "plan",
      name: "Plan",
      request: { settings: {}, headers: {}, body: {} },
      mode: "primary",
      hidden: false,
      permissions: [],
    };
    const data = [
      buildAgent,
      ...(guiStatuses.some((status) => supportsMode(status, "plan")) ? [planAgent] : []),
    ];
    const output: AgentListOutput = {
      location: requestLocation(url),
      data,
    };
    return json(output);
  }
  if (path === "/api/project" && method === "GET") {
    const current = await resolveProject();
    const time = Date.parse(current.createdAt);
    const output: ProjectListOutput = [
      {
        id: current.id,
        canonical: directoryOf(current.location),
        ...(current.name ? { name: current.name } : {}),
        time: { created: time, updated: time, active: time },
        sandboxes: [],
      },
    ];
    return json(output);
  }
  if (path === "/api/provider" && method === "GET") {
    const data: ProviderInfo[] = (await agentStatuses())
      .filter(supportsGui)
      .map((status: AgentStatus) => ({
        id: status.kind,
        ...(hasGuiAuthentication(status) ? { integrationID: status.kind } : {}),
        name: status.label,
        activation: hasGuiAuthentication(status) ? "enabled" : "disabled",
        package: "poracode",
      }));
    const output: ProviderListOutput = {
      location: requestLocation(url),
      data,
    };
    return json(output);
  }
  if (path === "/api/integration" && method === "GET") {
    const data: IntegrationInfo[] = (await agentStatuses())
      .filter(supportsGui)
      .filter(hasGuiAuthentication)
      .map((status) => ({
        id: status.kind,
        name: status.label,
        methods: [],
        connections: [{ type: "env", name: status.kind }],
      }));
    const output: IntegrationListOutput = {
      location: requestLocation(url),
      data,
    };
    return json(output);
  }
  if (path === "/api/model" && method === "GET") {
    const data: ModelInfo[] = (await agentStatuses()).filter(supportsGui).flatMap((status) => {
      const capabilities = status.capabilities.presentationCapabilities?.gui ?? status.capabilities;
      const models = capabilities.models ?? status.capabilities.models;
      return models.map((option) => {
        const model: ModelInfo = {
          id: option.id,
          modelID: option.id,
          providerID: status.kind,
          ...(capabilities.modelSubProvider?.[option.id]
            ? { canonical: capabilities.modelSubProvider[option.id] }
            : {}),
          name: option.label,
          capabilities: { tools: true, input: ["text"], output: ["text"] },
          variants: (
            capabilities.modelEfforts?.[option.id] ??
            status.capabilities.modelEfforts[option.id] ??
            capabilities.efforts ??
            status.capabilities.efforts
          ).map((id) => ({ id })),
          time: { released: 0 },
          cost: [],
          status: "active",
          enabled: true,
          limit: { context: 128_000, output: 8_192 },
        };
        return model;
      });
    });
    const output: ModelListOutput = {
      location: requestLocation(url),
      data,
    };
    return json(output);
  }
  if (path === "/api/model/default" && method === "GET") {
    // Provider discovery is asynchronous on a fresh profile — the vendored
    // client fetches this once at mount, so wait briefly for the first
    // GUI-capable provider to appear instead of locking in `data: null`.
    const deadline = Date.now() + 15_000;
    while (!ctx.defaultModel && Date.now() < deadline) {
      ctx.statuses = await input.client.agentStatuses({ omitSlashCommands: true });
      ctx.defaultModel = await resolveDefaultModel();
      if (!ctx.defaultModel) await new Promise((resolve) => setTimeout(resolve, 500));
    }
    const agents = (await agentStatuses()).filter(supportsGui);
    const defaultStatus = agents.find((status) => status.kind === ctx.defaultModel?.providerID);
    const defaultCapabilities =
      defaultStatus?.capabilities.presentationCapabilities?.gui ?? defaultStatus?.capabilities;
    const data: ModelInfo | null = ctx.defaultModel
      ? ({
          id: ctx.defaultModel.model,
          modelID: ctx.defaultModel.model,
          providerID: ctx.defaultModel.providerID,
          name: ctx.defaultModel.model,
          capabilities: { tools: true, input: ["text"], output: ["text"] },
          variants: (
            defaultCapabilities?.modelEfforts?.[ctx.defaultModel.model] ??
            defaultCapabilities?.efforts ??
            []
          ).map((id) => ({ id })),
          time: { released: 0 },
          cost: [],
          status: "active",
          enabled: true,
          limit: { context: 128_000, output: 8_192 },
        } satisfies ModelInfo)
      : null;
    const output: ModelDefaultOutput = {
      location: requestLocation(url),
      data,
    };
    return json(output);
  }
  if (path === "/api/mcp" && method === "GET") {
    const settings = await remoteSettings();
    const disabled = new Set(
      Array.isArray(settings.disabledBuiltInMcpServers)
        ? (settings.disabledBuiltInMcpServers as unknown[]).map(String)
        : [],
    );
    const builtIns = [
      ["crossagents", "crossagentMcp"],
      ["browser", "browserMcp"],
      ["chrome", "chromeMcp"],
    ] as const;
    const sessionID = ctx.currentSession ?? "";
    const pendingList = sessionMcpPending.get(sessionID) ?? sessionMcpPending.get("");
    const data: McpListOutput["data"] = [];
    for (const [id] of builtIns) {
      if (disabled.has(id)) continue;
      const enabled = pendingList?.get(id) ?? true;
      data.push({ name: id, status: { status: enabled ? "connected" : "disabled" } });
    }
    const output: McpListOutput = { location: requestLocation(url), data };
    return json(output);
  }
  const mcpToggleMatch = path.match(/^\/api\/experimental\/mcp\/([^/]+)\/(connect|disconnect)$/u);
  if (mcpToggleMatch && method === "POST") {
    const server = decodeURIComponent(mcpToggleMatch[1]!);
    const enabled = mcpToggleMatch[2] === "connect";
    // The vendored dialog sends no session — apply to the last-viewed
    // session; "" = location default for the next new thread.
    const sessionID = ctx.currentSession ?? "";
    let pendingToggle = sessionMcpPending.get(sessionID);
    if (!pendingToggle) {
      pendingToggle = new Map();
      sessionMcpPending.set(sessionID, pendingToggle);
    }
    pendingToggle.set(server, enabled);
    const remoteThread = sessionID ? await visibleThread(threadId(sessionID)) : undefined;
    const status = remoteThread ? (states.get(remoteThread.id) ?? remoteThread.status) : undefined;
    if (status !== undefined && isThreadTurnActive(status))
      input.events.emit(
        openCodeEvent(
          "tui.toast.show",
          { message: "Applies the next time this thread starts.", variant: "info" },
          { location: { directory: input.bootstrap.directory } },
        ),
      );
    return new Response(null, { status: 204 });
  }
  // Vendored skill palette — host-scanned skills for this project.
  if (path === "/api/skill" && method === "GET") {
    const skillProject = await resolveProject();
    const scanned = await input.client
      .callRemoteProcedure("scanSkills", { projectLocation: skillProject.location })
      .catch(() => null);
    const plugins = record(scanned).plugins;
    const data = (Array.isArray(plugins) ? plugins : []).map((value) => {
      const entry = record(value);
      const name = String(entry.name ?? "");
      const scope = String(entry.scope ?? "project");
      return {
        id: `${scope}:${name}`,
        name,
        description: String(entry.description ?? entry.name ?? ""),
        ...(typeof entry.path === "string" ? { path: entry.path } : {}),
        scope,
      };
    });
    return json({ location: requestLocation(url), data });
  }
  // `!command` — a one-off host dev shell, never a local spawn. PTY bytes
  // stream over the watched-terminal socket seam; the vendored UI reads
  // the rendered bash part, the next prompt carries the output as context.
  return undefined;
}

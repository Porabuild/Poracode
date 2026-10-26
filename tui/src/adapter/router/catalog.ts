import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  TUI_LAST_MODEL_FILE_NAME,
  TUI_LAST_MODEL_VERSION,
  tuiLastModelSchema,
} from "@/shared/tuiBootstrap";
import { agentStatusSchema, type AgentStatus } from "@/shared/contracts";
import { deriveLocationFromPath } from "@/shared/createProject";
import { projectIdentityKey } from "@/shared/projectIdentity";
import type { RemoteAgentStatuses } from "@/shared/remote";
import { openCodeEvent } from "../events";
import { logAdapterDebug } from "../diagnostics";
import { record, supportsGui, summarizeAgentStatus } from "./helpers";
import type { RouterContext } from "./context";

/**
 * Project resolution, the last-model preference file, agent status caching,
 * and the refresh events a status change publishes to the vendored TUI.
 */
export function createCatalog(ctx: RouterContext) {
  const LAST_MODEL_VERSION = TUI_LAST_MODEL_VERSION;
  // The vendored client picks the default on first prompt; resolve it lazily
  // here so a fresh profile's first send binds a provider without needing a
  // /api/model/default round-trip first.
  const resolveDefaultModel = async () => {
    if (ctx.defaultModel) return ctx.defaultModel;
    const settings = await ctx.input.client.settings();
    ctx.defaultModel = (await agentStatuses()).filter(supportsGui).flatMap((status) => {
      const capabilities = status.capabilities.presentationCapabilities?.gui ?? status.capabilities;
      const models = capabilities.models ?? status.capabilities.models;
      if (models.length === 0) return [];
      return [
        {
          providerID: status.kind,
          model: String(record(settings.agentSettings[status.kind]).model ?? "") || models[0]!.id,
        },
      ];
    })[0];
    return ctx.defaultModel;
  };

  const resolveProject = async () => {
    if (ctx.project) return ctx.project;
    const page = await ctx.input.client.boundedProjectListPage({
      mode: "inventory",
      projectLimit: 100,
    });
    const projects = page.projects;
    if (ctx.input.bootstrap.projectId)
      ctx.project = projects.find((value) => value.id === ctx.input.bootstrap.projectId);
    const location = deriveLocationFromPath(ctx.input.bootstrap.directory, process.platform);
    ctx.project ??= projects.find(
      (value) =>
        projectIdentityKey(value) ===
        projectIdentityKey({
          location: { ...location, remoteServerId: value.location.remoteServerId },
          remoteServerId: value.remoteServerId,
        }),
    );
    if (!ctx.project) {
      const added = await ctx.input.client.projectCommand({
        kind: "add-existing",
        path: ctx.input.bootstrap.directory,
      });
      ctx.project =
        added.project ??
        (await ctx.input.client.boundedProjectListPage({ mode: "inventory" })).projects.find(
          (value) => projectIdentityKey(value) === projectIdentityKey({ location }),
        );
    }
    if (!ctx.project) throw new Error("The current folder is not registered on the Poracode host");
    return ctx.project;
  };

  // The vendored data layer publishes every location-scoped catalog under
  // locationKey(response.location); echo the requested directory so a
  // worktree session finds lists answered for its own location.
  const requestLocation = (url: URL) => ({
    directory:
      url.searchParams.get("location[directory]") ??
      url.searchParams.get("location.directory") ??
      ctx.input.bootstrap.directory,
  });

  // last-model.json is a convenience preference, never a prompt blocker:
  // parse failures and write errors are logged, never thrown.
  const persistLastModel = async (patch: Record<string, unknown>) => {
    const home = process.env.PORACODE_TUI_HOME;
    if (!home) return;
    try {
      await mkdir(home, { recursive: true });
      const preferencePath = join(home, TUI_LAST_MODEL_FILE_NAME);
      const previous = record(
        await Bun.file(preferencePath)
          .json()
          .catch(() => undefined),
      );
      if (previous.version !== undefined && previous.version !== LAST_MODEL_VERSION) {
        if (ctx.debug)
          await logAdapterDebug(home, {
            source: "last-model.write-skipped",
            version: previous.version,
          });
        return;
      }
      const next = tuiLastModelSchema.parse({
        ...previous,
        version: LAST_MODEL_VERSION,
        ...patch,
        updatedAt: new Date().toISOString(),
      });
      const temporary = `${preferencePath}.tmp`;
      await writeFile(temporary, `${JSON.stringify(next)}\n`, "utf8");
      await rename(temporary, preferencePath);
    } catch (error) {
      if (ctx.debug)
        await logAdapterDebug(home, {
          source: "last-model.write-failed",
          error: error instanceof Error ? error.message : String(error),
        });
    }
  };

  const agentStatuses = async () => {
    if (!ctx.statuses) {
      const fetched = await ctx.input.client.agentStatuses({ omitSlashCommands: true });
      ctx.statuses ??= fetched;
      if (ctx.debug)
        await logAdapterDebug(ctx.input.bootstrap.home, {
          source: "agent-statuses-http",
          windows: fetched.windows.map(summarizeAgentStatus),
          wsl: fetched.wsl.map(summarizeAgentStatus),
        });
    }
    const current = ctx.statuses;
    return [...current.windows, ...(ctx.wslLocation ? current.wsl : [])].filter(
      (status) => status.installed,
    );
  };
  const hasGuiAuthentication = (status: AgentStatus) =>
    (status.presentationAuthStates?.gui ?? status.authState) === "authenticated";
  ctx.agentStatuses = agentStatuses;
  ctx.hasGuiAuthentication = hasGuiAuthentication;

  const emptyStatuses = (): RemoteAgentStatuses => ({
    windows: [],
    wsl: [],
    updatedAt: new Date().toISOString(),
  });

  // A ctx.statuses change can unlock Plan and new models — emit the vendored
  // list-refresh events, never resync() (that tears down the event stream
  // and the composer stops submitting).
  const emitProviderRefresh = () => {
    for (const type of [
      "integration.updated",
      "provider.updated",
      "model.updated",
      "agent.updated",
    ] as const)
      ctx.input.events.emit(
        openCodeEvent(type, {}, { location: { directory: ctx.input.bootstrap.directory } }),
      );
  };
  const statusSignature = (list: AgentStatus[]) => JSON.stringify(list);
  const handleAgentStatusEvent = (value: Record<string, unknown>) => {
    if (value.type === "windows-agent-statuses" || value.type === "wsl-agent-statuses") {
      if (value.type === "wsl-agent-statuses" && !ctx.wslLocation) return false;
      const parsed = z.array(agentStatusSchema).safeParse(value.statuses);
      if (!parsed.success) return false;
      const current = ctx.statuses ?? emptyStatuses();
      const before = statusSignature(
        value.type === "windows-agent-statuses" ? current.windows : current.wsl,
      );
      ctx.statuses =
        value.type === "windows-agent-statuses"
          ? { ...current, windows: parsed.data, updatedAt: new Date().toISOString() }
          : { ...current, wsl: parsed.data, updatedAt: new Date().toISOString() };
      if (ctx.debug)
        void logAdapterDebug(ctx.input.bootstrap.home, {
          source: value.type,
          statuses: parsed.data.map(summarizeAgentStatus),
        });
      if (statusSignature(parsed.data) !== before) emitProviderRefresh();
      return true;
    }
    if (value.type !== "agent-status-updated") return false;
    const parsed = agentStatusSchema.safeParse(value.status);
    if (!parsed.success) return false;
    const status = parsed.data;
    const isWsl = status.envKind === "wsl";
    if (isWsl && !ctx.wslLocation) return false;
    const current = ctx.statuses ?? emptyStatuses();
    const field = isWsl ? "wsl" : "windows";
    const previous = current[field];
    const index = previous.findIndex((entry) => entry.kind === status.kind);
    const updated =
      index < 0
        ? [...previous, status]
        : previous.map((entry, currentIndex) => (currentIndex === index ? status : entry));
    const previousSignature = statusSignature(previous);
    ctx.statuses = { ...current, [field]: updated, updatedAt: new Date().toISOString() };
    if (ctx.debug)
      void logAdapterDebug(ctx.input.bootstrap.home, {
        source: value.type,
        statuses: [summarizeAgentStatus(status)],
      });
    if (statusSignature(current[field]) !== previousSignature) emitProviderRefresh();
    return true;
  };
  return {
    resolveDefaultModel,
    resolveProject,
    requestLocation,
    persistLastModel,
    agentStatuses,
    hasGuiAuthentication,
    emptyStatuses,
    emitProviderRefresh,
    statusSignature,
    handleAgentStatusEvent,
  };
}

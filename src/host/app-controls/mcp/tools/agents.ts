import { z } from "zod";
import {
  agentCapabilitySchema,
  agentKindSchema,
  threadPresentationModeSchema,
} from "@/shared/contracts";
import type { AgentStatus } from "@/shared/contracts";
import {
  agentStatusForPresentation,
  resolveComposerPresentationMode,
  resolveModelSelection,
} from "@/shared/agentSelection";
import { getProjectAgentStatuses } from "@/shared/agentStatus";
import { appControlToolDomain, defineAppControlTool } from "../defineTools";
import { requireProject, type AppControlsToolContext } from "./types";

const composerOptionsSchema = agentCapabilitySchema.pick({
  models: true,
  modelFamilies: true,
  defaultHiddenModels: true,
  efforts: true,
  defaultEffort: true,
  modelEfforts: true,
  modelDefaultEfforts: true,
  contextSizes: true,
  modelContextSizes: true,
  defaultContextSize: true,
  fastModels: true,
  fastDisabledReason: true,
  thinkingModels: true,
  workflowModels: true,
  workflowLabel: true,
  modes: true,
  approvalPolicies: true,
  defaultApprovalPolicy: true,
  defaultApprovalsReviewer: true,
  sandboxModes: true,
  defaultSandboxMode: true,
  mcpScope: true,
  mcpConfigSource: true,
  supportsOneShot: true,
});

export const agentTools = appControlToolDomain(
  defineAppControlTool({
    name: "list_installed_agents",
    description:
      "List the host’s detected providers, installed versions, executable paths, and auth states. Set projectId to inspect only its execution environment, or agentKind to filter to one provider or profile. Use includeComposerOptions:true to include model IDs, effort and context options, supported modes and permission choices for the provider’s remembered presentation. Pass presentationMode to inspect a particular Chat or Terminal runtime. refresh:true forces a new detection sweep.",
    input: z.strictObject({
      refresh: z.boolean().optional(),
      projectId: z.string().min(1).optional(),
      agentKind: agentKindSchema.optional(),
      includeComposerOptions: z.boolean().optional(),
      presentationMode: threadPresentationModeSchema.optional(),
    }),
    run: async (
      { refresh, projectId, agentKind, includeComposerOptions, presentationMode },
      ctx,
    ) => {
      const project = projectId ? requireProject(ctx, projectId) : undefined;
      // Detection scans the native host plus WSL distros backing enabled projects,
      // exactly like the app's own callers (see buildAgentStatuses / MainView).
      const wslDistros = project
        ? project.location.kind === "wsl"
          ? [project.location.distro]
          : []
        : wslDistrosFromProjects(ctx);
      const payload = { wslDistros };
      const response = refresh
        ? await ctx.supervisor.refreshAgentStatuses(payload)
        : await ctx.supervisor.getAgentStatuses(payload);
      const includeOptions = includeComposerOptions === true || presentationMode !== undefined;
      const savedModes = includeOptions ? ctx.settings.read().lastPresentationModeByAgent : {};
      const view = (statuses: AgentStatus[]) =>
        statuses
          .filter((status) => agentKind === undefined || status.kind === agentKind)
          .flatMap((status) => {
            if (!includeOptions) return [agentView(status)];
            const modes = status.capabilities.presentationModes ?? [
              status.capabilities.presentationMode,
            ];
            if (presentationMode && !modes.includes(presentationMode)) return [];
            const mode = presentationMode ?? resolveComposerPresentationMode(status, savedModes);
            const projected = agentStatusForPresentation(status, mode);
            return [
              {
                ...agentView(projected),
                presentationMode: mode,
                presentationModes: modes,
                composerOptions: composerOptionsSchema.parse(projected.capabilities),
                defaultModel: resolveModelSelection(projected.capabilities),
              },
            ];
          });
      const scoped = project
        ? getProjectAgentStatuses(project.location, response.windows, response.wsl)
        : undefined;
      const native = view(project?.location.kind === "wsl" ? [] : (scoped ?? response.windows));
      const wsl = view(project && project.location.kind !== "wsl" ? [] : (scoped ?? response.wsl));
      return {
        ...(project ? { projectId: project.id } : {}),
        fromCache: response.fromCache,
        ...(native.length > 0 ? { native } : {}),
        ...(wsl.length > 0 ? { wsl } : {}),
      };
    },
  }),
);

/** Distinct WSL distros backing enabled projects (native env needs none). */
function wslDistrosFromProjects(ctx: AppControlsToolContext): string[] {
  return [
    ...new Set(
      ctx
        .getProjects()
        .flatMap((project) =>
          !project.disabled && project.location.kind === "wsl" ? [project.location.distro] : [],
        ),
    ),
  ];
}

/** Provider-agnostic projection of one detected agent (no secrets). */
function agentView(status: AgentStatus) {
  return {
    kind: status.kind,
    label: status.label,
    installed: status.installed,
    authState: status.authState,
    ...(status.version ? { version: status.version } : {}),
    ...(status.executablePath ? { path: status.executablePath } : {}),
    ...(status.envKind ? { env: status.envKind } : {}),
    ...(status.envDistro ? { distro: status.envDistro } : {}),
  };
}

import type { InstalledPlugins, LoadedPlugin } from "@/shared/contracts/plugin";
import {
  canDisablePlugin,
  isPluginSupportedForProject,
  resolveInstalledPluginState,
} from "@/shared/plugins/catalog";
import { isHomeProjectId } from "@/shared/homeScope";
import { settingsSubjectSchema } from "@/shared/settingsTransactions";
import { callerPluginOverrides } from "./pluginOverrides";
import { requireProject, type AppControlsToolContext } from "./types";

export function pluginProject(ctx: AppControlsToolContext, projectId?: string) {
  if (projectId !== undefined) {
    return isHomeProjectId(projectId) ? undefined : requireProject(ctx, projectId);
  }
  const caller = ctx.identity.threadId ? ctx.getThread(ctx.identity.threadId) : null;
  if (!caller || isHomeProjectId(caller.projectId)) return undefined;
  return ctx.getProject(caller.projectId) ?? undefined;
}

export function pluginContents(plugin: LoadedPlugin) {
  return {
    name: plugin.name,
    title: plugin.poracode.title ?? plugin.name,
    description: plugin.manifest.description ?? "",
    version: plugin.manifest.version ?? null,
    source: plugin.source,
    defaultEnabled: plugin.poracode.defaultEnabled,
    skills: plugin.skills.map((skill) => skill.folder),
    mcpServers: plugin.mcpServers.map(({ name, entry }) => ({
      name,
      transport: entry.type,
      ...(entry.type === "stdio"
        ? { environmentNames: Object.keys(entry.env) }
        : {
            headerNames: Object.keys(entry.headers),
            oauthAvailable: !Object.keys(entry.headers).some(
              (header) => header.toLowerCase() === "authorization",
            ),
          }),
    })),
    builtInMcpServers: plugin.poracode.builtInMcpServerIds,
    diagnostics: plugin.diagnostics.map(({ code, severity }) => ({ code, severity })),
  };
}

export async function pluginInventory(
  ctx: AppControlsToolContext,
  projectId?: string,
  globalOnly?: boolean,
) {
  const project = globalOnly ? undefined : pluginProject(ctx, projectId);
  const { plugins } = await ctx.supervisor.listPlugins(
    project ? { projectLocation: project.location } : {},
  );
  return { plugins, project };
}

export function pluginDescriptionForScope(
  ctx: AppControlsToolContext,
  project?: ReturnType<typeof pluginProject>,
) {
  const installed = ctx.settings.read().installedPlugins;
  const caller = ctx.identity.threadId ? ctx.getThread(ctx.identity.threadId) : null;
  const overrides =
    caller && (project ? caller.projectId === project.id : isHomeProjectId(caller.projectId))
      ? callerPluginOverrides(ctx, project?.id)
      : project?.pluginOverrides;
  return (plugin: LoadedPlugin) => {
    const supported = isPluginSupportedForProject(plugin, process.platform, project?.location);
    const state = resolveInstalledPluginState(plugin, installed);
    return {
      ...pluginContents(plugin),
      supported,
      installed: state !== undefined,
      enabled: state?.enabled ?? false,
      effectiveEnabled:
        supported && (resolveInstalledPluginState(plugin, installed, overrides)?.enabled ?? false),
      canDisable: canDisablePlugin(plugin),
      disabledSkills: state?.disabledSkillIds ?? [],
      disabledMcpServers: state?.disabledMcpServerNames ?? [],
    };
  };
}

export function validatePluginSettingsKey(key: string): void {
  settingsSubjectSchema.parse({ kind: "entry", field: "installedPlugins", key });
}

export async function editInstalledPlugins(
  ctx: AppControlsToolContext,
  compute: (current: InstalledPlugins) => InstalledPlugins,
): Promise<void> {
  const result = await ctx.settings.editField("installedPlugins", (current) =>
    compute(current.installedPlugins),
  );
  if (result.status !== "committed") {
    throw new Error(
      `Plugin settings were not saved (${result.status}). Check list_plugins before retrying.`,
    );
  }
}

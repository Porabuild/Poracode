import type { ProjectLocation } from "../contracts";
import type {
  InstalledPluginState,
  InstalledPlugins,
  LoadedPlugin,
  PluginSkillRef,
} from "../contracts/plugin";
import type { BuiltInMcpServerId } from "../contracts/mcpServer";

/**
 * Policy over loaded Agent Plugins packages.
 *
 * Packages are discovered on disk by the supervisor (`src/supervisor/plugins`);
 * this module holds the provider-agnostic rules both the supervisor and the
 * renderer apply to them — host/project support and contribution enablement.
 *
 * A package contributes the specification's skills and `mcp.json` servers.
 * Poracode's extension may bind those to an equivalent built-in MCP or a
 * provider-native package without changing the standard package contents.
 */

export function isPluginSupportedOnHost(
  plugin: LoadedPlugin,
  hostPlatform: NodeJS.Platform,
): boolean {
  const platforms = plugin.poracode.platforms;
  return !platforms || platforms.includes(hostPlatform as "win32" | "darwin" | "linux");
}

export function isPluginSupportedForProject(
  plugin: LoadedPlugin,
  hostPlatform: NodeJS.Platform,
  projectLocation: ProjectLocation | undefined,
): boolean {
  const projectKinds = plugin.poracode.projectKinds;
  return (
    isPluginSupportedOnHost(plugin, hostPlatform) &&
    (!projectLocation || !projectKinds || projectKinds.includes(projectLocation.kind))
  );
}

export function getPluginSkill(plugin: LoadedPlugin, folder: string): PluginSkillRef | undefined {
  return plugin.skills.find((skill) => skill.folder === folder);
}

/** Skill represented by an `@Plugin` composer mention. */
export function getPluginCoreSkill(plugin: LoadedPlugin): PluginSkillRef | undefined {
  const configured = plugin.poracode.coreSkill;
  if (configured) return getPluginSkill(plugin, configured);
  return (
    getPluginSkill(plugin, plugin.name) ??
    (plugin.skills.length === 1 ? plugin.skills[0] : undefined)
  );
}

export function pluginBuiltInMcpServerIds(plugin: LoadedPlugin): readonly BuiltInMcpServerId[] {
  return plugin.poracode.builtInMcpServerIds;
}

export function pluginNativeNames(plugin: LoadedPlugin): readonly string[] {
  return [plugin.name, ...plugin.poracode.nativePluginNames];
}

export function isPluginProvidedNatively(
  plugin: LoadedPlugin,
  nativePluginNames: ReadonlySet<string> | undefined,
): boolean {
  if (nativePluginNames === undefined) return false;
  if (nativePluginNames.has(plugin.name)) return true;
  const replacements = plugin.poracode.nativePluginNames;
  return replacements.length > 0 && replacements.every((name) => nativePluginNames.has(name));
}

export interface PluginSkillLaunchContext {
  hostPlatform: NodeJS.Platform;
  projectLocation?: ProjectLocation;
}

/** True when a plugin skill can be offered for a launch on this host and project. */
export function isPluginSkillSupportedForLaunch(
  plugin: LoadedPlugin,
  context: PluginSkillLaunchContext,
): boolean {
  return isPluginSupportedForProject(plugin, context.hostPlatform, context.projectLocation);
}

export function isPluginSkillEnabled(
  plugin: LoadedPlugin,
  state: InstalledPluginState,
  folder: string,
): boolean {
  return Boolean(
    state.enabled && getPluginSkill(plugin, folder) && !state.disabledSkillIds.includes(folder),
  );
}

/** Stable id so per-server settings survive a rescan. */
export function pluginMcpServerId(pluginName: string, serverName: string): string {
  return `plugin:${pluginName}:${serverName}`;
}

/** Provider-visible name, namespaced by plugin. */
export function pluginMcpServerName(pluginName: string, serverName: string): string {
  return `${pluginName}.${serverName}`;
}

export function isPluginMcpServerEnabled(
  plugin: LoadedPlugin,
  state: InstalledPluginState,
  serverName: string,
): boolean {
  const server = plugin.mcpServers.find((candidate) => candidate.name === serverName);
  return Boolean(state.enabled && server && !state.disabledMcpServerNames.includes(serverName));
}

export function installPlugin(
  installedPlugins: InstalledPlugins,
  plugin: LoadedPlugin,
): InstalledPlugins {
  if (installedPlugins[plugin.name]) return installedPlugins;
  return {
    ...installedPlugins,
    [plugin.name]: {
      version: plugin.manifest.version ?? "0.0.0",
      enabled: true,
      disabledSkillIds: [],
      disabledMcpServerNames: [],
    },
  };
}

export function uninstallPlugin(
  installedPlugins: InstalledPlugins,
  pluginName: string,
): InstalledPlugins {
  if (!installedPlugins[pluginName]) return installedPlugins;
  const next = { ...installedPlugins };
  delete next[pluginName];
  return next;
}

export function setInstalledPluginEnabled(
  installedPlugins: InstalledPlugins,
  pluginName: string,
  enabled: boolean,
): InstalledPlugins {
  const current = installedPlugins[pluginName];
  if (!current || current.enabled === enabled) return installedPlugins;
  return { ...installedPlugins, [pluginName]: { ...current, enabled } };
}

type ContributionField = "disabledSkillIds" | "disabledMcpServerNames";

function setContributionEnabled(
  installedPlugins: InstalledPlugins,
  pluginName: string,
  contributionId: string,
  enabled: boolean,
  field: ContributionField,
): InstalledPlugins {
  const current = installedPlugins[pluginName];
  if (!current) return installedPlugins;
  const wasDisabled = current[field].includes(contributionId);
  if (wasDisabled === !enabled) return installedPlugins;
  const disabled = new Set(current[field]);
  if (enabled) disabled.delete(contributionId);
  else disabled.add(contributionId);
  return { ...installedPlugins, [pluginName]: { ...current, [field]: [...disabled] } };
}

export function setPluginSkillEnabled(
  installedPlugins: InstalledPlugins,
  pluginName: string,
  folder: string,
  enabled: boolean,
): InstalledPlugins {
  return setContributionEnabled(installedPlugins, pluginName, folder, enabled, "disabledSkillIds");
}

export function setPluginMcpServerEnabled(
  installedPlugins: InstalledPlugins,
  pluginName: string,
  serverName: string,
  enabled: boolean,
): InstalledPlugins {
  return setContributionEnabled(
    installedPlugins,
    pluginName,
    serverName,
    enabled,
    "disabledMcpServerNames",
  );
}

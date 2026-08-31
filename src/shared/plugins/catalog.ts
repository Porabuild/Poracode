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

/**
 * A bundled package whose only servers are Poracode's own built-in MCPs
 * (Browser, Chrome, Crossagents, Computer Use). These ship inside the app, so
 * there is nothing to fetch or install: they count as installed from the first
 * run and are enabled unless the user turns them off. Packages that carry their
 * own `mcp.json` process stay opt-in — installing those starts something.
 */
export function isBuiltInToolPlugin(plugin: LoadedPlugin): boolean {
  return (
    plugin.source === "bundled" &&
    plugin.poracode.builtInMcpServerIds.length > 0 &&
    plugin.mcpServers.length === 0
  );
}

/** Install state a plugin has before the user changes anything. */
export function defaultInstalledPluginState(plugin: LoadedPlugin): InstalledPluginState {
  return {
    version: plugin.manifest.version ?? "0.0.0",
    enabled: plugin.poracode.defaultEnabled,
    disabledSkillIds: [],
    disabledMcpServerNames: [],
  };
}

/**
 * Install state every consumer must read through, so a built-in tool plugin
 * behaves as installed without writing a settings record for it. A stored
 * record always wins — that is how the user disables one.
 */
export function resolveInstalledPluginState(
  plugin: LoadedPlugin,
  installedPlugins: InstalledPlugins,
): InstalledPluginState | undefined {
  const stored = installedPlugins[plugin.name];
  if (isAlwaysEnabledPlugin(plugin)) {
    return { ...(stored ?? defaultInstalledPluginState(plugin)), enabled: true };
  }
  return stored ?? (isBuiltInToolPlugin(plugin) ? defaultInstalledPluginState(plugin) : undefined);
}

/** Bundled plugins the user cannot switch off. */
export function isAlwaysEnabledPlugin(plugin: LoadedPlugin): boolean {
  return plugin.source === "bundled" && plugin.poracode.alwaysEnabled;
}

/** Built-in tool plugins are part of the app; they can be disabled, not removed. */
export function canUninstallPlugin(plugin: LoadedPlugin): boolean {
  return !isBuiltInToolPlugin(plugin) && !isAlwaysEnabledPlugin(plugin);
}

/** Always-on bundled plugins have no enable switch. */
export function canDisablePlugin(plugin: LoadedPlugin): boolean {
  return !isAlwaysEnabledPlugin(plugin);
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
  return { ...installedPlugins, [plugin.name]: defaultInstalledPluginState(plugin) };
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
  plugin: LoadedPlugin,
  enabled: boolean,
): InstalledPlugins {
  if (isAlwaysEnabledPlugin(plugin)) return installedPlugins;
  // A built-in tool plugin has no stored record until the user changes
  // something, so materialize its default state before flipping the flag.
  const current = resolveInstalledPluginState(plugin, installedPlugins);
  if (!current || current.enabled === enabled) return installedPlugins;
  return { ...installedPlugins, [plugin.name]: { ...current, enabled } };
}

type ContributionField = "disabledSkillIds" | "disabledMcpServerNames";

function setContributionEnabled(
  installedPlugins: InstalledPlugins,
  plugin: LoadedPlugin,
  contributionId: string,
  enabled: boolean,
  field: ContributionField,
): InstalledPlugins {
  if (isAlwaysEnabledPlugin(plugin) && !enabled) return installedPlugins;
  const current = resolveInstalledPluginState(plugin, installedPlugins);
  if (!current) return installedPlugins;
  const wasDisabled = current[field].includes(contributionId);
  if (wasDisabled === !enabled) return installedPlugins;
  const disabled = new Set(current[field]);
  if (enabled) disabled.delete(contributionId);
  else disabled.add(contributionId);
  return { ...installedPlugins, [plugin.name]: { ...current, [field]: [...disabled] } };
}

export function setPluginSkillEnabled(
  installedPlugins: InstalledPlugins,
  plugin: LoadedPlugin,
  folder: string,
  enabled: boolean,
): InstalledPlugins {
  return setContributionEnabled(installedPlugins, plugin, folder, enabled, "disabledSkillIds");
}

export function setPluginMcpServerEnabled(
  installedPlugins: InstalledPlugins,
  plugin: LoadedPlugin,
  serverName: string,
  enabled: boolean,
): InstalledPlugins {
  return setContributionEnabled(
    installedPlugins,
    plugin,
    serverName,
    enabled,
    "disabledMcpServerNames",
  );
}

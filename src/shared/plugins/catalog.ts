import {
  resolveComposerMcpScope,
  type AgentCapability,
  type BuiltInMcpServerDisabled,
  type BuiltInMcpServerId,
  type ProjectLocation,
  type ThreadConfig,
  type ThreadPresentationMode,
} from "../contracts";
import type {
  InstalledPluginState,
  InstalledPlugins,
  LoadedPlugin,
  PluginSkillRef,
} from "../contracts/plugin";
import type { PluginSkillPolicyEntry } from "./spec";

/**
 * Policy over loaded Agent Plugins packages.
 *
 * Packages themselves are discovered on disk by the supervisor
 * (`src/supervisor/plugins`); this module holds the provider-agnostic rules that
 * both the supervisor and the renderer apply to them — host/project support,
 * contribution enablement, and how a plugin's runtime-owned apps map onto thread
 * launch config.
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

/** Poracode-specific policy for a skill, defaulted when the plugin declares none. */
export function getPluginSkillPolicy(plugin: LoadedPlugin, folder: string): PluginSkillPolicyEntry {
  return plugin.poracode.skills[folder] ?? { requiredAppIds: [] };
}

export interface PluginSkillLaunchContext {
  hostPlatform: NodeJS.Platform;
  projectLocation?: ProjectLocation;
  capabilities?: AgentCapability;
  presentationMode?: ThreadPresentationMode;
}

/**
 * True when a plugin skill can be offered for a launch: the plugin supports the
 * host and project, and every app the skill requires can actually run there.
 */
export function isPluginSkillSupportedForLaunch(
  plugin: LoadedPlugin,
  folder: string,
  context: PluginSkillLaunchContext,
): boolean {
  if (!isPluginSupportedForProject(plugin, context.hostPlatform, context.projectLocation)) {
    return false;
  }
  const requiredAppIds = getPluginSkillPolicy(plugin, folder).requiredAppIds;
  if (requiredAppIds.length === 0 || !context.capabilities || !context.projectLocation) {
    return true;
  }
  const capabilities = context.capabilities;
  const projectLocation = context.projectLocation;
  const modes = context.presentationMode
    ? [context.presentationMode]
    : (capabilities.presentationModes ?? [capabilities.presentationMode ?? "terminal"]);
  return requiredAppIds.every((appId) => {
    const app = plugin.poracode.apps.find((candidate) => candidate.id === appId);
    return Boolean(
      app &&
      modes.some((presentationMode) =>
        isBuiltInMcpServerSupportedForLaunch(app.builtInMcpServerId, {
          capabilities,
          presentationMode,
          projectLocation,
          hostPlatform: context.hostPlatform,
        }),
      ),
    );
  });
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

export function isPluginAppEnabled(
  plugin: LoadedPlugin,
  state: InstalledPluginState,
  appId: string,
): boolean {
  const app = plugin.poracode.apps.find((candidate) => candidate.id === appId);
  return Boolean(state.enabled && app && !state.disabledAppIds.includes(app.id));
}

export function isPluginMcpServerEnabled(
  plugin: LoadedPlugin,
  state: InstalledPluginState,
  serverName: string,
): boolean {
  const server = plugin.mcpServers.find((candidate) => candidate.name === serverName);
  return Boolean(state.enabled && server && !state.disabledMcpServerNames.includes(serverName));
}

/**
 * Maps a Poracode runtime-owned MCP server onto the thread config flag that
 * turns it on. These servers mint a URL and bearer token per thread, so plugins
 * reference them by stable id rather than declaring transport details.
 */
export const PLUGIN_MCP_CONFIG_ENTRIES = [
  ["browser", "browserMcp"],
  ["subagents", "subagentMcp"],
  ["chrome", "chromeMcp"],
  ["computer-use", "computerUse"],
] as const satisfies readonly (readonly [BuiltInMcpServerId, keyof ThreadConfig])[];

export type PluginMcpConfigKey = (typeof PLUGIN_MCP_CONFIG_ENTRIES)[number][1];

/** The installed plugin that owns a built-in server, if any plugin claims it. */
export function getInstalledPluginForMcpServer(
  plugins: readonly LoadedPlugin[],
  installedPlugins: InstalledPlugins,
  serverId: BuiltInMcpServerId,
): LoadedPlugin | undefined {
  return plugins.find(
    (plugin) =>
      installedPlugins[plugin.name] !== undefined &&
      plugin.poracode.apps.some((app) => app.builtInMcpServerId === serverId),
  );
}

export function isBuiltInMcpServerEnabledByPlugin(
  plugins: readonly LoadedPlugin[],
  installedPlugins: InstalledPlugins,
  serverId: BuiltInMcpServerId,
): boolean {
  return plugins.some((plugin) => {
    const state = installedPlugins[plugin.name];
    if (!state) return false;
    const app = plugin.poracode.apps.find((candidate) => candidate.builtInMcpServerId === serverId);
    return app ? isPluginAppEnabled(plugin, state, app.id) : false;
  });
}

/**
 * True when nothing blocks the server: either no installed plugin claims it, or
 * the plugin that does is enabled.
 */
export function isBuiltInMcpServerAvailableByPlugin(
  plugins: readonly LoadedPlugin[],
  installedPlugins: InstalledPlugins,
  serverId: BuiltInMcpServerId,
): boolean {
  const plugin = getInstalledPluginForMcpServer(plugins, installedPlugins, serverId);
  return !plugin || installedPlugins[plugin.name]?.enabled === true;
}

/** Config keys a disabled plugin hard-blocks, whatever provider settings say. */
export function getGloballyDisabledPluginConfigKeys(
  plugins: readonly LoadedPlugin[],
  installedPlugins: InstalledPlugins,
): PluginMcpConfigKey[] {
  return PLUGIN_MCP_CONFIG_ENTRIES.flatMap(([serverId, key]) =>
    isBuiltInMcpServerAvailableByPlugin(plugins, installedPlugins, serverId) ? [] : [key],
  );
}

export function isBrowserMcpEnabledByAgentSettings(
  agentSettings: Readonly<Record<string, boolean | string>> | undefined,
): boolean {
  return agentSettings?.browserMcp === true;
}

export function isBrowserMcpEnabledByConfigOrAgentSettings(
  config: Pick<ThreadConfig, "browserMcp">,
  agentSettings: Readonly<Record<string, boolean | string>> | undefined,
): boolean {
  return config.browserMcp === true || isBrowserMcpEnabledByAgentSettings(agentSettings);
}

export function arePluginSkillRequiredAppsEnabled(
  plugin: LoadedPlugin,
  folder: string,
  config: ThreadConfig,
): boolean {
  return getPluginSkillPolicy(plugin, folder).requiredAppIds.every((appId) => {
    const app = plugin.poracode.apps.find((candidate) => candidate.id === appId);
    const configEntry = app
      ? PLUGIN_MCP_CONFIG_ENTRIES.find(([serverId]) => serverId === app.builtInMcpServerId)
      : undefined;
    return configEntry ? config[configEntry[1]] === true : false;
  });
}

export interface PluginAppLaunchContext {
  capabilities: Pick<
    AgentCapability,
    "browserMcpScope" | "subagentMcpScope" | "computerUseMcpScope" | "chromeMcpScope"
  >;
  presentationMode: ThreadPresentationMode;
  projectLocation: ProjectLocation;
  hostPlatform: NodeJS.Platform;
}

export interface PluginLaunchPreviewContext extends PluginAppLaunchContext {
  disabledBuiltInMcpServers: BuiltInMcpServerDisabled;
  agentSettings: Readonly<Record<string, boolean | string>> | undefined;
}

export function isBuiltInMcpServerSupportedForLaunch(
  serverId: BuiltInMcpServerId,
  context: PluginAppLaunchContext,
): boolean {
  if (serverId === "chrome" && context.projectLocation.kind === "wsl") return false;
  if (
    serverId === "computer-use" &&
    ((context.hostPlatform !== "win32" && context.hostPlatform !== "darwin") ||
      context.projectLocation.kind === "wsl")
  ) {
    return false;
  }

  const scopes = {
    browser: context.capabilities.browserMcpScope,
    subagents: context.capabilities.subagentMcpScope,
    chrome: context.capabilities.chromeMcpScope,
    "computer-use": context.capabilities.computerUseMcpScope,
    "app-controls": undefined,
  } satisfies Record<BuiltInMcpServerId, AgentCapability["browserMcpScope"]>;
  return resolveComposerMcpScope(scopes[serverId], context.presentationMode) !== "none";
}

/** Add installed plugin apps to a new launch without serializing live MCP transport details. */
export function resolvePluginAppsForThreadConfig(
  config: ThreadConfig,
  plugins: readonly LoadedPlugin[],
  installedPlugins: InstalledPlugins,
  context: PluginAppLaunchContext,
): { config: ThreadConfig; disabledConfigKeys: PluginMcpConfigKey[] } {
  const disabledConfigKeys = getGloballyDisabledPluginConfigKeys(plugins, installedPlugins);
  let next = config;
  for (const key of disabledConfigKeys) {
    if (next[key] !== false) next = { ...next, [key]: false };
  }
  for (const [serverId, key] of PLUGIN_MCP_CONFIG_ENTRIES) {
    if (
      isBuiltInMcpServerEnabledByPlugin(plugins, installedPlugins, serverId) &&
      isBuiltInMcpServerSupportedForLaunch(serverId, context) &&
      next[key] !== true
    ) {
      next = { ...next, [key]: true };
    }
  }
  return { config: next, disabledConfigKeys };
}

export function resolvePluginLaunchPreview(
  config: ThreadConfig,
  plugins: readonly LoadedPlugin[],
  installedPlugins: InstalledPlugins,
  context: PluginLaunchPreviewContext,
): ThreadConfig {
  const { config: appliedConfig, disabledConfigKeys: pluginDisabledConfigKeys } =
    resolvePluginAppsForThreadConfig(config, plugins, installedPlugins, context);
  let next = appliedConfig;
  for (const [serverId, key] of PLUGIN_MCP_CONFIG_ENTRIES) {
    if (
      (context.disabledBuiltInMcpServers[serverId] === true ||
        !isBuiltInMcpServerSupportedForLaunch(serverId, context)) &&
      next[key] !== false
    ) {
      next = { ...next, [key]: false };
    }
  }
  if (
    context.disabledBuiltInMcpServers.browser !== true &&
    !pluginDisabledConfigKeys.includes("browserMcp") &&
    isBrowserMcpEnabledByAgentSettings(context.agentSettings) &&
    next.browserMcp !== true
  ) {
    next = { ...next, browserMcp: true };
  }
  return next;
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
      disabledAppIds: [],
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

type ContributionField = "disabledSkillIds" | "disabledAppIds" | "disabledMcpServerNames";

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

export function setPluginAppEnabled(
  installedPlugins: InstalledPlugins,
  pluginName: string,
  appId: string,
  enabled: boolean,
): InstalledPlugins {
  return setContributionEnabled(installedPlugins, pluginName, appId, enabled, "disabledAppIds");
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

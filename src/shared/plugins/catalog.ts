import {
  resolveComposerMcpScope,
  type AgentCapability,
  type BuiltInMcpServerDisabled,
  type BuiltInMcpServerId,
  type ProjectLocation,
  type ThreadConfig,
  type ThreadPresentationMode,
} from "../contracts";
import {
  pluginManifestSchema,
  type InstalledPluginState,
  type InstalledPlugins,
  type PluginManifest,
  type PluginSkillContribution,
} from "../contracts/plugin";

const manifests = [
  {
    manifestVersion: 1,
    id: "browser-tools",
    name: "Browser Tools",
    description: "Browse, inspect, and test websites in Poracode's isolated in-app browser.",
    version: "1.0.0",
    publisher: "Poracode",
    category: "developer-tools",
    featured: true,
    skills: [
      {
        id: "browser-control",
        name: "Browser Control",
        description: "Navigate, inspect, and test pages with the in-app Browser MCP.",
        folder: "browser-control",
        requiredAppIds: ["browser"],
        defaultEnabled: true,
      },
    ],
    apps: [
      {
        id: "browser",
        name: "Browser",
        description: "Control Poracode's isolated in-app browser.",
        builtInMcpServerId: "browser",
        defaultEnabled: true,
      },
    ],
  },
  {
    manifestVersion: 1,
    id: "chrome-tools",
    name: "Chrome Tools",
    description: "Work with the pages and signed-in sessions already open in Chrome.",
    version: "1.0.0",
    publisher: "Poracode",
    category: "automation",
    projectKinds: ["windows", "posix"],
    featured: true,
    skills: [
      {
        id: "chrome-control",
        name: "Chrome Control",
        description: "Use Chrome safely when a task needs an existing browser session.",
        folder: "chrome-control",
        requiredAppIds: ["chrome"],
        defaultEnabled: true,
      },
    ],
    apps: [
      {
        id: "chrome",
        name: "Chrome",
        description: "Control the user's Chrome browser through Poracode.",
        builtInMcpServerId: "chrome",
        defaultEnabled: true,
      },
    ],
  },
  {
    manifestVersion: 1,
    id: "computer-use",
    name: "Computer Use",
    description: "Control desktop apps and complete visual workflows.",
    version: "1.0.0",
    publisher: "Poracode",
    category: "automation",
    platforms: ["win32", "darwin"],
    projectKinds: ["windows", "posix"],
    featured: true,
    skills: [
      {
        id: "computer-use",
        name: "Computer Use",
        description: "Operate desktop apps through Poracode's desktop-control tools.",
        folder: "computer-use",
        requiredAppIds: ["computer-use"],
        defaultEnabled: true,
      },
    ],
    apps: [
      {
        id: "computer-use",
        name: "Computer Use",
        description: "Control supported desktop apps and windows.",
        builtInMcpServerId: "computer-use",
        defaultEnabled: true,
      },
    ],
  },
  {
    manifestVersion: 1,
    id: "subagent-delegation",
    name: "Subagent Delegation",
    description: "Delegate focused work to other installed agents and coordinate the results.",
    version: "1.0.0",
    publisher: "Poracode",
    category: "productivity",
    featured: true,
    skills: [
      {
        id: "subagent-delegation",
        name: "Subagent Delegation",
        description: "Choose, brief, and coordinate subagents for parallel work.",
        folder: "subagent-delegation",
        requiredAppIds: ["subagents"],
        defaultEnabled: true,
      },
    ],
    apps: [
      {
        id: "subagents",
        name: "Subagents",
        description: "Create and coordinate Poracode agent threads.",
        builtInMcpServerId: "subagents",
        defaultEnabled: true,
      },
    ],
  },
] satisfies PluginManifest[];

export const BUILT_IN_PLUGIN_MANIFESTS = manifests.map((manifest) =>
  pluginManifestSchema.parse(manifest),
);

const manifestsById = new Map(BUILT_IN_PLUGIN_MANIFESTS.map((manifest) => [manifest.id, manifest]));
const bundledSkillsByFolder = new Map(
  BUILT_IN_PLUGIN_MANIFESTS.flatMap((manifest) =>
    manifest.skills.map(
      (contribution) => [contribution.folder, { manifest, contribution }] as const,
    ),
  ),
);

export function getBuiltInPluginManifest(pluginId: string): PluginManifest | undefined {
  return manifestsById.get(pluginId);
}

export function getBundledPluginSkill(
  folder: string,
): { manifest: PluginManifest; contribution: PluginSkillContribution } | undefined {
  return bundledSkillsByFolder.get(folder);
}

export function isPluginSupportedOnHost(
  manifest: PluginManifest,
  hostPlatform: NodeJS.Platform,
): boolean {
  return (
    !manifest.platforms || manifest.platforms.includes(hostPlatform as "win32" | "darwin" | "linux")
  );
}

export function isPluginSupportedForProject(
  manifest: PluginManifest,
  hostPlatform: NodeJS.Platform,
  projectLocation: ProjectLocation | undefined,
): boolean {
  return (
    isPluginSupportedOnHost(manifest, hostPlatform) &&
    (!projectLocation ||
      !manifest.projectKinds ||
      manifest.projectKinds.includes(projectLocation.kind))
  );
}

export function isPluginSkillSupportedForLaunch(
  manifest: PluginManifest,
  skill: PluginSkillContribution,
  context: {
    hostPlatform: NodeJS.Platform;
    projectLocation?: ProjectLocation;
    capabilities?: AgentCapability;
    presentationMode?: ThreadPresentationMode;
  },
): boolean {
  if (!isPluginSupportedForProject(manifest, context.hostPlatform, context.projectLocation)) {
    return false;
  }
  if (skill.requiredAppIds.length === 0 || !context.capabilities || !context.projectLocation) {
    return true;
  }
  const capabilities = context.capabilities;
  const projectLocation = context.projectLocation;
  const modes = context.presentationMode
    ? [context.presentationMode]
    : (capabilities.presentationModes ?? [capabilities.presentationMode ?? "terminal"]);
  return skill.requiredAppIds.every((appId) => {
    const app = manifest.apps.find((candidate) => candidate.id === appId);
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

export function getInstalledPluginForMcpServer(
  installedPlugins: InstalledPlugins,
  serverId: BuiltInMcpServerId,
): PluginManifest | undefined {
  return BUILT_IN_PLUGIN_MANIFESTS.find(
    (manifest) =>
      installedPlugins[manifest.id] !== undefined &&
      manifest.apps.some((app) => app.builtInMcpServerId === serverId),
  );
}

export function isPluginSkillEnabled(
  manifest: PluginManifest,
  state: InstalledPluginState,
  skillId: string,
): boolean {
  const skill = manifest.skills.find((candidate) => candidate.id === skillId);
  return Boolean(state.enabled && skill && !state.disabledSkillIds.includes(skill.id));
}

export function isPluginAppEnabled(
  manifest: PluginManifest,
  state: InstalledPluginState,
  appId: string,
): boolean {
  const app = manifest.apps.find((candidate) => candidate.id === appId);
  return Boolean(state.enabled && app && !state.disabledAppIds.includes(app.id));
}

export function isBuiltInMcpServerEnabledByPlugin(
  installedPlugins: InstalledPlugins,
  serverId: BuiltInMcpServerId,
): boolean {
  return BUILT_IN_PLUGIN_MANIFESTS.some((manifest) => {
    const state = installedPlugins[manifest.id];
    if (!state) return false;
    const app = manifest.apps.find((candidate) => candidate.builtInMcpServerId === serverId);
    return app ? isPluginAppEnabled(manifest, state, app.id) : false;
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

export const PLUGIN_MCP_CONFIG_ENTRIES = [
  ["browser", "browserMcp"],
  ["subagents", "subagentMcp"],
  ["chrome", "chromeMcp"],
  ["computer-use", "computerUse"],
] as const satisfies readonly (readonly [BuiltInMcpServerId, keyof ThreadConfig])[];

export type PluginMcpConfigKey = (typeof PLUGIN_MCP_CONFIG_ENTRIES)[number][1];

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
  manifest: PluginManifest,
  skill: PluginSkillContribution,
  config: ThreadConfig,
): boolean {
  return skill.requiredAppIds.every((appId) => {
    const app = manifest.apps.find((candidate) => candidate.id === appId);
    const configEntry = app
      ? PLUGIN_MCP_CONFIG_ENTRIES.find(([serverId]) => serverId === app.builtInMcpServerId)
      : undefined;
    return configEntry ? config[configEntry[1]] === true : false;
  });
}

export function getGloballyDisabledPluginConfigKeys(
  installedPlugins: InstalledPlugins,
): PluginMcpConfigKey[] {
  return PLUGIN_MCP_CONFIG_ENTRIES.flatMap(([serverId, key]) =>
    isBuiltInMcpServerAvailableByPlugin(installedPlugins, serverId) ? [] : [key],
  );
}

export function isBuiltInMcpServerAvailableByPlugin(
  installedPlugins: InstalledPlugins,
  serverId: BuiltInMcpServerId,
): boolean {
  const manifest = getInstalledPluginForMcpServer(installedPlugins, serverId);
  return !manifest || installedPlugins[manifest.id]?.enabled === true;
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
  installedPlugins: InstalledPlugins,
  context: PluginAppLaunchContext,
): { config: ThreadConfig; disabledConfigKeys: PluginMcpConfigKey[] } {
  const disabledConfigKeys = getGloballyDisabledPluginConfigKeys(installedPlugins);
  let next = config;
  for (const key of disabledConfigKeys) {
    if (next[key] !== false) next = { ...next, [key]: false };
  }
  for (const [serverId, key] of PLUGIN_MCP_CONFIG_ENTRIES) {
    if (
      isBuiltInMcpServerEnabledByPlugin(installedPlugins, serverId) &&
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
  installedPlugins: InstalledPlugins,
  context: PluginLaunchPreviewContext,
): ThreadConfig {
  const { config: appliedConfig, disabledConfigKeys: pluginDisabledConfigKeys } =
    resolvePluginAppsForThreadConfig(config, installedPlugins, context);
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

export function installBuiltInPlugin(
  installedPlugins: InstalledPlugins,
  pluginId: string,
): InstalledPlugins {
  if (installedPlugins[pluginId]) return installedPlugins;
  const manifest = getBuiltInPluginManifest(pluginId);
  if (!manifest) return installedPlugins;
  return {
    ...installedPlugins,
    [pluginId]: {
      version: manifest.version,
      enabled: true,
      disabledSkillIds: [],
      disabledAppIds: [],
    },
  };
}

export function uninstallBuiltInPlugin(
  installedPlugins: InstalledPlugins,
  pluginId: string,
): InstalledPlugins {
  if (!installedPlugins[pluginId]) return installedPlugins;
  const next = { ...installedPlugins };
  delete next[pluginId];
  return next;
}

export function setInstalledPluginEnabled(
  installedPlugins: InstalledPlugins,
  pluginId: string,
  enabled: boolean,
): InstalledPlugins {
  const current = installedPlugins[pluginId];
  if (!current || current.enabled === enabled) return installedPlugins;
  return { ...installedPlugins, [pluginId]: { ...current, enabled } };
}

function setContributionEnabled(
  installedPlugins: InstalledPlugins,
  pluginId: string,
  contributionId: string,
  enabled: boolean,
  field: "disabledSkillIds" | "disabledAppIds",
): InstalledPlugins {
  const current = installedPlugins[pluginId];
  if (!current) return installedPlugins;
  const wasDisabled = current[field].includes(contributionId);
  if (wasDisabled === !enabled) return installedPlugins;
  const disabled = new Set(current[field]);
  if (enabled) disabled.delete(contributionId);
  else disabled.add(contributionId);
  return { ...installedPlugins, [pluginId]: { ...current, [field]: [...disabled] } };
}

export function setPluginSkillEnabled(
  installedPlugins: InstalledPlugins,
  pluginId: string,
  skillId: string,
  enabled: boolean,
): InstalledPlugins {
  return setContributionEnabled(installedPlugins, pluginId, skillId, enabled, "disabledSkillIds");
}

export function setPluginAppEnabled(
  installedPlugins: InstalledPlugins,
  pluginId: string,
  appId: string,
  enabled: boolean,
): InstalledPlugins {
  return setContributionEnabled(installedPlugins, pluginId, appId, enabled, "disabledAppIds");
}

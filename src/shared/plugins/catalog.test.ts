import { describe, expect, it } from "vitest";
import type { AgentCapability, LoadedPlugin, ThreadConfig } from "../contracts";
import { installedPluginsSchema } from "../contracts/plugin";
import {
  AGENT_PLUGINS_MANIFEST_SCHEMA_URL,
  type PluginAppContribution,
  type PluginSkillPolicyEntry,
} from "./spec";
import {
  arePluginSkillRequiredAppsEnabled,
  getGloballyDisabledPluginConfigKeys,
  getInstalledPluginForMcpServer,
  installPlugin,
  isBrowserMcpEnabledByAgentSettings,
  isBrowserMcpEnabledByConfigOrAgentSettings,
  isBuiltInMcpServerEnabledByPlugin,
  isPluginSkillSupportedForLaunch,
  isPluginSupportedForProject,
  type PluginAppLaunchContext,
  resolvePluginAppsForThreadConfig,
  resolvePluginLaunchPreview,
  setInstalledPluginEnabled,
  setPluginAppEnabled,
  setPluginSkillEnabled,
  uninstallPlugin,
} from "./catalog";

const SUPPORTED_TERMINAL_CONTEXT = {
  capabilities: {
    browserMcpScope: { terminal: "launch" },
    subagentMcpScope: { terminal: "launch" },
    chromeMcpScope: { terminal: "launch" },
    computerUseMcpScope: { terminal: "launch" },
  },
  presentationMode: "terminal",
  projectLocation: { kind: "windows", path: "C:\\repo" },
  hostPlatform: "win32",
} satisfies PluginAppLaunchContext;

function makePlugin(
  name: string,
  poracode: {
    apps?: PluginAppContribution[];
    skills?: Record<string, PluginSkillPolicyEntry>;
    platforms?: ("win32" | "darwin" | "linux")[];
    projectKinds?: ("windows" | "posix" | "wsl")[];
  } = {},
): LoadedPlugin {
  return {
    name,
    source: "bundled",
    root: `/plugins/${name}`,
    manifest: { $schema: AGENT_PLUGINS_MANIFEST_SCHEMA_URL, name, version: "1.0.0" },
    poracode: {
      category: "developer-tools",
      featured: false,
      communityMaintained: false,
      apps: poracode.apps ?? [],
      skills: poracode.skills ?? {},
      ...(poracode.platforms ? { platforms: poracode.platforms } : {}),
      ...(poracode.projectKinds ? { projectKinds: poracode.projectKinds } : {}),
    },
    skills: Object.keys(poracode.skills ?? {}).map((folder) => ({
      folder,
      path: `/plugins/${name}/skills/${folder}`,
    })),
    mcpServers: [],
    diagnostics: [],
  };
}

const app = (id: string, builtInMcpServerId: PluginAppContribution["builtInMcpServerId"]) => ({
  id,
  name: id,
  description: id,
  builtInMcpServerId,
});

const BROWSER_TOOLS = makePlugin("browser-tools", {
  apps: [app("browser", "browser")],
  skills: { "browser-control": { requiredAppIds: ["browser"] } },
});
const SUBAGENTS = makePlugin("subagent-delegation", { apps: [app("subagents", "subagents")] });
const CHROME_TOOLS = makePlugin("chrome-tools", {
  apps: [app("chrome", "chrome")],
  projectKinds: ["windows", "posix"],
});
const COMPUTER_USE = makePlugin("computer-use", {
  apps: [app("computer-use", "computer-use")],
  platforms: ["win32", "darwin"],
  projectKinds: ["windows", "posix"],
});
const ALL_PLUGINS = [BROWSER_TOOLS, SUBAGENTS, CHROME_TOOLS, COMPUTER_USE];

describe("plugin contracts", () => {
  it("defaults persisted plugin state fields", () => {
    expect(installedPluginsSchema.parse({ "test-tools": { version: "1.0.0" } })).toEqual({
      "test-tools": {
        version: "1.0.0",
        enabled: true,
        disabledSkillIds: [],
        disabledAppIds: [],
        disabledMcpServerNames: [],
      },
    });
  });

  it("defaults the version when a manifest omits it", () => {
    expect(installedPluginsSchema.parse({ "test-tools": {} })["test-tools"]?.version).toBe("0.0.0");
  });
});

describe("plugin catalog", () => {
  it("resolves Browser MCP from either thread config or provider settings", () => {
    expect(isBrowserMcpEnabledByAgentSettings({ browserMcp: true })).toBe(true);
    expect(isBrowserMcpEnabledByConfigOrAgentSettings({ browserMcp: true }, undefined)).toBe(true);
    expect(isBrowserMcpEnabledByConfigOrAgentSettings({}, { browserMcp: true })).toBe(true);
    expect(
      isBrowserMcpEnabledByConfigOrAgentSettings({ browserMcp: false }, { browserMcp: false }),
    ).toBe(false);
  });

  it("previews provider Browser settings while preserving hard disables", () => {
    const installed = setPluginAppEnabled(
      installPlugin({}, BROWSER_TOOLS),
      "browser-tools",
      "browser",
      false,
    );
    const context = {
      capabilities: { browserMcpScope: { terminal: "none" } },
      presentationMode: "terminal",
      projectLocation: { kind: "windows", path: "C:\\repo" },
      hostPlatform: "win32",
      disabledBuiltInMcpServers: {},
      agentSettings: { browserMcp: true },
    } satisfies Parameters<typeof resolvePluginLaunchPreview>[3];

    expect(
      resolvePluginLaunchPreview({ model: "test" }, ALL_PLUGINS, installed, context).browserMcp,
    ).toBe(true);
    expect(
      resolvePluginLaunchPreview({ model: "test" }, ALL_PLUGINS, installed, {
        ...context,
        disabledBuiltInMcpServers: { browser: true },
      }).browserMcp,
    ).toBe(false);
    expect(
      resolvePluginLaunchPreview(
        { model: "test" },
        ALL_PLUGINS,
        setInstalledPluginEnabled(installed, "browser-tools", false),
        context,
      ).browserMcp,
    ).toBe(false);
  });

  it("installs and uninstalls a plugin", () => {
    const installed = installPlugin({}, BROWSER_TOOLS);

    expect(installed).toEqual({
      "browser-tools": {
        version: "1.0.0",
        enabled: true,
        disabledSkillIds: [],
        disabledAppIds: [],
        disabledMcpServerNames: [],
      },
    });
    expect(getInstalledPluginForMcpServer(ALL_PLUGINS, installed, "browser")?.name).toBe(
      "browser-tools",
    );
    expect(installPlugin(installed, BROWSER_TOOLS)).toBe(installed);
    expect(uninstallPlugin(installed, "browser-tools")).toEqual({});
  });

  it("toggles the plugin and its skill and app contributions independently", () => {
    const installed = installPlugin({}, BROWSER_TOOLS);
    const disabledSkill = setPluginSkillEnabled(
      installed,
      "browser-tools",
      "browser-control",
      false,
    );
    const disabledApp = setPluginAppEnabled(disabledSkill, "browser-tools", "browser", false);
    const disabledPlugin = setInstalledPluginEnabled(disabledApp, "browser-tools", false);

    expect(disabledPlugin["browser-tools"]).toEqual({
      version: "1.0.0",
      enabled: false,
      disabledSkillIds: ["browser-control"],
      disabledAppIds: ["browser"],
      disabledMcpServerNames: [],
    });
    expect(
      setPluginAppEnabled(
        setPluginSkillEnabled(disabledPlugin, "browser-tools", "browser-control", true),
        "browser-tools",
        "browser",
        true,
      )["browser-tools"],
    ).toMatchObject({ disabledSkillIds: [], disabledAppIds: [] });
  });

  it("requires a skill's companion apps to be launch-compatible", () => {
    expect(
      isPluginSkillSupportedForLaunch(BROWSER_TOOLS, "browser-control", {
        hostPlatform: "win32",
        projectLocation: SUPPORTED_TERMINAL_CONTEXT.projectLocation,
        capabilities: {
          ...SUPPORTED_TERMINAL_CONTEXT.capabilities,
          presentationMode: "terminal",
        } as AgentCapability,
        presentationMode: "terminal",
      }),
    ).toBe(true);
    expect(
      isPluginSkillSupportedForLaunch(BROWSER_TOOLS, "browser-control", {
        hostPlatform: "win32",
        projectLocation: SUPPORTED_TERMINAL_CONTEXT.projectLocation,
        capabilities: { presentationMode: "terminal" } as AgentCapability,
        presentationMode: "terminal",
      }),
    ).toBe(false);
  });

  it("requires a skill's companion Apps in the effective launch config", () => {
    expect(
      arePluginSkillRequiredAppsEnabled(BROWSER_TOOLS, "browser-control", {
        model: "test-model",
        browserMcp: true,
      }),
    ).toBe(true);
    expect(
      arePluginSkillRequiredAppsEnabled(BROWSER_TOOLS, "browser-control", {
        model: "test-model",
        browserMcp: false,
      }),
    ).toBe(false);
  });

  it("applies enabled app contributions to thread config", () => {
    const config: ThreadConfig = { model: "test-model" };
    const installed = ALL_PLUGINS.reduce(installPlugin, {});

    expect(
      resolvePluginAppsForThreadConfig(config, ALL_PLUGINS, installed, SUPPORTED_TERMINAL_CONTEXT)
        .config,
    ).toEqual({
      model: "test-model",
      browserMcp: true,
      subagentMcp: true,
      chromeMcp: true,
      computerUse: true,
    });
    expect(isBuiltInMcpServerEnabledByPlugin(ALL_PLUGINS, installed, "browser")).toBe(true);

    const disabled = setPluginAppEnabled(installed, "browser-tools", "browser", false);
    expect(
      resolvePluginAppsForThreadConfig(config, ALL_PLUGINS, disabled, SUPPORTED_TERMINAL_CONTEXT)
        .config,
    ).toEqual({
      model: "test-model",
      subagentMcp: true,
      chromeMcp: true,
      computerUse: true,
    });
    expect(isBuiltInMcpServerEnabledByPlugin(ALL_PLUGINS, disabled, "browser")).toBe(false);
    expect(
      resolvePluginAppsForThreadConfig(config, ALL_PLUGINS, {}, SUPPORTED_TERMINAL_CONTEXT).config,
    ).toBe(config);

    const disabledPlugin = setInstalledPluginEnabled(installed, "browser-tools", false);
    expect(getGloballyDisabledPluginConfigKeys(ALL_PLUGINS, disabledPlugin)).toEqual([
      "browserMcp",
    ]);
    expect(
      resolvePluginAppsForThreadConfig(
        config,
        ALL_PLUGINS,
        disabledPlugin,
        SUPPORTED_TERMINAL_CONTEXT,
      ),
    ).toMatchObject({ disabledConfigKeys: ["browserMcp"] });
    expect(
      resolvePluginAppsForThreadConfig(
        config,
        ALL_PLUGINS,
        disabledPlugin,
        SUPPORTED_TERMINAL_CONTEXT,
      ).config,
    ).toEqual({
      model: "test-model",
      browserMcp: false,
      subagentMcp: true,
      chromeMcp: true,
      computerUse: true,
    });
    expect(
      resolvePluginAppsForThreadConfig(
        { ...config, browserMcp: true },
        ALL_PLUGINS,
        disabledPlugin,
        SUPPORTED_TERMINAL_CONTEXT,
      ).config,
    ).toEqual({
      model: "test-model",
      browserMcp: false,
      subagentMcp: true,
      chromeMcp: true,
      computerUse: true,
    });
  });

  it("does not apply plugin apps outside the provider or host launch scope", () => {
    const config: ThreadConfig = { model: "test-model" };
    const installed = ALL_PLUGINS.reduce(installPlugin, {});

    expect(
      resolvePluginAppsForThreadConfig(config, ALL_PLUGINS, installed, {
        ...SUPPORTED_TERMINAL_CONTEXT,
        capabilities: {},
      }).config,
    ).toBe(config);
    expect(
      resolvePluginAppsForThreadConfig(config, ALL_PLUGINS, installed, {
        ...SUPPORTED_TERMINAL_CONTEXT,
        projectLocation: {
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/repo",
          uncPath: "\\\\wsl.localhost\\Ubuntu\\repo",
        },
      }).config,
    ).toEqual({ model: "test-model", browserMcp: true, subagentMcp: true });

    const wslProject = {
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath: "/repo",
      uncPath: "\\\\wsl.localhost\\Ubuntu\\repo",
    } as const;
    expect(isPluginSupportedForProject(CHROME_TOOLS, "win32", wslProject)).toBe(false);
    expect(isPluginSupportedForProject(BROWSER_TOOLS, "win32", wslProject)).toBe(true);
  });
});

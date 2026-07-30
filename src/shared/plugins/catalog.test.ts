import { describe, expect, it } from "vitest";
import type { AgentCapability, ThreadConfig } from "../contracts";
import { installedPluginsSchema, pluginManifestSchema } from "../contracts/plugin";
import {
  arePluginSkillRequiredAppsEnabled,
  getBuiltInPluginManifest,
  getGloballyDisabledPluginConfigKeys,
  getInstalledPluginForMcpServer,
  installBuiltInPlugin,
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
  uninstallBuiltInPlugin,
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

describe("plugin contracts", () => {
  it("parses provider-neutral manifests and defaults contribution enablement", () => {
    const manifest = pluginManifestSchema.parse({
      manifestVersion: 1,
      id: "test-tools",
      name: "Test Tools",
      description: "Tools used by tests.",
      version: "1.0.0",
      publisher: "Poracode",
      category: "developer-tools",
      skills: [
        {
          id: "test-skill",
          name: "Test Skill",
          description: "Run a test workflow.",
          folder: "test-skill",
        },
      ],
      apps: [
        {
          id: "browser",
          name: "Browser",
          description: "Control the browser.",
          builtInMcpServerId: "browser",
        },
      ],
    });

    expect(manifest).toMatchObject({
      featured: false,
      skills: [{ requiredAppIds: [], defaultEnabled: true }],
      apps: [{ defaultEnabled: true }],
    });
    expect(() =>
      pluginManifestSchema.parse({
        ...manifest,
        skills: [{ ...manifest.skills[0], defaultEnabled: false }],
      }),
    ).toThrow(/expected true/u);
  });

  it("defaults persisted plugin state fields", () => {
    expect(installedPluginsSchema.parse({ "test-tools": { version: "1.0.0" } })).toEqual({
      "test-tools": {
        version: "1.0.0",
        enabled: true,
        disabledSkillIds: [],
        disabledAppIds: [],
      },
    });
  });
});

describe("built-in plugin catalog", () => {
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
      installBuiltInPlugin({}, "browser-tools"),
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
    } satisfies Parameters<typeof resolvePluginLaunchPreview>[2];

    expect(resolvePluginLaunchPreview({ model: "test" }, installed, context).browserMcp).toBe(true);
    expect(
      resolvePluginLaunchPreview({ model: "test" }, installed, {
        ...context,
        disabledBuiltInMcpServers: { browser: true },
      }).browserMcp,
    ).toBe(false);
    expect(
      resolvePluginLaunchPreview(
        { model: "test" },
        setInstalledPluginEnabled(installed, "browser-tools", false),
        context,
      ).browserMcp,
    ).toBe(false);
  });

  it("installs and uninstalls a catalog plugin", () => {
    const installed = installBuiltInPlugin({}, "browser-tools");

    expect(installed).toEqual({
      "browser-tools": {
        version: "1.0.0",
        enabled: true,
        disabledSkillIds: [],
        disabledAppIds: [],
      },
    });
    expect(getInstalledPluginForMcpServer(installed, "browser")?.id).toBe("browser-tools");
    expect(installBuiltInPlugin(installed, "browser-tools")).toBe(installed);
    expect(uninstallBuiltInPlugin(installed, "browser-tools")).toEqual({});
  });

  it("toggles the plugin and its skill and app contributions independently", () => {
    const installed = installBuiltInPlugin({}, "browser-tools");
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
    const manifest = getBuiltInPluginManifest("browser-tools")!;
    const skill = manifest.skills[0]!;
    expect(
      isPluginSkillSupportedForLaunch(manifest, skill, {
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
      isPluginSkillSupportedForLaunch(manifest, skill, {
        hostPlatform: "win32",
        projectLocation: SUPPORTED_TERMINAL_CONTEXT.projectLocation,
        capabilities: { presentationMode: "terminal" } as AgentCapability,
        presentationMode: "terminal",
      }),
    ).toBe(false);
  });

  it("requires a skill's companion Apps in the effective launch config", () => {
    const manifest = getBuiltInPluginManifest("browser-tools")!;
    const skill = manifest.skills[0]!;

    expect(
      arePluginSkillRequiredAppsEnabled(manifest, skill, {
        model: "test-model",
        browserMcp: true,
      }),
    ).toBe(true);
    expect(
      arePluginSkillRequiredAppsEnabled(manifest, skill, {
        model: "test-model",
        browserMcp: false,
      }),
    ).toBe(false);
  });

  it("applies enabled app contributions to thread config", () => {
    const config: ThreadConfig = { model: "test-model" };
    const installed = [
      "browser-tools",
      "subagent-delegation",
      "chrome-tools",
      "computer-use",
    ].reduce(installBuiltInPlugin, {});

    expect(
      resolvePluginAppsForThreadConfig(config, installed, SUPPORTED_TERMINAL_CONTEXT).config,
    ).toEqual({
      model: "test-model",
      browserMcp: true,
      subagentMcp: true,
      chromeMcp: true,
      computerUse: true,
    });
    expect(isBuiltInMcpServerEnabledByPlugin(installed, "browser")).toBe(true);

    const disabled = setPluginAppEnabled(installed, "browser-tools", "browser", false);
    expect(
      resolvePluginAppsForThreadConfig(config, disabled, SUPPORTED_TERMINAL_CONTEXT).config,
    ).toEqual({
      model: "test-model",
      subagentMcp: true,
      chromeMcp: true,
      computerUse: true,
    });
    expect(isBuiltInMcpServerEnabledByPlugin(disabled, "browser")).toBe(false);
    expect(resolvePluginAppsForThreadConfig(config, {}, SUPPORTED_TERMINAL_CONTEXT).config).toBe(
      config,
    );

    const disabledPlugin = setInstalledPluginEnabled(installed, "browser-tools", false);
    expect(getGloballyDisabledPluginConfigKeys(disabledPlugin)).toEqual(["browserMcp"]);
    expect(
      resolvePluginAppsForThreadConfig(config, disabledPlugin, SUPPORTED_TERMINAL_CONTEXT),
    ).toMatchObject({ disabledConfigKeys: ["browserMcp"] });
    expect(
      resolvePluginAppsForThreadConfig(config, disabledPlugin, SUPPORTED_TERMINAL_CONTEXT).config,
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
    const installed = [
      "browser-tools",
      "subagent-delegation",
      "chrome-tools",
      "computer-use",
    ].reduce(installBuiltInPlugin, {});

    expect(
      resolvePluginAppsForThreadConfig(config, installed, {
        ...SUPPORTED_TERMINAL_CONTEXT,
        capabilities: {},
      }).config,
    ).toBe(config);
    expect(
      resolvePluginAppsForThreadConfig(config, installed, {
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
    expect(
      isPluginSupportedForProject(getBuiltInPluginManifest("chrome-tools")!, "win32", wslProject),
    ).toBe(false);
    expect(
      isPluginSupportedForProject(getBuiltInPluginManifest("browser-tools")!, "win32", wslProject),
    ).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import type { BuiltInMcpServerId, LoadedPlugin, PluginSource } from "../contracts";
import { installedPluginsSchema } from "../contracts/plugin";
import { normalizeSharedSettings } from "../settings";
import { AGENT_PLUGINS_MANIFEST_SCHEMA_URL, type PluginSkillPolicyEntry } from "./spec";
import {
  canDisablePlugin,
  canUninstallPlugin,
  getPluginCoreSkill,
  installPlugin,
  isAlwaysEnabledPlugin,
  isBuiltInToolPlugin,
  resolveInstalledPluginState,
  isPluginMcpServerEnabled,
  isPluginProvidedNatively,
  isPluginSkillEnabled,
  isPluginSkillSupportedForLaunch,
  isPluginSupportedForProject,
  setInstalledPluginEnabled,
  setPluginMcpServerEnabled,
  setPluginSkillEnabled,
  uninstallPlugin,
} from "./catalog";

function makePlugin(
  name: string,
  options: {
    skills?: Record<string, PluginSkillPolicyEntry>;
    mcpServers?: string[];
    platforms?: ("win32" | "darwin" | "linux")[];
    projectKinds?: ("windows" | "posix" | "wsl")[];
    builtInMcpServerIds?: BuiltInMcpServerId[];
    source?: PluginSource;
    defaultEnabled?: boolean;
  } = {},
): LoadedPlugin {
  return {
    name,
    source: options.source ?? "bundled",
    root: `/plugins/${name}`,
    manifest: { $schema: AGENT_PLUGINS_MANIFEST_SCHEMA_URL, name, version: "1.0.0" },
    poracode: {
      category: "developer-tools",
      featured: false,
      communityMaintained: false,
      defaultEnabled: options.defaultEnabled ?? true,
      alwaysEnabled: false,
      nativePluginNames: [],
      builtInMcpServerIds: options.builtInMcpServerIds ?? [],
      skills: options.skills ?? {},
      ...(options.platforms ? { platforms: options.platforms } : {}),
      ...(options.projectKinds ? { projectKinds: options.projectKinds } : {}),
    },
    skills: Object.keys(options.skills ?? {}).map((folder) => ({
      folder,
      path: `/plugins/${name}/skills/${folder}`,
    })),
    mcpServers: (options.mcpServers ?? []).map((serverName) => ({
      name: serverName,
      entry: { type: "stdio" as const, command: "server", args: [], env: {} },
    })),
    diagnostics: [],
  };
}

const BROWSER_TOOLS = makePlugin("browser-tools", { skills: { "browser-control": {} } });
const CHROME_TOOLS = makePlugin("chrome-tools", {
  skills: { "chrome-control": {} },
  projectKinds: ["windows", "posix"],
});
const COMPUTER_USE = makePlugin("computer-use", {
  skills: { "computer-use": {} },
  platforms: ["win32", "darwin", "linux"],
  projectKinds: ["windows", "posix"],
});
const GITHUB = makePlugin("github", { skills: { github: {} }, mcpServers: ["github"] });
/** Bundled wrapper over a server the app already owns — installed from day one. */
const BUILT_IN_BROWSER_TOOLS = makePlugin("browser-tools", {
  skills: { "browser-control": {} },
  builtInMcpServerIds: ["browser"],
});

const WSL_PROJECT = {
  kind: "wsl",
  distro: "Ubuntu",
  linuxPath: "/repo",
  uncPath: "\\\\wsl.localhost\\Ubuntu\\repo",
} as const;

describe("plugin contracts", () => {
  it("defaults persisted plugin state fields", () => {
    expect(installedPluginsSchema.parse({ "test-tools": { version: "1.0.0" } })).toEqual({
      "test-tools": {
        version: "1.0.0",
        enabled: true,
        disabledSkillIds: [],
        disabledMcpServerNames: [],
      },
    });
  });

  it("defaults the version when a manifest omits it", () => {
    expect(installedPluginsSchema.parse({ "test-tools": {} })["test-tools"]?.version).toBe("0.0.0");
  });

  // An earlier build on this branch persisted `disabledAppIds`. `installedPlugins`
  // is normalized as one setting, so a strict per-entry schema would reject the
  // whole record and silently uninstall every plugin on upgrade.
  it("keeps plugin state when an entry carries a field from an older build", () => {
    const settings = normalizeSharedSettings({
      installedPlugins: {
        "browser-tools": {
          version: "1.0.0",
          enabled: false,
          disabledSkillIds: ["browser-control"],
          disabledAppIds: ["browser"],
        },
        github: {
          version: "1.0.0",
          enabled: true,
          disabledSkillIds: [],
          disabledMcpServerNames: ["github"],
        },
      },
    });

    expect(settings.installedPlugins["browser-tools"]).toEqual({
      version: "1.0.0",
      enabled: false,
      disabledSkillIds: ["browser-control"],
      disabledMcpServerNames: [],
    });
    expect(settings.installedPlugins.github?.disabledMcpServerNames).toEqual(["github"]);
  });
});

describe("plugin catalog", () => {
  it("installs and uninstalls a plugin", () => {
    const installed = installPlugin({}, BROWSER_TOOLS);

    expect(installed).toEqual({
      "browser-tools": {
        version: "1.0.0",
        enabled: true,
        disabledSkillIds: [],
        disabledMcpServerNames: [],
      },
    });
    expect(installPlugin(installed, BROWSER_TOOLS)).toBe(installed);
    expect(uninstallPlugin(installed, "browser-tools")).toEqual({});
  });

  it("toggles the plugin and its contributions independently", () => {
    const installed = installPlugin({}, GITHUB);
    const disabledSkill = setPluginSkillEnabled(installed, GITHUB, "github", false);
    const disabledServer = setPluginMcpServerEnabled(disabledSkill, GITHUB, "github", false);

    expect(disabledServer.github).toEqual({
      version: "1.0.0",
      enabled: true,
      disabledSkillIds: ["github"],
      disabledMcpServerNames: ["github"],
    });
    expect(isPluginSkillEnabled(GITHUB, disabledServer.github!, "github")).toBe(false);
    expect(isPluginMcpServerEnabled(GITHUB, disabledServer.github!, "github")).toBe(false);

    const reenabled = setPluginMcpServerEnabled(
      setPluginSkillEnabled(disabledServer, GITHUB, "github", true),
      GITHUB,
      "github",
      true,
    );
    expect(reenabled.github).toMatchObject({ disabledSkillIds: [], disabledMcpServerNames: [] });
    expect(isPluginSkillEnabled(GITHUB, reenabled.github!, "github")).toBe(true);
  });

  it("treats a disabled plugin as disabling every contribution", () => {
    const installed = setInstalledPluginEnabled(installPlugin({}, GITHUB), GITHUB, false);

    expect(isPluginSkillEnabled(GITHUB, installed.github!, "github")).toBe(false);
    expect(isPluginMcpServerEnabled(GITHUB, installed.github!, "github")).toBe(false);
  });

  it("reports an unknown contribution as disabled", () => {
    const installed = installPlugin({}, GITHUB);

    expect(isPluginSkillEnabled(GITHUB, installed.github!, "not-a-skill")).toBe(false);
    expect(isPluginMcpServerEnabled(GITHUB, installed.github!, "not-a-server")).toBe(false);
  });

  it("gates plugins on host platform and project kind", () => {
    expect(isPluginSupportedForProject(COMPUTER_USE, "linux", undefined)).toBe(true);
    expect(isPluginSupportedForProject(COMPUTER_USE, "win32", undefined)).toBe(true);
    expect(isPluginSupportedForProject(CHROME_TOOLS, "win32", WSL_PROJECT)).toBe(false);
    expect(isPluginSupportedForProject(BROWSER_TOOLS, "win32", WSL_PROJECT)).toBe(true);
  });

  it("offers a skill only where its plugin is supported", () => {
    expect(
      isPluginSkillSupportedForLaunch(CHROME_TOOLS, {
        hostPlatform: "win32",
        projectLocation: WSL_PROJECT,
      }),
    ).toBe(false);
    expect(
      isPluginSkillSupportedForLaunch(BROWSER_TOOLS, {
        hostPlatform: "win32",
        projectLocation: WSL_PROJECT,
      }),
    ).toBe(true);
  });

  it("resolves the plugin core skill and provider-native aliases", () => {
    const plugin = {
      ...BROWSER_TOOLS,
      poracode: {
        ...BROWSER_TOOLS.poracode,
        coreSkill: "browser-control",
        nativePluginNames: ["browser"],
      },
    };

    expect(getPluginCoreSkill(plugin)?.folder).toBe("browser-control");
    expect(isPluginProvidedNatively(plugin, new Set(["browser"]))).toBe(true);
    expect(isPluginProvidedNatively(plugin, new Set(["github"]))).toBe(false);
  });

  it("requires the complete native replacement set for a combined plugin", () => {
    const plugin = {
      ...GITHUB,
      name: "outlook",
      poracode: {
        ...GITHUB.poracode,
        nativePluginNames: ["outlook-email", "outlook-calendar"],
      },
    };

    expect(isPluginProvidedNatively(plugin, new Set(["outlook-email"]))).toBe(false);
    expect(isPluginProvidedNatively(plugin, new Set(["outlook-email", "outlook-calendar"]))).toBe(
      true,
    );
    expect(isPluginProvidedNatively(plugin, new Set(["outlook"]))).toBe(true);
  });
});

describe("built-in tool plugins", () => {
  it("counts a bundled built-in wrapper as installed before the user touches it", () => {
    expect(isBuiltInToolPlugin(BUILT_IN_BROWSER_TOOLS)).toBe(true);
    expect(resolveInstalledPluginState(BUILT_IN_BROWSER_TOOLS, {})).toEqual({
      version: "1.0.0",
      enabled: true,
      disabledSkillIds: [],
      disabledMcpServerNames: [],
    });
    expect(canUninstallPlugin(BUILT_IN_BROWSER_TOOLS)).toBe(false);
    expect(canDisablePlugin(BUILT_IN_BROWSER_TOOLS)).toBe(true);
  });

  it("keeps an always-on bundled plugin enabled and refuses disablement", () => {
    const terminal = makePlugin("terminal", {
      skills: { "terminal-inspection": {} },
      builtInMcpServerIds: ["app-controls"],
    });
    terminal.poracode = { ...terminal.poracode, alwaysEnabled: true };

    expect(isAlwaysEnabledPlugin(terminal)).toBe(true);
    expect(canDisablePlugin(terminal)).toBe(false);
    expect(canUninstallPlugin(terminal)).toBe(false);
    expect(resolveInstalledPluginState(terminal, {})).toMatchObject({ enabled: true });
    expect(setInstalledPluginEnabled({}, terminal, false)).toEqual({});
    expect(
      resolveInstalledPluginState(terminal, {
        terminal: {
          version: "1.0.0",
          enabled: false,
          disabledSkillIds: [],
          disabledMcpServerNames: [],
        },
      }),
    ).toMatchObject({ enabled: true });
  });

  it("leaves packages that start their own server, or came from disk, opt-in", () => {
    expect(isBuiltInToolPlugin(GITHUB)).toBe(false);
    expect(resolveInstalledPluginState(GITHUB, {})).toBeUndefined();
    expect(canUninstallPlugin(GITHUB)).toBe(true);

    const userCopy = makePlugin("browser-tools", {
      skills: { "browser-control": {} },
      builtInMcpServerIds: ["browser"],
      source: "user",
    });
    expect(isBuiltInToolPlugin(userCopy)).toBe(false);
    expect(resolveInstalledPluginState(userCopy, {})).toBeUndefined();
  });

  it("materializes a record the first time the user disables one", () => {
    const disabled = setInstalledPluginEnabled({}, BUILT_IN_BROWSER_TOOLS, false);

    expect(disabled["browser-tools"]).toMatchObject({ enabled: false });
    expect(resolveInstalledPluginState(BUILT_IN_BROWSER_TOOLS, disabled)).toMatchObject({
      enabled: false,
    });
  });

  it("materializes a record the first time the user disables one of its skills", () => {
    const disabled = setPluginSkillEnabled({}, BUILT_IN_BROWSER_TOOLS, "browser-control", false);

    expect(disabled["browser-tools"]).toMatchObject({
      enabled: true,
      disabledSkillIds: ["browser-control"],
    });
    expect(
      isPluginSkillEnabled(BUILT_IN_BROWSER_TOOLS, disabled["browser-tools"]!, "browser-control"),
    ).toBe(false);
  });
});

describe("default enablement", () => {
  // A package that starts a third-party server, or needs the user to sign in
  // first, ships off: installing it must not launch anything on its own.
  const OPT_IN = makePlugin("outlook", {
    skills: { "outlook-email": {} },
    mcpServers: ["outlook"],
    defaultEnabled: false,
  });

  it("installs a default-disabled package without switching it on", () => {
    const installed = installPlugin({}, OPT_IN);

    expect(installed.outlook).toMatchObject({ enabled: false });
    expect(isPluginSkillEnabled(OPT_IN, installed.outlook!, "outlook-email")).toBe(false);
    expect(isPluginMcpServerEnabled(OPT_IN, installed.outlook!, "outlook")).toBe(false);
  });

  it("still lets the user enable it, and leaves other packages on by default", () => {
    const enabled = setInstalledPluginEnabled(installPlugin({}, OPT_IN), OPT_IN, true);

    expect(enabled.outlook).toMatchObject({ enabled: true });
    expect(installPlugin({}, GITHUB).github).toMatchObject({ enabled: true });
  });
});

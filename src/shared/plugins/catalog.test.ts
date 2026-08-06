import { describe, expect, it } from "vitest";
import type { LoadedPlugin } from "../contracts";
import { installedPluginsSchema } from "../contracts/plugin";
import { normalizeSharedSettings } from "../settings";
import { AGENT_PLUGINS_MANIFEST_SCHEMA_URL, type PluginSkillPolicyEntry } from "./spec";
import {
  installPlugin,
  isPluginMcpServerEnabled,
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
  platforms: ["win32", "darwin"],
  projectKinds: ["windows", "posix"],
});
const GITHUB = makePlugin("github", { skills: { github: {} }, mcpServers: ["github"] });

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
    const disabledSkill = setPluginSkillEnabled(installed, "github", "github", false);
    const disabledServer = setPluginMcpServerEnabled(disabledSkill, "github", "github", false);

    expect(disabledServer.github).toEqual({
      version: "1.0.0",
      enabled: true,
      disabledSkillIds: ["github"],
      disabledMcpServerNames: ["github"],
    });
    expect(isPluginSkillEnabled(GITHUB, disabledServer.github!, "github")).toBe(false);
    expect(isPluginMcpServerEnabled(GITHUB, disabledServer.github!, "github")).toBe(false);

    const reenabled = setPluginMcpServerEnabled(
      setPluginSkillEnabled(disabledServer, "github", "github", true),
      "github",
      "github",
      true,
    );
    expect(reenabled.github).toMatchObject({ disabledSkillIds: [], disabledMcpServerNames: [] });
    expect(isPluginSkillEnabled(GITHUB, reenabled.github!, "github")).toBe(true);
  });

  it("treats a disabled plugin as disabling every contribution", () => {
    const installed = setInstalledPluginEnabled(installPlugin({}, GITHUB), "github", false);

    expect(isPluginSkillEnabled(GITHUB, installed.github!, "github")).toBe(false);
    expect(isPluginMcpServerEnabled(GITHUB, installed.github!, "github")).toBe(false);
  });

  it("reports an unknown contribution as disabled", () => {
    const installed = installPlugin({}, GITHUB);

    expect(isPluginSkillEnabled(GITHUB, installed.github!, "not-a-skill")).toBe(false);
    expect(isPluginMcpServerEnabled(GITHUB, installed.github!, "not-a-server")).toBe(false);
  });

  it("gates plugins on host platform and project kind", () => {
    expect(isPluginSupportedForProject(COMPUTER_USE, "linux", undefined)).toBe(false);
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
});

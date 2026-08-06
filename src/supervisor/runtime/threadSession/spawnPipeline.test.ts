import { describe, expect, it } from "vitest";
import type { LoadedPlugin, ThreadConfig } from "@/shared/contracts";
import type { AgentAdapter } from "../../agents/base";
import { installPlugin, resolvePluginAppsForThreadConfig } from "@/shared/plugins/catalog";
import { AGENT_PLUGINS_MANIFEST_SCHEMA_URL } from "@/shared/plugins/spec";

const BROWSER_TOOLS: LoadedPlugin = {
  name: "browser-tools",
  source: "bundled",
  root: "/plugins/browser-tools",
  manifest: { $schema: AGENT_PLUGINS_MANIFEST_SCHEMA_URL, name: "browser-tools", version: "1.0.0" },
  poracode: {
    category: "developer-tools",
    featured: false,
    communityMaintained: false,
    apps: [
      {
        id: "browser",
        name: "Browser",
        description: "Control the in-app browser.",
        builtInMcpServerId: "browser",
      },
    ],
    skills: {},
  },
  skills: [],
  mcpServers: [],
  diagnostics: [],
};
import {
  effectiveLaunchConfig,
  effectiveStructuredTurnConfig,
  mergeBuiltInMcpDisabledTools,
  resolveAttachedAppLaunchConfig,
  SpawnPipeline,
} from "./spawnPipeline";

const baseConfig: ThreadConfig = {
  model: "test-model",
  browserMcp: true,
  subagentMcp: true,
  computerUse: true,
  chromeMcp: true,
};

describe("effectiveLaunchConfig — single gate for built-in MCP disables", () => {
  it("returns the config unchanged when nothing is disabled", () => {
    expect(effectiveLaunchConfig(baseConfig, [])).toBe(baseConfig);
  });

  it("clears only the flags whose built-in server is disabled", () => {
    const result = effectiveLaunchConfig(baseConfig, ["browser", "computer-use"]);
    expect(result).toEqual({
      ...baseConfig,
      browserMcp: false,
      computerUse: false,
    });
  });

  it("clears every flag-mapped server when all are disabled", () => {
    const result = effectiveLaunchConfig(baseConfig, [
      "browser",
      "subagents",
      "computer-use",
      "chrome",
      "app-controls",
    ]);
    expect(result).toEqual({
      ...baseConfig,
      browserMcp: false,
      subagentMcp: false,
      computerUse: false,
      chromeMcp: false,
    });
  });

  it("does not mutate the original config", () => {
    effectiveLaunchConfig(baseConfig, ["browser"]);
    expect(baseConfig.browserMcp).toBe(true);
  });

  it("lets installed plugin apps opt in before global MCP disables are enforced", () => {
    const config: ThreadConfig = { model: "test-model" };
    const pluginConfig = resolvePluginAppsForThreadConfig(
      config,
      [BROWSER_TOOLS],
      installPlugin({}, BROWSER_TOOLS),
      {
        capabilities: { browserMcpScope: { terminal: "launch" } },
        presentationMode: "terminal",
        projectLocation: { kind: "windows", path: "C:\\repo" },
        hostPlatform: "win32",
      },
    ).config;

    expect(effectiveLaunchConfig(pluginConfig, []).browserMcp).toBe(true);
    expect(effectiveLaunchConfig(pluginConfig, ["browser"]).browserMcp).toBe(false);
    expect(config.browserMcp).toBeUndefined();
  });
});

describe("runtime App launch config", () => {
  it("keeps plugin master-disable authoritative over legacy Browser settings", async () => {
    const pipeline = new SpawnPipeline({
      options: {
        applyPluginAppsToConfig: (config: ThreadConfig) => ({
          config: { ...config, browserMcp: false },
          disabledConfigKeys: ["browserMcp"],
        }),
      },
      isBrowserMcpEnabledForLaunch: () => true,
    } as never);
    const adapter = {
      capabilities: { browserMcpScope: { terminal: "launch" } },
    } as unknown as AgentAdapter;

    const resolved = pipeline.resolveConfigForLaunch(
      { model: "test-model" },
      adapter,
      { kind: "windows", path: "C:\\repo" },
      "terminal",
      [],
    );
    expect(resolved.launchConfig.browserMcp).toBe(false);
    await expect(
      pipeline.resolveBrowserMcpForLaunch(
        adapter,
        { kind: "windows", path: "C:\\repo" },
        resolved.launchConfig,
        { mcpServers: [], disabledBuiltInMcpServerIds: [] },
        undefined,
        resolved.pluginDisabledConfigKeys,
      ),
    ).resolves.toBeUndefined();
  });

  it("unions caller and supervisor disabled-tool policy", () => {
    expect(
      mergeBuiltInMcpDisabledTools(
        { browser: ["navigate", "shared"] },
        { browser: ["shared", "click"], chrome: ["open_tab"] },
      ),
    ).toEqual({ browser: ["navigate", "shared", "click"], chrome: ["open_tab"] });
  });

  it("uses actual attachments while preserving explicit hard-disabled flags", () => {
    expect(
      resolveAttachedAppLaunchConfig(
        { model: "test-model", browserMcp: true, computerUse: false },
        {
          browserMcp: false,
          subagentMcp: false,
          computerUse: false,
          chromeMcp: true,
        },
      ),
    ).toEqual({ model: "test-model", computerUse: false, chromeMcp: true });
  });

  it("overlays immutable App state onto the latest structured turn config", () => {
    expect(
      effectiveStructuredTurnConfig(
        {
          runtimeLaunchConfig: {
            model: "original-model",
            browserMcp: true,
            computerUse: false,
          },
        },
        { model: "updated-model", browserMcp: false, computerUse: true },
      ),
    ).toEqual({ model: "updated-model", browserMcp: true, computerUse: false });
  });
});

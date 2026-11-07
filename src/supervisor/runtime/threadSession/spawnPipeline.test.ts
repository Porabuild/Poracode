import { beforeEach, describe, expect, it, vi } from "vitest";
import type { McpLaunchSnapshot, ProjectLocation, ThreadConfig } from "@/shared/contracts";

const resolveAgentProjectLocation = vi.hoisted(() =>
  vi.fn<
    (
      location: ProjectLocation,
      environment?: ThreadConfig["executionEnvironment"],
    ) => Promise<ProjectLocation>
  >(),
);

vi.mock("../../agents/base", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../agents/base")>()),
  resolveAgentProjectLocation,
}));
import {
  applyCrewCrossagentMcpFlag,
  applyAgentSettingsMcpFlags,
  composeResolvedMcpServers,
  effectiveLaunchConfig,
  resolveThreadExecution,
  SpawnPipeline,
  usesProviderSessionCrossagentRouting,
  workspaceLaunchConfig,
} from "./spawnPipeline";

beforeEach(() => {
  vi.clearAllMocks();
  resolveAgentProjectLocation.mockImplementation(async (location) => location);
});

const baseConfig: ThreadConfig = {
  model: "test-model",
  browserMcp: true,
  crossagentMcp: true,
  computerUse: true,
  chromeMcp: true,
};

describe("resolveThreadExecution", () => {
  const windowsProject: ProjectLocation = { kind: "windows", path: "C:\\repo" };
  const wslProject: ProjectLocation = {
    kind: "wsl",
    distro: "Ubuntu",
    linuxPath: "/mnt/c/repo",
    uncPath: "\\\\wsl.localhost\\Ubuntu\\mnt\\c\\repo",
  };
  it("passes a persisted WSL pin through unchanged", async () => {
    const config = {
      ...baseConfig,
      executionEnvironment: { kind: "wsl" as const, distro: "Ubuntu" },
    };
    resolveAgentProjectLocation.mockResolvedValue(wslProject);

    await expect(resolveThreadExecution(windowsProject, config)).resolves.toEqual({
      location: wslProject,
      config,
    });
  });

  it("forwards a persisted distro on cold resume", async () => {
    const config = {
      ...baseConfig,
      executionEnvironment: { kind: "wsl" as const, distro: "Debian" },
    };
    resolveAgentProjectLocation.mockResolvedValue({ ...wslProject, distro: "Debian" });

    await resolveThreadExecution(windowsProject, config);

    expect(resolveAgentProjectLocation).toHaveBeenCalledWith(
      windowsProject,
      config.executionEnvironment,
    );
  });

  it("keeps unpinned Windows projects on the native location", async () => {
    await expect(resolveThreadExecution(windowsProject, baseConfig)).resolves.toEqual({
      location: windowsProject,
      config: baseConfig,
    });
    expect(resolveAgentProjectLocation).toHaveBeenCalledWith(windowsProject, undefined);
  });
});

describe("effectiveLaunchConfig - single gate for built-in MCP disables", () => {
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
      "crossagents",
      "computer-use",
      "chrome",
      "app-controls",
    ]);
    expect(result).toEqual({
      ...baseConfig,
      browserMcp: false,
      crossagentMcp: false,
      computerUse: false,
      chromeMcp: false,
    });
  });

  it("does not mutate the original config", () => {
    effectiveLaunchConfig(baseConfig, ["browser"]);
    expect(baseConfig.browserMcp).toBe(true);
  });

  it("enables MCPs bundled by installed plugins while global disables still win", () => {
    const config = { model: baseConfig.model };

    expect(
      effectiveLaunchConfig(
        config,
        ["chrome"],
        ["browser", "crossagents", "computer-use", "chrome"],
      ),
    ).toEqual({
      ...config,
      browserMcp: true,
      crossagentMcp: true,
      computerUse: true,
      chromeMcp: false,
    });
  });

  it("preserves explicit per-thread disables when another plugin contributes the same built-in", () => {
    const config = {
      ...baseConfig,
      browserMcp: false,
      crossagentMcp: false,
      computerUse: false,
      chromeMcp: false,
    };
    expect(
      effectiveLaunchConfig(config, [], ["browser", "crossagents", "computer-use", "chrome"]),
    ).toEqual(config);
  });
});

describe("crew Crossagents launch policy", () => {
  const crewConfig: ThreadConfig = {
    model: "test-model",
    crossagentMcp: false,
    crew: {
      version: 1,
      policy: "crew-only",
      roles: [
        {
          id: "builder",
          label: "Builder",
          selection: { agentKind: "codex", model: "gpt-5.5" },
        },
      ],
    },
  };
  const threadCapabilities = { mcpScope: { gui: "launch" as const } };

  const snapshot: McpLaunchSnapshot = {
    mcpServers: [],
    disabledBuiltInMcpServerIds: [],
    disabledBuiltInMcpTools: {},
    pluginBuiltInMcpServerIds: [],
  };

  it("applies the crew rule in resolveMcpLaunchConfig after the early-return path", () => {
    const pipeline = new SpawnPipeline({ resolveAgentSettings: () => ({}) } as never);
    const adapter = {
      capabilities: {
        presentationMode: "gui",
        mcpScope: { gui: "launch" },
      },
    } as unknown as import("../../agents/base").AgentAdapter;
    expect(
      pipeline.resolveMcpLaunchConfig(crewConfig, snapshot, adapter, "thread", undefined, "gui")
        .crossagentMcp,
    ).toBe(true);
    expect(
      pipeline.resolveMcpLaunchConfig(
        crewConfig,
        { ...snapshot, disabledBuiltInMcpServerIds: ["crossagents"] },
        adapter,
        "thread",
        undefined,
        "gui",
      ).crossagentMcp,
    ).toBe(false);
  });

  it("keeps ordinary providers at effectiveLaunchConfig semantics", () => {
    const pipeline = new SpawnPipeline({ resolveAgentSettings: () => ({}) } as never);
    const adapter = {
      capabilities: {
        presentationMode: "gui",
        mcpScope: { gui: "launch" },
      },
    } as unknown as import("../../agents/base").AgentAdapter;
    const config = {
      model: "test-model",
      browserMcp: true,
      crossagentMcp: false,
      computerUse: true,
      chromeMcp: true,
    };
    const mcpLaunchSnapshot: McpLaunchSnapshot = {
      ...snapshot,
      disabledBuiltInMcpServerIds: ["browser"],
      pluginBuiltInMcpServerIds: ["crossagents", "computer-use"],
    };
    const expected = effectiveLaunchConfig(
      config,
      mcpLaunchSnapshot.disabledBuiltInMcpServerIds,
      mcpLaunchSnapshot.pluginBuiltInMcpServerIds,
    );
    expect(
      pipeline.resolveMcpLaunchConfig(
        config,
        mcpLaunchSnapshot,
        adapter,
        "thread",
        undefined,
        "gui",
      ),
    ).toEqual(expected);
  });

  it("uses provider-session routing availability for agentSettings providers", () => {
    const pipeline = new SpawnPipeline({
      resolveAgentSettings: () => ({ crossagentMcp: false }),
    } as never);
    const adapter = {
      capabilities: {
        presentationMode: "gui",
        mcpConfigSource: "agentSettings",
        crossagentMcpRouting: "provider-session",
      },
    } as unknown as import("../../agents/base").AgentAdapter;
    expect(
      pipeline.resolveMcpLaunchConfig(crewConfig, snapshot, adapter, undefined, undefined, "gui")
        .crossagentMcp,
    ).toBe(false);
    expect(
      pipeline.resolveMcpLaunchConfig(crewConfig, snapshot, adapter, "thread", undefined, "gui")
        .crossagentMcp,
    ).toBe(true);
  });

  it("forces Crossagents even when the effectiveLaunchConfig early-return path has no ids", () => {
    const effective = effectiveLaunchConfig(crewConfig, []);
    expect(effective.crossagentMcp).toBe(false);
    expect(
      applyCrewCrossagentMcpFlag(effective, threadCapabilities, "gui", [], false).crossagentMcp,
    ).toBe(true);
    expect(
      applyCrewCrossagentMcpFlag(
        { model: crewConfig.model, crew: crewConfig.crew },
        threadCapabilities,
        "gui",
        [],
        false,
      ).crossagentMcp,
    ).toBe(true);
  });

  it("lets the global built-in disable win", () => {
    expect(
      applyCrewCrossagentMcpFlag(crewConfig, threadCapabilities, "gui", ["crossagents"], false)
        .crossagentMcp,
    ).toBe(false);
  });

  it("forces provider-settings Crossagents only when routing is available", () => {
    const capabilities = {
      mcpConfigSource: "agentSettings" as const,
      crossagentMcpRouting: "provider-session" as const,
    };
    const withSettingsOff = applyAgentSettingsMcpFlags(crewConfig, {}, [], false);
    expect(
      applyCrewCrossagentMcpFlag(withSettingsOff, capabilities, "gui", [], false).crossagentMcp,
    ).toBe(false);
    const withRouting = applyAgentSettingsMcpFlags(crewConfig, {}, [], true);
    expect(
      applyCrewCrossagentMcpFlag(withRouting, capabilities, "gui", [], true).crossagentMcp,
    ).toBe(true);
  });

  it("turns on a crew for terminal launches whose provider has a terminal Crossagents path", () => {
    const terminalCapabilities = {
      mcpScope: { gui: "launch" as const, terminal: "launch" as const },
    };
    expect(
      applyCrewCrossagentMcpFlag(crewConfig, terminalCapabilities, "terminal", [], false)
        .crossagentMcp,
    ).toBe(true);
    const pipeline = new SpawnPipeline({ resolveAgentSettings: () => ({}) } as never);
    const adapter = {
      capabilities: { presentationMode: "terminal", mcpScope: terminalCapabilities.mcpScope },
    } as unknown as import("../../agents/base").AgentAdapter;
    expect(
      pipeline.resolveMcpLaunchConfig(
        crewConfig,
        snapshot,
        adapter,
        "thread",
        undefined,
        "terminal",
      ).crossagentMcp,
    ).toBe(true);
  });

  it("does not turn on a crew without a Crossagents path or without a supported binding", () => {
    expect(
      applyCrewCrossagentMcpFlag(crewConfig, threadCapabilities, "terminal", [], false)
        .crossagentMcp,
    ).toBe(false);
    expect(
      applyCrewCrossagentMcpFlag(
        { model: "test-model", crossagentMcp: false },
        threadCapabilities,
        "gui",
        [],
        false,
      ).crossagentMcp,
    ).toBe(false);
  });
});

describe("workspaceLaunchConfig — Home scope unrestricted for every agent", () => {
  const adapter = {
    capabilities: {
      approvalPolicies: [
        { id: "default", label: "Default" },
        { id: "bypassPermissions", label: "Bypass" },
      ],
      sandboxModes: [
        { id: "workspace-write", label: "Workspace" },
        { id: "danger-full-access", label: "Full" },
      ],
      bypassPermissions: { approvalPolicy: "bypassPermissions", sandboxMode: "danger-full-access" },
    },
  };

  it("leaves a repo workspace config unchanged", () => {
    const config = { ...baseConfig, approvalPolicy: "default", sandboxMode: "workspace-write" };
    expect(
      workspaceLaunchConfig({ kind: "windows", path: "C:\\repo" }, config, adapter, []),
    ).toEqual(config);
  });

  it("forces each provider's unrestricted posture in Home", () => {
    const config = { ...baseConfig, approvalPolicy: "default", sandboxMode: "workspace-write" };
    expect(
      workspaceLaunchConfig({ kind: "windows", path: "C:\\Users\\me" }, config, adapter, []),
    ).toEqual({
      ...config,
      approvalPolicy: "bypassPermissions",
      sandboxMode: "danger-full-access",
    });
  });

  it("uses the logical Windows Home path for a WSL-backed launch", () => {
    const config = { ...baseConfig, approvalPolicy: "default", sandboxMode: "workspace-write" };
    expect(
      workspaceLaunchConfig(
        {
          kind: "wsl",
          distro: "Ubuntu",
          linuxPath: "/mnt/c/Users/me",
          uncPath: "\\\\wsl.localhost\\Ubuntu\\mnt\\c\\Users\\me",
        },
        config,
        adapter,
        [],
        [],
        { kind: "windows", path: "C:\\Users\\me" },
      ),
    ).toEqual({
      ...config,
      approvalPolicy: "bypassPermissions",
      sandboxMode: "danger-full-access",
    });
  });
});

describe("applyAgentSettingsMcpFlags", () => {
  it("maps agentSettings booleans and keeps Crossagents off without provider-session routing", () => {
    const result = applyAgentSettingsMcpFlags(baseConfig, { browserMcp: true }, [], false);
    expect(result).toEqual({
      ...baseConfig,
      browserMcp: true,
      chromeMcp: false,
      computerUse: false,
      crossagentMcp: false,
    });
  });

  it("enables provider-level Crossagents when trusted provider-session routing is available", () => {
    const result = applyAgentSettingsMcpFlags(baseConfig, { crossagentMcp: true }, [], true);
    expect(result.crossagentMcp).toBe(true);
  });

  it("keeps globally disabled servers off when provider settings enable them", () => {
    const result = applyAgentSettingsMcpFlags(
      baseConfig,
      { browserMcp: true, crossagentMcp: true, chromeMcp: true, computerUse: true },
      ["browser", "crossagents", "chrome", "computer-use"],
      true,
    );
    expect(result).toEqual({
      ...baseConfig,
      browserMcp: false,
      chromeMcp: false,
      computerUse: false,
      crossagentMcp: false,
    });
  });
});

describe("usesProviderSessionCrossagentRouting", () => {
  const adapter = {
    capabilities: {
      presentationMode: "terminal",
      crossagentMcpRouting: "provider-session",
    },
  } as const;

  it("uses provider-session routing for a GUI thread", () => {
    expect(usesProviderSessionCrossagentRouting(adapter, "gui", "thread-1")).toBe(true);
  });

  it("keeps terminal threads on direct routing", () => {
    expect(usesProviderSessionCrossagentRouting(adapter, "terminal", "thread-1")).toBe(false);
    expect(usesProviderSessionCrossagentRouting(adapter, undefined, "thread-1")).toBe(false);
  });

  it("requires a thread id and provider support", () => {
    expect(usesProviderSessionCrossagentRouting(adapter, "gui", undefined)).toBe(false);
    expect(
      usesProviderSessionCrossagentRouting(
        { capabilities: { presentationMode: "gui" } },
        "gui",
        "thread-1",
      ),
    ).toBe(false);
  });
});

describe("composeResolvedMcpServers", () => {
  it("combines custom and built-in servers before the provider boundary", () => {
    const servers = composeResolvedMcpServers(
      {
        mcpServers: [
          {
            id: "custom",
            name: "custom",
            description: "",
            enabled: true,
            timeoutMs: 15_000,
            transport: { type: "stdio", command: "custom", args: [], env: {} },
          },
        ],
        disabledBuiltInMcpServerIds: [],
      },
      { url: "http://browser/mcp", token: "b", headers: { Authorization: "Bearer b" } },
      { url: "http://agents/mcp", token: "a", headers: { Authorization: "Bearer a" } },
      undefined,
      undefined,
      undefined,
    );

    expect(servers.map((server) => server.name)).toEqual(["custom", "browser", "crossagents"]);
    expect(servers[2]).toMatchObject({ timeoutMs: 600_000, approvalMode: "approve" });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectLocation, ThreadConfig } from "@/shared/contracts";
import type { AgentAdapter } from "../../agents/base";

const resolveAgentProjectLocation = vi.hoisted(() =>
  vi.fn<
    (
      adapter: AgentAdapter,
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
  applyAgentSettingsMcpFlags,
  composeResolvedMcpServers,
  effectiveLaunchConfig,
  resolveThreadExecution,
  usesProviderSessionCrossagentRouting,
  workspaceLaunchConfig,
} from "./spawnPipeline";

beforeEach(() => {
  vi.clearAllMocks();
  resolveAgentProjectLocation.mockImplementation(async (_adapter, location) => location);
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
  const wslAdapter = { windowsProjectExecution: "wsl" } as AgentAdapter;

  it("persists the selected distro for a Windows project", async () => {
    resolveAgentProjectLocation.mockResolvedValue(wslProject);

    await expect(resolveThreadExecution(wslAdapter, windowsProject, baseConfig)).resolves.toEqual({
      location: wslProject,
      config: {
        ...baseConfig,
        executionEnvironment: { kind: "wsl", distro: "Ubuntu" },
      },
    });
  });

  it("forwards a persisted distro on cold resume", async () => {
    const config = {
      ...baseConfig,
      executionEnvironment: { kind: "wsl" as const, distro: "Debian" },
    };
    resolveAgentProjectLocation.mockResolvedValue({ ...wslProject, distro: "Debian" });

    await resolveThreadExecution(wslAdapter, windowsProject, config);

    expect(resolveAgentProjectLocation).toHaveBeenCalledWith(
      wslAdapter,
      windowsProject,
      config.executionEnvironment,
    );
  });

  it("keeps non-opted-in providers on the native Windows location", async () => {
    const nativeAdapter = {} as AgentAdapter;

    await expect(
      resolveThreadExecution(nativeAdapter, windowsProject, {
        ...baseConfig,
        executionEnvironment: { kind: "wsl", distro: "Ubuntu" },
      }),
    ).resolves.toEqual({ location: windowsProject, config: baseConfig });
  });
});

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
    const config = {
      ...baseConfig,
      browserMcp: false,
      crossagentMcp: false,
      computerUse: false,
      chromeMcp: false,
    };

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
    expect(servers[2]).toMatchObject({ timeoutMs: 300_000, approvalMode: "approve" });
  });
});

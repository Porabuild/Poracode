import { describe, expect, it, vi } from "vitest";
import type {
  AgentStatus,
  GetLatestAgentVersionResult,
  NpmPackageVersionQuery,
} from "@/shared/contracts";
import { defaultSharedSettings } from "@/shared/settings";
import type { AgentAdapter } from "../agents/base";
import type { AgentStatusService } from "./agentStatusService";
import type { SupervisorSharedSettingsCache } from "./supervisorSharedSettings";

const readDetectedVersionMock = vi.hoisted(() =>
  vi.fn<typeof import("../agents/base").readDetectedVersion>(),
);
const detectProbeLocationMock = vi.hoisted(() =>
  vi.fn<typeof import("../agents/base").detectProbeLocation>(),
);
const runUpdateCommandWithFallbackMock = vi.hoisted(() =>
  vi.fn<typeof import("../agents/updateAgent").runUpdateCommandWithFallback>(),
);
const acpRegistryMocks = vi.hoisted(() => ({
  cacheLocalAcpRegistryIcons:
    vi.fn<typeof import("../agents/acpRegistry").cacheLocalAcpRegistryIcons>(),
  installAcpRegistryAgent: vi.fn<typeof import("../agents/acpRegistry").installAcpRegistryAgent>(),
  readAcpRegistrySettings: vi.fn<typeof import("../agents/acpRegistry").readAcpRegistrySettings>(),
}));

const getLatestVersionForAdapterMock = vi.hoisted(() =>
  vi.fn<(adapter: AgentAdapter) => Promise<GetLatestAgentVersionResult>>(),
);
const getLatestSupportedNpmPackageVersionMock = vi.hoisted(() =>
  vi.fn<(query: NpmPackageVersionQuery) => Promise<GetLatestAgentVersionResult>>(),
);

vi.mock("../agents/base", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../agents/base")>();
  return {
    ...actual,
    detectProbeLocation: detectProbeLocationMock,
    readDetectedVersion: readDetectedVersionMock,
  };
});

vi.mock("../agents/updateAgent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../agents/updateAgent")>();
  return {
    ...actual,
    runUpdateCommandWithFallback: runUpdateCommandWithFallbackMock,
    getLatestVersionForAdapter: getLatestVersionForAdapterMock,
    getLatestSupportedNpmPackageVersion: getLatestSupportedNpmPackageVersionMock,
  };
});

vi.mock("../agents/acpRegistry", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../agents/acpRegistry")>();
  return {
    ...actual,
    cacheLocalAcpRegistryIcons: acpRegistryMocks.cacheLocalAcpRegistryIcons,
    installAcpRegistryAgent: acpRegistryMocks.installAcpRegistryAgent,
    readAcpRegistrySettings: acpRegistryMocks.readAcpRegistrySettings,
  };
});

import { AgentRegistryService } from "./agentRegistryService";

const capabilities: AgentStatus["capabilities"] = {
  models: [],
  efforts: [],
  modelEfforts: {},
  modes: [],
  approvalPolicies: [],
  sandboxModes: [],
  supportsResume: true,
  supportsDirectInput: true,
  liveInputMode: "terminal",
  presentationMode: "terminal",
  settingDefs: [],
};

describe("AgentRegistryService.updateAgentBinary", () => {
  it("awaits a fresh scoped WSL status before running the updater", async () => {
    const status: AgentStatus = {
      kind: "opencode",
      label: "OpenCode",
      installed: true,
      version: "1.17.7",
      executablePath: "/home/test/.opencode/bin/opencode",
      authState: "authenticated",
      capabilities,
      envKind: "wsl",
      envDistro: "Ubuntu",
    };
    const adapter = {
      kind: "opencode",
      label: "OpenCode",
      capabilities,
      detectInstall: vi.fn<AgentAdapter["detectInstall"]>(),
      buildLaunchArgv: vi.fn<AgentAdapter["buildLaunchArgv"]>(),
      buildResumeArgv: vi.fn<AgentAdapter["buildResumeArgv"]>(),
      createInitialSessionRef: vi.fn<AgentAdapter["createInitialSessionRef"]>(() => undefined),
    } as unknown as AgentAdapter;
    const refreshAgentStatuses = vi
      .fn<AgentStatusService["refreshAgentStatuses"]>()
      .mockResolvedValue({
        windows: [],
        wsl: [status],
        fromCache: false,
      });
    const getAgentStatuses = vi.fn<AgentStatusService["getAgentStatuses"]>();
    const listWslDistros = vi.fn<AgentStatusService["listWslDistros"]>();
    const agentStatusService = {
      refreshAgentStatuses,
      getAgentStatuses,
      listWslDistros,
    } as unknown as AgentStatusService;
    const service = new AgentRegistryService({
      adapters: new Map([["opencode", adapter]]),
      settingsPath: "C:\\data\\settings.json",
      baseDir: "C:\\data",
      acpIconsDir: "C:\\data\\icons",
      sharedSettingsCache: {
        invalidate: vi.fn<SupervisorSharedSettingsCache["invalidate"]>(),
      } as unknown as SupervisorSharedSettingsCache,
      getAgentStatusService: () => agentStatusService,
      getActiveWslProjectDistros: () => [],
    });
    runUpdateCommandWithFallbackMock.mockResolvedValue({
      ok: false,
      strategy: "built-in",
      output: "command failed",
    });

    const result = await service.updateAgentBinary({
      agentKind: "opencode",
      envKind: "wsl",
      wslDistro: "Ubuntu",
    });

    expect(refreshAgentStatuses).toHaveBeenCalledWith({
      wslDistros: ["Ubuntu"],
      scope: {
        agentKinds: ["opencode"],
        envs: [{ kind: "wsl", distro: "Ubuntu" }],
      },
    });
    expect(getAgentStatuses).not.toHaveBeenCalled();
    expect(listWslDistros).not.toHaveBeenCalled();
    expect(runUpdateCommandWithFallbackMock).toHaveBeenCalledWith(adapter, status, {
      envKind: "wsl",
      wslDistro: "Ubuntu",
      baseDir: "C:\\data",
    });
    expect(result).toEqual({
      ok: false,
      strategy: "built-in",
      output: "command failed",
    });
  });

  it("refreshes every detected provider profile that resolves to the updated executable", async () => {
    const status: AgentStatus = {
      kind: "claude:work",
      label: "Claude Work",
      installed: true,
      version: "1.0.0",
      executablePath: "/usr/local/bin/claude",
      authState: "authenticated",
      capabilities,
      envKind: "posix",
    };
    const makeAdapter = (kind: AgentAdapter["kind"], label: string) =>
      ({
        kind,
        label,
        binary: "claude",
        capabilities,
        detectInstall: vi.fn<AgentAdapter["detectInstall"]>(),
        buildLaunchArgv: vi.fn<AgentAdapter["buildLaunchArgv"]>(),
        buildResumeArgv: vi.fn<AgentAdapter["buildResumeArgv"]>(),
        createInitialSessionRef: vi.fn<AgentAdapter["createInitialSessionRef"]>(() => undefined),
      }) as unknown as AgentAdapter;
    const adapters = new Map<AgentAdapter["kind"], AgentAdapter>([
      ["claude", makeAdapter("claude", "Claude Code")],
      ["claude:personal", makeAdapter("claude:personal", "Claude Personal")],
      ["claude:work", makeAdapter("claude:work", "Claude Work")],
    ]);
    const refreshAgentStatuses = vi
      .fn<AgentStatusService["refreshAgentStatuses"]>()
      .mockResolvedValue({
        windows: [
          { ...status, kind: "claude", label: "Claude Code" },
          { ...status, kind: "claude:personal", label: "Claude Personal" },
          status,
          {
            ...status,
            kind: "codex",
            label: "Codex",
            executablePath: "/usr/local/bin/codex",
          },
        ],
        wsl: [],
        fromCache: false,
      });
    const listWslDistros = vi
      .fn<AgentStatusService["listWslDistros"]>()
      .mockResolvedValue(["Ubuntu"]);
    const agentStatusService = {
      refreshAgentStatuses,
      getAgentStatuses: vi.fn<AgentStatusService["getAgentStatuses"]>(),
      listWslDistros,
    } as unknown as AgentStatusService;
    const service = new AgentRegistryService({
      adapters,
      settingsPath: "/data/settings.json",
      baseDir: "/data",
      acpIconsDir: "/data/icons",
      sharedSettingsCache: {
        invalidate: vi.fn<SupervisorSharedSettingsCache["invalidate"]>(),
      } as unknown as SupervisorSharedSettingsCache,
      getAgentStatusService: () => agentStatusService,
      getActiveWslProjectDistros: () => ["Ubuntu"],
    });
    runUpdateCommandWithFallbackMock.mockResolvedValue({
      ok: true,
      strategy: "built-in",
      output: "updated",
    });

    await service.updateAgentBinary({ agentKind: "claude:work", envKind: "posix" });

    expect(refreshAgentStatuses).toHaveBeenNthCalledWith(2, {
      wslDistros: ["Ubuntu"],
      scope: {
        agentKinds: ["claude", "claude:personal", "claude:work"],
      },
    });
    expect(listWslDistros).not.toHaveBeenCalled();
  });

  it("tracks the installed version for built-in updaters that require verification", async () => {
    const status: AgentStatus = {
      kind: "qwen",
      label: "Qwen Code",
      installed: true,
      version: "0.21.0",
      executablePath: "C:\\Users\\test\\AppData\\Roaming\\npm\\qwen.cmd",
      authState: "authenticated",
      capabilities,
      envKind: "windows",
      update: {
        builtIn: { binary: "qwen", args: ["update"] },
        verifyBuiltInVersionChange: true,
        npm: "@qwen-code/qwen-code",
      },
    };
    const adapter = {
      kind: "qwen",
      label: "Qwen Code",
      capabilities,
      update: status.update,
      detectInstall: vi.fn<AgentAdapter["detectInstall"]>(),
      buildLaunchArgv: vi.fn<AgentAdapter["buildLaunchArgv"]>(),
      buildResumeArgv: vi.fn<AgentAdapter["buildResumeArgv"]>(),
      createInitialSessionRef: vi.fn<AgentAdapter["createInitialSessionRef"]>(() => undefined),
    } as unknown as AgentAdapter;
    const refreshAgentStatuses = vi
      .fn<AgentStatusService["refreshAgentStatuses"]>()
      .mockResolvedValueOnce({ windows: [status], wsl: [], fromCache: false })
      .mockResolvedValue({
        windows: [{ ...status, version: "0.21.2" }],
        wsl: [],
        fromCache: false,
      });
    const listWslDistros = vi
      .fn<AgentStatusService["listWslDistros"]>()
      .mockResolvedValue(["Ubuntu"]);
    const agentStatusService = {
      refreshAgentStatuses,
      getAgentStatuses: vi.fn<AgentStatusService["getAgentStatuses"]>(),
      listWslDistros,
    } as unknown as AgentStatusService;
    const service = new AgentRegistryService({
      adapters: new Map([["qwen", adapter]]),
      settingsPath: "C:\\data\\settings.json",
      baseDir: "C:\\data",
      acpIconsDir: "C:\\data\\icons",
      sharedSettingsCache: {
        invalidate: vi.fn<SupervisorSharedSettingsCache["invalidate"]>(),
      } as unknown as SupervisorSharedSettingsCache,
      getAgentStatusService: () => agentStatusService,
      getActiveWslProjectDistros: () => [],
    });
    detectProbeLocationMock.mockReturnValueOnce({
      kind: "windows",
      path: "C:\\Users\\test",
    });
    readDetectedVersionMock.mockResolvedValueOnce("0.21.0");
    runUpdateCommandWithFallbackMock.mockImplementationOnce(
      async (_adapter, _status, _envContext, options) => {
        expect(await options?.verifyBuiltInSuccess?.()).toBe(false);
        return { ok: true, strategy: "npm-global" };
      },
    );

    const result = await service.updateAgentBinary({ agentKind: "qwen", envKind: "windows" });

    expect(result).toEqual({ ok: true, strategy: "npm-global" });
    expect(runUpdateCommandWithFallbackMock).toHaveBeenCalledWith(
      adapter,
      status,
      { envKind: "windows", baseDir: "C:\\data" },
      { verifyBuiltInSuccess: expect.any(Function) },
    );
    expect(readDetectedVersionMock).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "windows" }),
      status.executablePath,
      ["--version"],
    );
    expect(refreshAgentStatuses).toHaveBeenCalledTimes(2);
    expect(refreshAgentStatuses).toHaveBeenNthCalledWith(2, {
      wslDistros: [],
      scope: { agentKinds: ["qwen"] },
    });
    expect(listWslDistros).not.toHaveBeenCalled();
  });
});

describe("AgentRegistryService.getLatestAgentVersion", () => {
  const adapter = {
    kind: "cursor",
    label: "Cursor",
    capabilities,
    detectInstall: vi.fn<AgentAdapter["detectInstall"]>(),
    buildLaunchArgv: vi.fn<AgentAdapter["buildLaunchArgv"]>(),
    buildResumeArgv: vi.fn<AgentAdapter["buildResumeArgv"]>(),
    createInitialSessionRef: vi.fn<AgentAdapter["createInitialSessionRef"]>(() => undefined),
  } as unknown as AgentAdapter;

  function makeService(): AgentRegistryService {
    return new AgentRegistryService({
      adapters: new Map([["cursor", adapter]]),
      settingsPath: "/data/settings.json",
      baseDir: "/data",
      acpIconsDir: "/data/icons",
      sharedSettingsCache: {
        invalidate: vi.fn<SupervisorSharedSettingsCache["invalidate"]>(),
      } as unknown as SupervisorSharedSettingsCache,
      getAgentStatusService: () => ({}) as unknown as AgentStatusService,
      getActiveWslProjectDistros: () => [],
    });
  }

  it("probes the requested npm package window instead of the agent's own channel", async () => {
    getLatestSupportedNpmPackageVersionMock.mockReset().mockResolvedValue({
      version: "1.0.31",
      source: "npm",
    });
    getLatestVersionForAdapterMock.mockReset();

    const result = await makeService().getLatestAgentVersion({
      agentKind: "cursor",
      npmPackage: { name: "@cursor/sdk", minVersion: "1.0.24", maxExclusiveMajor: 2 },
    });

    expect(result).toEqual({ version: "1.0.31", source: "npm" });
    expect(getLatestSupportedNpmPackageVersionMock).toHaveBeenCalledWith({
      name: "@cursor/sdk",
      minVersion: "1.0.24",
      maxExclusiveMajor: 2,
    });
    expect(getLatestVersionForAdapterMock).not.toHaveBeenCalled();
  });

  it("keeps the per-agentKind probe when no npm package is requested", async () => {
    getLatestSupportedNpmPackageVersionMock.mockReset();
    getLatestVersionForAdapterMock
      .mockReset()
      .mockResolvedValue({ version: "2026.07.23", source: "homebrew-cask" });

    const result = await makeService().getLatestAgentVersion({ agentKind: "cursor" });

    expect(result).toEqual({ version: "2026.07.23", source: "homebrew-cask" });
    expect(getLatestVersionForAdapterMock).toHaveBeenCalledWith(adapter);
    expect(getLatestSupportedNpmPackageVersionMock).not.toHaveBeenCalled();
  });
});

describe("AgentRegistryService project-scoped ACP refreshes", () => {
  const settings = {
    ...defaultSharedSettings,
    agentInstances: {
      demo: {
        id: "demo",
        driver: "acp-generic",
        displayName: "Demo",
        enabled: true,
        config: { binary: "demo", cwd: "project", authMode: "none" },
      },
    },
    acpRegistryInstalledAgents: {},
  } satisfies ReturnType<typeof import("../agents/acpRegistry").readAcpRegistrySettings>;

  function createService(activeWslDistros: string[]) {
    const refreshAgentStatuses = vi
      .fn<AgentStatusService["refreshAgentStatuses"]>()
      .mockResolvedValue({ windows: [], wsl: [], fromCache: false });
    const listWslDistros = vi
      .fn<AgentStatusService["listWslDistros"]>()
      .mockResolvedValue(["Ubuntu"]);
    const agentStatusService = {
      refreshAgentStatuses,
      listWslDistros,
    } as unknown as AgentStatusService;
    const service = new AgentRegistryService({
      adapters: new Map(),
      settingsPath: "/data/settings.json",
      baseDir: "/data",
      acpIconsDir: "/data/icons",
      sharedSettingsCache: {
        invalidate: vi.fn<SupervisorSharedSettingsCache["invalidate"]>(),
      } as unknown as SupervisorSharedSettingsCache,
      getAgentStatusService: () => agentStatusService,
      getActiveWslProjectDistros: () => activeWslDistros,
    });
    return { listWslDistros, refreshAgentStatuses, service };
  }

  it("does not enumerate WSL during launch icon propagation without a WSL project", async () => {
    acpRegistryMocks.cacheLocalAcpRegistryIcons.mockReset().mockResolvedValue(true);
    acpRegistryMocks.readAcpRegistrySettings.mockReset().mockReturnValue(settings);
    const { listWslDistros, refreshAgentStatuses, service } = createService([]);

    await service.cacheLocalAcpIconsOnLaunch();

    expect(refreshAgentStatuses).toHaveBeenCalledExactlyOnceWith({
      wslDistros: [],
      scope: { agentKinds: ["acp-generic:demo"] },
    });
    expect(listWslDistros).not.toHaveBeenCalled();
  });

  it("does not enumerate WSL after an ACP install without a WSL project", async () => {
    acpRegistryMocks.installAcpRegistryAgent.mockReset().mockResolvedValue([]);
    acpRegistryMocks.readAcpRegistrySettings.mockReset().mockReturnValue(settings);
    const { listWslDistros, refreshAgentStatuses, service } = createService([]);

    await service.installAcpRegistryAgent({ agentId: "demo" });

    expect(refreshAgentStatuses).toHaveBeenCalledExactlyOnceWith({
      wslDistros: [],
      scope: { agentKinds: ["acp-generic:demo"] },
    });
    expect(listWslDistros).not.toHaveBeenCalled();
  });
});

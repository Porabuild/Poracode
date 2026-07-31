import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus } from "@/shared/contracts";
import type { SupervisorEvent } from "@/shared/ipc";
import { encryptSecret } from "@/shared/secretStorage";
import type { AgentAdapter } from "../agents/base";

vi.mock("../agents/base", async (importActual) => {
  const actual = await importActual<typeof import("../agents/base")>();
  return {
    ...actual,
    primeExecutablePathCache: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    invalidateExecutablePathCache: vi.fn<() => void>(),
  };
});

import { invalidateExecutablePathCache } from "../agents/base";
import { AgentStatusService, parseWslRegistryDistributionNames } from "./agentStatusService";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "poracode-agent-status-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

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

function makeStatus(): AgentStatus {
  return {
    kind: "codex",
    label: "Codex",
    installed: true,
    authState: "authenticated",
    capabilities,
  };
}

function makeAdapter(
  kind: string,
  label: string,
  detectInstall: AgentAdapter["detectInstall"],
): AgentAdapter {
  return {
    kind,
    label,
    capabilities,
    detectInstall,
    buildLaunchArgv: vi.fn<AgentAdapter["buildLaunchArgv"]>(),
    buildResumeArgv: vi.fn<AgentAdapter["buildResumeArgv"]>(),
    createInitialSessionRef: vi.fn<AgentAdapter["createInitialSessionRef"]>(() => undefined),
  } as unknown as AgentAdapter;
}

function makeService(detectInstall: AgentAdapter["detectInstall"]): {
  service: AgentStatusService;
  statusCachePath: string;
} {
  const dir = makeTempDir();
  const statusCachePath = join(dir, "agent-statuses.json");
  const adapter = makeAdapter("codex", "Codex", detectInstall);

  return {
    service: new AgentStatusService({
      adapters: new Map([["codex", adapter]]),
      settingsPath: join(dir, "settings.json"),
      statusCachePath,
      emit: vi.fn<(event: SupervisorEvent) => void>(),
    }),
    statusCachePath,
  };
}

function makeMultiAdapterService(adapters: AgentAdapter[]): {
  service: AgentStatusService;
  statusCachePath: string;
  settingsPath: string;
  emit: ReturnType<typeof vi.fn<(event: SupervisorEvent) => void>>;
} {
  const dir = makeTempDir();
  const statusCachePath = join(dir, "agent-statuses.json");
  const settingsPath = join(dir, "settings.json");
  const emit = vi.fn<(event: SupervisorEvent) => void>();
  const service = new AgentStatusService({
    adapters: new Map(adapters.map((a) => [a.kind, a])),
    settingsPath,
    statusCachePath,
    emit,
  });
  return { service, statusCachePath, settingsPath, emit };
}

describe("AgentStatusService", () => {
  it("parses WSL distro names from the Lxss registry output", () => {
    expect(
      parseWslRegistryDistributionNames(`
HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Lxss\\{111}
    DistributionName    REG_SZ    Ubuntu

HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Lxss\\{222}
    DistributionName    REG_SZ    Debian

HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Lxss\\{333}
    DistributionName    REG_SZ    Ubuntu
`),
    ).toEqual(["Ubuntu", "Debian"]);
  });

  it("runs automatic startup detection only once across status reads", async () => {
    const detectInstall = vi.fn<AgentAdapter["detectInstall"]>().mockResolvedValue(makeStatus());
    const { service, statusCachePath } = makeService(detectInstall);

    const first = await service.getAgentStatuses({ wslDistros: [] });

    expect(first.fromCache).toBe(false);
    await vi.waitFor(() => {
      expect(detectInstall).toHaveBeenCalledTimes(1);
      expect(existsSync(statusCachePath)).toBe(true);
    });

    const second = await service.getAgentStatuses({ wslDistros: [] });
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(second.fromCache).toBe(true);
    expect(detectInstall).toHaveBeenCalledTimes(1);
  });

  it("distinguishes a missing status cache from a cached unavailable provider", async () => {
    const detectInstall = vi
      .fn<AgentAdapter["detectInstall"]>()
      .mockResolvedValue({ ...makeStatus(), authState: "missing" });
    const { service } = makeService(detectInstall);

    expect(service.getCachedCapabilities("codex")).toBeUndefined();
    await service.refreshAgentStatuses({ wslDistros: [] });
    expect(service.getCachedCapabilities("codex")).toBeNull();
  });

  it("runs startup detection again when a new WSL distro is requested", async () => {
    const detectInstall = vi.fn<AgentAdapter["detectInstall"]>().mockResolvedValue(makeStatus());
    const adapter = makeAdapter("codex", "Codex", detectInstall);
    const { service, emit } = makeMultiAdapterService([adapter]);

    await service.getAgentStatuses({ wslDistros: [] });
    await vi.waitFor(() => {
      expect(detectInstall).toHaveBeenCalledTimes(1);
    });

    await service.getAgentStatuses({ wslDistros: ["Ubuntu"] });

    await vi.waitFor(() => {
      expect(detectInstall).toHaveBeenCalledTimes(3);
    });
    const detected = emit.mock.calls
      .map(([event]) => event)
      .filter((event) => event.type === "agent-detected")
      .map((event) => event.status);
    expect(detected).toContainEqual(
      expect.objectContaining({ kind: "codex", envKind: "wsl", envDistro: "Ubuntu" }),
    );
  });

  it("keeps explicit refresh able to probe again", async () => {
    const detectInstall = vi.fn<AgentAdapter["detectInstall"]>().mockResolvedValue(makeStatus());
    const { service } = makeService(detectInstall);

    await service.getAgentStatuses({ wslDistros: [] });
    await vi.waitFor(() => {
      expect(detectInstall).toHaveBeenCalledTimes(1);
    });

    await service.refreshAgentStatuses({ wslDistros: [] });

    expect(detectInstall).toHaveBeenCalledTimes(2);
  });

  it("busts the binary-path cache on explicit refresh but not on passive reads", async () => {
    const detectInstall = vi.fn<AgentAdapter["detectInstall"]>().mockResolvedValue(makeStatus());
    const { service } = makeService(detectInstall);
    vi.mocked(invalidateExecutablePathCache).mockClear();

    // Passive read must keep serving from the TTL cache — no invalidation.
    await service.getAgentStatuses({ wslDistros: [] });
    expect(invalidateExecutablePathCache).not.toHaveBeenCalled();

    // Explicit full refresh re-reads PATH (e.g. after an install adds a binary).
    await service.refreshAgentStatuses({ wslDistros: [] });
    expect(invalidateExecutablePathCache).toHaveBeenCalledTimes(1);

    // Scoped refresh (the post-install path) must invalidate too.
    await service.refreshAgentStatuses({ wslDistros: [], scope: { agentKinds: ["codex"] } });
    expect(invalidateExecutablePathCache).toHaveBeenCalledTimes(2);
  });

  it("does not auto-probe after an explicit refresh already ran", async () => {
    const detectInstall = vi.fn<AgentAdapter["detectInstall"]>().mockResolvedValue(makeStatus());
    const { service } = makeService(detectInstall);

    await service.refreshAgentStatuses({ wslDistros: [] });
    await service.getAgentStatuses({ wslDistros: [] });
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(detectInstall).toHaveBeenCalledTimes(1);
  });

  it("exposes cached native and WSL versions for projection compatibility checks", async () => {
    const detectInstall = vi
      .fn<AgentAdapter["detectInstall"]>()
      .mockResolvedValue({ ...makeStatus(), version: "2.1.203" });
    const { service } = makeService(detectInstall);

    expect(service.getCachedVersion("codex")).toBeUndefined();
    await service.refreshAgentStatuses({ wslDistros: ["Ubuntu"] });

    expect(service.getCachedVersion("codex")).toBe("2.1.203");
    expect(service.getCachedVersion("codex", "Ubuntu")).toBe("2.1.203");
  });

  it("scoped refresh probes only the requested adapter and merges into the cache", async () => {
    const codexStatus: AgentStatus = { ...makeStatus(), kind: "codex", label: "Codex" };
    const claudeStatus: AgentStatus = { ...makeStatus(), kind: "claude", label: "Claude" };
    const codexDetect = vi.fn<AgentAdapter["detectInstall"]>().mockResolvedValue(codexStatus);
    const claudeDetect = vi.fn<AgentAdapter["detectInstall"]>().mockResolvedValue(claudeStatus);
    const codexAdapter = makeAdapter("codex", "Codex", codexDetect);
    const claudeAdapter = makeAdapter("claude", "Claude", claudeDetect);
    const { service, emit } = makeMultiAdapterService([codexAdapter, claudeAdapter]);

    // Seed the cache with a baseline full detection.
    await service.refreshAgentStatuses({ wslDistros: [] });
    expect(codexDetect).toHaveBeenCalledTimes(1);
    expect(claudeDetect).toHaveBeenCalledTimes(1);
    emit.mockClear();

    // Updated codex status — only codex should be re-probed.
    codexDetect.mockResolvedValueOnce({
      ...codexStatus,
      authState: "missing",
      loginCommand: "codex login",
    });

    const response = await service.refreshAgentStatuses({
      wslDistros: [],
      scope: { agentKinds: ["codex"] },
    });

    expect(codexDetect).toHaveBeenCalledTimes(2);
    expect(claudeDetect).toHaveBeenCalledTimes(1);

    const all = [...response.windows, ...response.wsl];
    const merged = all.find((s) => s.kind === "codex");
    expect(merged?.authState).toBe("missing");
    expect(merged?.loginCommand).toBe("codex login");
    expect(all.some((s) => s.kind === "claude")).toBe(true);

    // Scoped path streams a per-status update event, not the terminal lists.
    const updates = emit.mock.calls.filter(([e]) => e.type === "agent-status-updated");
    expect(updates).toHaveLength(1);
    const terminal = emit.mock.calls.filter(
      ([e]) => e.type === "windows-agent-statuses" || e.type === "wsl-agent-statuses",
    );
    expect(terminal).toHaveLength(0);
  });

  it("streams WSL agent detection events during full detection", async () => {
    const detectInstall = vi.fn<AgentAdapter["detectInstall"]>().mockResolvedValue(makeStatus());
    const adapter = makeAdapter("codex", "Codex", detectInstall);
    const { service, emit } = makeMultiAdapterService([adapter]);

    await service.refreshAgentStatuses({ wslDistros: ["Ubuntu"] });

    const detected = emit.mock.calls
      .map(([event]) => event)
      .filter((event) => event.type === "agent-detected")
      .map((event) => event.status);
    expect(detected).toContainEqual(
      expect.objectContaining({ kind: "codex", envKind: "wsl", envDistro: "Ubuntu" }),
    );
  });

  it("passes provider settings to native, WSL, and scoped detection", async () => {
    const detectInstall = vi.fn<AgentAdapter["detectInstall"]>().mockResolvedValue(makeStatus());
    const adapter = makeAdapter("cursor", "Cursor", detectInstall);
    const { service, settingsPath } = makeMultiAdapterService([adapter]);
    const initialSettings = {
      structuredRuntime: "sdk",
      sdkApiKey: "sdk-key",
    };
    const storedInitialSettings = {
      ...initialSettings,
      sdkApiKey: encryptSecret(dirname(settingsPath), initialSettings.sdkApiKey),
    };
    writeFileSync(
      settingsPath,
      JSON.stringify({ agentSettings: { cursor: storedInitialSettings } }),
      "utf8",
    );

    await service.refreshAgentStatuses({ wslDistros: ["Ubuntu"] });

    expect(detectInstall).toHaveBeenCalledWith({
      envKind: process.platform === "win32" ? "windows" : "posix",
      agentSettings: initialSettings,
    });
    expect(detectInstall).toHaveBeenCalledWith({
      envKind: "wsl",
      wslDistro: "Ubuntu",
      agentSettings: initialSettings,
    });

    const updatedSettings = {
      structuredRuntime: "acp",
      sdkApiKey: "updated-sdk-key",
    };
    const storedUpdatedSettings = {
      ...updatedSettings,
      sdkApiKey: encryptSecret(dirname(settingsPath), updatedSettings.sdkApiKey),
    };
    writeFileSync(
      settingsPath,
      JSON.stringify({ agentSettings: { cursor: storedUpdatedSettings } }),
      "utf8",
    );
    detectInstall.mockClear();

    await service.refreshAgentStatuses({
      wslDistros: ["Ubuntu"],
      scope: { agentKinds: ["cursor"], envs: [{ kind: "wsl", distro: "Ubuntu" }] },
    });

    expect(detectInstall).toHaveBeenCalledExactlyOnceWith({
      envKind: "wsl",
      wslDistro: "Ubuntu",
      agentSettings: updatedSettings,
    });
  });
});

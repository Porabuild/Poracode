import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  agentStatusSchema,
  type AgentStatusesResponse,
  type RefreshAgentScope,
} from "@/shared/contracts";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";

const bridge = vi.hoisted(() => ({
  refreshAgentStatuses:
    vi.fn<(distros: string[], scope?: RefreshAgentScope) => Promise<AgentStatusesResponse>>(),
  cancelAgentDiscovery: vi.fn<() => Promise<AgentStatusesResponse>>(),
}));
vi.mock("@/renderer/bridge", () => ({ readBridge: () => bridge }));
import {
  cancelAgentDiscovery,
  refreshAgentDiscovery,
  refreshDiscoveredAgent,
} from "./agentDiscoveryActions";
const empty = { windows: [], wsl: [], fromCache: false };
function deferred() {
  let resolve!: (response: AgentStatusesResponse) => void;
  const promise = new Promise<AgentStatusesResponse>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.useFakeTimers();
  useAgentStatusesStore.setState({
    agentStatuses: [],
    wslAgentStatuses: [],
    windowsLoaded: false,
    wslLoaded: false,
    inFirstLaunchDiscovery: false,
    discoveryScanning: false,
    discoveryAutoHideCancelled: false,
    discoveryScope: undefined,
    discoveredAgents: [],
    discoveryHidden: false,
  });
  bridge.refreshAgentStatuses.mockReset();
  bridge.cancelAgentDiscovery.mockReset().mockResolvedValue(empty);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("app-owned agent discovery", () => {
  it("hides without cancelling and keeps the finished scan's rows open behind the pill", async () => {
    const scan = deferred();
    bridge.refreshAgentStatuses.mockReturnValue(scan.promise);
    refreshAgentDiscovery(["Ubuntu"]);
    useAgentStatusesStore.getState().setDiscoveryHidden(true);
    expect(useAgentStatusesStore.getState().inFirstLaunchDiscovery).toBe(true);
    expect(bridge.cancelAgentDiscovery).not.toHaveBeenCalled();
    scan.resolve(empty);
    await vi.advanceTimersByTimeAsync(0);
    expect(useAgentStatusesStore.getState().windowsLoaded).toBe(true);
    expect(useAgentStatusesStore.getState().discoveryHidden).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    // Completion ends the scan phase but no longer dismisses the session.
    expect(useAgentStatusesStore.getState().discoveryScanning).toBe(false);
    expect(useAgentStatusesStore.getState().inFirstLaunchDiscovery).toBe(true);
  });
  it("cancels the supervisor scan and ignores its late refresh result", async () => {
    const scan = deferred();
    bridge.refreshAgentStatuses.mockReturnValue(scan.promise);
    refreshAgentDiscovery([]);
    cancelAgentDiscovery();
    expect(bridge.cancelAgentDiscovery).toHaveBeenCalledOnce();
    expect(useAgentStatusesStore.getState().inFirstLaunchDiscovery).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    useAgentStatusesStore.setState({ windowsLoaded: false });
    scan.resolve(empty);
    await vi.advanceTimersByTimeAsync(1100);
    expect(useAgentStatusesStore.getState().windowsLoaded).toBe(false);
  });
  it("restores known agents on cancel and merges accepted partial results", async () => {
    const known = agentStatusSchema.parse({
      kind: "acp-generic:known",
      label: "Known agent",
      installed: true,
      authState: "authenticated",
      capabilities: {},
    });
    const found = { ...known, kind: "acp-generic:found", label: "Found agent" };
    const cancellation = deferred();
    useAgentStatusesStore.setState({ agentStatuses: [known], windowsLoaded: true });
    bridge.refreshAgentStatuses.mockReturnValue(new Promise(() => {}));
    bridge.cancelAgentDiscovery.mockReturnValue(cancellation.promise);
    refreshAgentDiscovery([]);
    // A full sweep can publish an empty list before the remaining probes settle.
    useAgentStatusesStore.setState({ agentStatuses: [] });
    cancelAgentDiscovery();
    expect(useAgentStatusesStore.getState().agentStatuses).toEqual([known]);
    expect(useAgentStatusesStore.getState().windowsLoaded).toBe(true);
    cancellation.resolve({ ...empty, windows: [found] });
    await vi.advanceTimersByTimeAsync(0);
    expect(useAgentStatusesStore.getState().agentStatuses).toEqual([known, found]);
  });
  it("reopens a running hidden scan instead of starting a second refresh", () => {
    bridge.refreshAgentStatuses.mockReturnValue(new Promise(() => {}));
    refreshAgentDiscovery([]);
    useAgentStatusesStore.getState().setDiscoveryHidden(true);
    refreshAgentDiscovery([]);
    expect(bridge.refreshAgentStatuses).toHaveBeenCalledOnce();
    expect(useAgentStatusesStore.getState().discoveryHidden).toBe(false);
  });
  it("a late cancellation response cannot close a newer discovery", async () => {
    const cancellation = deferred();
    bridge.cancelAgentDiscovery.mockReturnValue(cancellation.promise);
    bridge.refreshAgentStatuses.mockReturnValue(new Promise(() => {}));
    refreshAgentDiscovery([]);
    cancelAgentDiscovery();
    refreshAgentDiscovery([]);
    cancellation.resolve(empty);
    await vi.advanceTimersByTimeAsync(0);
    expect(useAgentStatusesStore.getState().inFirstLaunchDiscovery).toBe(true);
  });

  it("re-probes one discovered agent scoped to its own kind and environment", async () => {
    bridge.refreshAgentStatuses.mockResolvedValue(empty);
    const wslStatus = agentStatusSchema.parse({
      kind: "codex",
      label: "Codex",
      installed: true,
      authState: "authenticated",
      capabilities: {},
      envKind: "wsl",
      envDistro: "Ubuntu",
    });
    await refreshDiscoveredAgent([wslStatus]);
    expect(bridge.refreshAgentStatuses).toHaveBeenCalledExactlyOnceWith(["Ubuntu"], {
      agentKinds: ["codex"],
      envs: [{ kind: "wsl", distro: "Ubuntu" }],
    });
    // The session is untouched — refreshed data arrives via streamed events.
    expect(useAgentStatusesStore.getState().inFirstLaunchDiscovery).toBe(false);

    bridge.refreshAgentStatuses.mockClear();
    const nativeStatus = agentStatusSchema.parse({
      kind: "claude",
      label: "Claude Code",
      installed: true,
      authState: "missing",
      capabilities: {},
    });
    await refreshDiscoveredAgent([nativeStatus]);
    expect(bridge.refreshAgentStatuses).toHaveBeenCalledExactlyOnceWith([], {
      agentKinds: ["claude"],
      envs: [{ kind: "native" }],
    });
  });

  it("re-probes every environment where the agent was found in one call", async () => {
    bridge.refreshAgentStatuses.mockResolvedValue(empty);
    const parse = (env?: { envKind: string; envDistro: string }) =>
      agentStatusSchema.parse({
        kind: "claude",
        label: "Claude Code",
        installed: true,
        authState: "authenticated",
        capabilities: {},
        ...env,
      });
    await refreshDiscoveredAgent([
      parse(),
      parse({ envKind: "wsl", envDistro: "Ubuntu" }),
      parse({ envKind: "wsl", envDistro: "Debian" }),
    ]);
    expect(bridge.refreshAgentStatuses).toHaveBeenCalledExactlyOnceWith(["Ubuntu", "Debian"], {
      agentKinds: ["claude"],
      envs: [
        { kind: "native" },
        { kind: "wsl", distro: "Ubuntu" },
        { kind: "wsl", distro: "Debian" },
      ],
    });
  });

  it("re-probes the base agent and its profiles from one card refresh", async () => {
    bridge.refreshAgentStatuses.mockResolvedValue(empty);
    const parse = (kind: string, label: string) =>
      agentStatusSchema.parse({
        kind,
        label,
        installed: true,
        authState: "authenticated",
        capabilities: {},
      });
    await refreshDiscoveredAgent(
      [
        parse("claude", "Claude Code"),
        parse("claude:qwen", "Claude Qwen"),
        parse("claude:qwen", "Claude Qwen"),
      ],
      "claude",
    );
    // Both kinds share the one environment, so one scoped call covers the
    // card exactly (and duplicate statuses collapse).
    expect(bridge.refreshAgentStatuses).toHaveBeenCalledExactlyOnceWith([], {
      agentKinds: ["claude", "claude:qwen"],
      envs: [{ kind: "native" }],
    });
  });

  it("keeps each kind paired with only the environments where it was found", async () => {
    bridge.refreshAgentStatuses.mockResolvedValue(empty);
    const base = agentStatusSchema.parse({
      kind: "claude",
      label: "Claude Code",
      installed: true,
      authState: "authenticated",
      capabilities: {},
    });
    const profileWsl = agentStatusSchema.parse({
      kind: "claude:qwen",
      label: "Claude Qwen",
      installed: true,
      authState: "authenticated",
      capabilities: {},
      envKind: "wsl",
      envDistro: "Ubuntu",
    });
    await refreshDiscoveredAgent([base, profileWsl], "claude");
    // No claude@Ubuntu or claude:qwen@native cross-product probes.
    expect(bridge.refreshAgentStatuses).toHaveBeenCalledTimes(2);
    expect(bridge.refreshAgentStatuses).toHaveBeenNthCalledWith(1, [], {
      agentKinds: ["claude"],
      envs: [{ kind: "native" }],
    });
    expect(bridge.refreshAgentStatuses).toHaveBeenNthCalledWith(2, ["Ubuntu"], {
      agentKinds: ["claude:qwen"],
      envs: [{ kind: "wsl", distro: "Ubuntu" }],
    });
  });

  it("re-probes the base kind a profile-only card presents", async () => {
    bridge.refreshAgentStatuses.mockResolvedValue(empty);
    const parse = (env?: { envKind: string; envDistro: string }) =>
      agentStatusSchema.parse({
        kind: "claude:qwen",
        label: "Claude Qwen",
        installed: true,
        authState: "authenticated",
        capabilities: {},
        ...env,
      });
    await refreshDiscoveredAgent(
      [parse(), parse({ envKind: "wsl", envDistro: "Ubuntu" })],
      "claude",
    );
    // The base kind joins every environment the profile was found in.
    expect(bridge.refreshAgentStatuses).toHaveBeenCalledExactlyOnceWith(["Ubuntu"], {
      agentKinds: ["claude:qwen", "claude"],
      envs: [{ kind: "native" }, { kind: "wsl", distro: "Ubuntu" }],
    });
  });

  it("batches kinds sharing environments even when another profile is elsewhere", async () => {
    bridge.refreshAgentStatuses.mockResolvedValue(empty);
    const base = agentStatusSchema.parse({
      kind: "claude",
      label: "Claude Code",
      installed: true,
      authState: "missing",
      capabilities: {},
    });
    await refreshDiscoveredAgent(
      [
        base,
        { ...base, kind: "claude:work", label: "Claude Work" },
        {
          ...base,
          kind: "claude:other",
          label: "Claude Other",
          envKind: "wsl",
          envDistro: "Ubuntu",
        },
      ],
      "claude",
    );
    expect(bridge.refreshAgentStatuses).toHaveBeenCalledTimes(2);
    expect(bridge.refreshAgentStatuses).toHaveBeenNthCalledWith(1, [], {
      agentKinds: ["claude", "claude:work"],
      envs: [{ kind: "native" }],
    });
    expect(bridge.refreshAgentStatuses).toHaveBeenNthCalledWith(2, ["Ubuntu"], {
      agentKinds: ["claude:other"],
      envs: [{ kind: "wsl", distro: "Ubuntu" }],
    });
  });

  it("adds a base whose discovery event was superseded by a profile-only refresh", async () => {
    const profile = agentStatusSchema.parse({
      kind: "claude:work",
      label: "Claude Work",
      installed: true,
      authState: "authenticated",
      capabilities: {},
      envKind: "wsl",
      envDistro: "Ubuntu",
    });
    const base = agentStatusSchema.parse({
      ...profile,
      kind: "claude",
      label: "Claude Code",
      authState: "missing",
    });
    const native = agentStatusSchema.parse({ ...base, envKind: "posix", envDistro: undefined });
    useAgentStatusesStore.getState().hydrateFromCache({ windows: [native], wsl: [] });
    useAgentStatusesStore.getState().beginFirstLaunchDiscovery({ kind: "wsl", distro: "Ubuntu" });
    useAgentStatusesStore.getState().pushDiscoveredAgent(profile);
    const scoped = deferred();
    bridge.refreshAgentStatuses.mockReturnValue(scoped.promise);
    const refreshing = refreshDiscoveredAgent([profile], "claude");
    // The newer scoped probe owns both targets, so the pending base discovery
    // event is suppressed. Its replacement update cannot append a scan row.
    useAgentStatusesStore.getState().mergeAgentStatus(base);
    expect(useAgentStatusesStore.getState().discoveredAgents).toEqual([profile]);
    const fresherProfile = { ...profile, version: "2.0.0" };
    useAgentStatusesStore.getState().mergeAgentStatus(fresherProfile);
    scoped.resolve({
      ...empty,
      windows: [native],
      wsl: [
        base,
        profile,
        { ...profile, kind: "codex", label: "Codex" },
        { ...base, envDistro: "Debian" },
      ],
    });
    await refreshing;
    expect(useAgentStatusesStore.getState().discoveredAgents).toEqual([fresherProfile, base]);
    expect(bridge.refreshAgentStatuses).toHaveBeenCalledExactlyOnceWith(["Ubuntu"], {
      agentKinds: ["claude:work", "claude"],
      envs: [{ kind: "wsl", distro: "Ubuntu" }],
    });
  });

  it.each([false, true])(
    "ignores late card results after cancellation (restart: %s)",
    async (restart) => {
      const profile = agentStatusSchema.parse({
        kind: "claude:work",
        label: "Claude Work",
        installed: true,
        authState: "authenticated",
        capabilities: {},
      });
      useAgentStatusesStore.getState().beginFirstLaunchDiscovery({ kind: "native" });
      useAgentStatusesStore.getState().pushDiscoveredAgent(profile);
      const scoped = deferred();
      bridge.refreshAgentStatuses.mockReturnValue(scoped.promise);
      const refreshing = refreshDiscoveredAgent([profile], "claude");
      cancelAgentDiscovery();
      if (restart) {
        useAgentStatusesStore.setState({ windowsLoaded: false });
        useAgentStatusesStore.getState().beginFirstLaunchDiscovery({ kind: "native" });
      }
      expect(useAgentStatusesStore.getState().inFirstLaunchDiscovery).toBe(restart);
      scoped.resolve({ ...empty, windows: [profile, { ...profile, kind: "claude" }] });
      await refreshing;
      expect(useAgentStatusesStore.getState().discoveredAgents).toEqual([]);
    },
  );

  it("continues with later kinds when one scoped refresh fails", async () => {
    bridge.refreshAgentStatuses
      .mockRejectedValueOnce(new Error("supervisor gone"))
      .mockResolvedValue(empty);
    const base = agentStatusSchema.parse({
      kind: "claude",
      label: "Claude Code",
      installed: true,
      authState: "authenticated",
      capabilities: {},
    });
    const profileWsl = agentStatusSchema.parse({
      kind: "claude:qwen",
      label: "Claude Qwen",
      installed: true,
      authState: "authenticated",
      capabilities: {},
      envKind: "wsl",
      envDistro: "Ubuntu",
    });
    await expect(refreshDiscoveredAgent([base, profileWsl], "claude")).resolves.toBeUndefined();
    expect(bridge.refreshAgentStatuses).toHaveBeenCalledTimes(2);
  });

  it("swallows a failed refresh (the card simply stays as it was)", async () => {
    bridge.refreshAgentStatuses.mockRejectedValue(new Error("supervisor gone"));
    const status = agentStatusSchema.parse({
      kind: "codex",
      label: "Codex",
      installed: true,
      authState: "authenticated",
      capabilities: {},
    });
    await expect(refreshDiscoveredAgent([status])).resolves.toBeUndefined();
  });

  it("ignores a refresh with no statuses", async () => {
    await refreshDiscoveredAgent([]);
    expect(bridge.refreshAgentStatuses).not.toHaveBeenCalled();
  });
});

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
    await refreshDiscoveredAgent(wslStatus);
    expect(bridge.refreshAgentStatuses).toHaveBeenCalledExactlyOnceWith([], {
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
    await refreshDiscoveredAgent(nativeStatus);
    expect(bridge.refreshAgentStatuses).toHaveBeenCalledExactlyOnceWith([], {
      agentKinds: ["claude"],
      envs: [{ kind: "native" }],
    });
  });

  it("swallows a failed per-row refresh (the row simply stays as it was)", async () => {
    bridge.refreshAgentStatuses.mockRejectedValue(new Error("supervisor gone"));
    const status = agentStatusSchema.parse({
      kind: "codex",
      label: "Codex",
      installed: true,
      authState: "authenticated",
      capabilities: {},
    });
    await expect(refreshDiscoveredAgent(status)).resolves.toBeUndefined();
  });
});

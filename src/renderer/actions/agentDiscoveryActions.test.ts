import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { agentStatusSchema, type AgentStatusesResponse } from "@/shared/contracts";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";

const bridge = vi.hoisted(() => ({
  refreshAgentStatuses: vi.fn<(distros: string[]) => Promise<AgentStatusesResponse>>(),
  cancelAgentDiscovery: vi.fn<() => Promise<AgentStatusesResponse>>(),
}));
vi.mock("@/renderer/bridge", () => ({ readBridge: () => bridge }));
import { cancelAgentDiscovery, refreshAgentDiscovery } from "./agentDiscoveryActions";
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
  it("hides without cancelling and accepts the result while the artwork is hidden", async () => {
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
    expect(useAgentStatusesStore.getState().inFirstLaunchDiscovery).toBe(false);
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
});

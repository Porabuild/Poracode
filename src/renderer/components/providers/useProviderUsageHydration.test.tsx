import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderUsageResponse, UsageSnapshot } from "@/shared/contracts";
import type { ManagedLoopbackActivationSnapshot } from "@/renderer/hostTransport/loopbackHttpWsTransport";
import { useProviderUsageStore } from "@/renderer/state/providerUsageStore";
import { useProviderUsageHydration } from "./useProviderUsageHydration";

const mocks = vi.hoisted(() => ({
  getProviderUsage: vi.fn<(payload: object) => Promise<ProviderUsageResponse>>(),
  transport: "electron-backend-host",
  activation: null as ManagedLoopbackActivationSnapshot | null,
  listeners: new Set<() => void>(),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({ getProviderUsage: mocks.getProviderUsage }),
}));
vi.mock("@/renderer/clientRuntime", () => ({
  readClientRuntime: () => ({ transport: mocks.transport }),
}));
vi.mock("@/renderer/hostTransport/loopbackHttpWsTransport", () => ({
  readManagedLoopbackActivation: () => mocks.activation,
  subscribeManagedLoopbackActivation: (listener: () => void) => {
    mocks.listeners.add(listener);
    return () => mocks.listeners.delete(listener);
  },
}));

function activation(seq: number): ManagedLoopbackActivationSnapshot {
  return {
    seq,
    endpoint: "http://localhost/",
    client: {} as ManagedLoopbackActivationSnapshot["client"],
    authority: `activation-${seq}`,
  };
}

function publish(next: ManagedLoopbackActivationSnapshot | null): void {
  mocks.activation = next;
  for (const listener of mocks.listeners) listener();
}

function snapshot(fetchedAt = 1): UsageSnapshot {
  return {
    providerId: "fixture",
    status: "ok",
    windows: [{ id: "weekly", label: "Weekly", usedPercent: fetchedAt * 10 }],
    fetchedAt,
  };
}

function deferredRead() {
  let resolve!: (response: ProviderUsageResponse) => void;
  const promise = new Promise<ProviderUsageResponse>((done) => {
    resolve = done;
  });
  mocks.getProviderUsage.mockReturnValueOnce(promise);
  return resolve;
}

describe("sidebar usage hydration", () => {
  beforeEach(() => {
    mocks.transport = "electron-backend-host";
    mocks.activation = null;
    mocks.getProviderUsage.mockReset();
    mocks.getProviderUsage.mockResolvedValue({ snapshots: [snapshot()], fromCache: true });
    useProviderUsageStore.setState({ snapshots: {} });
  });
  afterEach(cleanup);

  it("loads usage when the desktop host becomes ready without opening the usage panel", async () => {
    renderHook(() => useProviderUsageHydration());
    expect(mocks.getProviderUsage).not.toHaveBeenCalled();
    await act(async () => publish(activation(1)));
    expect(mocks.getProviderUsage).toHaveBeenCalledExactlyOnceWith({});
    expect(useProviderUsageStore.getState().snapshots.fixture).toEqual(snapshot());
  });

  it("hydrates immediately when the host was ready before the sidebar mounted", async () => {
    mocks.activation = activation(1);
    await act(async () => {
      renderHook(() => useProviderUsageHydration());
    });
    expect(mocks.getProviderUsage).toHaveBeenCalledExactlyOnceWith({});
    expect(useProviderUsageStore.getState().snapshots.fixture).toEqual(snapshot());
  });

  it("reloads on reconnect and rejects a reply from a retired connection", async () => {
    mocks.activation = activation(1);
    const resolveOld = deferredRead();
    renderHook(() => useProviderUsageHydration());
    await act(async () => publish(null));
    expect(mocks.getProviderUsage).toHaveBeenCalledTimes(1);
    mocks.getProviderUsage.mockResolvedValue({ snapshots: [snapshot(2)], fromCache: true });
    await act(async () => publish(activation(2)));
    expect(mocks.getProviderUsage).toHaveBeenCalledTimes(2);
    await act(async () => resolveOld({ snapshots: [snapshot(3)], fromCache: true }));
    expect(useProviderUsageStore.getState().snapshots.fixture).toEqual(snapshot(2));
  });

  it("preserves newer streamed usage when a cached read completes later", async () => {
    mocks.activation = activation(1);
    const resolve = deferredRead();
    renderHook(() => useProviderUsageHydration());
    useProviderUsageStore.getState().mergeSnapshot(snapshot(2));
    await act(async () => resolve({ snapshots: [snapshot()], fromCache: true }));
    expect(useProviderUsageStore.getState().snapshots.fixture).toEqual(snapshot(2));
  });

  it("ignores pending replies after unmount and releases the readiness subscription", async () => {
    mocks.activation = activation(1);
    const resolve = deferredRead();
    const { unmount } = renderHook(() => useProviderUsageHydration());
    unmount();
    await act(async () => resolve({ snapshots: [snapshot()], fromCache: true }));
    expect(useProviderUsageStore.getState().snapshots).toEqual({});
    expect(mocks.listeners.size).toBe(0);
  });

  it("keeps remote-session cache hydration independent of the managed desktop connection", async () => {
    mocks.transport = "remote-http-websocket";
    await act(async () => {
      renderHook(() => useProviderUsageHydration());
    });
    expect(mocks.getProviderUsage).toHaveBeenCalledExactlyOnceWith({});
    expect(useProviderUsageStore.getState().snapshots.fixture).toEqual(snapshot());
  });

  it("retries a failed read on the next connection activation", async () => {
    mocks.activation = activation(1);
    mocks.getProviderUsage.mockRejectedValueOnce(new Error("Host restarting"));
    await act(async () => {
      renderHook(() => useProviderUsageHydration());
    });
    expect(useProviderUsageStore.getState().snapshots).toEqual({});
    await act(async () => publish(activation(2)));
    expect(mocks.getProviderUsage).toHaveBeenCalledTimes(2);
    expect(useProviderUsageStore.getState().snapshots.fixture).toEqual(snapshot());
  });
});

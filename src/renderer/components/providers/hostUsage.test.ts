import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UsageSnapshot } from "@/shared/contracts";
import type { RemoteServersState, RemoteServerRecord } from "@/renderer/state/remoteServers/types";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useHostUsageStore } from "@/renderer/state/hostUsageStore";
import { useProviderUsageStore } from "@/renderer/state/providerUsageStore";
import { fetchHostUsage } from "./hostUsage";

const fence = vi.hoisted(() => ({ generation: 0 }));
vi.mock("@/renderer/state/remoteServers/eventSocketRegistry", () => ({
  currentRemoteServerGeneration: () => fence.generation,
}));
vi.mock("@/renderer/state/remoteServersStore", async () => {
  const { create } = await import("zustand");
  return {
    useRemoteServersStore: create(() => ({
      servers: [],
      runtime: {},
      withClient: vi.fn<RemoteServersState["withClient"]>(),
    })),
  };
});

function snapshot(account: string, providerId = "provider"): UsageSnapshot {
  return { providerId, authenticatedAs: account, status: "ok", windows: [], fetchedAt: 100 };
}
function server(id: string): RemoteServerRecord {
  return {
    desktopId: id,
    connectionId: id,
    label: id,
    endpoint: `https://${id}.test`,
    accessToken: "fixture",
    scopes: ["session:read", "session:operate"],
  };
}
const callRemoteProcedure = vi.fn<(procedure: string, payload: unknown) => Promise<unknown>>();
const withClient: RemoteServersState["withClient"] = async (_id, invoke) =>
  invoke({ callRemoteProcedure } as never);

describe("host-owned provider usage", () => {
  beforeEach(() => {
    fence.generation = 0;
    callRemoteProcedure.mockReset();
    useRemoteServersStore.setState({
      servers: [server("a"), server("b")],
      runtime: {},
      withClient,
    });
    useHostUsageStore.setState({ hosts: {} });
    useProviderUsageStore.setState({ snapshots: {} });
  });

  it("keeps identical provider/profile IDs separate across hosts and the current host", async () => {
    useProviderUsageStore.getState().mergeSnapshot(snapshot("device"));
    callRemoteProcedure
      .mockResolvedValueOnce({ snapshots: [snapshot("alice")], fromCache: true })
      .mockResolvedValueOnce({ snapshots: [snapshot("bob")], fromCache: false });
    await fetchHostUsage("a");
    await fetchHostUsage("b", true, { force: true });
    expect(useHostUsageStore.getState().hosts.a?.snapshots[0]?.authenticatedAs).toBe("alice");
    expect(useHostUsageStore.getState().hosts.b?.snapshots[0]?.authenticatedAs).toBe("bob");
    expect(useProviderUsageStore.getState().snapshots.provider?.authenticatedAs).toBe("device");
  });

  it("preserves filters and force, and merges a single-provider reply without dropping siblings", async () => {
    callRemoteProcedure.mockResolvedValueOnce({
      snapshots: [snapshot("old"), snapshot("sibling", "other")],
      fromCache: true,
    });
    await fetchHostUsage("a");
    callRemoteProcedure.mockResolvedValueOnce({ snapshots: [snapshot("new")], fromCache: false });
    await fetchHostUsage("a", true, { providerIds: ["provider"], force: true });
    expect(callRemoteProcedure).toHaveBeenLastCalledWith("refreshProviderUsage", {
      providerIds: ["provider"],
      force: true,
    });
    expect(useHostUsageStore.getState().hosts.a?.snapshots.map((s) => s.authenticatedAs)).toEqual([
      "new",
      "sibling",
    ]);
  });

  it("does not let a late read replace a newer refresh", async () => {
    let resolve!: (value: unknown) => void;
    callRemoteProcedure.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const read = fetchHostUsage("a");
    callRemoteProcedure.mockResolvedValueOnce({ snapshots: [snapshot("fresh")], fromCache: false });
    await fetchHostUsage("a", true);
    resolve({ snapshots: [snapshot("old")], fromCache: true });
    await read;
    expect(useHostUsageStore.getState().hosts.a?.snapshots[0]?.authenticatedAs).toBe("fresh");
  });

  it.each(["remove", "replace", "generation"])(
    "fences a delayed result after %s",
    async (change) => {
      let resolve!: (value: unknown) => void;
      callRemoteProcedure.mockReturnValueOnce(
        new Promise((done) => {
          resolve = done;
        }),
      );
      const read = fetchHostUsage("a");
      if (change === "remove") useRemoteServersStore.setState({ servers: [] });
      if (change === "replace") useRemoteServersStore.setState({ servers: [server("a")] });
      if (change === "generation") {
        fence.generation++;
        useHostUsageStore.getState().invalidate("a");
      }
      resolve({ snapshots: [snapshot("retired")], fromCache: true });
      await read;
      expect(useHostUsageStore.getState().hosts.a?.snapshots ?? []).toEqual([]);
      expect(useHostUsageStore.getState().hosts.a?.pending ?? false).toBe(false);
    },
  );

  it("retains last-known usage on an auth/offline failure and recovers on retry", async () => {
    callRemoteProcedure.mockResolvedValueOnce({ snapshots: [snapshot("known")], fromCache: true });
    await fetchHostUsage("a");
    callRemoteProcedure.mockRejectedValueOnce(new Error("fixture denial"));
    await fetchHostUsage("a", true);
    expect(useHostUsageStore.getState().hosts.a).toMatchObject({ failed: true, pending: false });
    expect(useHostUsageStore.getState().hosts.a?.snapshots[0]?.authenticatedAs).toBe("known");
    callRemoteProcedure.mockResolvedValueOnce({
      snapshots: [snapshot("reconnected")],
      fromCache: false,
    });
    await fetchHostUsage("a");
    expect(useHostUsageStore.getState().hosts.a).toMatchObject({ failed: false, pending: false });
  });

  it("rejects malformed host data without discarding the previous snapshot", async () => {
    callRemoteProcedure.mockResolvedValue({
      snapshots: [{ providerId: "broken" }],
      fromCache: true,
    });
    await fetchHostUsage("a");
    expect(useHostUsageStore.getState().hosts.a).toMatchObject({
      snapshots: [],
      pending: false,
      failed: true,
    });
  });

  it("does not recreate a retired scope when its view cleanup invalidates it", async () => {
    callRemoteProcedure.mockResolvedValueOnce({ snapshots: [snapshot("known")], fromCache: true });
    await fetchHostUsage("a");
    useRemoteServersStore.setState({ servers: [] });
    useHostUsageStore.getState().invalidate("a");
    expect(Object.hasOwn(useHostUsageStore.getState().hosts, "a")).toBe(false);
  });
});

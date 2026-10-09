import { beforeEach, describe, expect, it, vi } from "vitest";
import { RemoteDesktopClient } from "@/shared/remote/client";
import { RemoteClientError } from "@/shared/remote/clientErrors";
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
const providerUsage = vi.fn<() => Promise<unknown>>();
const withClient: RemoteServersState["withClient"] = async (_id, invoke) =>
  invoke({ callRemoteProcedure, providerUsage } as never);

describe("host-owned provider usage", () => {
  beforeEach(() => {
    fence.generation = 0;
    callRemoteProcedure.mockReset();
    providerUsage.mockReset();
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
  it.each([
    [403, "git_procedure_not_allowed"],
    [404, "not_found"],
  ] as const)(
    "reads an old host through its same pinned legacy client on exact unsupported procedure %i",
    async (status, code) => {
      callRemoteProcedure.mockRejectedValueOnce(new RemoteClientError("unsupported", status, code));
      providerUsage.mockResolvedValueOnce({ snapshots: [snapshot("legacy")], fromCache: true });
      await fetchHostUsage("a");
      expect(providerUsage).toHaveBeenCalledOnce();
      expect(useHostUsageStore.getState().hosts.a?.snapshots[0]?.authenticatedAs).toBe("legacy");
      callRemoteProcedure.mockRejectedValueOnce(new RemoteClientError("unsupported", status, code));
      await fetchHostUsage("a", true, { force: true });
      expect(providerUsage).toHaveBeenCalledOnce();
      expect(useHostUsageStore.getState().hosts.a?.updateRequired).toBe(true);
    },
  );

  it.each([
    new RemoteClientError("scope", 403, "scope_denied"),
    new RemoteClientError("expired", 401, "unauthorized"),
    new RemoteClientError("transport", 0, "network"),
    new RemoteClientError("wrong unsupported pair", 404, "git_procedure_not_allowed"),
    new RemoteClientError("wrong not-found pair", 403, "not_found"),
    new Error("git_procedure_not_allowed"),
  ])(
    "never falls back on auth, scope, network, other codes or untyped failures (%s)",
    async (error) => {
      callRemoteProcedure.mockRejectedValueOnce(error);
      await fetchHostUsage("a");
      expect(providerUsage).not.toHaveBeenCalled();
      expect(useHostUsageStore.getState().hosts.a?.failed).toBe(true);
    },
  );

  it("never falls back for filtered reads, malformed replies, or refresh", async () => {
    const unsupported = new RemoteClientError("unsupported", 403, "git_procedure_not_allowed");
    callRemoteProcedure.mockRejectedValueOnce(unsupported);
    await fetchHostUsage("a", false, { providerIds: ["provider"] });
    callRemoteProcedure.mockResolvedValueOnce({ snapshots: "malformed", fromCache: true });
    await fetchHostUsage("a");
    callRemoteProcedure.mockRejectedValueOnce(unsupported);
    await fetchHostUsage("a", true, { force: true });
    expect(providerUsage).not.toHaveBeenCalled();
    expect(useHostUsageStore.getState().hosts.a).toMatchObject({
      updateRequired: true,
      refreshing: false,
    });
    callRemoteProcedure.mockResolvedValueOnce({ snapshots: [], fromCache: true });
    await fetchHostUsage("a");
    expect(useHostUsageStore.getState().hosts.a?.updateRequired).toBe(true);
    callRemoteProcedure.mockResolvedValueOnce({ snapshots: [], fromCache: false });
    await fetchHostUsage("a", true);
    expect(useHostUsageStore.getState().hosts.a?.updateRequired).toBe(false);
  });

  it("uses the selected child environment client for its legacy fallback", async () => {
    useRemoteServersStore.setState({
      servers: [
        {
          ...server("child"),
          transport: {
            kind: "environment",
            environmentId: "env",
            parentConnectionId: "a",
            childDesktopId: "child",
          },
        },
      ],
    });
    const parentLegacy = vi.fn<() => Promise<unknown>>();
    const pinnedChild = {
      callRemoteProcedure: vi
        .fn<(procedure: string, payload: unknown) => Promise<unknown>>()
        .mockRejectedValue(new RemoteClientError("unsupported", 403, "git_procedure_not_allowed")),
      providerUsage: vi
        .fn<() => Promise<unknown>>()
        .mockResolvedValue({ snapshots: [snapshot("child")], fromCache: true }),
    };
    const selected: string[] = [];
    useRemoteServersStore.setState({
      withClient: async (id, invoke) => {
        selected.push(id);
        return invoke((id === "child" ? pinnedChild : { providerUsage: parentLegacy }) as never);
      },
    });
    await fetchHostUsage("child");
    expect(selected).toEqual(["child"]);
    expect(pinnedChild.providerUsage).toHaveBeenCalledOnce();
    expect(parentLegacy).not.toHaveBeenCalled();
  });
  it("uses the legacy authenticated HTTP route on an old host, but never for a refresh", async () => {
    const requests: { url: string; authorization: string | null }[] = [];
    const client = new RemoteDesktopClient(
      "https://owned.test",
      "fixture-owned-token",
      async (url, init) => {
        requests.push({
          url: String(url),
          authorization: new Headers(init?.headers).get("authorization"),
        });
        return String(url).endsWith("/api/git/call")
          ? new Response(
              JSON.stringify({
                error: { code: "git_procedure_not_allowed", message: "Unsupported" },
              }),
              { status: 403, headers: { "content-type": "application/json" } },
            )
          : new Response(
              JSON.stringify({ snapshots: [snapshot("legacy-http")], fromCache: true }),
              { headers: { "content-type": "application/json" } },
            );
      },
    );
    useRemoteServersStore.setState({ withClient: async (_id, invoke) => invoke(client) });
    await fetchHostUsage("a");
    expect(requests.map((r) => r.url)).toEqual([
      "https://owned.test/api/git/call",
      "https://owned.test/api/provider-usage",
    ]);
    expect(requests.every((r) => r.authorization === "Bearer fixture-owned-token")).toBe(true);
    expect(useHostUsageStore.getState().hosts.a?.snapshots[0]?.authenticatedAs).toBe("legacy-http");
    await fetchHostUsage("a", true, { force: true });
    expect(requests.map((r) => r.url)).toEqual([
      "https://owned.test/api/git/call",
      "https://owned.test/api/provider-usage",
      "https://owned.test/api/git/call",
    ]);
    expect(useHostUsageStore.getState().hosts.a?.updateRequired).toBe(true);
  });
  it("does not issue a legacy fallback after the selected connection is retired", async () => {
    let reject!: (error: unknown) => void;
    callRemoteProcedure.mockReturnValueOnce(
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
    );
    const read = fetchHostUsage("a");
    useRemoteServersStore.setState({ servers: [] });
    reject(new RemoteClientError("unsupported", 403, "git_procedure_not_allowed"));
    await read;
    expect(providerUsage).not.toHaveBeenCalled();
    expect(Object.hasOwn(useHostUsageStore.getState().hosts, "a")).toBe(false);
  });
});

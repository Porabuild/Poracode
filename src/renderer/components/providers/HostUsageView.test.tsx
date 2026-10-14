import { act, cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RemoteDesktopClient } from "@/shared/remote/client";
import type { RemoteServersState } from "@/renderer/state/remoteServers/types";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { useHostUsageStore } from "@/renderer/state/hostUsageStore";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { HostUsageStatus, useHostUsageView } from "./HostUsageView";
import { UsageProviderCardView } from "./UsageProviderCardView";

// Only the connection inventory is a fixture. The lifecycle hook, fetchHostUsage,
// scoped store, RemoteDesktopClient and response codecs all run unmocked.
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
vi.mock("@/renderer/state/remoteServers/eventSocketRegistry", () => ({
  currentRemoteServerGeneration: () => 1,
}));
vi.mock("@dnd-kit/react/sortable", () => ({
  useSortable: () => ({ ref: () => {}, handleRef: () => {}, isDragging: false }),
}));

function View(props: { liveOnOpen?: boolean; refreshVersion?: number }) {
  const view = useHostUsageView("connection", props.refreshVersion, props.liveOnOpen);
  return (
    <>
      <HostUsageStatus view={view} />
      {view.usage.snapshots.map((snapshot, index) => (
        <UsageProviderCardView
          key={snapshot.providerId}
          id={snapshot.providerId}
          label={snapshot.providerId}
          snapshot={snapshot}
          index={index}
          compact
          collapsed={false}
          draggable={false}
          showAccount
          refreshing={view.usage.refreshing}
          onRefresh={() => {}}
          onToggleCollapse={() => {}}
        />
      ))}
    </>
  );
}

beforeEach(() => {
  useHostUsageStore.setState({ hosts: {} });
  useRemoteServersStore.setState({
    servers: [
      {
        desktopId: "host",
        connectionId: "connection",
        label: "Host",
        endpoint: "https://host.test",
        accessToken: "fixture",
        scopes: ["session:read", "session:operate"],
      },
    ],
    runtime: { connection: { status: "online", projects: [], threads: [] } },
  });
});
afterEach(cleanup);

function fixture(
  status = 403,
  code = "git_procedure_not_allowed",
  legacyFails = false,
  account = () => "legacy-fixture-account",
) {
  const requests: string[] = [];
  const client = new RemoteDesktopClient("https://host.test", "fixture", async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (path === "/api/git/call") {
      const body = JSON.parse(String(init?.body)) as { procedure: string };
      requests.push(body.procedure);
      return new Response(JSON.stringify({ error: { code, message: "Fixture refusal" } }), {
        status,
        headers: { "content-type": "application/json" },
      });
    }
    requests.push(path);
    return new Response(
      JSON.stringify(
        legacyFails
          ? { snapshots: "invalid" }
          : {
              snapshots: [
                {
                  providerId: "fixture-provider",
                  authenticatedAs: account(),
                  status: "ok",
                  windows: [],
                  fetchedAt: Date.now(),
                  credits: { balance: 23, label: "Fixture credits" },
                },
              ],
              fromCache: true,
            },
      ),
      { headers: { "content-type": "application/json" } },
    );
  });
  useRemoteServersStore.setState({ withClient: async (_id, invoke) => invoke(client) });
  return requests;
}

describe("host usage lifecycle with the real owning-host client", () => {
  it.each([{ liveOnOpen: true }, { refreshVersion: 3 }])(
    "loads legacy cache after unsupported refresh on open (%j)",
    async (trigger) => {
      const requests = fixture();
      const { rerender } = render(<View {...trigger} />);
      await screen.findByText("legacy-fixture-account");
      expect(screen.getByText("Fixture credits")).toBeTruthy();
      expect(screen.getByText(/Update this host to refresh usage remotely/)).toBeTruthy();
      expect(requests).toEqual(["refreshProviderUsage", "getProviderUsage", "/api/provider-usage"]);
      expect(useHostUsageStore.getState().hosts.connection).toMatchObject({
        lastReadRequest: useHostUsageStore.getState().hosts.connection?.request,
        updateRequired: true,
        pending: false,
      });
      rerender(<View {...trigger} />);
      await act(async () => {
        await Promise.resolve();
      });
      expect(requests).toHaveLength(3);
    },
  );

  it.each([{ liveOnOpen: true }, { refreshVersion: 3 }])(
    "reads changed legacy cache once on a new mount after an earlier successful read (%j)",
    async (trigger) => {
      let account = "cached-account-A";
      const requests = fixture(403, "git_procedure_not_allowed", false, () => account);
      const first = render(<View />);
      await screen.findByText("cached-account-A");
      expect(requests).toEqual(["getProviderUsage", "/api/provider-usage"]);
      first.unmount();
      expect(useHostUsageStore.getState().hosts.connection?.lastReadRequest).toBeGreaterThan(0);
      account = "cached-account-B";
      const second = render(<View {...trigger} />);
      await screen.findByText("cached-account-B");
      expect(screen.queryByText("cached-account-A")).toBeNull();
      expect(screen.getByText(/Update this host to refresh usage remotely/)).toBeTruthy();
      expect(requests).toEqual([
        "getProviderUsage",
        "/api/provider-usage",
        "refreshProviderUsage",
        "getProviderUsage",
        "/api/provider-usage",
      ]);
      second.rerender(<View {...trigger} />);
      await act(async () => {
        await Promise.resolve();
      });
      expect(requests).toHaveLength(5);
    },
  );

  it("reads changed legacy cache after reconnect despite an earlier successful read", async () => {
    let account = "cached-account-A";
    const requests = fixture(403, "git_procedure_not_allowed", false, () => account);
    const { rerender } = render(<View />);
    await screen.findByText("cached-account-A");
    act(() => {
      useRemoteServersStore.setState({
        runtime: { connection: { status: "offline", projects: [], threads: [] } },
      });
    });
    account = "cached-account-B";
    rerender(<View liveOnOpen />);
    await screen.findByText(/Host offline/);
    await waitFor(() =>
      expect(useHostUsageStore.getState().hosts.connection?.updateRequired).toBe(true),
    );
    act(() => {
      useRemoteServersStore.setState({
        runtime: { connection: { status: "online", projects: [], threads: [] } },
      });
    });
    await screen.findByText("cached-account-B");
    expect(requests).toEqual([
      "getProviderUsage",
      "/api/provider-usage",
      "refreshProviderUsage",
      "getProviderUsage",
      "/api/provider-usage",
    ]);
    expect(screen.getByText(/Update this host to refresh usage remotely/)).toBeTruthy();
    rerender(<View liveOnOpen />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(requests).toHaveLength(5);
  });

  it("shares one initial cache read between mounted views after unsupported refresh", async () => {
    const requests = fixture();
    const { rerender } = render(
      <>
        <View liveOnOpen />
        <View />
      </>,
    );
    await waitFor(() => expect(screen.getAllByText("legacy-fixture-account")).toHaveLength(2));
    expect(requests).toEqual(["refreshProviderUsage", "getProviderUsage", "/api/provider-usage"]);
    rerender(
      <>
        <View liveOnOpen />
        <View />
      </>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(requests).toHaveLength(3);
  });

  it.each([
    [403, "scope_denied"],
    [401, "unauthorized"],
  ] as const)(
    "does not turn an auth/scope refusal into a cache fallback (%i)",
    async (status, code) => {
      const requests = fixture(status, code);
      render(<View liveOnOpen />);
      await screen.findByText(/Could not load usage/);
      expect(requests).toEqual(["refreshProviderUsage"]);
    },
  );

  it("does not loop or collect again when the legacy cache read fails validation", async () => {
    const requests = fixture(403, "git_procedure_not_allowed", true);
    const { rerender } = render(<View liveOnOpen />);
    await waitFor(() => expect(useHostUsageStore.getState().hosts.connection?.failed).toBe(true));
    await screen.findByText(/Could not load usage/);
    rerender(<View liveOnOpen />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(requests).toEqual(["refreshProviderUsage", "getProviderUsage", "/api/provider-usage"]);
    expect(useHostUsageStore.getState().hosts.connection?.lastReadRequest).toBe(0);
  });
});

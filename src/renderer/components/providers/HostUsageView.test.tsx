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

function fixture(status = 403, code = "git_procedure_not_allowed", legacyFails = false) {
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
                  authenticatedAs: "legacy-fixture-account",
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
        readSucceeded: true,
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
    expect(useHostUsageStore.getState().hosts.connection?.readSucceeded).toBe(false);
  });
});

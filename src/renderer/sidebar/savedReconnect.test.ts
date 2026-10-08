import { createRemoteServerClientBindings } from "@/renderer/state/remoteServers/storeClient";
import "fake-indexeddb/auto";
import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createSidebarTransportPolicy } from "./transportPolicy";
import { installSidebarAutoConnect } from "./autoConnect";
import { useRemoteServerConnection } from "@/renderer/hooks/useRemoteServerConnection";
import { installRemoteTransportFactories } from "@/renderer/state/remoteServers/transportFactories";
import {
  selectBrowserBridgeServer,
  useRemoteServersStore,
  __resetRemoteServersStoreForTest,
} from "@/renderer/state/remoteServersStore";
import { setDesktopToken } from "@/renderer/state/remoteServers/tokenVault";
import {
  writeRefreshTokenToVault,
  hydrateRefreshTokens,
  refreshTokenForDesktop,
} from "@/renderer/state/remoteServers/refreshTokens";
import { PORACODE_REMOTE_PROTOCOL_VERSION } from "@/shared/remote";
import type { RemoteFetch } from "@/shared/remote/client";
import type { RemoteSocketLike } from "@/renderer/state/remoteServers/types";

const fixture = vi.hoisted(() => ({
  policy: undefined as ReturnType<typeof createSidebarTransportPolicy> | undefined,
}));
vi.mock("./installTransportPolicy", () => ({
  sidebarTransportPolicy: {
    onRetire: (fn: () => void) => fixture.policy!.onRetire(fn),
    isCurrent: () => fixture.policy!.isCurrent(),
    authorize: (
      bootstrap: Parameters<ReturnType<typeof createSidebarTransportPolicy>["authorize"]>[0],
    ) => fixture.policy!.authorize(bootstrap),
    retire: () => fixture.policy!.retire(),
  },
}));
vi.mock("@/renderer/clientRuntime", async (original) => ({
  ...(await original<typeof import("@/renderer/clientRuntime")>()),
  isBrowserClientRuntime: () => true,
}));
const initial = useRemoteServersStore.getState();
let stop = () => {};
let unmount = () => {};
let restoreFactories = () => {};
afterEach(() => {
  stop();
  unmount();
  fixture.policy?.retire();
  restoreFactories();
  __resetRemoteServersStoreForTest();
  useRemoteServersStore.setState({ ...initial, servers: [], runtime: {} });
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("mount, resume, explicit retry, autonomous refresh and event reconnect never send restored or retired credentials", async () => {
  const endpoint = "http://127.0.0.1:43210/";
  const staleEndpoint = "http://127.0.0.1:43211/";
  const bootstrap = { endpoint, pairingUrl: `${endpoint}pair#token=one-time` };
  let proven = false;
  let nonce = "a".repeat(64);
  let issued = 0;
  const ask = vi.fn<(message: { cmd: string }) => Promise<unknown>>(
    async ({ cmd }: { cmd: string }) => {
      if (!proven) return null;
      return cmd === "getChatBootstrap" ? bootstrap : { version: 1, session: nonce, endpoint };
    },
  );
  vi.stubGlobal("chrome", { runtime: { sendMessage: ask } });
  const peer = vi.fn<RemoteFetch>(async (url) => {
    const target = new URL(url);
    if (target.origin !== new URL(endpoint).origin || !proven)
      return new Response("{}", { status: 401 });
    let data: unknown;
    switch (target.pathname) {
      case "/oauth/token":
        data = {
          accessToken: `access-${++issued}`,
          refreshToken: `refresh-${issued}`,
          tokenType: "Bearer",
          expiresAt: "2099-01-01T00:00:00Z",
          scopes: ["session:read", "projects:manage"],
        };
        break;
      case "/.well-known/poracode/environment":
        data = {
          protocolVersion: PORACODE_REMOTE_PROTOCOL_VERSION,
          desktopId: "current",
          label: "Current",
          appVersion: "1.0",
          auth: {
            policy: "remote-reachable",
            bootstrapMethods: ["one-time-token"],
            sessionMethods: ["bearer-access-token"],
            scopes: ["session:read", "projects:manage"],
          },
          endpoints: { httpBaseUrl: endpoint, wsBaseUrl: endpoint.replace("http:", "ws:") },
        };
        break;
      case "/api/snapshot":
        data = {
          snapshotSeq: 0,
          projects: [],
          threads: [],
          runtimeSummariesByThread: {},
          updatedAt: "now",
        };
        break;
      case "/api/agent-statuses":
        data = { windows: [], wsl: [], updatedAt: "now" };
        break;
      case "/api/auth/websocket-ticket":
        data = { ticket: `ticket-${issued}`, expiresAt: "2099-01-01T00:00:00Z" };
        break;
      default:
        return new Response("{}", { status: 404 });
    }
    return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
  });
  const sockets: RemoteSocketLike[] = [];
  const open = vi.fn<() => RemoteSocketLike>(() => {
    const socket: RemoteSocketLike = {
      onclose: null,
      onmessage: null,
      readyState: 1,
      close: vi.fn<() => void>(),
    };
    sockets.push(socket);
    return socket;
  });
  fixture.policy = createSidebarTransportPolicy((cmd) => ask({ cmd }), peer, open);
  restoreFactories = installRemoteTransportFactories(fixture.policy);
  useRemoteServersStore.getState().setClientFactory(fixture.policy.client);
  useRemoteServersStore.getState().setSocketFactory(fixture.policy.socket);
  // Seed actual pre-upgrade version-2 metadata and encrypted access/refresh slots.
  const servers = [endpoint, staleEndpoint].map((url, i) => ({
    desktopId: `saved-${i}`,
    connectionId: `saved-${i}`,
    label: "Saved",
    endpoint: url,
    accessToken: "",
    scopes: ["session:read"],
    transport: { kind: "direct" },
  }));
  for (const server of servers) {
    await setDesktopToken(server.desktopId, `saved-access-${server.desktopId}`);
    expect(
      await writeRefreshTokenToVault(
        { kind: "connection", connectionId: server.desktopId },
        `saved-refresh-${server.desktopId}`,
      ),
    ).toBe(true);
  }
  localStorage.setItem(
    "poracode-remote-servers",
    JSON.stringify({
      version: 2,
      state: {
        servers,
        excludedProjectIds: {},
        projectWorkspaceIds: {},
        projectNameOverrides: {},
        lastKnownProjects: {},
      },
    }),
  );
  await useRemoteServersStore.persist.rehydrate();
  await hydrateRefreshTokens({
    subjects: servers.map((s) => ({ kind: "connection", connectionId: s.desktopId })),
  });
  expect(useRemoteServersStore.getState().servers[0]?.accessToken).toBe("saved-access-saved-0");
  expect(refreshTokenForDesktop("saved-0")).toBe("saved-refresh-saved-0");
  vi.useFakeTimers();
  const mounted = renderHook(() => useRemoteServerConnection({ autoConnect: false }));
  unmount = mounted.unmount;
  const status = vi.fn<() => void>();
  stop = installSidebarAutoConnect(status);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  for (const event of ["pageshow", "online", "visibilitychange"]) {
    await act(async () => {
      (event === "visibilitychange" ? document : window).dispatchEvent(new Event(event));
      await vi.advanceTimersByTimeAsync(0);
    });
  }
  await useRemoteServersStore.getState().connectAll({ forceTransportReconnect: true });
  await useRemoteServersStore.getState().refreshServer("saved-0");
  await useRemoteServersStore.getState().reconnectServer("saved-1");
  await vi.advanceTimersByTimeAsync(12_000);
  expect(peer).not.toHaveBeenCalled();
  expect(open).not.toHaveBeenCalled();
  useRemoteServersStore.setState({
    runtime: { "saved-1": { status: "online", projects: [], threads: [] } },
  });
  proven = true;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(4000);
  });
  expect(status).toHaveBeenLastCalledWith(null);
  expect(useRemoteServersStore.getState().runtime.current?.status).toBe("online");
  expect(open).toHaveBeenCalledOnce();
  expect(selectBrowserBridgeServer(useRemoteServersStore.getState())?.desktopId).toBe("current");
  expect(peer.mock.calls.every(([url]) => new URL(url).origin === new URL(endpoint).origin)).toBe(
    true,
  );
  expect(JSON.stringify(peer.mock.calls)).not.toContain("saved-access");
  expect(JSON.stringify(peer.mock.calls)).not.toContain("saved-refresh");
  const currentClient = fixture.policy.client(endpoint, "access-1");
  currentClient.setTokenLifecycle({
    refreshToken: () => "refresh-1",
    onTokensRefreshed: vi.fn<() => void>(),
  });
  // The event stream's own backoff retry runs before auto-connect's next tick.
  proven = false;
  peer.mockClear();
  sockets[0]!.onclose?.();
  await vi.advanceTimersByTimeAsync(1000);
  await useRemoteServersStore.getState().refreshServer("current");
  await expect(currentClient.refreshTokens()).rejects.toMatchObject({ status: 0, code: "network" });
  window.dispatchEvent(new Event("pageshow"));
  await vi.advanceTimersByTimeAsync(12_000);
  expect(peer).not.toHaveBeenCalled();
  expect(open).toHaveBeenCalledOnce();
  // Even a leftover online flag is not proof; only a fresh grant can recover.
  useRemoteServersStore.setState((state) => ({
    runtime: { ...state.runtime, current: { status: "online", projects: [], threads: [] } },
  }));
  expect(selectBrowserBridgeServer(useRemoteServersStore.getState())).toBeUndefined();
  proven = true;
  nonce = "b".repeat(64);
  await vi.advanceTimersByTimeAsync(4000);
  expect(issued).toBe(2);
  const bindings = createRemoteServerClientBindings(
    {
      get: useRemoteServersStore.getState,
      set: useRemoteServersStore.setState,
    },
    () => undefined,
  );
  const record = useRemoteServersStore
    .getState()
    .servers.find((server) => server.desktopId === "current")!;
  await bindings.clientForServer(record).refreshTokens();
  expect(record.accessToken).toBe("access-2");
  expect(refreshTokenForDesktop("current")).toBe("refresh-3");
  // The record deliberately retains its initially minted bearer. A new bound
  // client and the selector must continue to admit that same-grant token.
  await bindings.clientForServer(record).websocketTicket();
  expect(selectBrowserBridgeServer(useRemoteServersStore.getState())?.desktopId).toBe("current");
  expect(open).toHaveBeenCalledTimes(2);
  peer.mockClear();
  await expect(currentClient.websocketTicket()).rejects.toMatchObject({
    status: 0,
    code: "network",
  });
  expect(peer).not.toHaveBeenCalled();
});

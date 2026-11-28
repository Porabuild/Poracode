import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus, GitStatusResult, Project } from "@/shared/contracts";
import type { GitStatePatch, GitStateSnapshot } from "@/shared/gitState";
import { PORACODE_REMOTE_PROTOCOL_VERSION, type RemoteGitSummaries } from "@/shared/remote";
import { RemoteClientError, RemoteDesktopClient } from "@/shared/remote/client";
import { REMOTE_HTTP_BRIDGE_VERSION } from "@/shared/remote/httpBridgeProtocol";
import { REMOTE_SOCKET_POLICY } from "@/shared/remote/socketPolicy";
import { hostServiceCapabilities } from "@/shared/hostControlProtocol";
import { useAppStore } from "./appStore";
import { useGitStore } from "./gitStore";
import { remoteProjectId } from "./remoteProjection";
import { useSharedSettings } from "./sharedSettingsStore";
import { useWorkspaceStore } from "./workspaceStore";
import { installRemoteProjectWorkspaceSync } from "./remoteServers/appRows";
import { resetRemoteHttpBridgeClientForTest } from "./remoteServers/remoteHttpBridgeClient";
import type { RemoteSocketLike } from "./remoteServers/types";
import { closeRemoteServerEventSocket } from "./remoteServers/sessionReconnect";
import {
  __forgetRefreshTokenForTest,
  connectionRefreshSubject,
  rememberRefreshToken,
} from "./remoteServers/refreshTokens";
import { __resetRemoteServersStoreForTest, useRemoteServersStore } from "./remoteServersStore";

const bridge = vi.hoisted(() => ({
  sshConnect: vi.fn<() => Promise<unknown>>(),
  sshDisconnect: vi.fn<() => Promise<void>>(async () => {}),
  remoteHttpBridgeVersion: 2,
  openRemoteHttpBridge: vi.fn<() => Promise<unknown>>(),
  cancelRemoteHttpBridge: vi.fn<() => Promise<void>>(async () => {}),
  appendUsageEvents: vi.fn<() => Promise<void>>(async () => {}),
}));
vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
  isQuickComposerWindow: () => false,
  isConversationWindow: () => false,
}));

const browserBridge = vi.hoisted(() => ({
  setClient: vi.fn<(client: RemoteDesktopClient | null) => void>(),
}));
vi.mock("@/renderer/browser/remoteBridge", () => ({
  setRemoteBridgeClient: (client: RemoteDesktopClient | null) => browserBridge.setClient(client),
}));

vi.mock("@/renderer/state/remote", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/renderer/state/remote")>();
  return {
    ...actual,
    applyThreadSnapshot: vi.fn<() => { readonly installedAuthoritativeHistory: boolean }>(() => ({
      installedAuthoritativeHistory: true,
    })),
    dispatchRemoteSupervisorEvent: (
      value: unknown,
      hooks?: {
        onGitSummaries?: (summaries: RemoteGitSummaries) => void;
        onGitState?: (patch: GitStatePatch) => void;
      },
    ) => {
      if (
        value &&
        typeof value === "object" &&
        (value as { type?: unknown }).type === "remote-git-summaries"
      ) {
        hooks?.onGitSummaries?.((value as { summaries: RemoteGitSummaries }).summaries);
      }
      if (
        value &&
        typeof value === "object" &&
        (value as { type?: unknown }).type === "remote-git-state"
      ) {
        hooks?.onGitState?.((value as { patch: GitStatePatch }).patch);
      }
    },
  };
});

vi.mock("@heroui/react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, toast: { ...(actual.toast as object), danger: vi.fn<() => void>() } };
});

const proj: Project = {
  id: "p1",
  name: "Remote App",
  location: { kind: "posix", path: "/r/app" },
  createdAt: "2026-01-01T00:00:00.000Z",
};

function agentStatus(kind: string, label: string): AgentStatus {
  return {
    kind,
    label,
    installed: true,
    authState: "authenticated",
    capabilities: {
      models: [{ id: `${kind}-default`, label: "Default" }],
      efforts: [],
      modelEfforts: {},
      modes: [],
      approvalPolicies: [],
      sandboxModes: [],
      supportsResume: true,
      supportsDirectInput: true,
      liveInputMode: "server",
      presentationMode: "gui",
      settingDefs: [],
    },
  };
}

function gitStatus(behind: number): GitStatusResult {
  return {
    isRepo: true,
    branch: "main",
    tracking: "origin/main",
    hasRemote: true,
    remoteInfo: null,
    ahead: 0,
    behind,
    staged: [],
    unstaged: [],
    totalInsertions: 0,
    totalDeletions: 0,
  };
}

function gitState(behind: number, revision: number): GitStateSnapshot {
  return {
    revision,
    projects: {
      p1: {
        ref: { hostId: "d1", projectId: "p1" },
        status: gitStatus(behind),
        refreshedAt: "now",
      },
    },
    targets: {},
    pullRequests: {},
    pullRequestKeyByBranch: {},
    projectPullRequestLists: {},
  };
}

function makeSocket(): RemoteSocketLike {
  return { close: vi.fn<() => void>(), onmessage: null, onclose: null };
}

function makeClient(opts?: {
  environment?: RemoteDesktopClient["environment"];
  agentStatuses?: RemoteDesktopClient["agentStatuses"];
  boundedShellSnapshot?: RemoteDesktopClient["boundedShellSnapshot"];
}): RemoteDesktopClient {
  return {
    setTokenLifecycle: () => {},
    setCertFingerprintPin: () => {},
    refreshTokens: async () => null,
    exchangePairingCredential: async () => ({
      accessToken: "acc-token",
      tokenType: "Bearer" as const,
      expiresAt: "2099-01-01T00:00:00.000Z",
      scopes: ["session:read", "projects:manage"],
    }),
    environment:
      opts?.environment ??
      (async () => ({
        protocolVersion: PORACODE_REMOTE_PROTOCOL_VERSION,
        hostMode: "desktop",
        desktopId: "d1",
        label: "Server One",
        appVersion: "1.0",
        auth: {
          policy: "remote-reachable",
          bootstrapMethods: ["one-time-token"],
          sessionMethods: ["bearer-access-token"],
          scopes: ["session:read", "projects:manage"],
        },
        endpoints: {
          httpBaseUrl: "http://192.168.1.9:38987/",
          wsBaseUrl: "ws://192.168.1.9:38987/",
        },
      })),
    agentStatuses:
      opts?.agentStatuses ?? (async () => ({ windows: [], wsl: [], updatedAt: "now" })),
    agentSlashCommands: async (kind: string) => ({ kind, commands: [] }),
    snapshot: async () => ({
      snapshotSeq: 0,
      projects: [proj],
      threads: [],
      runtimeSummariesByThread: {},
      updatedAt: "now",
    }),
    boundedShellSnapshot:
      opts?.boundedShellSnapshot ??
      (async () => ({
        negotiation: "bounded" as const,
        page: {
          snapshotSeq: 1,
          snapshotEpoch: "epoch-1",
          projects: [proj],
          threads: [],
          runtimeSummariesByThread: {},
          reads: "bounded-v1" as const,
          threadsNextCursor: null,
          projectsNextCursor: null,
          updatedAt: "now",
        },
      })),
    boundedThreadListPage: async () => ({
      negotiation: "bounded" as const,
      page: {
        threads: [],
        runtimeSummariesByThread: {},
        nextCursor: null,
        reads: "bounded-v1" as const,
      },
    }),
    boundedProjectListPage: async () => ({
      projects: [],
      projectsNextCursor: null,
      reads: "bounded-v1" as const,
    }),
    boundedCatalogMembership: async (request: { threadIds?: string[]; projectIds?: string[] }) => ({
      existingThreadIds: request.threadIds ?? [],
      existingProjectIds: request.projectIds ?? [],
    }),
    websocketTicket: async () => "ticket-1",
    websocketUrl: () => "ws://192.168.1.9:38987/ws?ticket=ticket-1",
    parseSocketMessage: (value: string) => JSON.parse(value),
    describeHost: async () => hostServiceCapabilities({ autoUpdate: true, browserPanel: true }),
    hostUpdateState: async () => ({
      currentVersion: "1.0",
      status: { type: "update-not-available" },
    }),
    checkHostUpdate: async () => ({
      currentVersion: "1.0",
      status: { type: "update-not-available" },
    }),
  } as unknown as RemoteDesktopClient;
}

describe("useRemoteServersStore reconnect recovery", () => {
  let uninstallWorkspaceSync: (() => void) | null = null;

  beforeEach(async () => {
    localStorage.clear();
    __resetRemoteServersStoreForTest();
    useRemoteServersStore.getState().setSocketFactory(() => makeSocket());
    useRemoteServersStore.setState({
      servers: [],
      runtime: {},
      hostUpdates: {},
      excludedProjectIds: {},
      projectWorkspaceIds: {},
      projectNameOverrides: {},
      lastKnownProjects: {},
      openThread: null,
    });
    useAppStore.setState((state) => ({
      threads: state.threads.filter((thread) => !thread.remoteServerId),
      provisioningWorktreeThreadIds: {},
    }));
    useSharedSettings.setState({ workspaces: [] });
    useWorkspaceStore.setState({ activeWorkspaceId: null });
    useGitStore.setState({ statuses: {}, worktreeStatuses: {} });
    bridge.remoteHttpBridgeVersion = REMOTE_HTTP_BRIDGE_VERSION;
    resetRemoteHttpBridgeClientForTest();
    uninstallWorkspaceSync = installRemoteProjectWorkspaceSync();
    await vi.waitFor(() => {
      const persisted = JSON.parse(localStorage.getItem("poracode-remote-servers")!).state.servers;
      if (persisted.length !== 0) throw new Error("reset not persisted");
    });
  });

  afterEach(() => {
    uninstallWorkspaceSync?.();
    uninstallWorkspaceSync = null;
    vi.useRealTimers();
  });

  it("refreshes warming agentStatuses when the event socket attaches after a missed detection push", async () => {
    const claude = agentStatus("claude", "Claude");
    const codex = agentStatus("codex", "Codex");
    const sockets: RemoteSocketLike[] = [];
    const agentStatuses = vi
      .fn<RemoteDesktopClient["agentStatuses"]>()
      .mockResolvedValueOnce({
        windows: [claude],
        wsl: [],
        detecting: true,
        updatedAt: "2026-10-19T00:00:00.000Z",
      })
      .mockResolvedValueOnce({
        windows: [claude, codex],
        wsl: [],
        updatedAt: "2026-10-19T00:00:02.000Z",
      });

    useRemoteServersStore.getState().setClientFactory(() => makeClient({ agentStatuses }));
    useRemoteServersStore.getState().setSocketFactory(() => {
      const socket = makeSocket();
      sockets.push(socket);
      return socket;
    });

    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "d1",
          label: "Server One",
          endpoint: "http://192.168.1.9:38987/",
          accessToken: "acc-token",
          scopes: ["session:read", "projects:manage"],
        },
      ],
    });

    const connectPromise = useRemoteServersStore.getState().reconnectServer("d1");
    await vi.waitFor(() => expect(sockets).toHaveLength(1));
    expect(useRemoteServersStore.getState().runtime.d1?.agentStatuses?.detecting).toBe(true);
    expect(
      useRemoteServersStore.getState().runtime.d1?.agentStatuses?.windows.map((s) => s.kind),
    ).toEqual(["claude"]);

    // Socket becomes active without replaying any `windows-agent-statuses` event.
    sockets[0]?.onmessage?.({ data: JSON.stringify({ type: "ready", seq: 1 }) });
    await connectPromise;

    await vi.waitFor(() => {
      const statuses = useRemoteServersStore.getState().runtime.d1?.agentStatuses;
      expect(statuses?.detecting).toBeUndefined();
      expect(statuses?.windows.map((s) => s.kind)).toEqual(["claude", "codex"]);
    });
    expect(agentStatuses).toHaveBeenCalledTimes(2);
  });

  it("clears detecting: true -> undefined on refreshServer even when agent lists are identical", async () => {
    const claude = agentStatus("claude", "Claude");
    const agentStatuses = vi
      .fn<RemoteDesktopClient["agentStatuses"]>()
      .mockResolvedValueOnce({
        windows: [claude],
        wsl: [],
        detecting: true,
        updatedAt: "2026-10-19T00:00:00.000Z",
      })
      .mockResolvedValueOnce({
        windows: [claude],
        wsl: [],
        updatedAt: "2026-10-19T00:00:05.000Z",
      });

    useRemoteServersStore.getState().setClientFactory(() => makeClient({ agentStatuses }));
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "d1",
          label: "Server One",
          endpoint: "http://192.168.1.9:38987/",
          accessToken: "acc-token",
          scopes: ["session:read"],
        },
      ],
    });

    await useRemoteServersStore.getState().refreshServer("d1", { includeAgentStatuses: true });
    expect(useRemoteServersStore.getState().runtime.d1?.agentStatuses?.detecting).toBe(true);

    await useRemoteServersStore.getState().refreshServer("d1", { includeAgentStatuses: true });
    expect(useRemoteServersStore.getState().runtime.d1?.agentStatuses?.detecting).toBeUndefined();
  });

  it("schedules a host refresh with agentStatuses when withClient recovers from offline", async () => {
    const claude = agentStatus("claude", "Claude");
    const agentStatuses = vi.fn<RemoteDesktopClient["agentStatuses"]>().mockResolvedValue({
      windows: [claude],
      wsl: [],
      updatedAt: "2026-10-19T00:00:05.000Z",
    });
    useRemoteServersStore.getState().setClientFactory(() => makeClient({ agentStatuses }));
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "d1",
          label: "Server One",
          endpoint: "http://192.168.1.9:38987/",
          accessToken: "acc-token",
          scopes: ["session:read"],
        },
      ],
      runtime: {
        d1: {
          status: "offline",
          projects: [proj],
          threads: [],
          message: "offline",
        },
      },
    });

    await useRemoteServersStore.getState().withClient("d1", async () => "ok");

    await vi.waitFor(() => {
      const rt = useRemoteServersStore.getState().runtime.d1;
      expect(rt?.status).toBe("online");
      expect(rt?.agentStatuses?.windows.map((s) => s.kind)).toEqual(["claude"]);
    });
  });

  it("accepts a lower gitState revision after a host restart changes snapshotEpoch", async () => {
    const boundedShellSnapshot = vi
      .fn<RemoteDesktopClient["boundedShellSnapshot"]>()
      .mockResolvedValueOnce({
        negotiation: "bounded",
        page: {
          snapshotSeq: 5,
          snapshotEpoch: "epoch-1",
          projects: [proj],
          threads: [],
          runtimeSummariesByThread: {},
          gitState: gitState(4, 10),
          reads: "bounded-v1",
          threadsNextCursor: null,
          projectsNextCursor: null,
          updatedAt: "t1",
        },
      })
      .mockResolvedValueOnce({
        negotiation: "bounded",
        page: {
          snapshotSeq: 1,
          snapshotEpoch: "epoch-2",
          projects: [proj],
          threads: [],
          runtimeSummariesByThread: {},
          gitState: gitState(1, 2),
          reads: "bounded-v1",
          threadsNextCursor: null,
          projectsNextCursor: null,
          updatedAt: "t2",
        },
      });

    useRemoteServersStore.getState().setClientFactory(() => makeClient({ boundedShellSnapshot }));
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "d1",
          label: "Server One",
          endpoint: "http://192.168.1.9:38987/",
          accessToken: "acc-token",
          scopes: ["session:read"],
        },
      ],
    });

    const projectId = remoteProjectId("d1", "p1");
    await useRemoteServersStore.getState().refreshServer("d1");
    expect(useGitStore.getState().statuses[projectId]?.behind).toBe(4);

    await useRemoteServersStore.getState().refreshServer("d1");
    expect(useGitStore.getState().statuses[projectId]?.behind).toBe(1);
  });

  it("reconnects after a network change while startup requests are still pending", async () => {
    const stalled = Promise.withResolvers<never>();
    const healthyClient = makeClient();
    const environment = vi
      .fn<RemoteDesktopClient["environment"]>(healthyClient.environment)
      .mockImplementationOnce(() => stalled.promise);
    const boundedShellSnapshot = vi
      .fn<RemoteDesktopClient["boundedShellSnapshot"]>(healthyClient.boundedShellSnapshot)
      .mockImplementationOnce(() => stalled.promise);
    const socketFactory = vi.fn<() => RemoteSocketLike>(() => ({ ...makeSocket(), readyState: 1 }));
    const client = makeClient({ environment, boundedShellSnapshot });
    const store = useRemoteServersStore.getState();
    store.setClientFactory(() => client);
    store.setSocketFactory(socketFactory);
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "d1",
          label: "Server One",
          endpoint: "http://d1.test/",
          accessToken: "tok-1",
          scopes: ["session:read"],
        },
      ],
    });

    const startup = store.connectAll();
    try {
      await vi.waitFor(() => {
        expect(environment).toHaveBeenCalledTimes(1);
        expect(boundedShellSnapshot).toHaveBeenCalledTimes(1);
      });
      const recovery = store.connectAll({ forceTransportReconnect: true });
      const duplicate = store.connectAll({ forceTransportReconnect: true });
      await vi.waitFor(() => expect(socketFactory).toHaveBeenCalledTimes(1));
      await Promise.all([recovery, duplicate]);
      expect(useRemoteServersStore.getState().runtime.d1?.status).toBe("online");
    } finally {
      stalled.reject(new RemoteClientError("Timed out", 0, "timeout"));
      await startup;
    }

    expect(environment).toHaveBeenCalledTimes(2);
    expect(boundedShellSnapshot).toHaveBeenCalledTimes(2);
    expect(socketFactory).toHaveBeenCalledTimes(1);
    expect(useRemoteServersStore.getState().runtime.d1?.status).toBe("online");
  });

  it("keeps an online server independent of a hanging offline server across verify and connectAll", async () => {
    const offlineGate = Promise.withResolvers<never>();
    const onlineSockets: Array<RemoteSocketLike & { send?: (data: string) => void }> = [];
    const onlineClient = makeClient();
    const offlineEnvironment = vi.fn<RemoteDesktopClient["environment"]>(() => offlineGate.promise);
    const offlineClient = makeClient({
      environment: offlineEnvironment,
      boundedShellSnapshot: () => offlineGate.promise,
    });
    useRemoteServersStore
      .getState()
      .setClientFactory((endpoint) =>
        endpoint.includes("d1.test") ? onlineClient : offlineClient,
      );
    useRemoteServersStore.getState().setSocketFactory((url) => {
      const socket = { ...makeSocket(), readyState: 1, send: vi.fn<(data: string) => void>() };
      if (url.includes("d1.test") || onlineSockets.length < 3) onlineSockets.push(socket);
      return socket;
    });
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "d1",
          label: "Online Host",
          endpoint: "http://d1.test/",
          accessToken: "tok-1",
          scopes: ["session:read"],
        },
        {
          desktopId: "d2",
          label: "Offline Host",
          endpoint: "http://d2.test/",
          accessToken: "tok-2",
          scopes: ["session:read"],
        },
      ],
    });

    const initialConnect = useRemoteServersStore.getState().connectAll();
    await vi.waitFor(() => {
      expect(useRemoteServersStore.getState().runtime.d1?.status).toBe("online");
    });
    expect(useRemoteServersStore.getState().runtime.d2?.status).toBe("connecting");
    expect(onlineSockets).toHaveLength(1);

    // Simulate d1's WebSocket dropping while d2 is still hanging on a network timeout.
    onlineSockets[0]?.onclose?.();
    expect(useRemoteServersStore.getState().runtime.d1?.status).toBe("connecting");

    // Re-verifying connections (or reopening Connections settings) must reconnect d1
    // immediately instead of coalescing onto d2's stuck pass and leaving d1 in connecting.
    void useRemoteServersStore.getState().verifyConnections();
    await vi.waitFor(() => {
      expect(onlineSockets).toHaveLength(2);
      expect(useRemoteServersStore.getState().runtime.d1?.status).toBe("online");
    });

    offlineGate.reject(new RemoteClientError("Timed out", 0, "timeout"));
    await initialConnect;
    expect(useRemoteServersStore.getState().runtime.d2?.status).toBe("offline");
    // Failed initial refresh defers socket retry rather than firing a second blocking probe.
    expect(offlineEnvironment).toHaveBeenCalledTimes(1);
  });

  describe("connection status stays truthful", () => {
    type TestSocket = RemoteSocketLike & {
      readyState: number;
      send: ReturnType<typeof vi.fn<(data: string) => void>>;
    };
    const testSocket = (readyState: number): TestSocket => ({
      ...makeSocket(),
      readyState,
      send: vi.fn<(data: string) => void>(),
    });
    const pairedServer = (id: string) => ({
      desktopId: id,
      label: id,
      endpoint: `http://${id}.test/`,
      accessToken: `tok-${id}`,
      scopes: ["session:read" as const],
    });
    const statusOf = (key: string) => useRemoteServersStore.getState().runtime[key]?.status;
    const transportFailure = () => new RemoteClientError("Timed out", 0, "timeout");

    /** Connects d1 with sockets whose initial readyState the test controls. */
    async function connectOnlineHost(client: RemoteDesktopClient = makeClient()) {
      const sockets: TestSocket[] = [];
      const control = { nextReadyState: 1 };
      const store = useRemoteServersStore.getState();
      store.setClientFactory(() => client);
      store.setSocketFactory(() => {
        const socket = testSocket(control.nextReadyState);
        sockets.push(socket);
        return socket;
      });
      useRemoteServersStore.setState({ servers: [pairedServer("d1")] });
      await store.connectAll();
      expect(statusOf("d1")).toBe("online");
      expect(sockets).toHaveLength(1);
      return { sockets, control, store };
    }

    it("reports an unreachable host when a reconnect socket closes before it opens", async () => {
      const { sockets, control } = await connectOnlineHost();
      vi.useFakeTimers({ shouldAdvanceTime: true });
      control.nextReadyState = 0;
      sockets[0]!.onclose?.({ code: 1006, reason: "" });
      expect(statusOf("d1")).toBe("connecting");

      await vi.advanceTimersByTimeAsync(REMOTE_SOCKET_POLICY.reconnectBaseMs);
      await vi.waitFor(() => expect(sockets).toHaveLength(2));
      // A refused upgrade or a network loss before the handshake.
      sockets[1]!.onclose?.({ code: 1006, reason: "" });
      expect(statusOf("d1")).toBe("offline");

      // The ladder keeps retrying on its own and recovers once a socket opens.
      control.nextReadyState = 1;
      await vi.advanceTimersByTimeAsync(2 * REMOTE_SOCKET_POLICY.reconnectBaseMs);
      await vi.waitFor(() => expect(sockets).toHaveLength(3));
      await vi.waitFor(() => expect(statusOf("d1")).toBe("online"));
    });

    /** Drops d1's live socket and fails one reconnect before it opens, so the
     * host is offline with its ladder waiting out a backoff. */
    async function takeHostOffline(sockets: TestSocket[], control: { nextReadyState: number }) {
      vi.useFakeTimers();
      control.nextReadyState = 0;
      sockets[0]!.onclose?.({ code: 1006, reason: "" });
      await vi.advanceTimersByTimeAsync(REMOTE_SOCKET_POLICY.reconnectBaseMs);
      await vi.waitFor(() => expect(sockets).toHaveLength(2), { interval: 10, timeout: 500 });
      sockets[1]!.onclose?.({ code: 1006, reason: "" });
      expect(statusOf("d1")).toBe("offline");
    }

    it("retries a down socket at once on a request success without flapping the host online", async () => {
      const { sockets, control, store } = await connectOnlineHost();
      await takeHostOffline(sockets, control);

      // The next attempt's socket will not open by itself.
      await store.getHostUpdateState("d1");
      // Well inside the ladder's 1 s minimum backoff: the success nudged it.
      await vi.waitFor(() => expect(sockets).toHaveLength(3), { interval: 10, timeout: 500 });
      expect(statusOf("d1")).toBe("offline");

      sockets[2]!.readyState = 1;
      sockets[2]!.onopen?.();
      expect(statusOf("d1")).toBe("online");
    });

    it("spaces out request-driven retries while the live channel keeps failing", async () => {
      const { sockets, control, store } = await connectOnlineHost();
      await takeHostOffline(sockets, control);

      await store.getHostUpdateState("d1");
      await vi.waitFor(() => expect(sockets).toHaveLength(3), { interval: 10, timeout: 500 });
      // That early attempt fails before it opens, too.
      sockets[2]!.onclose?.({ code: 1006, reason: "" });

      // Another success right away must not start yet another attempt: the
      // floor grows with consecutive failures instead of hammering the host.
      await store.getHostUpdateState("d1");
      await vi.advanceTimersByTimeAsync(50);
      expect(sockets).toHaveLength(3);
      expect(statusOf("d1")).toBe("offline");
    });

    it("retries a down socket at once on a snapshot success without flapping the host online", async () => {
      const { sockets, control, store } = await connectOnlineHost();
      await takeHostOffline(sockets, control);

      await store.refreshServer("d1");
      await vi.waitFor(() => expect(sockets).toHaveLength(3), { interval: 10, timeout: 500 });
      expect(statusOf("d1")).toBe("offline");
    });

    it("retries an offline host's socket at once when the app returns to the foreground", async () => {
      const { sockets, control, store } = await connectOnlineHost();
      await takeHostOffline(sockets, control);

      control.nextReadyState = 1;
      await store.verifyConnections();
      await vi.waitFor(() => expect(sockets).toHaveLength(3), { interval: 10, timeout: 500 });
      await vi.waitFor(() => expect(statusOf("d1")).toBe("online"), { interval: 10, timeout: 500 });
    });

    it("treats a 401 as a pending renewal, not a re-pair, while the refresh grant is held", async () => {
      const healthy = makeClient();
      const boundedShellSnapshot = vi.fn<RemoteDesktopClient["boundedShellSnapshot"]>(
        healthy.boundedShellSnapshot,
      );
      const { store } = await connectOnlineHost(makeClient({ boundedShellSnapshot }));
      const expired = () =>
        new RemoteClientError("Invalid access token.", 401, "invalid_access_token");
      rememberRefreshToken("d1", "grant-1");
      try {
        // No live socket to defer to: the read's verdict lands on the row.
        closeRemoteServerEventSocket("d1");
        boundedShellSnapshot.mockImplementationOnce(() => Promise.reject(expired()));
        await store.refreshServer("d1");
        expect(useRemoteServersStore.getState().runtime.d1).toMatchObject({
          status: "offline",
          message: "Can't reach the remote server. Check that it is online, then reconnect it.",
        });
      } finally {
        __forgetRefreshTokenForTest(connectionRefreshSubject("d1"));
      }

      // Without a grant the same 401 really is the re-pair state.
      boundedShellSnapshot.mockImplementationOnce(() => Promise.reject(expired()));
      await store.refreshServer("d1");
      expect(useRemoteServersStore.getState().runtime.d1?.status).toBe("error");
    });

    it("reports an unreachable host when a reconnect socket never opens before the connect timeout", async () => {
      const { sockets, control } = await connectOnlineHost();
      vi.useFakeTimers({ shouldAdvanceTime: true });
      control.nextReadyState = 0;
      sockets[0]!.onclose?.({ code: 1006, reason: "" });
      await vi.advanceTimersByTimeAsync(REMOTE_SOCKET_POLICY.reconnectBaseMs);
      await vi.waitFor(() => expect(sockets).toHaveLength(2));

      await vi.advanceTimersByTimeAsync(REMOTE_SOCKET_POLICY.connectTimeoutMs);
      expect(sockets[1]!.close).toHaveBeenCalled();
      expect(statusOf("d1")).toBe("offline");
    });

    it("keeps a host online when a request fails while its event socket is open", async () => {
      const client = makeClient();
      Object.assign(client, {
        hostUpdateState: vi.fn<RemoteDesktopClient["hostUpdateState"]>(() =>
          Promise.reject(transportFailure()),
        ),
      });
      const { sockets, store } = await connectOnlineHost(client);

      await expect(store.getHostUpdateState("d1")).rejects.toBeInstanceOf(Error);
      expect(statusOf("d1")).toBe("online");
      // The open socket decides instead: a bounded health ping goes out.
      expect(sockets[0]!.send.mock.calls.some(([data]) => data.includes('"type":"ping"'))).toBe(
        true,
      );
    });

    it("keeps a host online when a snapshot refresh fails while its event socket is open", async () => {
      const healthy = makeClient();
      const boundedShellSnapshot = vi.fn<RemoteDesktopClient["boundedShellSnapshot"]>(
        healthy.boundedShellSnapshot,
      );
      const { store } = await connectOnlineHost(makeClient({ boundedShellSnapshot }));

      boundedShellSnapshot.mockImplementationOnce(() => Promise.reject(transportFailure()));
      await store.refreshServer("d1");
      expect(boundedShellSnapshot).toHaveBeenCalledTimes(2);
      expect(statusOf("d1")).toBe("online");
    });

    it("keeps an offline host offline during automatic retries and shows connecting only for an explicit reconnect", async () => {
      const gate = Promise.withResolvers<never>();
      let mode: "fail" | "hang" = "fail";
      const read = () => (mode === "fail" ? Promise.reject(transportFailure()) : gate.promise);
      const boundedShellSnapshot = vi.fn<RemoteDesktopClient["boundedShellSnapshot"]>(() => read());
      const client = makeClient({ environment: () => read(), boundedShellSnapshot });
      const store = useRemoteServersStore.getState();
      store.setClientFactory(() => client);
      store.setSocketFactory(() => testSocket(1));
      useRemoteServersStore.setState({ servers: [pairedServer("d2")] });
      await store.connectAll();
      expect(statusOf("d2")).toBe("offline");

      mode = "hang";
      const automatic = store.connectAll();
      const verify = store.verifyConnections();
      await vi.waitFor(() => expect(boundedShellSnapshot).toHaveBeenCalledTimes(2));
      expect(statusOf("d2")).toBe("offline");

      const explicit = store.reconnectServer("d2");
      await vi.waitFor(() => expect(statusOf("d2")).toBe("connecting"));

      gate.reject(transportFailure());
      await Promise.allSettled([automatic, verify, explicit]);
      expect(statusOf("d2")).toBe("offline");
    });

    it("reports an unreachable host after the reachability probe fails without waiting for the snapshot", async () => {
      const healthy = makeClient();
      const snapshot =
        Promise.withResolvers<Awaited<ReturnType<RemoteDesktopClient["boundedShellSnapshot"]>>>();
      const environment = vi
        .fn<RemoteDesktopClient["environment"]>(healthy.environment)
        .mockImplementationOnce(() => Promise.reject(transportFailure()));
      const client = makeClient({ environment, boundedShellSnapshot: () => snapshot.promise });
      const store = useRemoteServersStore.getState();
      store.setClientFactory(() => client);
      store.setSocketFactory(() => testSocket(1));
      useRemoteServersStore.setState({ servers: [pairedServer("d2")] });

      const connecting = store.connectAll();
      try {
        await vi.waitFor(() => expect(statusOf("d2")).toBe("offline"));
        expect(environment).toHaveBeenCalledWith({
          timeoutMs: REMOTE_SOCKET_POLICY.connectTimeoutMs,
        });
      } finally {
        // The slow snapshot still answers: the host was reachable after all.
        snapshot.resolve(await healthy.boundedShellSnapshot({} as never));
        await connecting;
      }
      await vi.waitFor(() => expect(statusOf("d2")).toBe("online"));
    });
  });
});

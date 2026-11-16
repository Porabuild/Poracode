import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus, GitStatusResult, Project } from "@/shared/contracts";
import type { GitStatePatch, GitStateSnapshot } from "@/shared/gitState";
import { PORACODE_REMOTE_PROTOCOL_VERSION, type RemoteGitSummaries } from "@/shared/remote";
import { RemoteClientError, RemoteDesktopClient } from "@/shared/remote/client";
import { REMOTE_HTTP_BRIDGE_VERSION } from "@/shared/remote/httpBridgeProtocol";
import { hostServiceCapabilities } from "@/shared/hostControlProtocol";
import { useAppStore } from "./appStore";
import { useGitStore } from "./gitStore";
import { remoteProjectId } from "./remoteProjection";
import { useSharedSettings } from "./sharedSettingsStore";
import { useWorkspaceStore } from "./workspaceStore";
import { installRemoteProjectWorkspaceSync } from "./remoteServers/appRows";
import { resetRemoteHttpBridgeClientForTest } from "./remoteServers/remoteHttpBridgeClient";
import type { RemoteSocketLike } from "./remoteServers/types";
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
});

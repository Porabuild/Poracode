import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GitStatusResult, Project, Thread } from "@/shared/contracts";
import { HOME_PROJECT_ID } from "@/shared/homeScope";
import type { RemoteGitSummaries } from "@/shared/remote";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import {
  __resetRemoteServersStoreForTest,
  installRemoteProjectWorkspaceSync,
  useRemoteServersStore,
} from "./remoteServersStore";
import { filterRemoteThreadEvent } from "./remoteServers/eventRouting";
import type {
  RemoteClientFactory,
  RemoteSocketFactory,
  RemoteSocketLike,
} from "./remoteServers/types";
import { useAgentStatusesStore } from "./agentStatusesStore";
import { useAppStore } from "./appStore";
import { useGitStore } from "./gitStore";
import { watchRemoteTerminal } from "./remoteTerminalFeed";
import { remoteProjectId, remoteThreadId } from "./remoteProjection";
import { renameProject } from "../actions/projectActions";
import { routeRemoteProcedure } from "../remoteProcedureRouter";

const bridge = vi.hoisted(() => ({
  sshConnect: vi.fn<() => Promise<unknown>>(),
  sshDisconnect: vi.fn<() => Promise<void>>(async () => {}),
  remoteHttpRequest: vi.fn<() => Promise<unknown>>(),
}));
vi.mock("@/renderer/bridge", () => ({ readBridge: () => bridge }));

// Hydration into the shared runtime store is covered by storeSync's own tests;
// here we only assert the remote store calls it.
const sync = vi.hoisted(() => ({
  applyThreadSnapshot: vi.fn<(snapshot: unknown) => void>(),
  dispatchRemoteSupervisorEvent: vi.fn<(value: unknown) => void>(),
}));
vi.mock("@/renderer/state/remote", async (importOriginal) => {
  // Keep collectRuntimeEventsFromSupervisoryMessage (used by filterRemoteThreadEvent)
  // and the other pure helpers real; only stub the two store mutators.
  const actual = await importOriginal<typeof import("@/renderer/state/remote")>();
  return {
    ...actual,
    applyThreadSnapshot: (snapshot: unknown) => sync.applyThreadSnapshot(snapshot),
    dispatchRemoteSupervisorEvent: (
      value: unknown,
      hooks?: { onGitSummaries?: (summaries: RemoteGitSummaries) => void },
    ) => {
      sync.dispatchRemoteSupervisorEvent(value);
      if (
        value &&
        typeof value === "object" &&
        (value as { type?: unknown }).type === "remote-git-summaries"
      ) {
        hooks?.onGitSummaries?.((value as { summaries: RemoteGitSummaries }).summaries);
      }
    },
  };
});

// The store toasts on action failures (finding #6). Stub the toast surface so
// the tests don't need a live HeroUI toast provider mounted.
const toastDanger = vi.hoisted(() => vi.fn<(message: string) => void>());
vi.mock("@heroui/react", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, toast: { ...(actual.toast as object), danger: toastDanger } };
});

const proj: Project = {
  id: "p1",
  name: "Remote App",
  location: { kind: "posix", path: "/r/app" },
  createdAt: "2026-01-01T00:00:00.000Z",
};
const proj2: Project = {
  ...proj,
  id: "p2",
  name: "Second App",
  location: { kind: "posix", path: "/r/two" },
};

const remoteThread = {
  id: "rt-1",
  projectId: "p1",
  title: "Remote thread",
  agentKind: "claude",
  config: { foo: "bar" },
  status: "idle",
} as unknown as Thread; // shape-checked loosely; only fields the store reads matter

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

type RemoteThreadHistorySnapshot = Awaited<ReturnType<RemoteDesktopClient["threadHistory"]>>;
type RemoteShellSnapshot = Awaited<ReturnType<RemoteDesktopClient["snapshot"]>>;

function remoteThreadSnapshot(threadId: string): RemoteThreadHistorySnapshot {
  return {
    snapshotSeq: 1,
    thread: { ...remoteThread, id: threadId, title: `Remote ${threadId}` },
    runtimeItems: [],
    completedTurns: [],
    contextUsage: null,
    updatedAt: "now",
  };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function makeSocket(): RemoteSocketLike {
  return { close: vi.fn<() => void>(), onmessage: null, onclose: null };
}

function makeClient(opts?: {
  snapshotProjects?: Project[];
  snapshotThrows?: boolean;
  snapshot?: RemoteDesktopClient["snapshot"];
  agentStatuses?: RemoteDesktopClient["agentStatuses"];
  environmentHttpBaseUrl?: string;
  hostMode?: "desktop" | "helper";
  projectCommand?: RemoteDesktopClient["projectCommand"];
  projectSettings?: RemoteDesktopClient["projectSettings"];
  interruptThread?: RemoteDesktopClient["interruptThread"];
  closeThread?: RemoteDesktopClient["closeThread"];
  threadHistory?: RemoteDesktopClient["threadHistory"];
  threadRuntimeItemsPage?: RemoteDesktopClient["threadRuntimeItemsPage"];
  websocketTicket?: RemoteDesktopClient["websocketTicket"];
  websocketUrl?: RemoteDesktopClient["websocketUrl"];
  sendThreadInput?: RemoteDesktopClient["sendThreadInput"];
  uploadAttachment?: RemoteDesktopClient["uploadAttachment"];
  startNewThread?: RemoteDesktopClient["startNewThread"];
  writeTerminal?: RemoteDesktopClient["writeTerminal"];
  resizeTerminal?: RemoteDesktopClient["resizeTerminal"];
  startShell?: RemoteDesktopClient["startShell"];
  closeShell?: RemoteDesktopClient["closeShell"];
  gitCall?: RemoteDesktopClient["gitCall"];
}): RemoteDesktopClient {
  return {
    exchangePairingCredential: async () => ({
      accessToken: "acc-token",
      tokenType: "Bearer" as const,
      expiresAt: "2099-01-01T00:00:00.000Z",
      scopes: ["session:read", "projects:manage"],
    }),
    environment: async () => ({
      protocolVersion: 1,
      ...(opts?.hostMode ? { hostMode: opts.hostMode } : {}),
      desktopId: "d1",
      label: "Server One",
      appVersion: "1.0",
      endpoints: {
        httpBaseUrl: opts?.environmentHttpBaseUrl ?? "http://192.168.1.9:38987/",
        wsBaseUrl: "ws://192.168.1.9:38987/",
      },
    }),
    agentStatuses:
      opts?.agentStatuses ?? (async () => ({ windows: [], wsl: [], updatedAt: "now" })),
    snapshot:
      opts?.snapshot ??
      (async () => {
        if (opts?.snapshotThrows) throw new Error("boom");
        return {
          snapshotSeq: 0,
          projects: opts?.snapshotProjects ?? [proj],
          threads: [],
          runtimeSummariesByThread: {},
          updatedAt: "now",
        };
      }),
    projectCommand:
      opts?.projectCommand ?? (async () => ({ projects: opts?.snapshotProjects ?? [proj] })),
    projectSettings: opts?.projectSettings ?? (async () => ({})),
    interruptThread: opts?.interruptThread ?? (async () => {}),
    closeThread: opts?.closeThread ?? (async () => {}),
    threadHistory: opts?.threadHistory ?? (async () => remoteThreadSnapshot(remoteThread.id)),
    threadRuntimeItemsPage:
      opts?.threadRuntimeItemsPage ?? (async () => ({ items: [], nextCursor: null })),
    websocketTicket: opts?.websocketTicket ?? (async () => "ticket-1"),
    websocketUrl: opts?.websocketUrl ?? (() => "ws://192.168.1.9:38987/ws?ticket=ticket-1"),
    parseSocketMessage: (value: string) => JSON.parse(value),
    sendThreadInput: opts?.sendThreadInput ?? (async () => {}),
    uploadAttachment: opts?.uploadAttachment ?? (async () => "/remote/attachment.png"),
    startNewThread: opts?.startNewThread ?? (async () => ({ threadId: crypto.randomUUID() })),
    writeTerminal: opts?.writeTerminal ?? (async () => {}),
    resizeTerminal: opts?.resizeTerminal ?? (async () => {}),
    startShell: opts?.startShell ?? (async () => {}),
    closeShell: opts?.closeShell ?? (async () => {}),
    gitCall: opts?.gitCall ?? (async () => ({})),
  } as unknown as RemoteDesktopClient;
}

function factoryFor(client: RemoteDesktopClient): RemoteClientFactory {
  return () => client;
}

/**
 * Pair a server, then tear down its pair-time event stream and reinstall the
 * socket factory. Opening a thread restarts the same per-server stream, letting
 * tests observe that shared socket in isolation.
 */
async function pairIsolated(socketFactory: RemoteSocketFactory): Promise<void> {
  await useRemoteServersStore.getState().pairServer({ endpoint: "192.168.1.9:38987", token: "a" });
  // Closes the pair-time event socket; opening a thread restarts it afterward.
  useRemoteServersStore.getState().setSocketFactory(socketFactory);
}

describe("useRemoteServersStore", () => {
  let uninstallWorkspaceSync: (() => void) | null = null;

  beforeEach(() => {
    localStorage.clear();
    // Pairing now opens a per-server event socket; fully reset process-local
    // connection state so sockets/timers/seq cursors don't bleed across tests.
    __resetRemoteServersStoreForTest();
    useRemoteServersStore.getState().setSocketFactory(() => makeSocket());
    useRemoteServersStore.setState({
      servers: [],
      runtime: {},
      excludedProjectIds: {},
      projectWorkspaceIds: {},
      projectNameOverrides: {},
      openThread: null,
    });
    useGitStore.setState({ statuses: {}, worktreeStatuses: {} });
    sync.applyThreadSnapshot.mockClear();
    sync.dispatchRemoteSupervisorEvent.mockClear();
    toastDanger.mockClear();
    bridge.sshConnect.mockReset();
    bridge.sshDisconnect.mockClear();
    // Mirrors the app-level wiring (app.tsx installs this at mount).
    uninstallWorkspaceSync = installRemoteProjectWorkspaceSync();
  });

  afterEach(() => {
    uninstallWorkspaceSync?.();
    uninstallWorkspaceSync = null;
    vi.useRealTimers();
  });

  it("pairs a server and stores its snapshot online", async () => {
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient()));
    const record = await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "lc_pair_x" });

    expect(record.desktopId).toBe("d1");
    expect(record.endpoint).toBe("http://192.168.1.9:38987/");
    expect(record.accessToken).toBe("acc-token");

    const state = useRemoteServersStore.getState();
    expect(state.servers).toHaveLength(1);
    expect(state.runtime.d1?.status).toBe("online");
    expect(state.runtime.d1?.projects[0]?.name).toBe("Remote App");
    expect(useAppStore.getState().projects).toContainEqual(
      expect.objectContaining({
        id: remoteProjectId("d1", "p1"),
        remoteServerId: "d1",
        remoteId: "p1",
      }),
    );
  });

  it("persists a local name for a remote connection", async () => {
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient()));
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });

    useRemoteServersStore.getState().renameServer("d1", "Mac Studio");

    expect(useRemoteServersStore.getState().servers[0]?.label).toBe("Mac Studio");
    expect(useRemoteServersStore.getState().servers[0]?.remoteLabel).toBe("Server One");
    expect(
      JSON.parse(localStorage.getItem("poracode-remote-servers")!).state.servers[0].label,
    ).toBe("Mac Studio");
  });

  it("keeps mirrored project metadata local across reconnects", async () => {
    const remoteWorkspaceProject = { ...proj, workspaceId: "remote-workspace" };
    const projectCommand = vi.fn<RemoteDesktopClient["projectCommand"]>(async () => ({
      projects: [remoteWorkspaceProject],
    }));
    useRemoteServersStore
      .getState()
      .setClientFactory(
        factoryFor(makeClient({ snapshotProjects: [remoteWorkspaceProject], projectCommand })),
      );
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });

    const projectedId = remoteProjectId("d1", "p1");
    expect(
      useAppStore.getState().projects.find((project) => project.id === projectedId)?.workspaceId,
    ).toBeUndefined();

    useAppStore.getState().setProjectWorkspace(projectedId, "local-workspace");
    renameProject(projectedId, "Local Project");
    expect(useRemoteServersStore.getState().projectWorkspaceIds.d1?.p1).toBe("local-workspace");
    expect(useRemoteServersStore.getState().projectNameOverrides.d1?.p1).toBe("Local Project");
    expect(projectCommand).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem("poracode-remote-servers")!).state).toEqual(
      expect.objectContaining({
        projectWorkspaceIds: { d1: { p1: "local-workspace" } },
        projectNameOverrides: { d1: { p1: "Local Project" } },
      }),
    );

    __resetRemoteServersStoreForTest();
    useRemoteServersStore.setState({ runtime: {} });
    await useRemoteServersStore.getState().refreshServer("d1");

    expect(
      useAppStore.getState().projects.find((project) => project.id === projectedId)?.workspaceId,
    ).toBe("local-workspace");
    expect(
      useAppStore.getState().projects.find((project) => project.id === projectedId)?.name,
    ).toBe("Local Project");
  });

  it("bootstraps and persists an SSH-backed server through the shared protocol", async () => {
    const id = "1a2f655a-e274-4213-9a2b-029f29062fd7";
    const connection = { id, label: "Build host", target: "dev@build" };
    const listing = {
      path: "/srv",
      parentPath: "/",
      homePath: "/home/dev",
      entries: [{ name: "app", path: "/srv/app", type: "directory" as const }],
      truncated: false,
    };
    const gitCall = vi.fn<RemoteDesktopClient["gitCall"]>(async () => listing);
    bridge.sshConnect.mockResolvedValue({
      connectionId: id,
      endpoint: "http://127.0.0.1:39001/",
      remotePort: 38987,
      pairingCredential: "lc_pair_ssh",
    });
    useRemoteServersStore
      .getState()
      .setClientFactory(factoryFor(makeClient({ gitCall, hostMode: "helper" })));

    const record = await useRemoteServersStore.getState().pairSshServer(connection);
    const folders = await useRemoteServersStore
      .getState()
      .browseHostDirectory(record.desktopId, "/srv");

    expect(bridge.sshConnect).toHaveBeenCalledWith({
      connection,
      issuePairingCredential: true,
    });
    expect(record).toMatchObject({
      endpoint: "http://127.0.0.1:39001/",
      hostMode: "helper",
      transport: { kind: "ssh", connection },
    });
    expect(folders).toEqual(listing);
    expect(gitCall).toHaveBeenCalledWith("browseHostDirectory", { path: "/srv" });
  });

  it("re-establishes and disconnects an SSH tunnel for a persisted server", async () => {
    const id = "1a2f655a-e274-4213-9a2b-029f29062fd7";
    const connection = { id, label: "Build host", target: "dev@build" };
    bridge.sshConnect.mockResolvedValue({
      connectionId: id,
      endpoint: "http://127.0.0.1:39002/",
      remotePort: 38987,
    });
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient()));
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "d1",
          label: "Build host",
          endpoint: "http://127.0.0.1:39999/",
          accessToken: "token",
          scopes: [],
          transport: { kind: "ssh", connection },
        },
      ],
      runtime: {},
    });

    await useRemoteServersStore.getState().connectAll();
    expect(useRemoteServersStore.getState().servers[0]?.endpoint).toBe("http://127.0.0.1:39002/");
    useRemoteServersStore.getState().removeServer("d1");
    expect(bridge.sshDisconnect).toHaveBeenCalledWith({ connectionId: id });
  });

  it("de-duplicates when the same desktop is paired twice", async () => {
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient()));
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "b" });
    expect(useRemoteServersStore.getState().servers).toHaveLength(1);
  });

  it("keeps the paired relay endpoint instead of the server-advertised LAN endpoint", async () => {
    const endpoints: string[] = [];
    const client = makeClient({ environmentHttpBaseUrl: "http://127.0.0.1:38987/" });
    useRemoteServersStore.getState().setClientFactory((endpoint) => {
      endpoints.push(endpoint);
      return client;
    });

    const record = await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "https://relay.example.test/s/server-1/", token: "a" });

    expect(record.endpoint).toBe("https://relay.example.test/s/server-1/");
    // Every client factory call (token exchange, environment/snapshot, and the
    // event stream started at pair time) must use the paired relay endpoint —
    // never the server-advertised LAN endpoint.
    expect(endpoints.length).toBeGreaterThanOrEqual(2);
    expect(endpoints.every((e) => e === "https://relay.example.test/s/server-1/")).toBe(true);
  });

  it("removes a server and its runtime", async () => {
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient()));
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });

    useRemoteServersStore.getState().removeServer("d1");
    const state = useRemoteServersStore.getState();
    expect(state.servers).toHaveLength(0);
    expect(state.runtime.d1).toBeUndefined();
  });

  it("marks a server errored when refresh fails but retains projects", async () => {
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient()));
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });

    useRemoteServersStore
      .getState()
      .setClientFactory(factoryFor(makeClient({ snapshotThrows: true })));
    await useRemoteServersStore.getState().refreshServer("d1");

    const state = useRemoteServersStore.getState();
    expect(state.runtime.d1?.status).toBe("error");
    expect(state.runtime.d1?.message).toBe("boom");
    expect(state.runtime.d1?.projects).toHaveLength(1);
  });

  it("opens a server event stream and refreshes snapshots on remote metadata events", async () => {
    const sockets: RemoteSocketLike[] = [];
    // Pairing (seq 1), then the metadata-change refresh (seq 5). connectAll does
    // not re-open the socket (same server key), so only two snapshots are needed.
    const snapshots: RemoteShellSnapshot[] = [
      {
        snapshotSeq: 1,
        projects: [proj],
        threads: [],
        runtimeSummariesByThread: {},
        updatedAt: "pair",
      },
      {
        snapshotSeq: 5,
        projects: [proj, proj2],
        threads: [{ ...remoteThread, id: "rt-2", title: "Changed elsewhere" } as Thread],
        runtimeSummariesByThread: {},
        updatedAt: "event",
      },
    ];
    const snapshot = vi.fn<RemoteDesktopClient["snapshot"]>(async () => snapshots.shift()!);
    const websocketTicket = vi.fn<RemoteDesktopClient["websocketTicket"]>(async () => "ticket-1");
    const websocketUrl = vi.fn<RemoteDesktopClient["websocketUrl"]>(
      (ticket, lastSeenSeq) => `ws://192.168.1.9:38987/ws?ticket=${ticket}&last=${lastSeenSeq}`,
    );
    const socketFactory = vi.fn<RemoteSocketFactory>(() => {
      const socket = makeSocket();
      sockets.push(socket);
      return socket;
    });
    useRemoteServersStore
      .getState()
      .setClientFactory(factoryFor(makeClient({ snapshot, websocketTicket, websocketUrl })));
    useRemoteServersStore.getState().setSocketFactory(socketFactory);
    // Pairing starts the event stream (finding #3); wait for the socket to open.
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });
    await vi.waitFor(() => expect(socketFactory).toHaveBeenCalledTimes(1));

    // connectAll must not re-open the already-connected server's socket.
    await useRemoteServersStore.getState().connectAll();
    expect(socketFactory).toHaveBeenCalledTimes(1);
    snapshot.mockClear();
    sync.dispatchRemoteSupervisorEvent.mockClear();
    vi.useFakeTimers();

    sockets[0]?.onmessage?.({
      data: JSON.stringify({
        type: "event",
        seq: 4,
        event: { type: "remote-projects-changed", projects: [proj, proj2] },
      }),
    });

    await vi.advanceTimersByTimeAsync(600);
    expect(snapshot).toHaveBeenCalledTimes(1);
    expect(useRemoteServersStore.getState().runtime.d1?.projects).toHaveLength(2);
    expect(useRemoteServersStore.getState().runtime.d1?.threads[0]?.title).toBe(
      "Changed elsewhere",
    );
    // A desktop-global project-change event is NOT forwarded into the shared
    // runtime store on the per-server event socket path.
    expect(sync.dispatchRemoteSupervisorEvent).not.toHaveBeenCalled();
  });

  it("reconnects the server event stream from the latest seen seq", async () => {
    vi.useFakeTimers();
    const sockets: RemoteSocketLike[] = [];
    let ticketSeq = 0;
    const snapshot = vi.fn<RemoteDesktopClient["snapshot"]>(async () => ({
      snapshotSeq: 2,
      projects: [proj],
      threads: [],
      runtimeSummariesByThread: {},
      updatedAt: "now",
    }));
    const websocketTicket = vi.fn<RemoteDesktopClient["websocketTicket"]>(
      async () => `ticket-${++ticketSeq}`,
    );
    const websocketUrl = vi.fn<RemoteDesktopClient["websocketUrl"]>(
      (ticket, lastSeenSeq) => `ws://192.168.1.9:38987/ws?ticket=${ticket}&last=${lastSeenSeq}`,
    );
    const socketFactory = vi.fn<RemoteSocketFactory>(() => {
      const socket = makeSocket();
      sockets.push(socket);
      return socket;
    });
    useRemoteServersStore
      .getState()
      .setClientFactory(factoryFor(makeClient({ snapshot, websocketTicket, websocketUrl })));
    useRemoteServersStore.getState().setSocketFactory(socketFactory);
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });
    await useRemoteServersStore.getState().connectAll();

    expect(socketFactory).toHaveBeenCalledTimes(1);
    expect(websocketUrl).toHaveBeenNthCalledWith(1, "ticket-1", 2);

    sockets[0]?.onmessage?.({
      data: JSON.stringify({ type: "event", seq: 7, event: { type: "noop" } }),
    });
    sockets[0]?.onclose?.();
    await vi.advanceTimersByTimeAsync(20_000);
    await Promise.resolve();

    expect(socketFactory).toHaveBeenCalledTimes(2);
    expect(websocketUrl).toHaveBeenNthCalledWith(2, "ticket-2", 7);
  });

  it("runs a remote project command then refreshes the snapshot", async () => {
    const projectCommand = vi.fn<RemoteDesktopClient["projectCommand"]>(async () => ({
      projects: [proj, proj2],
    }));
    useRemoteServersStore
      .getState()
      .setClientFactory(
        factoryFor(makeClient({ projectCommand, snapshotProjects: [proj, proj2] })),
      );
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });

    await useRemoteServersStore
      .getState()
      .runProjectCommand("d1", { kind: "add-existing", path: "/r/two" });

    expect(projectCommand).toHaveBeenCalledWith({ kind: "add-existing", path: "/r/two" });
    expect(useRemoteServersStore.getState().runtime.d1?.projects).toHaveLength(2);
  });

  it("loads sensitive project settings into the projected project row", async () => {
    const server = {
      id: "memory-id",
      name: "memory",
      description: "Memory tools",
      enabled: true,
      timeoutMs: 30_000,
      transport: { type: "stdio" as const, command: "node", args: ["server.js"], env: {} },
    };
    const projectSettings = vi.fn<RemoteDesktopClient["projectSettings"]>(async () => ({
      mcpServers: [server],
    }));
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient({ projectSettings })));
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });

    await useRemoteServersStore.getState().loadProjectSettings("d1", "p1");

    expect(projectSettings).toHaveBeenCalledWith("p1");
    expect(
      useAppStore.getState().projects.find((project) => project.id === remoteProjectId("d1", "p1"))
        ?.mcpServers,
    ).toEqual([server]);
  });

  it("browses folders through the selected remote server", async () => {
    const listing = {
      path: "/srv",
      parentPath: "/",
      homePath: "/home/remote",
      entries: [{ name: "app", path: "/srv/app", type: "directory" as const }],
      truncated: false,
    };
    const gitCall = vi.fn<RemoteDesktopClient["gitCall"]>(async () => listing);
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient({ gitCall })));
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });

    await expect(
      useRemoteServersStore.getState().browseHostDirectory("d1", "/srv"),
    ).resolves.toEqual(listing);
    expect(gitCall).toHaveBeenCalledWith("browseHostDirectory", { path: "/srv" });
  });

  it("routes project-scoped renderer procedures by explicit remote ownership", async () => {
    const gitCall = vi.fn<RemoteDesktopClient["gitCall"]>(async () => ({
      skills: [],
      effectiveSkillIds: [],
    }));
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient({ gitCall })));
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });

    const projectedProject = useAppStore
      .getState()
      .projects.find((project) => project.remoteServerId === "d1");
    expect(projectedProject?.location.remoteServerId).toBe("d1");

    await expect(
      routeRemoteProcedure("scanSkills", {
        projectLocation: projectedProject?.location,
        agentKind: "claude",
      }),
    ).resolves.toEqual({ skills: [], effectiveSkillIds: [] });
    expect(gitCall).toHaveBeenCalledWith("scanSkills", {
      projectLocation: { kind: "posix", path: "/r/app" },
      agentKind: "claude",
    });

    expect(
      routeRemoteProcedure("scanSkills", {
        projectLocation: { kind: "posix", path: "/r/app" },
        agentKind: "claude",
      }),
    ).toBeUndefined();
  });

  it("pages older runtime history through the thread's remote server", async () => {
    const threadRuntimeItemsPage = vi.fn<RemoteDesktopClient["threadRuntimeItemsPage"]>(
      async () => ({ items: [], nextCursor: null }),
    );
    useRemoteServersStore
      .getState()
      .setClientFactory(factoryFor(makeClient({ threadRuntimeItemsPage })));
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });
    useAppStore.setState((state) => ({
      threads: [
        ...state.threads,
        {
          ...remoteThread,
          id: remoteThreadId("d1", "rt-1"),
          remoteId: "rt-1",
          remoteServerId: "d1",
          projectId: remoteProjectId("d1", "p1"),
        } as Thread,
      ],
    }));

    await expect(
      routeRemoteProcedure("dbGetThreadRuntimeItemsPage", {
        threadId: remoteThreadId("d1", "rt-1"),
        beforePosition: 77,
        limit: 500,
        targetTimelineEntryCount: 40,
      }),
    ).resolves.toEqual({ items: [], nextCursor: null });
    expect(threadRuntimeItemsPage).toHaveBeenCalledWith({
      threadId: "rt-1",
      beforePosition: 77,
      limit: 500,
      targetTimelineEntryCount: 40,
    });
  });

  it("routes normal project terminal operations through the remote server", async () => {
    const startShell = vi.fn<RemoteDesktopClient["startShell"]>(async () => {});
    const writeTerminal = vi.fn<RemoteDesktopClient["writeTerminal"]>(async () => {});
    const resizeTerminal = vi.fn<RemoteDesktopClient["resizeTerminal"]>(async () => {});
    const closeShell = vi.fn<RemoteDesktopClient["closeShell"]>(async () => {});
    useRemoteServersStore
      .getState()
      .setClientFactory(
        factoryFor(makeClient({ startShell, writeTerminal, resizeTerminal, closeShell })),
      );
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });
    const location = useAppStore
      .getState()
      .projects.find((project) => project.remoteServerId === "d1")?.location;

    await routeRemoteProcedure("startShell", {
      shellId: "shell:remote",
      projectLocation: location,
      initialSize: { cols: 90, rows: 25 },
    });
    await routeRemoteProcedure("writeTerminal", {
      threadId: "shell:remote",
      data: "pwd\r",
    });
    await routeRemoteProcedure("resizeTerminal", {
      threadId: "shell:remote",
      cols: 100,
      rows: 30,
    });
    await routeRemoteProcedure("closeThread", { threadId: "shell:remote" });

    expect(startShell).toHaveBeenCalledWith({
      shellId: "shell:remote",
      projectLocation: { kind: "posix", path: "/r/app" },
      initialSize: { cols: 90, rows: 25 },
    });
    expect(writeTerminal).toHaveBeenCalledWith({
      threadId: "shell:remote",
      data: "pwd\r",
    });
    expect(resizeTerminal).toHaveBeenCalledWith({
      threadId: "shell:remote",
      cols: 100,
      rows: 30,
    });
    expect(closeShell).toHaveBeenCalledWith({ threadId: "shell:remote" });
  });

  it("interrupts a remote thread", async () => {
    const interruptThread = vi.fn<RemoteDesktopClient["interruptThread"]>(async () => {});
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient({ interruptThread })));
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });

    await useRemoteServersStore.getState().interruptThread("d1", "thread-7");
    expect(interruptThread).toHaveBeenCalledWith("thread-7");
  });

  it("closes a remote thread then refreshes", async () => {
    const closeThread = vi.fn<RemoteDesktopClient["closeThread"]>(async () => {});
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient({ closeThread })));
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });

    await useRemoteServersStore.getState().closeThread("d1", "thread-7");
    expect(closeThread).toHaveBeenCalledWith("thread-7");
    expect(useRemoteServersStore.getState().runtime.d1?.status).toBe("online");
  });

  it("routes checkpoint rollback and file restore through the remote git bridge", async () => {
    const gitCall = vi.fn<RemoteDesktopClient["gitCall"]>(async () => ({}));
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient({ gitCall })));
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });

    await useRemoteServersStore.getState().rollbackThreadConversation({
      desktopId: "d1",
      threadId: "thread-7",
      numTurns: 2,
      config: {
        model: "gpt-5.6-terra",
        approvalPolicy: "on-request",
        sandboxMode: "workspace-write",
      },
    });
    await useRemoteServersStore.getState().restoreFileCheckpoint({
      desktopId: "d1",
      threadId: "thread-7",
      checkpointItemId: "user-1",
      projectLocation: { kind: "posix", path: "/r/app" },
    });

    expect(gitCall).toHaveBeenCalledWith("rollbackThreadConversation", {
      threadId: "thread-7",
      numTurns: 2,
      config: {
        model: "gpt-5.6-terra",
        approvalPolicy: "on-request",
        sandboxMode: "workspace-write",
      },
    });
    expect(gitCall).toHaveBeenCalledWith("restoreFileCheckpoint", {
      threadId: "thread-7",
      checkpointItemId: "user-1",
      projectLocation: { kind: "posix", path: "/r/app" },
    });
  });

  it("routes remote file editor reads and writes through the remote git bridge", async () => {
    const gitCall = vi.fn<RemoteDesktopClient["gitCall"]>(async (procedure) =>
      procedure === "readProjectFile"
        ? { path: "README.md", status: "ready", modifiedAtMs: 1, content: "hello" }
        : { modifiedAtMs: 2 },
    );
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient({ gitCall })));
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });

    const read = await useRemoteServersStore.getState().readProjectFile({
      desktopId: "d1",
      projectLocation: { kind: "posix", path: "/r/app" },
      path: "README.md",
    });
    const write = await useRemoteServersStore.getState().writeProjectFile({
      desktopId: "d1",
      projectLocation: { kind: "posix", path: "/r/app" },
      path: "README.md",
      content: "updated",
      baseModifiedAtMs: 1,
    });

    expect(read).toMatchObject({ path: "README.md", content: "hello" });
    expect(write).toEqual({ modifiedAtMs: 2 });
    expect(gitCall).toHaveBeenCalledWith("readProjectFile", {
      projectLocation: { kind: "posix", path: "/r/app" },
      path: "README.md",
    });
    expect(gitCall).toHaveBeenCalledWith("writeProjectFile", {
      projectLocation: { kind: "posix", path: "/r/app" },
      path: "README.md",
      content: "updated",
      baseModifiedAtMs: 1,
    });
  });

  it("opens a remote thread: hydrates history and streams socket events", async () => {
    const sockets: RemoteSocketLike[] = [];
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient()));
    const socketFactory = vi.fn<RemoteSocketFactory>(() => {
      const socket = makeSocket();
      sockets.push(socket);
      return socket;
    });
    useRemoteServersStore.getState().setSocketFactory(socketFactory);
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });
    await vi.waitFor(() => expect(socketFactory).toHaveBeenCalledTimes(1));

    await useRemoteServersStore.getState().openRemoteThread("d1", "rt-1");

    expect(sync.applyThreadSnapshot).toHaveBeenCalledTimes(1);
    expect(useRemoteServersStore.getState().openThread?.threadId).toBe("rt-1");
    expect(sockets[0]?.close).not.toHaveBeenCalled();

    // A thread-scoped live event frame for the OPEN thread is forwarded.
    const threadStateEvent = { type: "thread-state", threadId: "rt-1", status: "idle" };
    sockets[0]?.onmessage?.({
      data: JSON.stringify({ type: "event", seq: 1, event: threadStateEvent }),
    });
    expect(sync.dispatchRemoteSupervisorEvent).toHaveBeenCalledWith({
      ...threadStateEvent,
      threadId: remoteThreadId("d1", "rt-1"),
    });

    useRemoteServersStore.getState().closeRemoteThread();
    expect(sockets[0]?.close).not.toHaveBeenCalled();
    expect(useRemoteServersStore.getState().openThread).toBeNull();
  });

  it("streams and operates a remote terminal through the open-thread connection", async () => {
    const send = vi.fn<(data: string) => void>();
    const socket: RemoteSocketLike = {
      close: vi.fn<() => void>(),
      send,
      onmessage: null,
      onclose: null,
    };
    const writeTerminal = vi.fn<RemoteDesktopClient["writeTerminal"]>(async () => {});
    const resizeTerminal = vi.fn<RemoteDesktopClient["resizeTerminal"]>(async () => {});
    const threadHistory = vi.fn<RemoteDesktopClient["threadHistory"]>(async () => ({
      ...remoteThreadSnapshot("rt-1"),
      thread: {
        ...remoteThread,
        id: "rt-1",
        presentationMode: "terminal",
      } as Thread,
      terminalScrollback: "remote frame",
      terminalSize: { cols: 120, rows: 30 },
    }));
    useRemoteServersStore
      .getState()
      .setClientFactory(factoryFor(makeClient({ threadHistory, writeTerminal, resizeTerminal })));
    await pairIsolated(() => socket);
    await useRemoteServersStore.getState().openRemoteThread("d1", "rt-1");

    expect(useRemoteServersStore.getState().openThread).toMatchObject({
      terminalScrollback: "remote frame",
      terminalSize: { cols: 120, rows: 30 },
    });
    const onOutput = vi.fn<(data: string) => void>();
    const onReset = vi.fn<() => void>();
    const onExited = vi.fn<(exitCode: number | null) => void>();
    const unsubscribe = watchRemoteTerminal("d1", "rt-1", { onOutput, onReset, onExited });
    expect(send).toHaveBeenCalledWith(JSON.stringify({ type: "terminal-watch", id: "rt-1" }));

    socket.onmessage?.({
      data: JSON.stringify({ type: "terminal-output", id: "rt-1", data: "next frame" }),
    });
    socket.onmessage?.({
      data: JSON.stringify({
        type: "event",
        seq: 2,
        event: { type: "thread-reset", threadId: "rt-1" },
      }),
    });
    socket.onmessage?.({
      data: JSON.stringify({
        type: "event",
        seq: 3,
        event: { type: "thread-exited", threadId: "rt-1", exitCode: 7 },
      }),
    });
    expect(onOutput).toHaveBeenCalledWith("next frame");
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(onExited).toHaveBeenCalledWith(7);

    await useRemoteServersStore.getState().writeThreadTerminal("d1", "rt-1", "x");
    await useRemoteServersStore
      .getState()
      .resizeThreadTerminal("d1", "rt-1", { cols: 100, rows: 25 });
    expect(writeTerminal).toHaveBeenCalledWith({ threadId: "rt-1", data: "x" });
    expect(resizeTerminal).toHaveBeenCalledWith({ threadId: "rt-1", cols: 100, rows: 25 });

    unsubscribe();
    expect(send).toHaveBeenCalledWith(JSON.stringify({ type: "terminal-unwatch", id: "rt-1" }));
  });

  it("refreshes shell snapshot when remote thread metadata changes over the socket", async () => {
    const socket: RemoteSocketLike = { close: vi.fn<() => void>(), onmessage: null, onclose: null };
    const snapshot = vi.fn<RemoteDesktopClient["snapshot"]>(async () => ({
      snapshotSeq: 2,
      projects: [proj],
      threads: [{ ...remoteThread, id: "rt-1", title: "Renamed remotely" } as Thread],
      runtimeSummariesByThread: {},
      updatedAt: "later",
    }));
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient({ snapshot })));
    await pairIsolated(() => socket);
    await useRemoteServersStore.getState().openRemoteThread("d1", "rt-1");
    snapshot.mockClear();
    sync.dispatchRemoteSupervisorEvent.mockClear();
    vi.useFakeTimers();

    socket.onmessage?.({
      data: JSON.stringify({
        type: "event",
        seq: 2,
        event: { type: "remote-threads-changed", threadIds: ["rt-1"] },
      }),
    });

    // `remote-threads-changed` is a desktop-global broadcast: it must NOT be
    // forwarded into the shared runtime store on the desktop-as-client path…
    expect(sync.dispatchRemoteSupervisorEvent).not.toHaveBeenCalled();
    // …but it still triggers a (debounced) snapshot refresh so the sidebar picks
    // up the renamed thread.
    await vi.advanceTimersByTimeAsync(600);
    expect(snapshot).toHaveBeenCalledTimes(1);
    expect(useRemoteServersStore.getState().runtime.d1?.threads[0]?.title).toBe("Renamed remotely");
  });

  it("closes a remote thread pane when the refreshed snapshot no longer contains it", async () => {
    const socket: RemoteSocketLike = { close: vi.fn<() => void>(), onmessage: null, onclose: null };
    const snapshot = vi.fn<RemoteDesktopClient["snapshot"]>(async () => ({
      snapshotSeq: 1,
      projects: [proj],
      threads: [remoteThread],
      runtimeSummariesByThread: {},
      updatedAt: "now",
    }));
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient({ snapshot })));
    await pairIsolated(() => socket);
    await useRemoteServersStore.getState().openRemoteThread("d1", "rt-1");
    const projectedThreadId = remoteThreadId("d1", "rt-1");
    useAppStore.setState({ view: { kind: "thread", panes: [projectedThreadId] } });
    snapshot.mockResolvedValue({
      snapshotSeq: 2,
      projects: [proj],
      threads: [],
      runtimeSummariesByThread: {},
      updatedAt: "later",
    });
    vi.useFakeTimers();

    socket.onmessage?.({
      data: JSON.stringify({
        type: "event",
        seq: 2,
        event: { type: "remote-threads-changed", threadIds: ["rt-1"] },
      }),
    });
    await vi.advanceTimersByTimeAsync(600);

    expect(useAppStore.getState().threads).not.toContainEqual(
      expect.objectContaining({ id: projectedThreadId }),
    );
    expect(useAppStore.getState().view).toEqual({ kind: "home" });
    expect(useRemoteServersStore.getState().openThread).toBeNull();
  });

  it("closes a remote project draft when the refreshed snapshot no longer contains it", async () => {
    const socket: RemoteSocketLike = { close: vi.fn<() => void>(), onmessage: null, onclose: null };
    const snapshot = vi.fn<RemoteDesktopClient["snapshot"]>(async () => ({
      snapshotSeq: 1,
      projects: [proj],
      threads: [],
      runtimeSummariesByThread: {},
      updatedAt: "now",
    }));
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient({ snapshot })));
    useRemoteServersStore.getState().setSocketFactory(() => socket);
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });
    const projectedProjectId = remoteProjectId("d1", "p1");
    useAppStore.setState({ view: { kind: "draft", projectId: projectedProjectId } });
    snapshot.mockResolvedValue({
      snapshotSeq: 2,
      projects: [],
      threads: [],
      runtimeSummariesByThread: {},
      updatedAt: "later",
    });
    vi.useFakeTimers();

    socket.onmessage?.({
      data: JSON.stringify({
        type: "event",
        seq: 2,
        event: { type: "remote-projects-changed", projects: [] },
      }),
    });
    await vi.advanceTimersByTimeAsync(600);

    expect(useAppStore.getState().projects).not.toContainEqual(
      expect.objectContaining({ id: projectedProjectId }),
    );
    expect(useAppStore.getState().view).toEqual({ kind: "home" });
  });

  it("reconciles cached Git counts from the authoritative shell snapshot", async () => {
    const projectedProjectId = remoteProjectId("d1", "p1");
    useGitStore.setState({ statuses: { [projectedProjectId]: gitStatus(6) } });
    useRemoteServersStore.getState().setClientFactory(
      factoryFor(
        makeClient({
          snapshot: async () => ({
            snapshotSeq: 1,
            projects: [proj],
            threads: [remoteThread],
            runtimeSummariesByThread: {},
            gitSummariesByThread: {
              "rt-1": {
                isRepo: true,
                branch: "main",
                totalInsertions: 0,
                totalDeletions: 0,
                ahead: 0,
                behind: 0,
                pr: null,
              },
            },
            updatedAt: "now",
          }),
        }),
      ),
    );

    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });

    expect(useGitStore.getState().statuses[projectedProjectId]?.behind).toBe(0);
  });

  it("updates cached Git counts when the remote desktop publishes a pull result", async () => {
    const socket = makeSocket();
    useRemoteServersStore.getState().setClientFactory(
      factoryFor(
        makeClient({
          snapshot: async () => ({
            snapshotSeq: 1,
            projects: [proj],
            threads: [remoteThread],
            runtimeSummariesByThread: {},
            updatedAt: "now",
          }),
        }),
      ),
    );
    useRemoteServersStore.getState().setSocketFactory(() => socket);
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });
    const projectedProjectId = remoteProjectId("d1", "p1");
    useGitStore.setState({ statuses: { [projectedProjectId]: gitStatus(6) } });

    socket.onmessage?.({
      data: JSON.stringify({
        type: "event",
        seq: 2,
        event: {
          type: "remote-git-summaries",
          summaries: {
            "rt-1": {
              isRepo: true,
              branch: "main",
              totalInsertions: 0,
              totalDeletions: 0,
              ahead: 0,
              behind: 0,
              pr: null,
            },
          },
        },
      }),
    });

    expect(useGitStore.getState().statuses[projectedProjectId]?.behind).toBe(0);
  });

  it("reconnects the shared server socket from the latest seen event seq", async () => {
    vi.useFakeTimers();
    let ticketSeq = 0;
    const sockets: RemoteSocketLike[] = [];
    const websocketTicket = vi.fn<RemoteDesktopClient["websocketTicket"]>(
      async () => `ticket-${++ticketSeq}`,
    );
    const websocketUrl = vi.fn<RemoteDesktopClient["websocketUrl"]>(
      (ticket, lastSeenSeq) => `ws://192.168.1.9:38987/ws?ticket=${ticket}&last=${lastSeenSeq}`,
    );
    const socketFactory = vi.fn<(url: string) => RemoteSocketLike>(() => {
      const socket: RemoteSocketLike = {
        close: vi.fn<() => void>(),
        onmessage: null,
        onclose: null,
      };
      sockets.push(socket);
      return socket;
    });
    useRemoteServersStore
      .getState()
      .setClientFactory(factoryFor(makeClient({ websocketTicket, websocketUrl })));
    // Pair, then close the pair-time event stream and reset socket/ticket
    // tracking so we observe the stream restarted by openRemoteThread below.
    await pairIsolated(socketFactory);
    await vi.advanceTimersByTimeAsync(0);
    sockets.length = 0;
    socketFactory.mockClear();
    ticketSeq = 0;

    await useRemoteServersStore.getState().openRemoteThread("d1", "rt-1");
    expect(socketFactory).toHaveBeenCalledTimes(1);
    expect(socketFactory).toHaveBeenNthCalledWith(
      1,
      "ws://192.168.1.9:38987/ws?ticket=ticket-1&last=1",
    );

    sockets[0]?.onmessage?.({
      data: JSON.stringify({
        type: "event",
        seq: 7,
        event: { type: "thread-state", threadId: "rt-1", status: "idle" },
      }),
    });
    sockets[0]?.onclose?.();
    await vi.advanceTimersByTimeAsync(1000);
    await Promise.resolve();

    expect(socketFactory).toHaveBeenCalledTimes(2);
    expect(socketFactory).toHaveBeenNthCalledWith(
      2,
      "ws://192.168.1.9:38987/ws?ticket=ticket-2&last=7",
    );

    sync.dispatchRemoteSupervisorEvent.mockClear();
    const second = { type: "thread-state", threadId: "rt-1", status: "running" };
    sockets[1]?.onmessage?.({
      data: JSON.stringify({ type: "event", seq: 8, event: second }),
    });
    expect(sync.dispatchRemoteSupervisorEvent).toHaveBeenCalledWith({
      ...second,
      threadId: remoteThreadId("d1", "rt-1"),
    });
  });

  it("refreshes remote thread history when websocket replay requires resync", async () => {
    const socket: RemoteSocketLike = {
      close: vi.fn<() => void>(),
      onmessage: null,
      onclose: null,
    };
    const threadHistory = vi.fn<RemoteDesktopClient["threadHistory"]>(async () =>
      remoteThreadSnapshot("rt-1"),
    );
    threadHistory.mockResolvedValueOnce(remoteThreadSnapshot("rt-1"));
    threadHistory.mockResolvedValueOnce({
      ...remoteThreadSnapshot("rt-1"),
      snapshotSeq: 9,
      thread: { ...remoteThread, id: "rt-1", title: "Remote rt-1 resynced" },
    });
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient({ threadHistory })));
    await pairIsolated(() => socket);
    const applyCallsBefore = sync.applyThreadSnapshot.mock.calls.length;
    await useRemoteServersStore.getState().openRemoteThread("d1", "rt-1");

    socket.onmessage?.({
      data: JSON.stringify({
        type: "resync-required",
        seq: 9,
        reason: "Event replay window expired; request a fresh snapshot.",
      }),
    });

    await vi.waitFor(() => expect(threadHistory).toHaveBeenCalledTimes(2));
    expect(sync.applyThreadSnapshot).toHaveBeenCalledTimes(applyCallsBefore + 2);
    expect(useRemoteServersStore.getState().openThread?.thread.title).toBe("Remote rt-1 resynced");
  });

  it("keeps the shared server event socket alive after manual thread close", async () => {
    vi.useFakeTimers();
    const sockets: RemoteSocketLike[] = [];
    const socketFactory = vi.fn<(url: string) => RemoteSocketLike>(() => {
      const socket: RemoteSocketLike = {
        close: vi.fn<() => void>(),
        onmessage: null,
        onclose: null,
      };
      sockets.push(socket);
      return socket;
    });
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient()));
    await pairIsolated(socketFactory);
    await vi.advanceTimersByTimeAsync(0);
    sockets.length = 0;
    socketFactory.mockClear();

    await useRemoteServersStore.getState().openRemoteThread("d1", "rt-1");

    useRemoteServersStore.getState().closeRemoteThread();
    await vi.advanceTimersByTimeAsync(20_000);
    await Promise.resolve();

    expect(sockets[0]?.close).not.toHaveBeenCalled();
    expect(socketFactory).toHaveBeenCalledTimes(1);
  });

  it("closes the shared event socket when its server is removed", async () => {
    const socket: RemoteSocketLike = { close: vi.fn<() => void>(), onmessage: null, onclose: null };
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient()));
    // pairIsolated tears down the pair-time stream; opening the thread restarts
    // that single shared server socket, which removeServer closes exactly once.
    await pairIsolated(() => socket);
    await useRemoteServersStore.getState().openRemoteThread("d1", "rt-1");
    expect(useRemoteServersStore.getState().openThread).not.toBeNull();

    useRemoteServersStore.getState().removeServer("d1");
    expect(useRemoteServersStore.getState().openThread).toBeNull();
    expect(socket.close).toHaveBeenCalledTimes(1);
    expect(useRemoteServersStore.getState().servers).toHaveLength(0);
  });

  it("sends thread input with the normal composer's full payload", async () => {
    const sendThreadInput = vi.fn<RemoteDesktopClient["sendThreadInput"]>(async () => {});
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient({ sendThreadInput })));
    useRemoteServersStore.getState().setSocketFactory(() => ({
      close: vi.fn<() => void>(),
      onmessage: null,
      onclose: null,
    }));
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });
    await useRemoteServersStore.getState().sendThreadInput({
      desktopId: "d1",
      threadId: "rt-1",
      prompt: "hello remote",
      segments: [{ kind: "text", content: "hello remote" }],
      config: { model: "claude-sonnet" },
      userMessageItemId: "user-1",
    });
    expect(sendThreadInput).toHaveBeenCalledWith({
      threadId: "rt-1",
      prompt: "hello remote",
      segments: [{ kind: "text", content: "hello remote" }],
      config: { model: "claude-sonnet" },
      userMessageItemId: "user-1",
    });
  });

  it("uploads pasted clipboard images to the remote host", async () => {
    const uploadAttachment = vi.fn<RemoteDesktopClient["uploadAttachment"]>(
      async () => "C:\\remote\\attachments\\clipboard.png",
    );
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient({ uploadAttachment })));
    useRemoteServersStore.getState().setSocketFactory(() => ({
      close: vi.fn<() => void>(),
      onmessage: null,
      onclose: null,
    }));
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });

    const data = new Uint8Array([1, 2, 3]);
    await expect(
      useRemoteServersStore.getState().saveClipboardImage("d1", {
        threadId: "rt-1",
        data,
        extension: "png",
      }),
    ).resolves.toBe("C:\\remote\\attachments\\clipboard.png");
    expect(uploadAttachment).toHaveBeenCalledWith({
      threadId: "rt-1",
      fileName: expect.stringMatching(/^clipboard-[0-9a-f-]+\.png$/),
      data,
    });
  });

  it("starts a thread for a selected remote project and opens it", async () => {
    const startedThread = {
      ...remoteThread,
      id: "rt-new",
      title: "New remote thread",
      presentationMode: "gui",
    } as Thread;
    const startNewThread = vi.fn<RemoteDesktopClient["startNewThread"]>(async () => ({
      threadId: "rt-new",
    }));
    const client = makeClient({
      startNewThread,
      snapshot: async () => ({
        snapshotSeq: 2,
        projects: [proj],
        threads: [startedThread],
        runtimeSummariesByThread: {},
        updatedAt: "now",
      }),
      threadHistory: async () => ({
        ...remoteThreadSnapshot("rt-new"),
        thread: startedThread,
      }),
    });
    useRemoteServersStore.getState().setClientFactory(factoryFor(client));
    await pairIsolated(() => makeSocket());
    await useRemoteServersStore.getState().launchRemoteThread({
      desktopId: "d1",
      projectId: "p1",
      agentKind: "claude",
      config: { model: "claude-sonnet" },
      prompt: "work remotely",
      presentationMode: "gui",
    });

    expect(startNewThread).toHaveBeenCalledWith({
      projectId: "p1",
      agentKind: "claude",
      config: { model: "claude-sonnet" },
      prompt: "work remotely",
      presentationMode: "gui",
    });
    expect(useRemoteServersStore.getState().openThread?.threadId).toBe("rt-new");
  });

  it("keeps the latest open remote thread when an earlier history request resolves last", async () => {
    const slow = deferred<RemoteThreadHistorySnapshot>();
    const fast = deferred<RemoteThreadHistorySnapshot>();
    const threadHistory = vi.fn<RemoteDesktopClient["threadHistory"]>((threadId) =>
      threadId === "rt-slow" ? slow.promise : fast.promise,
    );
    const socketFactory = vi.fn<() => RemoteSocketLike>(() => ({
      close: vi.fn<() => void>(),
      onmessage: null,
      onclose: null,
    }));
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient({ threadHistory })));
    // Pair, then isolate: tear down the pair-time event socket so socketFactory
    // below counts only the shared stream restarted for the winning open.
    await pairIsolated(socketFactory);
    const applyCallsBefore = sync.applyThreadSnapshot.mock.calls.length;

    const firstOpen = useRemoteServersStore.getState().openRemoteThread("d1", "rt-slow");
    const secondOpen = useRemoteServersStore.getState().openRemoteThread("d1", "rt-fast");
    fast.resolve(remoteThreadSnapshot("rt-fast"));
    await secondOpen;
    expect(useRemoteServersStore.getState().openThread?.threadId).toBe("rt-fast");

    slow.resolve(remoteThreadSnapshot("rt-slow"));
    await firstOpen;

    expect(useRemoteServersStore.getState().openThread?.threadId).toBe("rt-fast");
    expect(sync.applyThreadSnapshot).toHaveBeenCalledTimes(applyCallsBefore + 1);
    expect(socketFactory).toHaveBeenCalledTimes(1);
  });

  // ── Finding #1: desktop-as-client event filtering ──────────────────
  describe("filterRemoteThreadEvent", () => {
    it("drops unrelated desktop-global events but keeps Git summaries", () => {
      expect(
        filterRemoteThreadEvent({ type: "windows-agent-statuses", statuses: [] }, "rt-1"),
      ).toBeNull();
      expect(
        filterRemoteThreadEvent({ type: "wsl-agent-statuses", statuses: [] }, "rt-1"),
      ).toBeNull();
      expect(
        filterRemoteThreadEvent({ type: "agent-status-updated", status: {} }, "rt-1"),
      ).toBeNull();
      const gitSummaries = { type: "remote-git-summaries", summaries: {} };
      expect(filterRemoteThreadEvent(gitSummaries, "rt-1")).toBe(gitSummaries);
      expect(
        filterRemoteThreadEvent({ type: "remote-projects-changed", projects: [] }, "rt-1"),
      ).toBeNull();
      expect(
        filterRemoteThreadEvent({ type: "remote-threads-changed", threadIds: ["rt-1"] }, "rt-1"),
      ).toBeNull();
    });

    it("forwards thread-scoped lifecycle events only for the open thread", () => {
      const own = { type: "thread-state", threadId: "rt-1", status: "idle" };
      expect(filterRemoteThreadEvent(own, "rt-1")).toBe(own);
      const other = { type: "thread-state", threadId: "rt-2", status: "idle" };
      expect(filterRemoteThreadEvent(other, "rt-1")).toBeNull();
    });

    it("filters runtime-event batches down to the open thread only", () => {
      // A multi-batch carrying the open thread plus an unrelated one keeps only ours.
      const multi = {
        type: "thread-runtime-events-multi",
        batches: [
          { threadId: "rt-1", events: [{ type: "session.started", threadId: "rt-1" }] },
          { threadId: "rt-2", events: [{ type: "session.started", threadId: "rt-2" }] },
        ],
      };
      const filtered = filterRemoteThreadEvent(multi, "rt-1") as {
        type: string;
        batches: Array<{ threadId: string }>;
      };
      expect(filtered.type).toBe("thread-runtime-events-multi");
      expect(filtered.batches).toHaveLength(1);
      expect(filtered.batches[0]?.threadId).toBe("rt-1");

      // An unrelated single-thread runtime batch is dropped entirely.
      expect(
        filterRemoteThreadEvent(
          {
            type: "thread-runtime-event",
            threadId: "rt-2",
            event: { type: "session.started", threadId: "rt-2" },
          },
          "rt-1",
        ),
      ).toBeNull();
    });
  });

  it("does not clobber local agent statuses when a remote agent-status event arrives", async () => {
    const socket: RemoteSocketLike = { close: vi.fn<() => void>(), onmessage: null, onclose: null };
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient()));
    await pairIsolated(() => socket);
    await useRemoteServersStore.getState().openRemoteThread("d1", "rt-1");
    sync.dispatchRemoteSupervisorEvent.mockClear();

    const before = useAgentStatusesStore.getState().agentStatuses;
    socket.onmessage?.({
      data: JSON.stringify({
        type: "event",
        seq: 2,
        event: { type: "windows-agent-statuses", statuses: [{ id: "remote-agent" }] },
      }),
    });

    // The desktop-global agent-status event is filtered out entirely.
    expect(sync.dispatchRemoteSupervisorEvent).not.toHaveBeenCalled();
    expect(useAgentStatusesStore.getState().agentStatuses).toBe(before);
  });

  it("does not hydrate an unrelated thread's runtime batch but applies the open thread's", async () => {
    const socket: RemoteSocketLike = { close: vi.fn<() => void>(), onmessage: null, onclose: null };
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient()));
    await pairIsolated(() => socket);
    await useRemoteServersStore.getState().openRemoteThread("d1", "rt-1");
    sync.dispatchRemoteSupervisorEvent.mockClear();

    // Unrelated thread's runtime batch: not forwarded.
    socket.onmessage?.({
      data: JSON.stringify({
        type: "event",
        seq: 2,
        event: {
          type: "thread-runtime-event",
          threadId: "rt-other",
          event: { type: "session.started", threadId: "rt-other" },
        },
      }),
    });
    expect(sync.dispatchRemoteSupervisorEvent).not.toHaveBeenCalled();

    // The open thread's own runtime batch IS forwarded (as a narrowed multi).
    socket.onmessage?.({
      data: JSON.stringify({
        type: "event",
        seq: 3,
        event: {
          type: "thread-runtime-event",
          threadId: "rt-1",
          event: { type: "session.started", threadId: "rt-1" },
        },
      }),
    });
    expect(sync.dispatchRemoteSupervisorEvent).toHaveBeenCalledTimes(1);
    const forwarded = sync.dispatchRemoteSupervisorEvent.mock.calls[0]?.[0] as {
      type: string;
      batches: Array<{ threadId: string }>;
    };
    expect(forwarded.type).toBe("thread-runtime-events-multi");
    expect(forwarded.batches[0]?.threadId).toBe(remoteThreadId("d1", "rt-1"));
  });

  // ── Finding #2: refresh coalescing / out-of-order + seq clamp ───────
  it("ignores a stale refresh result that resolves after a newer one", async () => {
    const first = deferred<RemoteShellSnapshot>();
    const second = deferred<RemoteShellSnapshot>();
    let refreshCall = 0;
    const snapshot = vi.fn<RemoteDesktopClient["snapshot"]>(() =>
      ++refreshCall === 1 ? first.promise : second.promise,
    );
    // Pair with a client whose snapshot resolves immediately, then swap to the
    // deferred-snapshot client so ONLY the two explicit refreshes are controlled.
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient()));
    await pairIsolated(() => makeSocket());
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient({ snapshot })));

    // Two overlapping refreshes; the SECOND (newer) resolves first with the
    // fresh state, then the FIRST (stale) resolves — it must be ignored.
    const p1 = useRemoteServersStore.getState().refreshServer("d1");
    const p2 = useRemoteServersStore.getState().refreshServer("d1");
    second.resolve({
      snapshotSeq: 9,
      projects: [proj, proj2],
      threads: [{ ...remoteThread, id: "rt-1", title: "Newer" } as Thread],
      runtimeSummariesByThread: {},
      updatedAt: "newer",
    });
    await p2;
    expect(useRemoteServersStore.getState().runtime.d1?.threads[0]?.title).toBe("Newer");

    first.resolve({
      snapshotSeq: 3,
      projects: [proj],
      threads: [{ ...remoteThread, id: "rt-1", title: "Stale" } as Thread],
      runtimeSummariesByThread: {},
      updatedAt: "stale",
    });
    await p1;

    // Stale result did NOT overwrite the newer state, and the seq cursor was
    // clamped with Math.max (stays at 9, not regressed to 3).
    expect(useRemoteServersStore.getState().runtime.d1?.threads[0]?.title).toBe("Newer");
    expect(useRemoteServersStore.getState().runtime.d1?.projects).toHaveLength(2);
  });

  it("does not flicker to connecting when a snapshot is already cached", async () => {
    const statuses: (string | undefined)[] = [];
    const snapshot = vi.fn<RemoteDesktopClient["snapshot"]>(async () => {
      statuses.push(useRemoteServersStore.getState().runtime.d1?.status);
      return {
        snapshotSeq: 2,
        projects: [proj],
        threads: [],
        runtimeSummariesByThread: {},
        updatedAt: "now",
      };
    });
    // Pair with a default client (seeds an "online" runtime), then swap to the
    // status-tracking client so `statuses` only records the explicit refresh.
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient()));
    await pairIsolated(() => makeSocket());
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient({ snapshot })));

    // pairServer seeded an "online" runtime; a subsequent refresh must not flip
    // it to "connecting" while the snapshot GET is in flight.
    await useRemoteServersStore.getState().refreshServer("d1");
    expect(statuses).toEqual(["online"]);
  });

  it("marks a cached server as connecting while connectAll checks it", async () => {
    const statuses: (string | undefined)[] = [];
    const snapshot = vi.fn<RemoteDesktopClient["snapshot"]>(async () => {
      statuses.push(useRemoteServersStore.getState().runtime.d1?.status);
      return {
        snapshotSeq: 2,
        projects: [proj],
        threads: [],
        runtimeSummariesByThread: {},
        updatedAt: "now",
      };
    });
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient()));
    await pairIsolated(() => makeSocket());
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient({ snapshot })));

    await useRemoteServersStore.getState().connectAll();

    expect(statuses).toEqual(["connecting"]);
    expect(useRemoteServersStore.getState().runtime.d1?.status).toBe("online");
  });

  it("preserves an unchanged remote runtime snapshot identity", async () => {
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient()));
    await pairIsolated(() => makeSocket());
    const before = useRemoteServersStore.getState().runtime.d1!;
    useRemoteServersStore.getState().setClientFactory(
      factoryFor(
        makeClient({
          agentStatuses: async () => ({ windows: [], wsl: [], updatedAt: "later" }),
          snapshot: async () => ({
            snapshotSeq: 2,
            projects: [{ ...proj, location: { ...proj.location } }],
            threads: [],
            runtimeSummariesByThread: {},
            updatedAt: "later",
          }),
        }),
      ),
    );

    await useRemoteServersStore.getState().refreshServer("d1");
    const after = useRemoteServersStore.getState().runtime.d1!;

    expect(after).toBe(before);
    expect(after.projects).toBe(before.projects);
  });

  // ── Finding #3: pairing during in-flight connectAll ─────────────────
  it("starts the event stream for a server paired during an in-flight connectAll", async () => {
    // Pre-seed one persisted server whose refresh hangs, so connectAll stays
    // in flight while we pair a NEW server.
    const hang = deferred<RemoteShellSnapshot>();
    const socketFactory = vi.fn<RemoteSocketFactory>(() => makeSocket());
    useRemoteServersStore.getState().setSocketFactory(socketFactory);
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "d0",
          label: "Existing",
          endpoint: "http://192.168.1.8:38987/",
          accessToken: "tok0",
          scopes: [],
        },
      ],
      runtime: {},
    });
    const existingClient = makeClient({ snapshot: () => hang.promise });
    const newClient = makeClient();
    useRemoteServersStore
      .getState()
      .setClientFactory((endpoint) =>
        endpoint.includes("192.168.1.8") ? existingClient : newClient,
      );

    const connectAllPromise = useRemoteServersStore.getState().connectAll();
    // Pair a new server while connectAll is still awaiting the hung refresh.
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });

    // The newly paired server got its own event stream immediately (its socket
    // was created by startRemoteServerEventStream from pairServer's closure).
    await vi.waitFor(() => expect(socketFactory).toHaveBeenCalled());

    hang.resolve({
      snapshotSeq: 1,
      projects: [],
      threads: [],
      runtimeSummariesByThread: {},
      updatedAt: "now",
    });
    await connectAllPromise;
  });

  // ── Finding #5: debounced refresh coalesces a burst ─────────────────
  it("coalesces a burst of qualifying events into a single snapshot refresh", async () => {
    vi.useFakeTimers();
    const socket: RemoteSocketLike = { close: vi.fn<() => void>(), onmessage: null, onclose: null };
    const snapshot = vi.fn<RemoteDesktopClient["snapshot"]>(async () => ({
      snapshotSeq: 2,
      projects: [proj],
      threads: [],
      runtimeSummariesByThread: {},
      updatedAt: "now",
    }));
    const agentStatuses = vi.fn<RemoteDesktopClient["agentStatuses"]>(async () => ({
      windows: [],
      wsl: [],
      updatedAt: "now",
    }));
    useRemoteServersStore
      .getState()
      .setClientFactory(factoryFor(makeClient({ snapshot, agentStatuses })));
    await pairIsolated(() => socket);
    // Fire the debounced scheduler via qualifying events on the open-thread
    // socket; only the debounced scheduler snapshots (not open/pair).
    await useRemoteServersStore.getState().openRemoteThread("d1", "rt-1");
    snapshot.mockClear();
    agentStatuses.mockClear();

    // A burst of qualifying (metadata-changing) events.
    for (let i = 0; i < 5; i++) {
      socket.onmessage?.({
        data: JSON.stringify({
          type: "event",
          seq: 10 + i,
          event: { type: "remote-threads-changed", threadIds: ["rt-1"] },
        }),
      });
    }
    // No immediate GET; the scheduler is debounced.
    expect(snapshot).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(600);
    expect(snapshot).toHaveBeenCalledTimes(1);
    expect(agentStatuses).not.toHaveBeenCalled();

    socket.onmessage?.({
      data: JSON.stringify({
        type: "event",
        seq: 20,
        event: { type: "windows-agent-statuses", statuses: [] },
      }),
    });
    await vi.advanceTimersByTimeAsync(600);
    expect(snapshot).toHaveBeenCalledTimes(2);
    expect(agentStatuses).toHaveBeenCalledTimes(1);

    socket.onmessage?.({
      data: JSON.stringify({
        type: "event",
        seq: 21,
        event: { type: "agent-status-updated", status: { kind: "claude" } },
      }),
    });
    await vi.advanceTimersByTimeAsync(600);
    expect(snapshot).toHaveBeenCalledTimes(3);
    expect(agentStatuses).toHaveBeenCalledTimes(2);
  });

  // ── Finding #6: failing openRemoteThread does not reject ────────────
  it("does not reject (and reports) when openRemoteThread fails", async () => {
    const threadHistory = vi.fn<RemoteDesktopClient["threadHistory"]>(async () => {
      throw new Error("server offline");
    });
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient({ threadHistory })));
    useRemoteServersStore.getState().setSocketFactory(() => makeSocket());
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });

    // Must resolve (not reject) so the caller's `void openRemoteThread(...)`
    // never hits the renderer's global unhandledrejection crash screen.
    await expect(
      useRemoteServersStore.getState().openRemoteThread("d1", "rt-1"),
    ).resolves.toBeUndefined();
    // The failure is reflected in the server's runtime status/message.
    expect(useRemoteServersStore.getState().runtime.d1?.status).toBe("error");
    expect(useRemoteServersStore.getState().runtime.d1?.message).toBe("server offline");
    expect(useRemoteServersStore.getState().openThread).toBeNull();
  });

  // ── Selective project sync ──────────────────────────────────────────
  it("never mirrors the remote's built-in Home scope project", async () => {
    const home: Project = { ...proj, id: HOME_PROJECT_ID, name: "Home" };
    useRemoteServersStore
      .getState()
      .setClientFactory(factoryFor(makeClient({ snapshotProjects: [home, proj] })));

    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });

    const mirrored = useAppStore
      .getState()
      .projects.filter((project) => project.remoteServerId === "d1");
    expect(mirrored.map((project) => project.remoteId)).toEqual(["p1"]);
    // The full list stays in the runtime snapshot for the settings picker.
    expect(useRemoteServersStore.getState().runtime.d1?.projects).toHaveLength(2);
  });

  it("excludes a project from sync locally, without reaching the server", async () => {
    const snapshot = vi.fn<RemoteDesktopClient["snapshot"]>(async () => ({
      snapshotSeq: 0,
      projects: [proj, proj2],
      threads: [remoteThread],
      runtimeSummariesByThread: {},
      updatedAt: "now",
    }));
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient({ snapshot })));
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });
    const callsAfterPairing = snapshot.mock.calls.length;

    useRemoteServersStore.getState().setRemoteProjectSynced("d1", "p1", false);

    const remoteIds = () =>
      useAppStore
        .getState()
        .projects.filter((project) => project.remoteServerId === "d1")
        .map((project) => project.remoteId);
    expect(remoteIds()).toEqual(["p2"]);
    // Threads of an unsynced project would be orphans in the sidebar.
    expect(useAppStore.getState().threads.map((thread) => thread.remoteId)).not.toContain("rt-1");
    // Purely local state — nothing was asked of the server.
    expect(snapshot).toHaveBeenCalledTimes(callsAfterPairing);
    expect(useRemoteServersStore.getState().excludedProjectIds.d1).toEqual(["p1"]);

    // A later refresh must not resurrect it.
    await useRemoteServersStore.getState().refreshServer("d1");
    expect(remoteIds()).toEqual(["p2"]);

    useRemoteServersStore.getState().setRemoteProjectSynced("d1", "p1", true);
    expect(remoteIds()).toEqual(expect.arrayContaining(["p1", "p2"]));
  });

  it("does not reject when interruptThread fails against an offline server", async () => {
    const interruptThread = vi.fn<RemoteDesktopClient["interruptThread"]>(async () => {
      throw new Error("unreachable");
    });
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient({ interruptThread })));
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });

    await expect(
      useRemoteServersStore.getState().interruptThread("d1", "rt-1"),
    ).resolves.toBeUndefined();
    expect(useRemoteServersStore.getState().runtime.d1?.status).toBe("error");
  });
});

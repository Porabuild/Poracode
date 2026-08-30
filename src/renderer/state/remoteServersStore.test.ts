import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentStatus, GitStatusResult, Project, Thread } from "@/shared/contracts";
import type {
  IpcProcedureName,
  IpcProcedurePayload,
  IpcProcedureResult,
  PoracodeBridge,
} from "@/shared/ipc";
import type { GitStatePatch, GitStateSnapshot } from "@/shared/gitState";
import { HOME_PROJECT_ID } from "@/shared/homeScope";
import { PORACODE_REMOTE_PROTOCOL_VERSION, type RemoteGitSummaries } from "@/shared/remote";
import { RemoteClientError, RemoteDesktopClient } from "@/shared/remote/client";
import {
  __resetRemoteServersStoreForTest,
  installRemoteProjectWorkspaceSync,
  useRemoteServersStore,
} from "./remoteServersStore";
import { filterRemoteThreadEvent } from "./remoteServers/eventRouting";
import { mainProcessFetch } from "./remoteServers/mainProcessFetch";
import type {
  RemoteClientFactory,
  RemoteServerRecord,
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
import { installBrowserClientRuntime, resetClientRuntimeForTest } from "@/renderer/clientRuntime";
import {
  resetBrowserMirror,
  startBrowserWatch,
  stopBrowserWatch,
} from "@/renderer/browser/browserMirror";
import { useBrowserPanelStore } from "./browserPanelStore";

async function invokeRemoteRoute<Name extends IpcProcedureName>(
  procedure: Name,
  payload: IpcProcedurePayload<Name>,
): Promise<IpcProcedureResult<Name> | undefined> {
  const decision = routeRemoteProcedure(procedure, payload);
  return decision.kind === "remote" ? decision.result : undefined;
}

const bridge = vi.hoisted(() => ({
  sshConnect: vi.fn<() => Promise<unknown>>(),
  sshDisconnect: vi.fn<() => Promise<void>>(async () => {}),
  remoteHttpRequest: vi.fn<() => Promise<unknown>>(),
}));
vi.mock("@/renderer/bridge", () => ({ readBridge: () => bridge }));

const browserBridge = vi.hoisted(() => ({
  setClient: vi.fn<(client: RemoteDesktopClient | null) => void>(),
}));
vi.mock("@/renderer/browser/remoteBridge", () => ({
  setRemoteBridgeClient: (client: RemoteDesktopClient | null) => browserBridge.setClient(client),
}));

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
      hooks?: {
        onGitSummaries?: (summaries: RemoteGitSummaries) => void;
        onGitState?: (patch: GitStatePatch) => void;
      },
    ) => {
      sync.dispatchRemoteSupervisorEvent(value);
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

function seedRemoteThreadOwner(): void {
  const projectedId = remoteThreadId("d1", "rt-1");
  useAppStore.setState((state) => ({
    threads: [
      ...state.threads.filter((thread) => thread.id !== projectedId),
      {
        ...remoteThread,
        id: projectedId,
        remoteId: "rt-1",
        remoteServerId: "d1",
        projectId: remoteProjectId("d1", "p1"),
      } as Thread,
    ],
  }));
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

function gitState(behind: number, revision = 1): GitStateSnapshot {
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
  let reject: (reason?: unknown) => void = () => {};
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function makeSocket(overrides: Partial<RemoteSocketLike> = {}): RemoteSocketLike {
  return { close: vi.fn<() => void>(), onmessage: null, onclose: null, ...overrides };
}

function makeClient(opts?: {
  snapshotProjects?: Project[];
  snapshotThrows?: boolean;
  snapshot?: RemoteDesktopClient["snapshot"];
  agentStatuses?: RemoteDesktopClient["agentStatuses"];
  environment?: RemoteDesktopClient["environment"];
  environmentHttpBaseUrl?: string;
  hostMode?: "desktop" | "helper";
  projectCommand?: RemoteDesktopClient["projectCommand"];
  projectNotes?: RemoteDesktopClient["projectNotes"];
  projectSettings?: RemoteDesktopClient["projectSettings"];
  interruptThread?: RemoteDesktopClient["interruptThread"];
  closeThread?: RemoteDesktopClient["closeThread"];
  threadHistory?: RemoteDesktopClient["threadHistory"];
  threadRuntimeItemsPage?: RemoteDesktopClient["threadRuntimeItemsPage"];
  websocketTicket?: RemoteDesktopClient["websocketTicket"];
  websocketUrl?: RemoteDesktopClient["websocketUrl"];
  sendThreadCommand?: RemoteDesktopClient["sendThreadCommand"];
  sendThreadInput?: RemoteDesktopClient["sendThreadInput"];
  uploadAttachment?: RemoteDesktopClient["uploadAttachment"];
  startThread?: RemoteDesktopClient["startThread"];
  startNewThread?: RemoteDesktopClient["startNewThread"];
  writeTerminal?: RemoteDesktopClient["writeTerminal"];
  resizeTerminal?: RemoteDesktopClient["resizeTerminal"];
  startShell?: RemoteDesktopClient["startShell"];
  closeShell?: RemoteDesktopClient["closeShell"];
  callRemoteProcedure?: RemoteDesktopClient["callRemoteProcedure"];
  hostUpdateState?: RemoteDesktopClient["hostUpdateState"];
  checkHostUpdate?: RemoteDesktopClient["checkHostUpdate"];
  settings?: RemoteDesktopClient["settings"];
  installHostUpdate?: RemoteDesktopClient["installHostUpdate"];
}): RemoteDesktopClient {
  return {
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
        ...(opts?.hostMode ? { hostMode: opts.hostMode } : {}),
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
          httpBaseUrl: opts?.environmentHttpBaseUrl ?? "http://192.168.1.9:38987/",
          wsBaseUrl: "ws://192.168.1.9:38987/",
        },
      })),
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
    projectNotes: opts?.projectNotes ?? (async () => null),
    projectSettings: opts?.projectSettings ?? (async () => ({})),
    interruptThread: opts?.interruptThread ?? (async () => {}),
    closeThread: opts?.closeThread ?? (async () => {}),
    threadHistory: opts?.threadHistory ?? (async () => remoteThreadSnapshot(remoteThread.id)),
    threadRuntimeItemsPage:
      opts?.threadRuntimeItemsPage ?? (async () => ({ items: [], nextCursor: null })),
    websocketTicket: opts?.websocketTicket ?? (async () => "ticket-1"),
    websocketUrl: opts?.websocketUrl ?? (() => "ws://192.168.1.9:38987/ws?ticket=ticket-1"),
    parseSocketMessage: (value: string) => JSON.parse(value),
    sendThreadCommand: opts?.sendThreadCommand ?? (async () => {}),
    sendThreadInput: opts?.sendThreadInput ?? (async () => {}),
    uploadAttachment: opts?.uploadAttachment ?? (async () => "/remote/attachment.png"),
    startThread: opts?.startThread ?? (async () => ({ threadId: remoteThread.id })),
    startNewThread: opts?.startNewThread ?? (async () => ({ threadId: crypto.randomUUID() })),
    writeTerminal: opts?.writeTerminal ?? (async () => {}),
    resizeTerminal: opts?.resizeTerminal ?? (async () => {}),
    startShell: opts?.startShell ?? (async () => {}),
    closeShell: opts?.closeShell ?? (async () => {}),
    callRemoteProcedure: opts?.callRemoteProcedure ?? (async () => ({})),
    hostUpdateState:
      opts?.hostUpdateState ??
      (async () => ({ currentVersion: "1.0", status: { type: "update-not-available" } })),
    checkHostUpdate:
      opts?.checkHostUpdate ??
      (async () => ({ currentVersion: "1.0", status: { type: "update-not-available" } })),
    settings: opts?.settings ?? (async () => ({})),
    installHostUpdate: opts?.installHostUpdate ?? (async () => {}),
  } as unknown as RemoteDesktopClient;
}

function factoryFor(client: RemoteDesktopClient): RemoteClientFactory {
  return () => client;
}

function makeEnvironment(
  appVersion = "1.0",
): Awaited<ReturnType<RemoteDesktopClient["environment"]>> {
  return {
    protocolVersion: PORACODE_REMOTE_PROTOCOL_VERSION,
    hostMode: "desktop",
    desktopId: "d1",
    label: "Server One",
    appVersion,
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
  };
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

  beforeEach(async () => {
    localStorage.clear();
    // Pairing now opens a per-server event socket; fully reset process-local
    // connection state so sockets/timers/seq cursors don't bleed across tests.
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
    useGitStore.setState({ statuses: {}, worktreeStatuses: {} });
    sync.applyThreadSnapshot.mockClear();
    sync.dispatchRemoteSupervisorEvent.mockClear();
    toastDanger.mockClear();
    browserBridge.setClient.mockClear();
    bridge.sshConnect.mockReset();
    bridge.sshDisconnect.mockClear();
    bridge.remoteHttpRequest.mockReset();
    // Mirrors the app-level wiring (app.tsx installs this at mount).
    uninstallWorkspaceSync = installRemoteProjectWorkspaceSync();
    await vi.waitFor(() => {
      const persistedServers = JSON.parse(localStorage.getItem("poracode-remote-servers")!).state
        .servers;
      if (persistedServers.length !== 0)
        throw new Error("Remote server reset is not persisted yet");
    });
  });

  afterEach(() => {
    uninstallWorkspaceSync?.();
    uninstallWorkspaceSync = null;
    vi.useRealTimers();
    resetClientRuntimeForTest();
    window.poracode = undefined as unknown as typeof window.poracode;
  });

  it("keeps one browser action client across refreshes of the same host", async () => {
    installBrowserClientRuntime({} as PoracodeBridge);
    window.poracode = {} as PoracodeBridge;
    const client = makeClient();
    useRemoteServersStore.getState().setClientFactory(factoryFor(client));
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "d1",
          label: "Server One",
          endpoint: "http://desktop-one.test/",
          accessToken: "token-one",
          scopes: [],
        },
      ],
      runtime: {
        d1: { status: "online", projects: [proj], threads: [] },
      },
    });

    await useRemoteServersStore.getState().refreshServer("d1");
    await useRemoteServersStore.getState().refreshServer("d1");

    expect(browserBridge.setClient).toHaveBeenCalledTimes(1);
    expect(browserBridge.setClient).toHaveBeenCalledWith(client);
  });

  it("routes the selected desktop event socket to the browser mirror", async () => {
    installBrowserClientRuntime({} as PoracodeBridge);
    window.poracode = {} as PoracodeBridge;
    resetBrowserMirror();
    const sent: string[] = [];
    const socket = makeSocket({ send: (message) => sent.push(message) });
    useRemoteServersStore.getState().setSocketFactory(() => socket);
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient()));

    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });
    startBrowserWatch();

    expect(sent.map((message) => JSON.parse(message))).toContainEqual({ type: "browser-watch" });

    socket.onmessage?.({
      data: JSON.stringify({
        type: "browser-state",
        state: {
          activeTabId: "tab-1",
          tabs: [
            {
              tabId: "tab-1",
              title: "Example",
              url: "https://example.com/",
              loading: false,
              canGoBack: false,
              canGoForward: false,
            },
          ],
        },
      }),
    });

    expect(useBrowserPanelStore.getState().activeTabId).toBe("tab-1");
    stopBrowserWatch();
    resetBrowserMirror();
  });

  it("hydrates browser model settings from the selected host's agent statuses", async () => {
    installBrowserClientRuntime({} as PoracodeBridge);
    window.poracode = {} as PoracodeBridge;
    const remoteStatus = {
      kind: "codex",
      label: "Codex on desktop",
      installed: true,
      authState: "authenticated",
      capabilities: {
        models: [],
        efforts: [],
        modelEfforts: {},
        modes: [],
        approvalPolicies: [],
        sandboxModes: [],
        supportsResume: true,
        supportsDirectInput: true,
        liveInputMode: "terminal",
        presentationMode: "terminal",
        settingDefs: [],
      },
    } as AgentStatus;
    useRemoteServersStore.getState().setClientFactory(
      factoryFor(
        makeClient({
          agentStatuses: async () => ({
            windows: [remoteStatus],
            wsl: [],
            updatedAt: "now",
          }),
        }),
      ),
    );

    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });

    expect(useAgentStatusesStore.getState().agentStatuses).toEqual([remoteStatus]);
  });

  it("switches browser actions to another online host when the active host fails", async () => {
    installBrowserClientRuntime({} as PoracodeBridge);
    window.poracode = {} as PoracodeBridge;
    const firstSnapshot = vi
      .fn<RemoteDesktopClient["snapshot"]>()
      .mockResolvedValueOnce({
        snapshotSeq: 1,
        projects: [proj],
        threads: [],
        runtimeSummariesByThread: {},
        updatedAt: "now",
      })
      .mockRejectedValueOnce(new Error("offline"));
    const first = makeClient({ snapshot: firstSnapshot });
    const second = makeClient({ snapshotProjects: [proj2] });
    useRemoteServersStore
      .getState()
      .setClientFactory((endpoint) => (endpoint.includes("desktop-one") ? first : second));
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "d1",
          label: "Server One",
          endpoint: "http://desktop-one.test/",
          accessToken: "token-one",
          scopes: [],
        },
        {
          desktopId: "d2",
          label: "Server Two",
          endpoint: "http://desktop-two.test/",
          accessToken: "token-two",
          scopes: [],
        },
      ],
      runtime: {
        d1: { status: "online", projects: [proj], threads: [] },
        d2: { status: "online", projects: [proj2], threads: [] },
      },
    });

    await useRemoteServersStore.getState().refreshServer("d1");
    await useRemoteServersStore.getState().refreshServer("d1");

    expect(browserBridge.setClient).toHaveBeenLastCalledWith(second);
  });

  it("keeps the active browser action client while its only host reconnects", async () => {
    installBrowserClientRuntime({} as PoracodeBridge);
    window.poracode = {} as PoracodeBridge;
    const snapshot = vi
      .fn<RemoteDesktopClient["snapshot"]>()
      .mockResolvedValueOnce({
        snapshotSeq: 1,
        projects: [proj],
        threads: [],
        runtimeSummariesByThread: {},
        updatedAt: "now",
      })
      .mockRejectedValueOnce(new Error("offline"));
    const client = makeClient({ snapshot });
    useRemoteServersStore.getState().setClientFactory(factoryFor(client));
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "d1",
          label: "Server One",
          endpoint: "http://desktop-one.test/",
          accessToken: "token-one",
          scopes: [],
        },
      ],
      runtime: {
        d1: { status: "online", projects: [proj], threads: [] },
      },
    });

    await useRemoteServersStore.getState().refreshServer("d1");
    await useRemoteServersStore.getState().refreshServer("d1");

    expect(browserBridge.setClient).toHaveBeenCalledOnce();
    expect(browserBridge.setClient).toHaveBeenLastCalledWith(client);
  });

  it("automatically checks for updates when a desktop host is paired", async () => {
    const checkHostUpdate = vi.fn<RemoteDesktopClient["checkHostUpdate"]>(async () => ({
      currentVersion: "1.0",
      status: { type: "update-not-available" },
    }));
    useRemoteServersStore
      .getState()
      .setClientFactory(factoryFor(makeClient({ hostMode: "desktop", checkHostUpdate })));

    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });

    expect(checkHostUpdate).toHaveBeenCalledOnce();
    expect(useRemoteServersStore.getState().hostUpdates.d1).toEqual({
      currentVersion: "1.0",
      status: { type: "update-not-available" },
    });
  });

  it("does not run desktop update checks against an SSH helper", async () => {
    const checkHostUpdate = vi.fn<RemoteDesktopClient["checkHostUpdate"]>();
    useRemoteServersStore
      .getState()
      .setClientFactory(factoryFor(makeClient({ hostMode: "helper", checkHostUpdate })));

    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });

    expect(checkHostUpdate).not.toHaveBeenCalled();
  });

  it("waits for the installed host version before restoring the connection", async () => {
    vi.useFakeTimers();
    const environment = vi
      .fn<RemoteDesktopClient["environment"]>()
      .mockResolvedValueOnce(makeEnvironment("1.0"))
      .mockResolvedValue(makeEnvironment("1.1"));
    const installHostUpdate = vi.fn<RemoteDesktopClient["installHostUpdate"]>(async () => {});
    const checkHostUpdate = vi.fn<RemoteDesktopClient["checkHostUpdate"]>(async () => ({
      currentVersion: "1.1",
      status: { type: "update-not-available" },
    }));
    useRemoteServersStore
      .getState()
      .setClientFactory(
        factoryFor(makeClient({ environment, installHostUpdate, checkHostUpdate })),
      );
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "d1",
          label: "Server One",
          endpoint: "http://192.168.1.9:38987/",
          accessToken: "acc-token",
          scopes: ["session:read", "projects:manage"],
          appVersion: "1.0",
          hostMode: "desktop",
        },
      ],
      runtime: { d1: { status: "online", projects: [proj], threads: [] } },
      hostUpdates: {
        d1: { currentVersion: "1.0", status: { type: "downloaded", version: "1.1" } },
      },
    });

    await useRemoteServersStore.getState().installHostUpdate("d1");

    expect(installHostUpdate).toHaveBeenCalledOnce();
    expect(useRemoteServersStore.getState().runtime.d1?.status).toBe("connecting");
    expect(useRemoteServersStore.getState().hostUpdates.d1).toBeUndefined();
    expect(useRemoteServersStore.getState().hostUpdateRestarts.d1).toBe("1.1");

    await vi.advanceTimersByTimeAsync(1_000);

    expect(useRemoteServersStore.getState().runtime.d1?.status).toBe("online");
    expect(useRemoteServersStore.getState().servers[0]?.appVersion).toBe("1.1");
    expect(useRemoteServersStore.getState().hostUpdateRestarts.d1).toBeUndefined();
    expect(checkHostUpdate).toHaveBeenCalledOnce();
    expect(useRemoteServersStore.getState().hostUpdates.d1).toEqual({
      currentVersion: "1.1",
      status: { type: "update-not-available" },
    });
  });

  it("ignores a stale host update response after installation starts", async () => {
    const stale = deferred<Awaited<ReturnType<RemoteDesktopClient["hostUpdateState"]>>>();
    const hostUpdateState = vi.fn<RemoteDesktopClient["hostUpdateState"]>(() => stale.promise);
    const checkHostUpdate = vi.fn<RemoteDesktopClient["checkHostUpdate"]>(async () => ({
      currentVersion: "1.1",
      status: { type: "update-not-available" },
    }));
    const client = makeClient({
      hostUpdateState,
      checkHostUpdate,
      installHostUpdate: async () => {},
      environment: async () => makeEnvironment("1.1"),
    });
    useRemoteServersStore.getState().setClientFactory(factoryFor(client));
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "d1",
          label: "Server One",
          endpoint: "http://192.168.1.9:38987/",
          accessToken: "acc-token",
          scopes: ["session:read", "projects:manage"],
          appVersion: "1.0",
          hostMode: "desktop",
        },
      ],
      runtime: { d1: { status: "online", projects: [proj], threads: [] } },
      hostUpdates: {
        d1: { currentVersion: "1.0", status: { type: "downloaded", version: "1.1" } },
      },
    });

    const staleRequest = useRemoteServersStore.getState().getHostUpdateState("d1");
    await useRemoteServersStore.getState().installHostUpdate("d1");
    await vi.waitFor(() => {
      expect(useRemoteServersStore.getState().hostUpdates.d1).toEqual({
        currentVersion: "1.1",
        status: { type: "update-not-available" },
      });
    });

    stale.resolve({
      currentVersion: "1.0",
      status: { type: "downloaded", version: "1.1" },
    });
    await staleRequest;

    expect(useRemoteServersStore.getState().hostUpdates.d1).toEqual({
      currentVersion: "1.1",
      status: { type: "update-not-available" },
    });
  });

  it("stops waiting when the updated host does not reconnect in time", async () => {
    vi.useFakeTimers();
    const environment = vi.fn<RemoteDesktopClient["environment"]>(() => new Promise(() => {}));
    useRemoteServersStore
      .getState()
      .setClientFactory(factoryFor(makeClient({ environment, installHostUpdate: async () => {} })));
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "d1",
          label: "Server One",
          endpoint: "http://192.168.1.9:38987/",
          accessToken: "acc-token",
          scopes: ["session:read", "projects:manage"],
          appVersion: "1.0",
          hostMode: "desktop",
        },
      ],
      runtime: { d1: { status: "online", projects: [proj], threads: [] } },
      hostUpdates: {
        d1: { currentVersion: "1.0", status: { type: "downloaded", version: "1.1" } },
      },
    });

    await useRemoteServersStore.getState().installHostUpdate("d1");
    await useRemoteServersStore.getState().connectAll();
    await useRemoteServersStore.getState().reconnectServer("d1");
    await vi.advanceTimersByTimeAsync(60_000);

    expect(environment).toHaveBeenCalledTimes(1);
    expect(useRemoteServersStore.getState().runtime.d1).toMatchObject({
      status: "offline",
      message: "Can't reach the remote server. Check that it is online, then reconnect it.",
    });
    expect(useRemoteServersStore.getState().hostUpdateRestarts.d1).toBeUndefined();
  });

  it("bounds the connection refresh after the updated version appears", async () => {
    vi.useFakeTimers();
    const environment = vi
      .fn<RemoteDesktopClient["environment"]>()
      .mockResolvedValueOnce(makeEnvironment("1.1"))
      .mockImplementation(() => new Promise(() => {}));
    useRemoteServersStore
      .getState()
      .setClientFactory(factoryFor(makeClient({ environment, installHostUpdate: async () => {} })));
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "d1",
          label: "Server One",
          endpoint: "http://192.168.1.9:38987/",
          accessToken: "acc-token",
          scopes: ["session:read", "projects:manage"],
          appVersion: "1.0",
          hostMode: "desktop",
        },
      ],
      runtime: { d1: { status: "online", projects: [proj], threads: [] } },
      hostUpdates: {
        d1: { currentVersion: "1.0", status: { type: "downloaded", version: "1.1" } },
      },
    });

    await useRemoteServersStore.getState().installHostUpdate("d1");
    await vi.advanceTimersByTimeAsync(60_000);

    expect(environment).toHaveBeenCalledTimes(2);
    expect(useRemoteServersStore.getState().runtime.d1?.status).toBe("offline");
    expect(useRemoteServersStore.getState().hostUpdateRestarts.d1).toBeUndefined();
  });

  it("ignores an update response from a removed server after it is paired again", async () => {
    const stale = deferred<Awaited<ReturnType<RemoteDesktopClient["hostUpdateState"]>>>();
    const hostUpdateState = vi
      .fn<RemoteDesktopClient["hostUpdateState"]>()
      .mockImplementationOnce(() => stale.promise)
      .mockResolvedValue({
        currentVersion: "2.0",
        status: { type: "update-not-available" },
      });
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient({ hostUpdateState })));
    const server: RemoteServerRecord = {
      desktopId: "d1",
      label: "Server One",
      endpoint: "http://192.168.1.9:38987/",
      accessToken: "acc-token",
      scopes: ["session:read", "projects:manage"],
      appVersion: "1.0",
      hostMode: "desktop",
    };
    useRemoteServersStore.setState({
      servers: [server],
      runtime: { d1: { status: "online", projects: [proj], threads: [] } },
    });

    const staleRequest = useRemoteServersStore.getState().getHostUpdateState("d1");
    useRemoteServersStore.getState().removeServer("d1");
    useRemoteServersStore.setState({
      servers: [server],
      runtime: { d1: { status: "online", projects: [proj], threads: [] } },
    });
    await useRemoteServersStore.getState().getHostUpdateState("d1");

    stale.resolve({
      currentVersion: "1.0",
      status: { type: "downloaded", version: "1.1" },
    });
    await staleRequest;

    expect(useRemoteServersStore.getState().hostUpdates.d1).toEqual({
      currentVersion: "2.0",
      status: { type: "update-not-available" },
    });
  });

  it("ignores an update reconnect snapshot after the server is removed and paired again", async () => {
    const staleSnapshot = deferred<RemoteShellSnapshot>();
    const snapshot = vi.fn<RemoteDesktopClient["snapshot"]>(() => staleSnapshot.promise);
    const environment = vi.fn<RemoteDesktopClient["environment"]>(async () =>
      makeEnvironment("1.1"),
    );
    useRemoteServersStore
      .getState()
      .setClientFactory(
        factoryFor(makeClient({ environment, snapshot, installHostUpdate: async () => {} })),
      );
    const server: RemoteServerRecord = {
      desktopId: "d1",
      label: "Server One",
      endpoint: "http://192.168.1.9:38987/",
      accessToken: "acc-token",
      scopes: ["session:read", "projects:manage"],
      appVersion: "1.0",
      hostMode: "desktop",
    };
    useRemoteServersStore.setState({
      servers: [server],
      runtime: { d1: { status: "online", projects: [proj], threads: [] } },
      hostUpdates: {
        d1: { currentVersion: "1.0", status: { type: "downloaded", version: "1.1" } },
      },
    });

    await useRemoteServersStore.getState().installHostUpdate("d1");
    await vi.waitFor(() => expect(snapshot).toHaveBeenCalledOnce());

    useRemoteServersStore.getState().removeServer("d1");
    useRemoteServersStore.setState({
      servers: [{ ...server, appVersion: "2.0" }],
      runtime: { d1: { status: "online", projects: [proj2], threads: [] } },
    });
    staleSnapshot.resolve({
      snapshotSeq: 99,
      projects: [proj],
      threads: [remoteThread],
      runtimeSummariesByThread: {},
      updatedAt: "stale",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(useRemoteServersStore.getState().runtime.d1).toMatchObject({
      status: "online",
      projects: [proj2],
      threads: [],
    });
    expect(useRemoteServersStore.getState().servers[0]?.appVersion).toBe("2.0");
  });

  it("ignores an update reconnect error after the server is removed and paired again", async () => {
    const pendingEnvironment = deferred<Awaited<ReturnType<RemoteDesktopClient["environment"]>>>();
    const environment = vi.fn<RemoteDesktopClient["environment"]>(() => pendingEnvironment.promise);
    useRemoteServersStore
      .getState()
      .setClientFactory(factoryFor(makeClient({ environment, installHostUpdate: async () => {} })));
    const server: RemoteServerRecord = {
      desktopId: "d1",
      label: "Server One",
      endpoint: "http://192.168.1.9:38987/",
      accessToken: "acc-token",
      scopes: ["session:read", "projects:manage"],
      appVersion: "1.0",
      hostMode: "desktop",
    };
    useRemoteServersStore.setState({
      servers: [server],
      runtime: { d1: { status: "online", projects: [proj], threads: [] } },
      hostUpdates: {
        d1: { currentVersion: "1.0", status: { type: "downloaded", version: "1.1" } },
      },
    });

    await useRemoteServersStore.getState().installHostUpdate("d1");
    await vi.waitFor(() => expect(environment).toHaveBeenCalledOnce());

    useRemoteServersStore.getState().removeServer("d1");
    useRemoteServersStore.setState({
      servers: [{ ...server, appVersion: "2.0" }],
      runtime: { d1: { status: "online", projects: [proj2], threads: [] } },
    });
    pendingEnvironment.reject(
      new RemoteClientError(
        "This app version is incompatible with that server.",
        426,
        "protocol_version_mismatch",
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(useRemoteServersStore.getState().runtime.d1).toMatchObject({
      status: "online",
      projects: [proj2],
    });
    expect(useRemoteServersStore.getState().runtime.d1?.message).toBeUndefined();
  });

  it("reports a protocol mismatch immediately after the host update", async () => {
    const mismatch = new RemoteClientError(
      "This app version is incompatible with that server.",
      426,
      "protocol_version_mismatch",
    );
    useRemoteServersStore.getState().setClientFactory(
      factoryFor(
        makeClient({
          environment: async () => {
            throw mismatch;
          },
          installHostUpdate: async () => {},
        }),
      ),
    );
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "d1",
          label: "Server One",
          endpoint: "http://192.168.1.9:38987/",
          accessToken: "acc-token",
          scopes: ["session:read", "projects:manage"],
          appVersion: "1.0",
          hostMode: "desktop",
        },
      ],
      runtime: { d1: { status: "online", projects: [proj], threads: [] } },
      hostUpdates: {
        d1: { currentVersion: "1.0", status: { type: "downloaded", version: "1.1" } },
      },
    });

    await useRemoteServersStore.getState().installHostUpdate("d1");

    await vi.waitFor(() => {
      expect(useRemoteServersStore.getState().runtime.d1).toMatchObject({
        status: "error",
        message: "This app version is incompatible with that server.",
      });
      expect(useRemoteServersStore.getState().hostUpdateRestarts.d1).toBeUndefined();
    });
  });

  it("clears the restart watch when the server is paired again mid-restart", async () => {
    vi.useFakeTimers();
    useRemoteServersStore
      .getState()
      .setClientFactory(factoryFor(makeClient({ installHostUpdate: async () => {} })));
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "d1",
          label: "Server One",
          endpoint: "http://192.168.1.9:38987/",
          accessToken: "acc-token",
          scopes: ["session:read", "projects:manage"],
          appVersion: "1.0",
          hostMode: "desktop",
        },
      ],
      runtime: { d1: { status: "online", projects: [proj], threads: [] } },
      hostUpdates: {
        d1: { currentVersion: "1.0", status: { type: "downloaded", version: "1.1" } },
      },
    });

    await useRemoteServersStore.getState().installHostUpdate("d1");
    expect(useRemoteServersStore.getState().hostUpdateRestarts.d1).toBe("1.1");

    await useRemoteServersStore.getState().pairServer({
      endpoint: "192.168.1.9:38987",
      token: "lc_pair_x",
    });
    await vi.advanceTimersByTimeAsync(1_000);

    expect(useRemoteServersStore.getState().hostUpdateRestarts.d1).toBeUndefined();
    expect(useRemoteServersStore.getState().runtime.d1?.status).toBe("online");
  });

  it("installs without tracking a restart when no downloaded update is recorded", async () => {
    const installHostUpdate = vi.fn<RemoteDesktopClient["installHostUpdate"]>(async () => {});
    useRemoteServersStore
      .getState()
      .setClientFactory(factoryFor(makeClient({ installHostUpdate })));
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "d1",
          label: "Server One",
          endpoint: "http://192.168.1.9:38987/",
          accessToken: "acc-token",
          scopes: ["session:read", "projects:manage"],
          appVersion: "1.0",
          hostMode: "desktop",
        },
      ],
      runtime: { d1: { status: "online", projects: [proj], threads: [] } },
      hostUpdates: {},
    });

    await useRemoteServersStore.getState().installHostUpdate("d1");

    expect(installHostUpdate).toHaveBeenCalledOnce();
    expect(useRemoteServersStore.getState().hostUpdateRestarts.d1).toBeUndefined();
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
    expect(state.lastKnownProjects.d1).toEqual([proj]);
    expect(useAppStore.getState().projects).toContainEqual(
      expect.objectContaining({
        id: remoteProjectId("d1", "p1"),
        remoteServerId: "d1",
        remoteId: "p1",
      }),
    );
  });

  it("probes an offline server and restores it online after a successful action", async () => {
    const gitCall = vi.fn<RemoteDesktopClient["callRemoteProcedure"]>(async () => ({}));
    useRemoteServersStore
      .getState()
      .setClientFactory(factoryFor(makeClient({ callRemoteProcedure: gitCall })));
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });
    useRemoteServersStore.setState((state) => ({
      runtime: {
        ...state.runtime,
        d1: { ...state.runtime.d1!, status: "offline" },
      },
    }));

    await expect(
      useRemoteServersStore.getState().withClient("d1", (client) =>
        client.callRemoteProcedure("ghMergePr", {
          projectLocation: { kind: "posix", path: "/r/app" },
          prNumber: 42,
          method: "squash",
          admin: false,
        }),
      ),
    ).resolves.toEqual({});
    expect(gitCall).toHaveBeenCalledOnce();
    expect(useRemoteServersStore.getState().runtime.d1).toMatchObject({ status: "online" });
    expect(useRemoteServersStore.getState().runtime.d1?.message).toBeUndefined();
  });

  it("marks an online server unreachable when an action discovers a transport failure", async () => {
    const gitCall = vi.fn<RemoteDesktopClient["callRemoteProcedure"]>(async () => {
      throw new TypeError("fetch failed");
    });
    useRemoteServersStore
      .getState()
      .setClientFactory(factoryFor(makeClient({ callRemoteProcedure: gitCall })));
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });

    await expect(
      useRemoteServersStore.getState().withClient("d1", (client) =>
        client.callRemoteProcedure("ghMergePr", {
          projectLocation: { kind: "posix", path: "/r/app" },
          prNumber: 42,
          method: "squash",
          admin: false,
        }),
      ),
    ).rejects.toThrow("Can't reach the remote server");
    expect(useRemoteServersStore.getState().runtime.d1).toMatchObject({
      status: "offline",
      message: "Can't reach the remote server. Check that it is online, then reconnect it.",
    });
  });

  it("keeps a reachable server online after an application error", async () => {
    const gitCall = vi
      .fn<RemoteDesktopClient["callRemoteProcedure"]>()
      .mockRejectedValueOnce(new RemoteClientError("Internal server error.", 500, "internal"))
      .mockResolvedValueOnce({ ok: true });
    useRemoteServersStore
      .getState()
      .setClientFactory(factoryFor(makeClient({ callRemoteProcedure: gitCall })));
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });

    await expect(
      useRemoteServersStore
        .getState()
        .withClient("d1", (client) => client.callRemoteProcedure("getGitStatus", {})),
    ).rejects.toThrow("Internal server error");
    expect(useRemoteServersStore.getState().runtime.d1).toMatchObject({ status: "online" });
    expect(useRemoteServersStore.getState().runtime.d1?.message).toBeUndefined();

    await expect(
      useRemoteServersStore
        .getState()
        .withClient("d1", (client) => client.callRemoteProcedure("getGitStatus", {})),
    ).resolves.toEqual({ ok: true });
    expect(useRemoteServersStore.getState().runtime.d1).toMatchObject({ status: "online" });
    expect(useRemoteServersStore.getState().runtime.d1?.message).toBeUndefined();
  });

  it("does not rewrite online state after a successful action", async () => {
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient()));
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });
    const runtime = useRemoteServersStore.getState().runtime.d1;
    const listener = vi.fn<(state: unknown, previousState: unknown) => void>();
    const unsubscribe = useRemoteServersStore.subscribe(listener);

    await useRemoteServersStore.getState().withClient("d1", async () => "ok");

    expect(useRemoteServersStore.getState().runtime.d1).toBe(runtime);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("allows a reconnecting server action without changing its connecting status", async () => {
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient()));
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });
    useRemoteServersStore.setState((state) => ({
      runtime: { ...state.runtime, d1: { ...state.runtime.d1!, status: "connecting" } },
    }));

    await expect(useRemoteServersStore.getState().withClient("d1", async () => "ok")).resolves.toBe(
      "ok",
    );

    expect(useRemoteServersStore.getState().runtime.d1?.status).toBe("connecting");
  });

  it("normalizes main-process IPC fetch failures for routed controls", async () => {
    useRemoteServersStore
      .getState()
      .setClientFactory(
        (endpoint, accessToken) => new RemoteDesktopClient(endpoint, accessToken, mainProcessFetch),
      );
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
      runtime: {
        d1: { status: "online", projects: [proj], threads: [] },
      },
    });
    bridge.remoteHttpRequest.mockRejectedValueOnce(
      new Error(
        "Error invoking remote method 'poracode:remote-http-request': TypeError: fetch failed",
      ),
    );

    await expect(
      invokeRemoteRoute("getGitStatus", {
        projectLocation: { kind: "posix", path: "/r/app", remoteServerId: "d1" },
        detail: "summary",
      }),
    ).rejects.toThrow("Can't reach the remote server");
    expect(useRemoteServersStore.getState().runtime.d1).toMatchObject({
      status: "offline",
      message: "Can't reach the remote server. Check that it is online, then reconnect it.",
    });
  });

  it("loads project notes through an offline server recovery probe", async () => {
    const projectNotes = vi.fn<RemoteDesktopClient["projectNotes"]>(async () => ({
      projectId: "p1",
      doc: null,
      todos: [],
      updatedAt: "now",
    }));
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient({ projectNotes })));
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });
    useRemoteServersStore.setState((state) => ({
      runtime: { ...state.runtime, d1: { ...state.runtime.d1!, status: "offline" } },
    }));

    await expect(
      invokeRemoteRoute("dbGetProjectNotes", {
        projectId: remoteProjectId("d1", "p1"),
      }),
    ).resolves.toMatchObject({ projectId: remoteProjectId("d1", "p1") });

    expect(projectNotes).toHaveBeenCalledWith("p1");
    expect(useRemoteServersStore.getState().runtime.d1).toMatchObject({ status: "online" });
  });

  it("persists a local name for a remote connection", async () => {
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient()));
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });

    useRemoteServersStore.getState().renameServer("d1", "Mac Studio");

    expect(useRemoteServersStore.getState().servers[0]?.label).toBe("Mac Studio");
    expect(useRemoteServersStore.getState().servers[0]?.remoteLabel).toBe("Server One");
    await vi.waitFor(() => {
      expect(
        JSON.parse(localStorage.getItem("poracode-remote-servers")!).state.servers[0].label,
      ).toBe("Mac Studio");
    });
  });

  it("hydrates persisted servers before the initial reconnect pass", async () => {
    const snapshot = vi.fn<RemoteDesktopClient["snapshot"]>(async () => makeClient().snapshot());
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient({ snapshot })));
    const persist = useRemoteServersStore.persist;
    const originalHasHydrated = persist.hasHydrated;
    const originalRehydrate = persist.rehydrate;
    persist.hasHydrated = vi.fn<() => boolean>(() => false);
    persist.rehydrate = vi.fn<() => Promise<void>>(async () => {
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
    });

    try {
      await useRemoteServersStore.getState().connectAll();
      expect(persist.rehydrate).toHaveBeenCalledOnce();
      expect(snapshot).toHaveBeenCalledOnce();
      expect(useRemoteServersStore.getState().runtime.d1?.status).toBe("online");
    } finally {
      persist.hasHydrated = originalHasHydrated;
      persist.rehydrate = originalRehydrate;
    }
  });

  it("restores last-known remote projects when a persisted server is offline", async () => {
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
      lastKnownProjects: { d1: [proj] },
      projectWorkspaceIds: { d1: { p1: "workspace-1" } },
      projectNameOverrides: { d1: { p1: "Pinned Remote App" } },
    });
    await vi.waitFor(() => {
      expect(
        JSON.parse(localStorage.getItem("poracode-remote-servers")!).state.lastKnownProjects.d1,
      ).toEqual([proj]);
    });
    const persisted = localStorage.getItem("poracode-remote-servers")!;

    __resetRemoteServersStoreForTest();
    useAppStore.setState((state) => ({
      projects: state.projects.filter((project) => project.remoteServerId !== "d1"),
      threads: state.threads.filter((thread) => thread.remoteServerId !== "d1"),
    }));
    useRemoteServersStore.setState({ servers: [], runtime: {}, lastKnownProjects: {} });
    await vi.waitFor(() => {
      expect(JSON.parse(localStorage.getItem("poracode-remote-servers")!).state.servers).toEqual(
        [],
      );
    });
    localStorage.setItem("poracode-remote-servers", persisted);
    await useRemoteServersStore.persist.rehydrate();
    expect(useRemoteServersStore.getState().projectWorkspaceIds).toEqual({
      d1: { p1: "workspace-1" },
    });
    expect(useRemoteServersStore.getState().projectNameOverrides).toEqual({
      d1: { p1: "Pinned Remote App" },
    });
    const snapshot = vi.fn<RemoteDesktopClient["snapshot"]>(async () => {
      throw new Error("offline");
    });
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient({ snapshot })));
    useRemoteServersStore.getState().setSocketFactory(() => makeSocket({ readyState: 0 }));

    const connecting = useRemoteServersStore.getState().connectAll();

    expect(useRemoteServersStore.getState().runtime.d1).toMatchObject({
      status: "connecting",
      projects: [proj],
    });
    expect(useAppStore.getState().projects).toContainEqual(
      expect.objectContaining({ id: remoteProjectId("d1", "p1") }),
    );
    expect(useGitStore.getState().statuses).not.toHaveProperty(remoteProjectId("d1", "p1"));
    await connecting;

    expect(snapshot).toHaveBeenCalledOnce();
    expect(useRemoteServersStore.getState().runtime.d1).toMatchObject({
      status: "error",
      projects: [proj],
    });
    expect(useAppStore.getState().projects).toContainEqual(
      expect.objectContaining({
        id: remoteProjectId("d1", "p1"),
        name: "Pinned Remote App",
        remoteServerId: "d1",
        remoteId: "p1",
        workspaceId: "workspace-1",
      }),
    );
  });

  it("keeps pre-v1 remote workspace overrides when rehydrating", async () => {
    localStorage.setItem(
      "poracode-remote-servers",
      JSON.stringify({
        state: {
          servers: [],
          excludedProjectIds: {},
          projectWorkspaceIds: { d1: { p1: "workspace-1" } },
          projectNameOverrides: {},
          lastKnownProjects: { d1: [proj] },
        },
        version: 0,
      }),
    );

    await useRemoteServersStore.persist.rehydrate();

    expect(useRemoteServersStore.getState().projectWorkspaceIds.d1?.p1).toBe("workspace-1");
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
    await vi.waitFor(() => {
      expect(JSON.parse(localStorage.getItem("poracode-remote-servers")!).state).toEqual(
        expect.objectContaining({
          projectWorkspaceIds: { d1: { p1: "local-workspace" } },
          projectNameOverrides: { d1: { p1: "Local Project" } },
        }),
      );
    });

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

  it("derives a mirror's workspace from its local counterpart until filed explicitly", async () => {
    const previousProjects = useAppStore.getState().projects;
    useAppStore.setState({
      projects: [{ ...proj, id: "local-1", workspaceId: "workspace-side" }],
    });
    try {
      useRemoteServersStore
        .getState()
        .setClientFactory(factoryFor(makeClient({ snapshotProjects: [proj] })));
      await useRemoteServersStore
        .getState()
        .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });

      const projectedId = remoteProjectId("d1", "p1");
      const mirroredWorkspace = () =>
        useAppStore.getState().projects.find((project) => project.id === projectedId)?.workspaceId;
      // Same name as the local project, so the mirror joins its workspace…
      expect(mirroredWorkspace()).toBe("workspace-side");
      // …without pinning: the filing stays derived from the counterpart.
      expect(useRemoteServersStore.getState().projectWorkspaceIds.d1?.p1).toBeUndefined();

      // Moving the local project moves the mirror live, not on the next sync.
      useAppStore.getState().setProjectWorkspace("local-1", "workspace-other");
      expect(mirroredWorkspace()).toBe("workspace-other");
      expect(useRemoteServersStore.getState().projectWorkspaceIds.d1?.p1).toBeUndefined();
      await useRemoteServersStore.getState().refreshServer("d1");
      expect(mirroredWorkspace()).toBe("workspace-other");

      // An explicit filing pins the mirror and stops the inheritance.
      useAppStore.getState().setProjectWorkspace(projectedId, "workspace-side");
      expect(useRemoteServersStore.getState().projectWorkspaceIds.d1?.p1).toBe("workspace-side");
      useAppStore.getState().setProjectWorkspace("local-1", undefined);
      await useRemoteServersStore.getState().refreshServer("d1");
      expect(mirroredWorkspace()).toBe("workspace-side");

      // Explicitly unfiling the mirror must survive refreshes and stop
      // inheriting the local counterpart's workspace.
      useAppStore.getState().setProjectWorkspace(projectedId, undefined);
      expect(useRemoteServersStore.getState().projectWorkspaceIds.d1?.p1).toBeNull();
      await useRemoteServersStore.getState().refreshServer("d1");
      expect(mirroredWorkspace()).toBeUndefined();
    } finally {
      useAppStore.setState({ projects: previousProjects });
    }
  });

  it("does not inherit a workspace from ambiguous duplicate local project names", async () => {
    const previousProjects = useAppStore.getState().projects;
    useAppStore.setState({
      projects: [
        {
          ...proj,
          id: "local-1",
          location: { kind: "windows", path: "C:\\one" },
          workspaceId: "w1",
        },
        {
          ...proj,
          id: "local-2",
          location: { kind: "windows", path: "C:\\two" },
          workspaceId: "w2",
        },
      ],
    });
    try {
      useRemoteServersStore
        .getState()
        .setClientFactory(factoryFor(makeClient({ snapshotProjects: [proj] })));
      await useRemoteServersStore
        .getState()
        .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });

      expect(
        useAppStore
          .getState()
          .projects.find((project) => project.id === remoteProjectId("d1", "p1"))?.workspaceId,
      ).toBeUndefined();
    } finally {
      useAppStore.setState({ projects: previousProjects });
    }
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
    const gitCall = vi.fn<RemoteDesktopClient["callRemoteProcedure"]>(async () => listing);
    bridge.sshConnect.mockResolvedValue({
      connectionId: id,
      endpoint: "http://127.0.0.1:39001/",
      remotePort: 38987,
      pairingCredential: "lc_pair_ssh",
    });
    useRemoteServersStore
      .getState()
      .setClientFactory(
        factoryFor(makeClient({ callRemoteProcedure: gitCall, hostMode: "helper" })),
      );

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

  it("marks a persisted SSH server offline when reconnecting its tunnel fails", async () => {
    const connection = {
      id: "1a2f655a-e274-4213-9a2b-029f29062fd7",
      label: "Build host",
      target: "dev@build",
    };
    bridge.sshConnect.mockRejectedValue(new Error("SSH connection failed"));
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

    expect(useRemoteServersStore.getState().runtime.d1).toMatchObject({
      status: "offline",
      message: "SSH connection failed",
    });
  });

  it("stops reconnecting when a persisted server reports the previous protocol", async () => {
    const snapshot = vi.fn<RemoteDesktopClient["snapshot"]>();
    const environment = vi.fn<RemoteDesktopClient["environment"]>(async () => {
      throw new RemoteClientError(
        "This app version is incompatible with that server.",
        409,
        "protocol_version_mismatch",
      );
    });
    useRemoteServersStore
      .getState()
      .setClientFactory(factoryFor(makeClient({ environment, snapshot })));
    useRemoteServersStore.setState({
      servers: [
        {
          desktopId: "d1",
          label: "Old host",
          endpoint: "http://127.0.0.1:38987/",
          accessToken: "token",
          scopes: [],
        },
      ],
      runtime: {
        d1: { status: "offline", projects: [], threads: [] },
      },
    });

    await useRemoteServersStore.getState().connectAll();

    expect(snapshot).not.toHaveBeenCalled();
    expect(useRemoteServersStore.getState().runtime.d1).toMatchObject({
      status: "error",
      message: "This app version is incompatible with that server.",
    });
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
    expect(state.lastKnownProjects.d1).toBeUndefined();
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

  it("marks a server offline when refresh finds a nested transport failure", async () => {
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient()));
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });
    const snapshot = vi.fn<RemoteDesktopClient["snapshot"]>(async () => {
      throw new Error("wrapped", {
        cause: new RemoteClientError("network", 0, "network"),
      });
    });
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient({ snapshot })));

    await useRemoteServersStore.getState().refreshServer("d1");

    expect(useRemoteServersStore.getState().runtime.d1).toMatchObject({
      status: "offline",
      projects: [proj],
    });
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
    expect(websocketUrl).toHaveBeenNthCalledWith(1, "ticket-1", 2, {
      threadItemInterests: [],
    });

    sockets[0]?.onmessage?.({
      data: JSON.stringify({ type: "event", seq: 7, event: { type: "noop" } }),
    });
    sockets[0]?.onclose?.();
    await vi.advanceTimersByTimeAsync(20_000);
    await Promise.resolve();

    expect(socketFactory).toHaveBeenCalledTimes(2);
    expect(websocketUrl).toHaveBeenNthCalledWith(2, "ticket-2", 7, {
      threadItemInterests: [],
    });
  });

  it("retries an expired event stream session at the slower authorization interval", async () => {
    vi.useFakeTimers();
    const sockets: RemoteSocketLike[] = [];
    const socketFactory = vi.fn<RemoteSocketFactory>(() => {
      const socket = makeSocket();
      sockets.push(socket);
      return socket;
    });
    useRemoteServersStore.getState().setSocketFactory(socketFactory);
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });
    await vi.advanceTimersByTimeAsync(0);

    sockets[0]?.onclose?.({ code: 1008, reason: "Remote access session expired" });
    expect(useRemoteServersStore.getState().runtime.d1).toMatchObject({
      status: "error",
      message: "Pairing expired — pair again to reconnect.",
    });
    await vi.advanceTimersByTimeAsync(59_999);
    expect(socketFactory).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(socketFactory).toHaveBeenCalledTimes(2);
  });

  it("retries an unauthorized websocket ticket at the slower authorization interval", async () => {
    vi.useFakeTimers();
    const sockets: RemoteSocketLike[] = [];
    const websocketTicket = vi
      .fn<RemoteDesktopClient["websocketTicket"]>()
      .mockResolvedValueOnce("ticket-1")
      .mockRejectedValueOnce(new RemoteClientError("Missing access token.", 401, "unauthorized"))
      .mockResolvedValueOnce("ticket-3");
    const socketFactory = vi.fn<RemoteSocketFactory>(() => {
      const socket = makeSocket();
      sockets.push(socket);
      return socket;
    });
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient({ websocketTicket })));
    useRemoteServersStore.getState().setSocketFactory(socketFactory);
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });
    await vi.advanceTimersByTimeAsync(0);

    sockets[0]?.onclose?.();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(useRemoteServersStore.getState().runtime.d1).toMatchObject({
      status: "error",
      message: "Pairing expired — pair again to reconnect.",
    });

    await vi.advanceTimersByTimeAsync(59_499);
    expect(websocketTicket).toHaveBeenCalledTimes(2);
    expect(socketFactory).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(501);
    expect(websocketTicket).toHaveBeenCalledTimes(3);
    expect(socketFactory).toHaveBeenCalledTimes(2);
  });

  it("marks a server offline when its event stream reconnect cannot reach it", async () => {
    vi.useFakeTimers();
    const sockets: RemoteSocketLike[] = [];
    const websocketTicket = vi
      .fn<RemoteDesktopClient["websocketTicket"]>()
      .mockResolvedValueOnce("ticket-1")
      .mockRejectedValueOnce(new RemoteClientError("fetch failed", 0, "offline"));
    const socketFactory = vi.fn<RemoteSocketFactory>(() => {
      const socket = makeSocket();
      sockets.push(socket);
      return socket;
    });
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient({ websocketTicket })));
    useRemoteServersStore.getState().setSocketFactory(socketFactory);
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });
    await vi.advanceTimersByTimeAsync(0);

    expect(useRemoteServersStore.getState().runtime.d1?.status).toBe("online");
    sockets[0]?.onclose?.();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(useRemoteServersStore.getState().runtime.d1).toMatchObject({
      status: "offline",
      projects: [proj],
    });
    expect(useAppStore.getState().projects).toContainEqual(
      expect.objectContaining({ id: remoteProjectId("d1", "p1") }),
    );
  });

  it("times out and reconnects a server event stream whose handshake never opens", async () => {
    vi.useFakeTimers();
    const sockets: RemoteSocketLike[] = [];
    const socketFactory = vi.fn<RemoteSocketFactory>(() => {
      const socket = makeSocket({ readyState: 0, onopen: null });
      sockets.push(socket);
      return socket;
    });
    useRemoteServersStore.getState().setSocketFactory(socketFactory);
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });
    await vi.advanceTimersByTimeAsync(0);

    expect(socketFactory).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(14_999);
    expect(sockets[0]?.close).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(sockets[0]?.close).toHaveBeenCalledTimes(1);
    expect(useRemoteServersStore.getState().runtime.d1?.status).toBe("connecting");

    await vi.advanceTimersByTimeAsync(1_000);
    await Promise.resolve();
    expect(socketFactory).toHaveBeenCalledTimes(2);
  });

  it("reconnects a half-open server event stream when its health pong never arrives", async () => {
    vi.useFakeTimers();
    const sockets: RemoteSocketLike[] = [];
    const socketFactory = vi.fn<RemoteSocketFactory>(() => {
      const socket = makeSocket({
        send: vi.fn<(data: string) => void>(),
        readyState: 1,
      });
      sockets.push(socket);
      return socket;
    });
    useRemoteServersStore.getState().setSocketFactory(socketFactory);
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });
    await vi.advanceTimersByTimeAsync(0);

    expect(socketFactory).toHaveBeenCalledTimes(1);
    expect(useRemoteServersStore.getState().runtime.d1?.status).toBe("online");

    await vi.advanceTimersByTimeAsync(25_000);
    expect(sockets[0]?.send).toHaveBeenCalledWith(expect.stringContaining('"type":"ping"'));

    await vi.advanceTimersByTimeAsync(5_000);
    expect(sockets[0]?.close).toHaveBeenCalledTimes(1);
    expect(useRemoteServersStore.getState().runtime.d1?.status).toBe("connecting");

    await vi.advanceTimersByTimeAsync(1_000);
    await Promise.resolve();
    expect(socketFactory).toHaveBeenCalledTimes(2);
  });

  it("keeps the server event stream online after its correlated health pong", async () => {
    vi.useFakeTimers();
    const send = vi.fn<(data: string) => void>();
    const socket = makeSocket({ send, readyState: 1 });
    useRemoteServersStore.getState().setSocketFactory(() => socket);
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });
    await vi.advanceTimersByTimeAsync(25_000);

    const pingCall = send.mock.calls.find(([data]) => String(data).includes('"type":"ping"'));
    const ping = JSON.parse(String(pingCall?.[0])) as { id: string };
    socket.onmessage?.({
      data: JSON.stringify({ type: "pong", id: ping.id, receivedAt: Date.now() }),
    });
    await vi.advanceTimersByTimeAsync(5_001);

    expect(socket.close).not.toHaveBeenCalled();
    expect(useRemoteServersStore.getState().runtime.d1?.status).toBe("online");
  });

  it("does not health-probe sockets that cannot send", async () => {
    vi.useFakeTimers();
    const socket = makeSocket({ readyState: 1 });
    const socketFactory = vi.fn<RemoteSocketFactory>(() => socket);
    useRemoteServersStore.getState().setSocketFactory(socketFactory);
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });

    await vi.advanceTimersByTimeAsync(30_001);

    expect(socket.close).not.toHaveBeenCalled();
    expect(socketFactory).toHaveBeenCalledTimes(1);
    expect(useRemoteServersStore.getState().runtime.d1?.status).toBe("online");
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
    const gitCall = vi.fn<RemoteDesktopClient["callRemoteProcedure"]>(async () => listing);
    useRemoteServersStore
      .getState()
      .setClientFactory(factoryFor(makeClient({ callRemoteProcedure: gitCall })));
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });

    await expect(
      useRemoteServersStore.getState().browseHostDirectory("d1", "/srv"),
    ).resolves.toEqual(listing);
    expect(gitCall).toHaveBeenCalledWith("browseHostDirectory", { path: "/srv" });
  });

  it("routes project-scoped renderer procedures by explicit remote ownership", async () => {
    const gitCall = vi.fn<RemoteDesktopClient["callRemoteProcedure"]>(async () => ({
      skills: [],
      effectiveSkillIds: [],
    }));
    useRemoteServersStore
      .getState()
      .setClientFactory(factoryFor(makeClient({ callRemoteProcedure: gitCall })));
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });

    const projectedProject = useAppStore
      .getState()
      .projects.find((project) => project.remoteServerId === "d1");
    expect(projectedProject?.location.remoteServerId).toBe("d1");

    await expect(
      invokeRemoteRoute("scanSkills", {
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
    ).toEqual({ kind: "local" });
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
      invokeRemoteRoute("dbGetThreadRuntimeItemsPage", {
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

    expect(location).toBeDefined();
    await invokeRemoteRoute("startShell", {
      shellId: "shell:remote",
      projectLocation: location!,
      initialSize: { cols: 90, rows: 25 },
    });
    await invokeRemoteRoute("writeTerminal", {
      threadId: "shell:remote",
      data: "pwd\r",
    });
    await invokeRemoteRoute("resizeTerminal", {
      threadId: "shell:remote",
      cols: 100,
      rows: 30,
    });
    await invokeRemoteRoute("closeThread", { threadId: "shell:remote" });

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

  it("routes a remote thread interrupt through the central bridge owner", async () => {
    const interruptThread = vi.fn<RemoteDesktopClient["interruptThread"]>(async () => {});
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient({ interruptThread })));
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });
    seedRemoteThreadOwner();

    await invokeRemoteRoute("interruptThread", { threadId: remoteThreadId("d1", "rt-1") });
    expect(interruptThread).toHaveBeenCalledWith("rt-1");
  });

  it("opens a remote thread: hydrates history and streams socket events", async () => {
    const sockets: RemoteSocketLike[] = [];
    const send = vi.fn<(data: string) => void>();
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient()));
    const socketFactory = vi.fn<RemoteSocketFactory>(() => {
      const socket = makeSocket({ send });
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
    expect(send).toHaveBeenCalledWith(
      JSON.stringify({ type: "thread-item-interests", threadIds: ["rt-1"] }),
    );

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
    expect(send).toHaveBeenLastCalledWith(
      JSON.stringify({ type: "thread-item-interests", threadIds: [] }),
    );
    expect(useRemoteServersStore.getState().openThread).toBeNull();
  });

  it("keeps the visible remote thread subscribed while a replacement hydrates", async () => {
    const send = vi.fn<(data: string) => void>();
    const socket = makeSocket({ send });
    const threadHistory = vi.fn<RemoteDesktopClient["threadHistory"]>(async (threadId) => {
      if (threadId === "rt-2") throw new Error("history failed");
      return remoteThreadSnapshot(threadId);
    });
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient({ threadHistory })));
    await pairIsolated(() => socket);
    await useRemoteServersStore.getState().openRemoteThread("d1", "rt-1");
    send.mockClear();

    await expect(useRemoteServersStore.getState().openRemoteThread("d1", "rt-2")).resolves.toBe(
      false,
    );

    expect(send).toHaveBeenCalledWith(
      JSON.stringify({ type: "thread-item-interests", threadIds: ["rt-1", "rt-2"] }),
    );
    expect(send).toHaveBeenLastCalledWith(
      JSON.stringify({ type: "thread-item-interests", threadIds: ["rt-1"] }),
    );
    expect(useRemoteServersStore.getState().openThread?.threadId).toBe("rt-1");
  });

  it("does not restore a removed thread after a pending replacement fails", async () => {
    const pendingHistory = deferred<RemoteThreadHistorySnapshot>();
    const send = vi.fn<(data: string) => void>();
    const socket = makeSocket({ send });
    const snapshot = vi
      .fn<RemoteDesktopClient["snapshot"]>()
      .mockResolvedValueOnce({
        snapshotSeq: 1,
        projects: [proj],
        threads: [{ ...remoteThread, id: "rt-1" }],
        runtimeSummariesByThread: {},
        updatedAt: "pair",
      })
      .mockResolvedValueOnce({
        snapshotSeq: 2,
        projects: [proj],
        threads: [],
        runtimeSummariesByThread: {},
        updatedAt: "refresh",
      });
    const threadHistory = vi.fn<RemoteDesktopClient["threadHistory"]>((threadId) =>
      threadId === "rt-2"
        ? pendingHistory.promise
        : Promise.resolve(remoteThreadSnapshot(threadId)),
    );
    useRemoteServersStore
      .getState()
      .setClientFactory(factoryFor(makeClient({ snapshot, threadHistory })));
    await pairIsolated(() => socket);
    await useRemoteServersStore.getState().openRemoteThread("d1", "rt-1");

    const replacement = useRemoteServersStore.getState().openRemoteThread("d1", "rt-2");
    await useRemoteServersStore.getState().refreshServer("d1");
    pendingHistory.reject(new Error("history failed"));

    await expect(replacement).resolves.toBe(false);
    expect(useRemoteServersStore.getState().openThread).toBeNull();
    expect(send).toHaveBeenLastCalledWith(
      JSON.stringify({ type: "thread-item-interests", threadIds: [] }),
    );
  });

  it("streams a remote terminal through the open-thread connection", async () => {
    const send = vi.fn<(data: string) => void>();
    const socket: RemoteSocketLike = {
      close: vi.fn<() => void>(),
      send,
      onmessage: null,
      onclose: null,
    };
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
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient({ threadHistory })));
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

  it("reconciles a remote project row from the host Git state snapshot", async () => {
    const projectedProjectId = remoteProjectId("d1", "p1");
    useGitStore.setState({ statuses: { [projectedProjectId]: gitStatus(7) } });
    useRemoteServersStore.getState().setClientFactory(
      factoryFor(
        makeClient({
          snapshot: async () => ({
            snapshotSeq: 1,
            projects: [proj],
            threads: [],
            runtimeSummariesByThread: {},
            gitState: gitState(0),
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

  it("updates a remote project row from a live host Git state patch", async () => {
    const socket = makeSocket();
    useRemoteServersStore.getState().setClientFactory(
      factoryFor(
        makeClient({
          snapshot: async () => ({
            snapshotSeq: 1,
            projects: [proj],
            threads: [],
            runtimeSummariesByThread: {},
            gitState: gitState(7),
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

    socket.onmessage?.({
      data: JSON.stringify({
        type: "event",
        seq: 2,
        event: {
          type: "remote-git-state",
          patch: {
            revision: 2,
            projects: gitState(0, 2).projects,
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
    websocketUrl.mockClear();
    ticketSeq = 0;

    await useRemoteServersStore.getState().openRemoteThread("d1", "rt-1");
    expect(socketFactory).toHaveBeenCalledTimes(1);
    expect(websocketUrl).toHaveBeenNthCalledWith(1, "ticket-1", 1, {
      threadItemInterests: ["rt-1"],
    });
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
    expect(websocketUrl).toHaveBeenNthCalledWith(2, "ticket-2", 7, {
      threadItemInterests: ["rt-1"],
    });
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

    sockets[1]?.onmessage?.({
      data: JSON.stringify({
        type: "resync-required",
        seq: 2,
        reason: "The remote server restarted.",
      }),
    });
    sockets[1]?.onclose?.();
    await vi.advanceTimersByTimeAsync(1000);
    await Promise.resolve();

    expect(socketFactory).toHaveBeenCalledTimes(3);
    expect(socketFactory).toHaveBeenNthCalledWith(
      3,
      "ws://192.168.1.9:38987/ws?ticket=ticket-3&last=2",
    );
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
    seedRemoteThreadOwner();
    await invokeRemoteRoute("sendThreadInput", {
      threadId: remoteThreadId("d1", "rt-1"),
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
      threadId: "rt-new",
      desktopId: "d1",
      projectId: "p1",
      agentKind: "claude",
      config: { model: "claude-sonnet" },
      prompt: "work remotely",
      presentationMode: "gui",
      userMessageItemId: "user-optimistic",
    });

    expect(startNewThread).toHaveBeenCalledWith({
      threadId: "rt-new",
      projectId: "p1",
      agentKind: "claude",
      config: { model: "claude-sonnet" },
      prompt: "work remotely",
      presentationMode: "gui",
      userMessageItemId: "user-optimistic",
    });
    expect(useRemoteServersStore.getState().openThread?.threadId).toBe("rt-new");
  });

  it("preserves an optimistic remote thread while its worktree is provisioning", async () => {
    const socket = makeSocket();
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient()));
    useRemoteServersStore.getState().setSocketFactory(() => socket);
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });
    const pendingId = remoteThreadId("d1", "rt-pending");
    useAppStore.getState().createThread({
      threadId: pendingId,
      projectId: remoteProjectId("d1", "p1"),
      remoteServerId: "d1",
      remoteId: "rt-pending",
      agentKind: "claude",
      config: { model: "claude-sonnet" },
      prompt: "work remotely",
      presentationMode: "gui",
      worktreeBranch: "feature",
      worktreeProvisioning: true,
    });
    useAppStore.getState().createThread({
      threadId: remoteThreadId("d1", "rt-stale"),
      projectId: remoteProjectId("d1", "p1"),
      remoteServerId: "d1",
      remoteId: "rt-stale",
      agentKind: "claude",
      config: { model: "claude-sonnet" },
      prompt: "stale remote row",
      presentationMode: "gui",
    });
    sync.dispatchRemoteSupervisorEvent.mockClear();

    socket.onmessage?.({
      data: JSON.stringify({
        type: "event",
        seq: 1,
        event: {
          type: "thread-state",
          threadId: "rt-stale",
          status: "working",
          attention: "working",
          canResumeWithConfig: false,
        },
      }),
    });
    expect(sync.dispatchRemoteSupervisorEvent).not.toHaveBeenCalled();

    socket.onmessage?.({
      data: JSON.stringify({
        type: "event",
        seq: 2,
        event: {
          type: "thread-state",
          threadId: "rt-pending",
          status: "working",
          attention: "working",
          canResumeWithConfig: false,
        },
      }),
    });

    expect(sync.dispatchRemoteSupervisorEvent).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: pendingId }),
    );

    await useRemoteServersStore.getState().refreshServer("d1");

    expect(useAppStore.getState().threads).toContainEqual(
      expect.objectContaining({
        id: pendingId,
        remoteServerId: "d1",
        remoteId: "rt-pending",
      }),
    );

    useRemoteServersStore.getState().setClientFactory(
      factoryFor(
        makeClient({
          snapshot: async () => ({
            snapshotSeq: 3,
            projects: [proj],
            threads: [
              {
                ...remoteThread,
                id: "rt-pending",
                projectId: "p1",
                worktreePath: "/srv/worktrees/feature",
              },
            ],
            runtimeSummariesByThread: {},
            updatedAt: "confirmed",
          }),
        }),
      ),
    );
    await useRemoteServersStore.getState().refreshServer("d1");

    expect(useAppStore.getState().provisioningWorktreeThreadIds[pendingId]).toBe(true);
  });

  it("compensates when an authoritative snapshot precedes deletion and the start response", async () => {
    const start = deferred<{ threadId: string }>();
    const startNewThread = vi.fn<RemoteDesktopClient["startNewThread"]>(() => start.promise);
    const sendThreadCommand = vi.fn<RemoteDesktopClient["sendThreadCommand"]>(async () => {});
    let authoritative = false;
    const snapshot = vi.fn<RemoteDesktopClient["snapshot"]>(async () => ({
      snapshotSeq: authoritative ? 2 : 1,
      projects: [proj],
      threads: authoritative
        ? [{ ...remoteThread, id: "rt-cancelled", worktreePath: "/srv/worktrees/feature" }]
        : [],
      runtimeSummariesByThread: {},
      updatedAt: authoritative ? "authoritative" : "initial",
    }));
    useRemoteServersStore
      .getState()
      .setClientFactory(factoryFor(makeClient({ snapshot, startNewThread, sendThreadCommand })));
    await pairIsolated(() => makeSocket());
    const projectedId = remoteThreadId("d1", "rt-cancelled");
    useAppStore.getState().createThread({
      threadId: projectedId,
      projectId: remoteProjectId("d1", "p1"),
      remoteServerId: "d1",
      remoteId: "rt-cancelled",
      agentKind: "claude",
      config: { model: "claude-sonnet" },
      prompt: "work remotely",
      presentationMode: "gui",
      worktreeBranch: "feature",
      worktreeProvisioning: true,
    });

    const launch = useRemoteServersStore.getState().launchRemoteThread(
      {
        threadId: "rt-cancelled",
        desktopId: "d1",
        projectId: "p1",
        agentKind: "claude",
        config: { model: "claude-sonnet" },
        prompt: "work remotely",
        presentationMode: "gui",
        worktreePath: "/srv/worktrees/feature",
      },
      {
        isPendingLaunchOwned: () =>
          useAppStore.getState().provisioningWorktreeThreadIds[projectedId] === true,
      },
    );
    await vi.waitFor(() => expect(startNewThread).toHaveBeenCalledOnce());
    authoritative = true;
    await useRemoteServersStore.getState().refreshServer("d1");
    expect(useAppStore.getState().provisioningWorktreeThreadIds[projectedId]).toBe(true);
    useAppStore.getState().deleteThread(projectedId);
    start.resolve({ threadId: "rt-cancelled" });

    await expect(launch).resolves.toBe("cancelled");
    expect(sendThreadCommand).toHaveBeenCalledWith({
      kind: "delete",
      threadId: "rt-cancelled",
    });
    expect(useAppStore.getState().threads.map((thread) => thread.id)).not.toContain(projectedId);
    expect(useRemoteServersStore.getState().openThread).toBeNull();
  });

  it("compensates when the provisional row is deleted while waiting for host appearance", async () => {
    const appearance = deferred<Awaited<ReturnType<RemoteDesktopClient["snapshot"]>>>();
    let snapshotCalls = 0;
    const snapshot = vi.fn<RemoteDesktopClient["snapshot"]>(async () => {
      snapshotCalls += 1;
      if (snapshotCalls === 1) {
        return {
          snapshotSeq: 1,
          projects: [proj],
          threads: [],
          runtimeSummariesByThread: {},
          updatedAt: "initial",
        };
      }
      return appearance.promise;
    });
    const startNewThread = vi.fn<RemoteDesktopClient["startNewThread"]>(async () => ({
      threadId: "rt-waiting",
    }));
    const sendThreadCommand = vi.fn<RemoteDesktopClient["sendThreadCommand"]>(async () => {});
    useRemoteServersStore
      .getState()
      .setClientFactory(factoryFor(makeClient({ snapshot, startNewThread, sendThreadCommand })));
    await pairIsolated(() => makeSocket());
    const projectedId = remoteThreadId("d1", "rt-waiting");
    useAppStore.getState().createThread({
      threadId: projectedId,
      projectId: remoteProjectId("d1", "p1"),
      remoteServerId: "d1",
      remoteId: "rt-waiting",
      agentKind: "claude",
      config: { model: "claude-sonnet" },
      prompt: "work remotely",
      presentationMode: "gui",
      worktreeProvisioning: true,
    });

    const launch = useRemoteServersStore.getState().launchRemoteThread(
      {
        threadId: "rt-waiting",
        desktopId: "d1",
        projectId: "p1",
        agentKind: "claude",
        config: { model: "claude-sonnet" },
        prompt: "work remotely",
        presentationMode: "gui",
      },
      {
        isPendingLaunchOwned: () =>
          useAppStore.getState().provisioningWorktreeThreadIds[projectedId] === true,
      },
    );
    await vi.waitFor(() => expect(snapshot).toHaveBeenCalledTimes(2));
    useAppStore.getState().deleteThread(projectedId);
    appearance.resolve({
      snapshotSeq: 2,
      projects: [proj],
      threads: [{ ...remoteThread, id: "rt-waiting" }],
      runtimeSummariesByThread: {},
      updatedAt: "appeared",
    });

    await expect(launch).resolves.toBe("cancelled");
    expect(sendThreadCommand).toHaveBeenCalledWith({
      kind: "delete",
      threadId: "rt-waiting",
    });
    expect(useRemoteServersStore.getState().openThread).toBeNull();
  });

  it("retains a cancelled remote launch when compensating deletion fails", async () => {
    const sendThreadCommand = vi.fn<RemoteDesktopClient["sendThreadCommand"]>(async () => {
      throw new Error("remote delete failed");
    });
    useRemoteServersStore
      .getState()
      .setClientFactory(factoryFor(makeClient({ sendThreadCommand })));
    await pairIsolated(() => makeSocket());

    await expect(
      useRemoteServersStore.getState().launchRemoteThread(
        {
          threadId: "rt-orphaned",
          desktopId: "d1",
          projectId: "p1",
          agentKind: "claude",
          config: { model: "claude-sonnet" },
          prompt: "work remotely",
          presentationMode: "gui",
          worktreePath: "/srv/worktrees/feature",
        },
        { isPendingLaunchOwned: () => false },
      ),
    ).resolves.toBe("cancellation-failed");
    expect(toastDanger).toHaveBeenCalledWith("remote delete failed");
    expect(useRemoteServersStore.getState().openThread).toBeNull();
  });

  it("closes a deleted launch opened during history hydration when compensation fails", async () => {
    const history = deferred<RemoteThreadHistorySnapshot>();
    let snapshotCalls = 0;
    const snapshot = vi.fn<RemoteDesktopClient["snapshot"]>(async () => {
      snapshotCalls += 1;
      return {
        snapshotSeq: snapshotCalls,
        projects: [proj],
        threads: snapshotCalls === 1 ? [] : [{ ...remoteThread, id: "rt-hydrating" }],
        runtimeSummariesByThread: {},
        updatedAt: `snapshot-${snapshotCalls}`,
      };
    });
    const startNewThread = vi.fn<RemoteDesktopClient["startNewThread"]>(async () => ({
      threadId: "rt-hydrating",
    }));
    const threadHistory = vi.fn<RemoteDesktopClient["threadHistory"]>(() => history.promise);
    const sendThreadCommand = vi.fn<RemoteDesktopClient["sendThreadCommand"]>(async () => {
      throw new Error("remote delete failed");
    });
    useRemoteServersStore
      .getState()
      .setClientFactory(
        factoryFor(makeClient({ snapshot, startNewThread, threadHistory, sendThreadCommand })),
      );
    await pairIsolated(() => makeSocket());
    const projectedId = remoteThreadId("d1", "rt-hydrating");
    useAppStore.getState().createThread({
      threadId: projectedId,
      projectId: remoteProjectId("d1", "p1"),
      remoteServerId: "d1",
      remoteId: "rt-hydrating",
      agentKind: "claude",
      config: { model: "claude-sonnet" },
      prompt: "work remotely",
      presentationMode: "gui",
      worktreeProvisioning: true,
    });

    const launch = useRemoteServersStore.getState().launchRemoteThread(
      {
        threadId: "rt-hydrating",
        desktopId: "d1",
        projectId: "p1",
        agentKind: "claude",
        config: { model: "claude-sonnet" },
        prompt: "work remotely",
        presentationMode: "gui",
      },
      {
        isPendingLaunchOwned: () =>
          useAppStore.getState().provisioningWorktreeThreadIds[projectedId] === true,
      },
    );
    await vi.waitFor(() => expect(threadHistory).toHaveBeenCalledWith("rt-hydrating"));
    useAppStore.getState().deleteThread(projectedId);
    history.resolve(remoteThreadSnapshot("rt-hydrating"));

    await expect(launch).resolves.toBe("cancellation-failed");
    expect(sendThreadCommand).toHaveBeenCalledWith({
      kind: "delete",
      threadId: "rt-hydrating",
    });
    expect(useRemoteServersStore.getState().openThread).toBeNull();
    expect(useAppStore.getState().threads.map((thread) => thread.id)).not.toContain(projectedId);
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
    // The applied open resolves true; the superseded one resolves false so
    // callers can gate follow-up work (e.g. relaunching) on having applied.
    expect(await secondOpen).toBe(true);
    expect(useRemoteServersStore.getState().openThread?.threadId).toBe("rt-fast");

    slow.resolve(remoteThreadSnapshot("rt-slow"));
    expect(await firstOpen).toBe(false);

    expect(useRemoteServersStore.getState().openThread?.threadId).toBe("rt-fast");
    expect(sync.applyThreadSnapshot).toHaveBeenCalledTimes(applyCallsBefore + 1);
    expect(socketFactory).toHaveBeenCalledTimes(1);
  });

  // ── Finding #1: desktop-as-client event filtering ──────────────────
  describe("filterRemoteThreadEvent", () => {
    it("drops unrelated desktop-global events but keeps Git state events", () => {
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
      const gitStateEvent = { type: "remote-git-state", patch: { revision: 1 } };
      expect(filterRemoteThreadEvent(gitStateEvent, "rt-1")).toBe(gitStateEvent);
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
  it("does not reject or mark the server offline when openRemoteThread fails", async () => {
    const threadHistory = vi.fn<RemoteDesktopClient["threadHistory"]>(async () => {
      throw new Error("server offline");
    });
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient({ threadHistory })));
    useRemoteServersStore.getState().setSocketFactory(() => makeSocket());
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });

    // Must resolve (not reject) so the caller's `void openRemoteThread(...)`
    // never hits the renderer's global unhandledrejection crash screen. It
    // resolves false: no snapshot was applied, so no reopen should follow.
    await expect(useRemoteServersStore.getState().openRemoteThread("d1", "rt-1")).resolves.toBe(
      false,
    );
    expect(toastDanger).toHaveBeenCalledWith("server offline");
    expect(useRemoteServersStore.getState().runtime.d1?.status).toBe("online");
    expect(useRemoteServersStore.getState().runtime.d1?.message).toBeUndefined();
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
    const provisionalId = remoteThreadId("d1", "rt-provisional");
    useAppStore.getState().createThread({
      threadId: provisionalId,
      projectId: remoteProjectId("d1", "p1"),
      remoteServerId: "d1",
      remoteId: "rt-provisional",
      agentKind: "claude",
      config: { model: "claude-sonnet" },
      prompt: "work remotely",
      worktreeProvisioning: true,
    });

    useRemoteServersStore.getState().setRemoteProjectSynced("d1", "p1", false);

    const remoteIds = () =>
      useAppStore
        .getState()
        .projects.filter((project) => project.remoteServerId === "d1")
        .map((project) => project.remoteId);
    expect(remoteIds()).toEqual(["p2"]);
    // Threads of an unsynced project would be orphans in the sidebar.
    expect(useAppStore.getState().threads.map((thread) => thread.remoteId)).not.toContain("rt-1");
    expect(useAppStore.getState().threads.map((thread) => thread.id)).not.toContain(provisionalId);
    expect(useAppStore.getState().provisioningWorktreeThreadIds[provisionalId]).toBeUndefined();
    // Purely local state — nothing was asked of the server.
    expect(snapshot).toHaveBeenCalledTimes(callsAfterPairing);
    expect(useRemoteServersStore.getState().excludedProjectIds.d1).toEqual(["p1"]);

    // A later refresh must not resurrect it.
    await useRemoteServersStore.getState().refreshServer("d1");
    expect(remoteIds()).toEqual(["p2"]);

    useRemoteServersStore.getState().setRemoteProjectSynced("d1", "p1", true);
    expect(remoteIds()).toEqual(expect.arrayContaining(["p1", "p2"]));
  });

  it("rejects interrupt application failures without disabling the connection", async () => {
    const interruptThread = vi.fn<RemoteDesktopClient["interruptThread"]>(async () => {
      throw new Error("unreachable");
    });
    useRemoteServersStore.getState().setClientFactory(factoryFor(makeClient({ interruptThread })));
    await useRemoteServersStore
      .getState()
      .pairServer({ endpoint: "192.168.1.9:38987", token: "a" });
    seedRemoteThreadOwner();

    await expect(
      invokeRemoteRoute("interruptThread", { threadId: remoteThreadId("d1", "rt-1") }),
    ).rejects.toThrow("unreachable");
    expect(useRemoteServersStore.getState().runtime.d1?.status).toBe("online");
  });
});

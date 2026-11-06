import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Thread } from "@/shared/contracts";
import { PORACODE_CLIENT_RUNTIME_VERSION } from "@/shared/clientRuntime";
import { HOME_PROJECT_ID } from "@/shared/homeScope";
import type { PoracodeBridge } from "@/shared/ipc";
import type { RemoteThreadSnapshot } from "@/shared/remote";
import {
  installBrowserClientRuntime,
  installClientRuntime,
  resetClientRuntimeForTest,
} from "@/renderer/clientRuntime";
import { useAppStore } from "../appStore";
import { useSharedSettings } from "../sharedSettingsStore";
import { bootstrapWorkspaces, useWorkspaceStore } from "../workspaceStore";
import { useRemoteServersStore, __resetRemoteServersStoreForTest } from "../remoteServersStore";
import {
  projectRemoteProject,
  projectRemoteThread,
  projectRemoteThreadSnapshot,
  remoteProjectId,
  remoteThreadId,
} from "../remoteProjection";
import { applyThreadSnapshot } from "../remote/sync";
import { installRemoteProjectWorkspaceSync, syncRemoteAppRows } from "./appRows";
import { persistedRemoteServersState } from "./projectCache";
import {
  pinRemoteHomeThreadWorkspace,
  pinRemoteProjectWorkspaces,
  projectBrowserThreadWorkspace,
} from "./workspaceFilings";

const project: Project = {
  id: "p1",
  name: "Repo",
  location: { kind: "posix", path: "/repo" },
  createdAt: "2026-01-01T00:00:00.000Z",
};
const thread: Thread = {
  id: "t1",
  projectId: project.id,
  title: "Chat",
  agentKind: "test-agent",
  config: { model: "default" },
  status: "idle",
  attention: "none",
  canResumeWithConfig: false,
  archived: false,
  done: false,
  starred: false,
  createdAt: project.createdAt,
  updatedAt: project.createdAt,
};

function historySnapshot(workspaceId: string): RemoteThreadSnapshot {
  return projectRemoteThreadSnapshot("d1", {
    snapshotSeq: 1,
    thread: { ...thread, workspaceId },
    runtimeItems: [],
    completedTurns: [],
    contextUsage: null,
    updatedAt: thread.updatedAt,
  });
}

function homeHistorySnapshot(workspaceId: string): RemoteThreadSnapshot {
  return projectRemoteThreadSnapshot("d1", {
    snapshotSeq: 2,
    thread: { ...thread, projectId: HOME_PROJECT_ID, workspaceId },
    runtimeItems: [],
    completedTurns: [],
    contextUsage: null,
    updatedAt: thread.updatedAt,
  });
}

function installDesktopClientRuntime(): void {
  installClientRuntime({
    version: PORACODE_CLIENT_RUNTIME_VERSION,
    host: "electron",
    surface: "adaptive",
    transport: "electron-backend-host",
    capabilities: {
      localBackend: true,
      manageRemoteEnvironments: true,
      nativeAppUpdates: true,
      nativeBrowserWebContents: true,
      nativeShell: true,
      nativeSsh: true,
      osNotifications: true,
    },
    procedures: {} as never,
    native: {} as never,
  });
}

function persistedRemoteDocument(): unknown {
  return JSON.parse(
    JSON.stringify({
      version: 2,
      state: persistedRemoteServersState(useRemoteServersStore.getState()),
    }),
  ) as unknown;
}

/** Cold remote-store restart from one persisted document, without resident app rows. */
async function rehydrateRemoteStore(document: unknown): Promise<void> {
  const persist = useRemoteServersStore.persist;
  const previousStorage = persist.getOptions().storage;
  persist.setOptions({
    storage: {
      getItem: async () => document as never,
      setItem: async () => {},
      removeItem: async () => {},
    },
  });
  try {
    await persist.rehydrate();
  } finally {
    persist.setOptions({ storage: previousStorage });
  }
}

describe("remote workspace filings", () => {
  beforeEach(() => {
    localStorage.clear();
    __resetRemoteServersStoreForTest();
    installBrowserClientRuntime({} as PoracodeBridge);
    useRemoteServersStore.setState({
      servers: [],
      runtime: {},
      projectWorkspaceIds: {},
      explicitProjectWorkspaceIds: {},
      homeThreadWorkspaceIds: {},
      projectNameOverrides: {},
      excludedProjectIds: {},
      lastKnownProjects: {},
    });
    useAppStore.setState({ projects: [], threads: [], view: { kind: "home" } });
    useSharedSettings.setState({
      workspaces: [
        { id: "client-work", name: "Work", icon: "briefcase", createdAt: project.createdAt },
      ],
    });
    useWorkspaceStore.setState({ activeWorkspaceId: "client-work" });
  });

  afterEach(() => {
    __resetRemoteServersStoreForTest();
    resetClientRuntimeForTest();
    vi.restoreAllMocks();
  });

  it("keeps browser filings through authoritative history and rejects legacy foreign tags", () => {
    const appId = remoteThreadId("d1", thread.id);
    // A released browser cache could contain the host's previous workspace id.
    useAppStore.setState({
      threads: [{ ...historySnapshot("old-server-work").thread }],
    });
    syncRemoteAppRows("d1", [project], [{ ...thread, workspaceId: "new-server-work" }]);
    const resident = () => useAppStore.getState().threads.find((row) => row.id === appId)!;
    expect(resident().workspaceId).toBeUndefined();

    applyThreadSnapshot(historySnapshot("new-server-work"), { fromServer: true });
    expect(resident().workspaceId).toBeUndefined();
    useAppStore.getState().setThreadWorkspace(appId, "client-work");
    applyThreadSnapshot(historySnapshot("changed-server-work"), { fromServer: true });
    expect(resident().workspaceId).toBe("client-work");

    const page = { ...thread, workspaceId: "changed-server-work" };
    syncRemoteAppRows("d1", [project], [page]);
    const first = resident();
    syncRemoteAppRows("d1", [project], [page]);
    expect(resident()).toBe(first);
    useAppStore.getState().setThreadWorkspace(appId, undefined);
    applyThreadSnapshot(historySnapshot("changed-server-work"), { fromServer: true });
    expect(resident().workspaceId).toBeUndefined();
  });

  it("retains a desktop remote Home thread's client workspace through thread-only, full, and history snapshots", () => {
    resetClientRuntimeForTest();
    installDesktopClientRuntime();
    const hostHome: Project = {
      ...project,
      id: HOME_PROJECT_ID,
      name: "Home",
      location: { kind: "posix", path: "/Users/me" },
    };
    const hostHomeThread: Thread = {
      ...thread,
      projectId: HOME_PROJECT_ID,
      workspaceId: "server-work",
    };
    const appId = remoteThreadId("d1", thread.id);
    const resident = projectRemoteThreadSnapshot("d1", {
      snapshotSeq: 1,
      thread: { ...hostHomeThread, workspaceId: "client-work" },
      runtimeItems: [],
      completedTurns: [],
      contextUsage: null,
      updatedAt: thread.updatedAt,
    }).thread;
    useAppStore.setState({
      projects: [projectRemoteProject("d1", hostHome)],
      threads: [resident],
    });
    useRemoteServersStore.setState({
      runtime: { d1: { status: "online", projects: [hostHome], threads: [] } },
    });
    const row = () => useAppStore.getState().threads.find((entry) => entry.id === appId)!;

    syncRemoteAppRows("d1", undefined, [hostHomeThread]);
    expect(row().workspaceId).toBe("client-work");
    syncRemoteAppRows("d1", [hostHome], [hostHomeThread]);
    expect(row().workspaceId).toBe("client-work");
    applyThreadSnapshot(homeHistorySnapshot("changed-server-work"), { fromServer: true });
    expect(row().workspaceId).toBe("client-work");
    expect(row().workspaceId).not.toBe("changed-server-work");
  });

  it("shares the pin writer while preserving connection isolation and unchanged map identity", () => {
    pinRemoteProjectWorkspaces([
      { desktopId: "d1", remoteId: "p1", workspaceId: "work" },
      { desktopId: "d1", remoteId: "p2", workspaceId: "side" },
      { desktopId: "d2", remoteId: "p1", workspaceId: undefined },
    ]);
    const pins = useRemoteServersStore.getState().projectWorkspaceIds;
    expect(pins).toEqual({ d1: { p1: "work", p2: "side" }, d2: { p1: null } });
    pinRemoteProjectWorkspaces([{ desktopId: "d1", remoteId: "p1", workspaceId: "work" }]);
    expect(useRemoteServersStore.getState().projectWorkspaceIds).toBe(pins);
  });

  it("waits for released connection state before seeding, preserving null pins and reload filings", async () => {
    const remotePersist = useRemoteServersStore.persist;
    const appPersist = useAppStore.persist;
    const previousRemoteStorage = remotePersist.getOptions().storage;
    const previousAppStorage = appPersist.getOptions().storage;
    let releaseRead!: () => void;
    const encryptedRead = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    let releaseLatestRead!: () => void;
    const latestEncryptedRead = new Promise<void>((resolve) => {
      releaseLatestRead = resolve;
    });
    let readIndex = 0;
    const getRemoteState = () => ({
      servers: ["d1", "d2"].map((desktopId) => ({
        desktopId,
        connectionId: desktopId,
        label: desktopId,
        endpoint: `http://${desktopId}.example.test/`,
        accessToken: "fixture-token",
        scopes: ["session:read", "projects:manage"],
      })),
      excludedProjectIds: {},
      projectWorkspaceIds: { d1: { p1: null }, d2: { p1: "previous-client-group" } },
      projectNameOverrides: {},
      lastKnownProjects: { d1: [project], d2: [project] },
    });
    // The released versions remain valid; only the browser projection changes.
    let savedRemote: unknown = { version: 2, state: getRemoteState() };
    let savedApp: unknown = {
      version: 5,
      state: {
        projects: [
          projectRemoteProject("d1", project),
          projectRemoteProject("d1", {
            ...project,
            id: "p2",
            name: "New",
            location: { kind: "posix", path: "/new-repo" },
          }),
          { ...projectRemoteProject("d2", project), workspaceId: "previous-client-group" },
        ],
        threads: [],
      },
    };
    const writeRemote = vi.fn<(_name: string, value: unknown) => void>((_name, value) => {
      savedRemote = value;
    });
    remotePersist.setOptions({
      storage: {
        getItem: async () => {
          const read = readIndex++;
          if (read === 0) await encryptedRead;
          if (read === 1) await latestEncryptedRead;
          return savedRemote as never;
        },
        setItem: writeRemote,
        removeItem: () => {},
      },
    });
    appPersist.setOptions({
      storage: {
        getItem: () => savedApp as never,
        setItem: (_name, value) => {
          savedApp = value;
        },
        removeItem: () => {},
      },
    });
    const uninstall = installRemoteProjectWorkspaceSync();
    try {
      useSharedSettings.setState({ workspaces: [] });
      await appPersist.rehydrate();
      const remoteHydration = remotePersist.rehydrate();
      const seed = bootstrapWorkspaces();
      await Promise.resolve();
      expect(useSharedSettings.getState().workspaces).toEqual([]);
      expect(writeRemote).not.toHaveBeenCalled();
      const latestHydration = remotePersist.rehydrate();
      releaseRead();
      await remoteHydration;
      await Promise.resolve();
      expect(useSharedSettings.getState().workspaces).toEqual([]);
      expect(writeRemote).not.toHaveBeenCalled();
      releaseLatestRead();
      await latestHydration;
      await seed;

      const workspaces = useSharedSettings.getState().workspaces;
      expect(workspaces.map((workspace) => workspace.name)).toEqual(["Work", "Side Hustle"]);
      const pins = useRemoteServersStore.getState().projectWorkspaceIds;
      expect(pins.d1?.p1).toBeNull();
      expect(pins.d1?.p2).toBe(workspaces[0]!.id);
      expect(pins.d2?.p1).toBe("previous-client-group");
      expect(useRemoteServersStore.getState().servers.map((server) => server.desktopId)).toEqual([
        "d1",
        "d2",
      ]);
      expect(
        useRemoteServersStore
          .getState()
          .servers.every((server) => server.accessToken === "fixture-token"),
      ).toBe(true);
      syncRemoteAppRows(
        "d1",
        [
          project,
          {
            ...project,
            id: "p2",
            name: "New",
            location: { kind: "posix", path: "/new-repo" },
          },
        ],
        [],
      );
      syncRemoteAppRows("d2", [project], []);

      await appPersist.rehydrate();
      await remotePersist.rehydrate();
      await bootstrapWorkspaces();
      expect(useSharedSettings.getState().workspaces).toBe(workspaces);
      expect(useRemoteServersStore.getState().projectWorkspaceIds).toEqual(pins);
      expect(
        useAppStore
          .getState()
          .projects.find((row) => row.remoteServerId === "d1" && row.remoteId === "p1")
          ?.workspaceId,
      ).toBeUndefined();
    } finally {
      releaseRead();
      releaseLatestRead();
      uninstall();
      remotePersist.setOptions({ storage: previousRemoteStorage });
      appPersist.setOptions({ storage: previousAppStorage });
    }
  });

  it("restores a paired Home thread's client workspace through a cold rehydrate", async () => {
    resetClientRuntimeForTest();
    installDesktopClientRuntime();
    const homeProject: Project = {
      ...project,
      id: HOME_PROJECT_ID,
      name: "Home",
      location: { kind: "posix", path: "/Users/me" },
    };
    const hostHomeThread: Thread = { ...thread, projectId: HOME_PROJECT_ID };
    useSharedSettings.setState({
      workspaces: [
        { id: "client-work", name: "Work", createdAt: project.createdAt, icon: "briefcase" },
        { id: "client-side", name: "Side", createdAt: project.createdAt, icon: "briefcase" },
      ],
    });
    useWorkspaceStore.setState({ activeWorkspaceId: "client-work" });
    const appId = remoteThreadId("d1", thread.id);
    const row = () => useAppStore.getState().threads.find((entry) => entry.id === appId)!;

    // A launch on the paired host's Home: the mirrored row carries the client
    // workspace, while the host create omits it.
    const created = useAppStore.getState().createThread({
      threadId: appId,
      projectId: remoteProjectId("d1", HOME_PROJECT_ID),
      workspaceId: "client-work",
      remoteServerId: "d1",
      remoteId: thread.id,
      agentKind: "test-agent",
      config: { model: "default" },
      prompt: "Plan a trip",
    });
    expect(created.workspaceId).toBe("client-work");
    expect(useRemoteServersStore.getState().homeThreadWorkspaceIds).toEqual({
      [appId]: "client-work",
    });

    // Cold restart: only the remote-server document survives; no resident
    // catalog, history row, or in-memory pin map exists to recover it from.
    const firstReload = persistedRemoteDocument();
    useRemoteServersStore.setState({ homeThreadWorkspaceIds: {} });
    await rehydrateRemoteStore(firstReload);
    useAppStore.setState({ projects: [], threads: [] });
    expect(useRemoteServersStore.getState().homeThreadWorkspaceIds).toEqual({
      [appId]: "client-work",
    });

    syncRemoteAppRows("d1", [homeProject], [hostHomeThread]);
    expect(row().workspaceId).toBe("client-work");
    applyThreadSnapshot(
      projectRemoteThreadSnapshot("d1", {
        snapshotSeq: 1,
        thread: { ...hostHomeThread, workspaceId: "changed-server-work" },
        runtimeItems: [],
        completedTurns: [],
        contextUsage: null,
        updatedAt: thread.updatedAt,
      }),
      { fromServer: true },
    );
    expect(row().workspaceId).toBe("client-work");

    // A move is a new client pin; an explicit unfile is the null pin. Both
    // outlive a cold restart and outrank the host workspace.
    useAppStore.getState().setThreadWorkspace(appId, "client-side");
    const movedReload = persistedRemoteDocument();
    useRemoteServersStore.setState({ homeThreadWorkspaceIds: {} });
    await rehydrateRemoteStore(movedReload);
    useAppStore.setState({ projects: [], threads: [] });
    syncRemoteAppRows("d1", [homeProject], [{ ...hostHomeThread, workspaceId: "server-work" }]);
    expect(row().workspaceId).toBe("client-side");

    useAppStore.getState().setThreadWorkspace(appId, undefined);
    expect(useRemoteServersStore.getState().homeThreadWorkspaceIds).toEqual({ [appId]: null });
    const unfiledReload = persistedRemoteDocument();
    useRemoteServersStore.setState({ homeThreadWorkspaceIds: {} });
    await rehydrateRemoteStore(unfiledReload);
    useAppStore.setState({ projects: [], threads: [] });
    syncRemoteAppRows("d1", [homeProject], [{ ...hostHomeThread, workspaceId: "server-work" }]);
    expect(row().workspaceId).toBeUndefined();
  });

  it("keeps the same remote Home thread id isolated per connection", () => {
    resetClientRuntimeForTest();
    installDesktopClientRuntime();
    const hostHomeThread: Thread = { ...thread, projectId: HOME_PROJECT_ID };
    const first = {
      id: remoteThreadId("d1", thread.id),
      projectId: remoteProjectId("d1", HOME_PROJECT_ID),
      remoteServerId: "d1",
    };
    const second = {
      id: remoteThreadId("d2", thread.id),
      projectId: remoteProjectId("d2", HOME_PROJECT_ID),
      remoteServerId: "d2",
    };

    pinRemoteHomeThreadWorkspace(first, "client-work");
    pinRemoteHomeThreadWorkspace(second, undefined);
    const pins = useRemoteServersStore.getState().homeThreadWorkspaceIds;
    expect(pins).toEqual({ [first.id]: "client-work", [second.id]: null });

    pinRemoteHomeThreadWorkspace(first, "client-work");
    expect(useRemoteServersStore.getState().homeThreadWorkspaceIds).toBe(pins);
    expect(
      projectBrowserThreadWorkspace(projectRemoteThread("d1", hostHomeThread), undefined)
        .workspaceId,
    ).toBe("client-work");
    expect(
      projectBrowserThreadWorkspace(projectRemoteThread("d2", hostHomeThread), undefined)
        .workspaceId,
    ).toBeUndefined();
  });

  it("leaves ordinary project threads and unpaired Home threads unchanged", () => {
    resetClientRuntimeForTest();
    installDesktopClientRuntime();
    const ordinary = projectRemoteThread("d1", { ...thread, workspaceId: "server-work" });
    expect(projectBrowserThreadWorkspace(ordinary, undefined)).toBe(ordinary);
    pinRemoteHomeThreadWorkspace(ordinary, "client-work");
    pinRemoteHomeThreadWorkspace(
      { id: thread.id, projectId: HOME_PROJECT_ID, remoteServerId: undefined },
      "client-work",
    );
    expect(useRemoteServersStore.getState().homeThreadWorkspaceIds).toEqual({});

    installBrowserClientRuntime({} as PoracodeBridge);
    const resident = { ...ordinary, workspaceId: "client-work" };
    expect(projectBrowserThreadWorkspace(ordinary, resident).workspaceId).toBe("client-work");
  });

  it("hydrates a v2 document without Home thread pins as an empty client map", async () => {
    useRemoteServersStore.setState({ homeThreadWorkspaceIds: {} });
    await rehydrateRemoteStore({
      version: 2,
      state: {
        servers: [
          {
            desktopId: "d1",
            connectionId: "d1",
            label: "d1",
            endpoint: "http://d1.example.test/",
            accessToken: "",
            scopes: [],
          },
        ],
        excludedProjectIds: {},
        projectWorkspaceIds: { d1: { p1: null } },
        projectNameOverrides: {},
        lastKnownProjects: {},
      },
    });

    expect(useRemoteServersStore.getState().servers.map((server) => server.connectionId)).toEqual([
      "d1",
    ]);
    expect(useRemoteServersStore.getState().homeThreadWorkspaceIds).toEqual({});
    expect(useRemoteServersStore.getState().projectWorkspaceIds).toEqual({ d1: { p1: null } });
  });
});

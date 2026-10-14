import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Thread } from "@/shared/contracts";
import type { PoracodeBridge } from "@/shared/ipc";
import type { RemoteThreadSnapshot } from "@/shared/remote";
import { installBrowserClientRuntime, resetClientRuntimeForTest } from "@/renderer/clientRuntime";
import { useAppStore } from "../appStore";
import { useSharedSettings } from "../sharedSettingsStore";
import { bootstrapWorkspaces, useWorkspaceStore } from "../workspaceStore";
import { useRemoteServersStore, __resetRemoteServersStoreForTest } from "../remoteServersStore";
import {
  projectRemoteProject,
  projectRemoteThreadSnapshot,
  remoteThreadId,
} from "../remoteProjection";
import { applyThreadSnapshot } from "../remote/sync";
import { installRemoteProjectWorkspaceSync, syncRemoteAppRows } from "./appRows";
import { pinRemoteProjectWorkspaces } from "./workspaceFilings";

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

describe("browser workspace filings", () => {
  beforeEach(() => {
    localStorage.clear();
    __resetRemoteServersStoreForTest();
    installBrowserClientRuntime({} as PoracodeBridge);
    useRemoteServersStore.setState({
      servers: [],
      runtime: {},
      projectWorkspaceIds: {},
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
});

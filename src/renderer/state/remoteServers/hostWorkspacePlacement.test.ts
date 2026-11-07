import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/shared/contracts";
import type { PoracodeBridge } from "@/shared/ipc";
import { remoteShellSnapshotSchema } from "@/shared/remote";
import { installBrowserClientRuntime, resetClientRuntimeForTest } from "@/renderer/clientRuntime";
import { useAppStore } from "../appStore";
import { useSharedSettings } from "../sharedSettingsStore";
import { useWorkspaceStore } from "../workspaceStore";
import { useRemoteServersStore, __resetRemoteServersStoreForTest } from "../remoteServersStore";
import { projectRemoteProject } from "../remoteProjection";
import { installRemoteProjectWorkspaceSync, syncRemoteAppRows } from "./appRows";
import { recordHostWorkspaces } from "./hostWorkspacePlacement";

const createdAt = "2026-01-01T00:00:00.000Z";
const hostProject = (id: string, workspaceId?: string): Project => ({
  id,
  name: id,
  location: { kind: "posix", path: `/${id}` },
  createdAt,
  ...(workspaceId ? { workspaceId } : {}),
});

const mirrored = (id: string) =>
  useAppStore
    .getState()
    .projects.find((project) => project.id === projectRemoteProject("pc", hostProject(id)).id);
const clientWorkspace = (name: string) =>
  useSharedSettings.getState().workspaces.find((workspace) => workspace.name === name);

function resetStores(): void {
  localStorage.clear();
  __resetRemoteServersStoreForTest();
  useRemoteServersStore.setState({
    servers: [],
    runtime: {},
    projectWorkspaceIds: {},
    explicitProjectWorkspaceIds: {},
    hostWorkspaces: {},
    projectNameOverrides: {},
    excludedProjectIds: {},
    lastKnownProjects: {},
  });
  useAppStore.setState({ projects: [], threads: [], view: { kind: "home" } });
  useSharedSettings.setState({
    sharedSettingsHydrated: true,
    workspaces: [
      { id: "client-work", name: "Work", icon: "briefcase", createdAt },
      { id: "client-side", name: "Side Hustle", icon: "rocket", createdAt },
    ],
  });
  useWorkspaceStore.setState({ activeWorkspaceId: "client-work" });
}

describe("host workspace placement in a browser client", () => {
  beforeEach(() => {
    resetStores();
    installBrowserClientRuntime({} as PoracodeBridge);
  });

  afterEach(() => {
    __resetRemoteServersStoreForTest();
    resetClientRuntimeForTest();
    vi.restoreAllMocks();
  });

  it("files host projects in the same-named workspace, creating a missing one", () => {
    recordHostWorkspaces("pc", [
      { id: "host-side", name: "side hustle" },
      { id: "host-clients", name: "Clients" },
    ]);
    syncRemoteAppRows("pc", [hostProject("app", "host-side"), hostProject("site", "host-clients")]);

    expect(mirrored("app")?.workspaceId).toBe("client-side");
    const clients = clientWorkspace("Clients");
    expect(clients).toBeDefined();
    expect(mirrored("site")?.workspaceId).toBe(clients!.id);
    // A second sync reuses the created workspace instead of adding another.
    syncRemoteAppRows("pc", [hostProject("site", "host-clients")]);
    expect(
      useSharedSettings.getState().workspaces.filter((w) => w.name === "Clients"),
    ).toHaveLength(1);
  });

  it("moves a project the browser filed by default once the host names its workspace", () => {
    // A released PWA pinned every mirror to the workspace that was active.
    useRemoteServersStore.setState({ projectWorkspaceIds: { pc: { app: "client-work" } } });
    syncRemoteAppRows("pc", [hostProject("app", "host-side")]);
    expect(mirrored("app")?.workspaceId).toBe("client-work");

    recordHostWorkspaces("pc", [{ id: "host-side", name: "Side Hustle" }]);
    syncRemoteAppRows("pc", [hostProject("app", "host-side")]);
    expect(mirrored("app")?.workspaceId).toBe("client-side");
  });

  it("keeps a project where the user moved it, whatever the host's workspace", () => {
    const stop = installRemoteProjectWorkspaceSync();
    try {
      recordHostWorkspaces("pc", [{ id: "host-side", name: "Side Hustle" }]);
      syncRemoteAppRows("pc", [hostProject("app", "host-side")]);
      const id = mirrored("app")!.id;
      useAppStore.getState().setProjectWorkspace(id, "client-work");

      syncRemoteAppRows("pc", [hostProject("app", "host-side")]);
      expect(mirrored("app")?.workspaceId).toBe("client-work");
      expect(useRemoteServersStore.getState().explicitProjectWorkspaceIds.pc?.app).toBe(true);
    } finally {
      stop();
    }
  });

  it("falls back to the browser's own filing for a host that sends no workspace names", () => {
    // Pre-upgrade host: its snapshot has no `workspaces` key.
    const legacy = remoteShellSnapshotSchema.parse({
      snapshotSeq: 1,
      projects: [hostProject("app", "host-side")],
      threads: [],
      runtimeSummariesByThread: {},
      updatedAt: createdAt,
    });
    expect(legacy.workspaces).toBeUndefined();
    recordHostWorkspaces("pc", legacy.workspaces);
    syncRemoteAppRows("pc", legacy.projects);

    expect(mirrored("app")?.workspaceId).toBe("client-work");
    expect(useRemoteServersStore.getState().projectWorkspaceIds.pc?.app).toBe("client-work");
  });
});

describe("host workspace placement on desktop", () => {
  beforeEach(() => {
    // No browser runtime installed: the desktop's own filing rules apply.
    resetClientRuntimeForTest();
    resetStores();
  });

  afterEach(() => {
    __resetRemoteServersStoreForTest();
    resetClientRuntimeForTest();
  });

  it("leaves Electron's own filing alone and creates no workspaces", () => {
    recordHostWorkspaces("pc", [{ id: "host-clients", name: "Clients" }]);
    syncRemoteAppRows("pc", [hostProject("site", "host-clients")]);
    expect(mirrored("site")?.workspaceId).toBeUndefined();
    expect(clientWorkspace("Clients")).toBeUndefined();
  });
});

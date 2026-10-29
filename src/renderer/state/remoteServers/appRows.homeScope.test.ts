import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Thread } from "@/shared/contracts";
import type { PoracodeBridge } from "@/shared/ipc";
import { HOME_PROJECT_ID, HOME_PROJECT_NAME } from "@/shared/homeScope";
import { installBrowserClientRuntime, resetClientRuntimeForTest } from "@/renderer/clientRuntime";
import { useAppStore } from "../appStore";
import { useGitStore } from "../gitStore";
import { useSharedSettings } from "../sharedSettingsStore";
import { useWorkspaceStore } from "../workspaceStore";
import { useRemoteServersStore, __resetRemoteServersStoreForTest } from "../remoteServersStore";
import { remoteProjectId } from "../remoteProjection";
import { syncRemoteAppRows } from "./appRows";

const gitRefresh = vi.hoisted(() => ({
  refreshGitProject: vi.fn<(project: { id: string }) => Promise<void>>(async () => {}),
}));
vi.mock("../gitRefresh", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../gitRefresh")>()),
  refreshGitProject: gitRefresh.refreshGitProject,
}));

const createdAt = "2026-01-01T00:00:00.000Z";
const home: Project = {
  id: HOME_PROJECT_ID,
  name: HOME_PROJECT_NAME,
  location: { kind: "windows", path: "C:\\Users\\me" },
  disabled: true,
  createdAt,
};
const repo: Project = {
  id: "p1",
  name: "Repo",
  location: { kind: "windows", path: "C:\\repo" },
  createdAt,
};
const homeChat: Thread = {
  id: "t1",
  projectId: HOME_PROJECT_ID,
  title: "Plan a trip",
  agentKind: "test-agent",
  config: { model: "default" },
  status: "idle",
  attention: "none",
  canResumeWithConfig: false,
  archived: false,
  done: false,
  starred: false,
  createdAt,
  updatedAt: createdAt,
};

describe("browser client Home mirror", () => {
  beforeEach(() => {
    localStorage.clear();
    __resetRemoteServersStoreForTest();
    installBrowserClientRuntime({} as PoracodeBridge);
    useRemoteServersStore.setState({
      servers: [],
      runtime: { d1: { status: "online" } },
      projectWorkspaceIds: {},
      projectNameOverrides: {},
      excludedProjectIds: {},
      lastKnownProjects: {},
    } as never);
    useAppStore.setState({ projects: [], threads: [], view: { kind: "home" } });
    useGitStore.setState({ statuses: {} });
    useSharedSettings.setState({ workspaces: [] } as never);
    useWorkspaceStore.setState({ activeWorkspaceId: null });
    gitRefresh.refreshGitProject.mockClear();
  });

  afterEach(() => {
    __resetRemoteServersStoreForTest();
    resetClientRuntimeForTest();
    vi.restoreAllMocks();
  });

  it("mirrors the host's Home chats without running Git in the host's home folder", () => {
    syncRemoteAppRows("d1", [home, repo], [homeChat]);

    const homeRowId = remoteProjectId("d1", HOME_PROJECT_ID);
    expect(useAppStore.getState().projects.map((project) => project.id)).toContain(homeRowId);
    expect(useAppStore.getState().threads.map((thread) => thread.projectId)).toEqual([homeRowId]);
    expect(gitRefresh.refreshGitProject.mock.calls.map(([project]) => project.id)).toEqual([
      remoteProjectId("d1", "p1"),
    ]);
  });

  it("leaves the mirrored Home unfiled while other mirrored projects join the active workspace", () => {
    useSharedSettings.setState({
      workspaces: [{ id: "w1", name: "Work", createdAt, icon: "briefcase" }],
    } as never);
    useWorkspaceStore.setState({ activeWorkspaceId: "w1" });

    syncRemoteAppRows("d1", [home, repo], [homeChat]);

    const byId = new Map(useAppStore.getState().projects.map((project) => [project.id, project]));
    expect(byId.get(remoteProjectId("d1", HOME_PROJECT_ID))?.workspaceId).toBeUndefined();
    expect(byId.get(remoteProjectId("d1", "p1"))?.workspaceId).toBe("w1");
    expect(useRemoteServersStore.getState().projectWorkspaceIds.d1).toEqual({ p1: "w1" });
  });
});

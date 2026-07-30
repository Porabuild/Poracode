import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAppStore } from "@/renderer/state/appStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { useWorkspaceStore } from "@/renderer/state/workspaceStore";
import { createWorkspace, deleteWorkspace, renameWorkspace } from "./workspaceActions";

vi.mock("@heroui/react", () => ({
  toast: {
    info: vi.fn<(message: string) => void>(),
    warning: vi.fn<(message: string) => void>(),
    danger: vi.fn<(message: string) => void>(),
  },
}));

function addProject(name: string, workspaceId?: string) {
  return useAppStore
    .getState()
    .addProject({ kind: "posix", path: `/repos/${name}` }, name, workspaceId);
}

describe("workspaceActions", () => {
  beforeEach(() => {
    localStorage.clear();
    useSharedSettings.setState({ workspaces: [] });
    useWorkspaceStore.setState({ activeWorkspaceId: null });
    useAppStore.setState((state) => ({ ...state, projects: [], threads: [] }));
  });

  it("creates a workspace and switches to it", () => {
    const first = createWorkspace("Work");
    const second = createWorkspace("Side Hustle");

    expect(useSharedSettings.getState().workspaces.map((w) => w.name)).toEqual([
      "Work",
      "Side Hustle",
    ]);
    expect(useSharedSettings.getState().workspaces.map((w) => w.icon)).toEqual([
      "briefcase",
      "rocket",
    ]);
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe(second!.id);
    expect(first!.id).not.toBe(second!.id);
  });

  it("refuses a blank name", () => {
    expect(createWorkspace("   ")).toBeNull();
    expect(useSharedSettings.getState().workspaces).toHaveLength(0);
  });

  it("trims names on create and rename", () => {
    const workspace = createWorkspace("  Work  ")!;
    expect(workspace.name).toBe("Work");

    renameWorkspace(workspace.id, "  Client  ");
    expect(useSharedSettings.getState().workspaces[0]!.name).toBe("Client");
  });

  it("moves projects to another workspace when one is deleted", () => {
    const work = createWorkspace("Work")!;
    const side = createWorkspace("Side Hustle")!;
    const alpha = addProject("alpha", work.id);
    const beta = addProject("beta", side.id);

    deleteWorkspace(work.id);

    const projects = useAppStore.getState().projects;
    // Deleting a grouping must never delete the work inside it.
    expect(projects).toHaveLength(2);
    expect(projects.find((p) => p.id === alpha.id)?.workspaceId).toBe(side.id);
    expect(projects.find((p) => p.id === beta.id)?.workspaceId).toBe(side.id);
    expect(useSharedSettings.getState().workspaces.map((w) => w.id)).toEqual([side.id]);
  });

  it("moves the active workspace off a deleted one", () => {
    const work = createWorkspace("Work")!;
    const side = createWorkspace("Side Hustle")!;
    useWorkspaceStore.setState({ activeWorkspaceId: side.id });

    deleteWorkspace(side.id);

    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe(work.id);
  });

  it("refuses to delete the last workspace", () => {
    const only = createWorkspace("Work")!;
    const alpha = addProject("alpha", only.id);

    deleteWorkspace(only.id);

    expect(useSharedSettings.getState().workspaces).toHaveLength(1);
    expect(useAppStore.getState().projects.find((p) => p.id === alpha.id)?.workspaceId).toBe(
      only.id,
    );
  });
});

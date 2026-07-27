import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_WORKSPACE_ICONS, DEFAULT_WORKSPACE_NAMES } from "@/shared/contracts";
import { HOME_PROJECT_ID } from "@/shared/homeScope";
import { useAppStore } from "./appStore";
import { useSharedSettings } from "./sharedSettingsStore";
import { bootstrapWorkspaces, resolveActiveWorkspaceId, useWorkspaceStore } from "./workspaceStore";

function addProject(name: string) {
  return useAppStore.getState().addProject({ kind: "posix", path: `/repos/${name}` }, name);
}

describe("resolveActiveWorkspaceId", () => {
  it("keeps a stored id that still resolves", () => {
    expect(resolveActiveWorkspaceId([{ id: "a" }, { id: "b" }], "b")).toBe("b");
  });

  it("falls back to the first workspace when the stored id is stale", () => {
    // A workspace deleted on another device must not blank the sidebar.
    expect(resolveActiveWorkspaceId([{ id: "a" }, { id: "b" }], "gone")).toBe("a");
  });

  it("returns null when there are no workspaces at all", () => {
    expect(resolveActiveWorkspaceId([], "a")).toBeNull();
  });
});

describe("bootstrapWorkspaces", () => {
  beforeEach(() => {
    localStorage.clear();
    useSharedSettings.setState({ workspaces: [] });
    useWorkspaceStore.setState({ activeWorkspaceId: null });
    useAppStore.setState((state) => ({ ...state, projects: [], threads: [] }));
  });

  it("seeds the default workspaces in a single settings write", async () => {
    const writes: number[] = [];
    const unsubscribe = useSharedSettings.subscribe((state) =>
      writes.push(state.workspaces.length),
    );

    await bootstrapWorkspaces();
    unsubscribe();

    // One write, not one per default name — each would serialize all settings.
    expect(writes).toEqual([2]);

    const names = useSharedSettings.getState().workspaces.map((w) => w.name);
    expect(names).toEqual([...DEFAULT_WORKSPACE_NAMES]);
    expect(useSharedSettings.getState().workspaces.map((w) => w.icon)).toEqual([
      ...DEFAULT_WORKSPACE_ICONS,
    ]);
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe(
      useSharedSettings.getState().workspaces[0]!.id,
    );
  });

  it("files pre-existing projects into the first workspace", async () => {
    const alpha = addProject("alpha");
    const beta = addProject("beta");

    await bootstrapWorkspaces();

    const workId = useSharedSettings.getState().workspaces[0]!.id;
    const projects = useAppStore.getState().projects;
    expect(projects.find((p) => p.id === alpha.id)?.workspaceId).toBe(workId);
    expect(projects.find((p) => p.id === beta.id)?.workspaceId).toBe(workId);
  });

  it("leaves the synthetic Home project unfiled", async () => {
    useAppStore.getState().ensureHomeProject({ kind: "posix", path: "/Users/me" });

    await bootstrapWorkspaces();

    const home = useAppStore.getState().projects.find((p) => p.id === HOME_PROJECT_ID);
    expect(home?.workspaceId).toBeUndefined();
  });

  it("is idempotent once workspaces exist", async () => {
    await bootstrapWorkspaces();
    const before = useSharedSettings.getState().workspaces;

    await bootstrapWorkspaces();

    expect(useSharedSettings.getState().workspaces).toEqual(before);
  });

  it("repairs a stale active id instead of reseeding", async () => {
    await bootstrapWorkspaces();
    const [work, side] = useSharedSettings.getState().workspaces;
    useWorkspaceStore.setState({ activeWorkspaceId: "gone" });

    await bootstrapWorkspaces();

    expect(useSharedSettings.getState().workspaces).toHaveLength(2);
    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe(work!.id);
    expect(side).toBeDefined();
  });
});

import { describe, expect, it, vi } from "vitest";
import type { Project } from "@/shared/contracts";
import { applyRemoteProjectCommand, type RemoteProjectCommandDeps } from "./projectCommands";

const NOW = "2026-06-30T00:00:00.000Z";

function makeDeps(overrides?: Partial<RemoteProjectCommandDeps>) {
  const projects: Project[] = [];
  const upsertProject = vi.fn<RemoteProjectCommandDeps["upsertProject"]>((project) => {
    projects.push(project);
  });
  const deleteProject = vi.fn<RemoteProjectCommandDeps["deleteProject"]>((id) => {
    const index = projects.findIndex((project) => project.id === id);
    if (index !== -1) projects.splice(index, 1);
  });
  const deps: RemoteProjectCommandDeps = {
    getProjects: () => [...projects],
    listProjectThreadIds: () => [],
    upsertProject,
    deleteProject,
    closeThread: vi.fn<RemoteProjectCommandDeps["closeThread"]>(async () => {}),
    cloneRepo: vi.fn<RemoteProjectCommandDeps["cloneRepo"]>(async () => ({
      path: "/repos/cloned",
    })),
    makeDirectory: vi.fn<RemoteProjectCommandDeps["makeDirectory"]>(),
    platform: "linux",
    now: () => NOW,
    ...overrides,
  };
  return { deps, projects, upsertProject, deleteProject };
}

describe("applyRemoteProjectCommand", () => {
  it("registers an existing folder, deriving the name from the path", async () => {
    const { deps, projects } = makeDeps();
    const result = await applyRemoteProjectCommand(
      { kind: "add-existing", path: "/work/my-app" },
      deps,
    );

    expect(result.project?.name).toBe("my-app");
    expect(result.project?.location).toEqual({ kind: "posix", path: "/work/my-app" });
    expect(result.projects).toHaveLength(1);
    expect(projects[0]?.name).toBe("my-app");
  });

  it("honors an explicit project name", async () => {
    const { deps } = makeDeps();
    const result = await applyRemoteProjectCommand(
      { kind: "add-existing", path: "/work/my-app", name: "Custom" },
      deps,
    );
    expect(result.project?.name).toBe("Custom");
  });

  it("sorts new projects to the top via a descending-timestamp sortOrder", async () => {
    const { deps, upsertProject } = makeDeps();
    await applyRemoteProjectCommand({ kind: "add-existing", path: "/work/app" }, deps);
    expect(upsertProject).toHaveBeenCalledWith(
      expect.objectContaining({ name: "app" }),
      -Date.parse(NOW),
    );
  });

  it("creates a folder then registers it", async () => {
    const { deps } = makeDeps();
    const result = await applyRemoteProjectCommand(
      { kind: "create", parentPath: "/work", name: "fresh" },
      deps,
    );
    expect(deps.makeDirectory).toHaveBeenCalledWith("/work/fresh");
    expect(result.project?.location).toEqual({ kind: "posix", path: "/work/fresh" });
  });

  it("surfaces a directory-creation failure as a 400", async () => {
    const { deps } = makeDeps({
      makeDirectory: vi.fn<RemoteProjectCommandDeps["makeDirectory"]>(() => {
        throw new Error("EEXIST: already exists");
      }),
    });
    await expect(
      applyRemoteProjectCommand({ kind: "create", parentPath: "/work", name: "dup" }, deps),
    ).rejects.toMatchObject({ status: 400, code: "project_directory_failed" });
  });

  it("clones via the supervisor then registers the cloned path", async () => {
    const cloneRepo = vi.fn<RemoteProjectCommandDeps["cloneRepo"]>(async () => ({
      path: "/work/cloned-app",
    }));
    const { deps } = makeDeps({ cloneRepo });
    const result = await applyRemoteProjectCommand(
      {
        kind: "clone",
        parentPath: "/work",
        name: "cloned-app",
        source: { kind: "url", url: "https://example.com/x.git" },
      },
      deps,
    );
    expect(cloneRepo).toHaveBeenCalledWith({
      parentLocation: { kind: "posix", path: "/work" },
      name: "cloned-app",
      source: { kind: "url", url: "https://example.com/x.git" },
    });
    expect(result.project?.location).toEqual({ kind: "posix", path: "/work/cloned-app" });
  });

  it("removes a project after closing its threads", async () => {
    const closeThread = vi.fn<RemoteProjectCommandDeps["closeThread"]>(async () => {});
    const { deps, projects } = makeDeps({
      closeThread,
      listProjectThreadIds: () => ["t1", "t2"],
    });
    projects.push({
      id: "p1",
      name: "x",
      location: { kind: "posix", path: "/x" },
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    const result = await applyRemoteProjectCommand({ kind: "remove", projectId: "p1" }, deps);

    expect(closeThread).toHaveBeenCalledTimes(2);
    expect(result.projects).toHaveLength(0);
  });

  it("rejects removing an unknown project", async () => {
    const { deps } = makeDeps();
    await expect(
      applyRemoteProjectCommand({ kind: "remove", projectId: "missing" }, deps),
    ).rejects.toMatchObject({ status: 404, code: "project_not_found" });
  });

  it("rejects an invalid project name", async () => {
    const { deps } = makeDeps();
    await expect(
      applyRemoteProjectCommand({ kind: "add-existing", path: "/x", name: "bad/name" }, deps),
    ).rejects.toMatchObject({ status: 400, code: "invalid_project_name" });
  });

  it("rejects path-traversal segments in add-existing/create/clone", async () => {
    const { deps } = makeDeps();
    await expect(
      applyRemoteProjectCommand({ kind: "add-existing", path: "/a/b/../../etc" }, deps),
    ).rejects.toMatchObject({ status: 400, code: "invalid_project_path" });
    await expect(
      applyRemoteProjectCommand({ kind: "create", parentPath: "/a/../..", name: "x" }, deps),
    ).rejects.toMatchObject({ status: 400, code: "invalid_project_path" });
    await expect(
      applyRemoteProjectCommand(
        {
          kind: "clone",
          parentPath: "/a/../b",
          name: "r",
          source: { kind: "url", url: "https://example.com/r.git" },
        },
        deps,
      ),
    ).rejects.toMatchObject({ status: 400, code: "invalid_project_path" });
    // A clean absolute path is still allowed (the granted capability).
    const ok = await applyRemoteProjectCommand(
      { kind: "add-existing", path: "/home/me/app" },
      deps,
    );
    expect(ok.project?.location).toEqual({ kind: "posix", path: "/home/me/app" });
  });

  it("rejects relative paths in add-existing/create/clone", async () => {
    const { deps } = makeDeps();
    await expect(
      applyRemoteProjectCommand({ kind: "add-existing", path: "relative/app" }, deps),
    ).rejects.toMatchObject({ status: 400, code: "invalid_project_path" });
    await expect(
      applyRemoteProjectCommand({ kind: "create", parentPath: "relative", name: "app" }, deps),
    ).rejects.toMatchObject({ status: 400, code: "invalid_project_path" });
    await expect(
      applyRemoteProjectCommand(
        {
          kind: "clone",
          parentPath: "relative",
          name: "r",
          source: { kind: "url", url: "https://example.com/r.git" },
        },
        deps,
      ),
    ).rejects.toMatchObject({ status: 400, code: "invalid_project_path" });
  });
});

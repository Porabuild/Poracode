import { describe, expect, it, vi } from "vitest";
import { reorderCatalogIds } from "@/shared/catalogOrder";
import type { Project } from "@/shared/contracts";
import { remoteProjectCommandSchema } from "@/shared/remote";
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
  const updateProject = vi.fn<RemoteProjectCommandDeps["updateProject"]>((project) => {
    const index = projects.findIndex((candidate) => candidate.id === project.id);
    if (index !== -1) projects[index] = project;
  });
  const reorderProject = vi.fn<RemoteProjectCommandDeps["reorderProject"]>((input) => {
    const ids = projects.map((project) => project.id);
    if (!ids.includes(input.projectId)) return { status: "project_missing" };
    if (input.projectId !== input.targetProjectId && !ids.includes(input.targetProjectId)) {
      return { status: "target_missing" };
    }
    const nextIds = reorderCatalogIds(ids, input.projectId, input.targetProjectId, input.placement);
    if (nextIds === ids) return { status: "noop" };
    const byId = new Map(projects.map((project) => [project.id, project]));
    let changed = 0;
    ids.forEach((id, index) => {
      if (id !== nextIds[index]) changed += 1;
    });
    projects.splice(0, projects.length, ...nextIds.map((id) => byId.get(id)!));
    return { status: "applied", changed };
  });
  const setProjectWorkspace = vi.fn<RemoteProjectCommandDeps["setProjectWorkspace"]>(
    (projectId, workspaceId) => {
      const index = projects.findIndex((project) => project.id === projectId);
      if (index === -1) return false;
      const current = projects[index]!;
      projects[index] =
        workspaceId === null
          ? (({ workspaceId: _cleared, ...rest }) => rest)(current)
          : { ...current, workspaceId };
      return true;
    },
  );
  const setProjectLastDraftConfig = vi.fn<RemoteProjectCommandDeps["setProjectLastDraftConfig"]>(
    (projectId, lastDraftConfig) => {
      const index = projects.findIndex((project) => project.id === projectId);
      if (index === -1) return false;
      const current = projects[index]!;
      projects[index] =
        lastDraftConfig === null
          ? (({ lastDraftConfig: _cleared, ...rest }) => rest)(current)
          : { ...current, lastDraftConfig };
      return true;
    },
  );
  const deps: RemoteProjectCommandDeps = {
    getProjects: () => [...projects],
    getProject: (projectId) => projects.find((project) => project.id === projectId) ?? null,
    beginProjectRemoval: vi.fn<RemoteProjectCommandDeps["beginProjectRemoval"]>(() => () => {}),
    removeProjectExperiments: vi.fn<RemoteProjectCommandDeps["removeProjectExperiments"]>(
      async () => {},
    ),
    hasRunningProjectThread: () => false,
    listProjectThreadIds: () => [],
    upsertProject,
    updateProject,
    deleteProject,
    reorderProject,
    setProjectWorkspace,
    setProjectLastDraftConfig,
    closeThread: vi.fn<RemoteProjectCommandDeps["closeThread"]>(async () => {}),
    cloneRepo: vi.fn<RemoteProjectCommandDeps["cloneRepo"]>(async () => ({
      path: "/repos/cloned",
    })),
    makeDirectory: vi.fn<RemoteProjectCommandDeps["makeDirectory"]>(),
    platform: "linux",
    now: () => NOW,
    ...overrides,
  };
  return {
    deps,
    projects,
    upsertProject,
    updateProject,
    deleteProject,
    reorderProject,
    setProjectWorkspace,
    setProjectLastDraftConfig,
  };
}

describe("applyRemoteProjectCommand", () => {
  it("registers an existing folder, deriving the name from the path", async () => {
    const { deps, projects } = makeDeps();
    const result = await applyRemoteProjectCommand(
      { kind: "add-existing", path: "/work/my-app" },
      deps,
    );

    expect(result.response.project?.name).toBe("my-app");
    expect(result.response.project?.location).toEqual({ kind: "posix", path: "/work/my-app" });
    expect(result.kind).toBe("complete");
    if (result.kind !== "complete") throw new Error("expected a complete legacy outcome");
    expect(result.projects).toHaveLength(1);
    expect(projects[0]?.name).toBe("my-app");
  });

  it("honors an explicit project name", async () => {
    const { deps } = makeDeps();
    const result = await applyRemoteProjectCommand(
      { kind: "add-existing", path: "/work/my-app", name: "Custom" },
      deps,
    );
    expect(result.response.project?.name).toBe("Custom");
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
    expect(result.response.project?.location).toEqual({ kind: "posix", path: "/work/fresh" });
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
    expect(result.response.project?.location).toEqual({ kind: "posix", path: "/work/cloned-app" });
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
    expect(result.kind).toBe("complete");
    if (result.kind !== "complete") throw new Error("expected a complete legacy outcome");
    expect(result.projects).toHaveLength(0);
  });

  it("updates project settings without replacing its location or identity", async () => {
    const { deps, projects, updateProject } = makeDeps();
    projects.push({
      id: "p1",
      name: "Before",
      location: { kind: "posix", path: "/work/app" },
      createdAt: NOW,
    });

    const result = await applyRemoteProjectCommand(
      {
        kind: "update",
        projectId: "p1",
        patch: {
          name: "After",
          scripts: { actions: [], setupScript: "pnpm install" },
          ghAccount: { host: "github.com", login: "octocat" },
          disabled: true,
        },
      },
      deps,
    );

    expect(updateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "p1",
        name: "After",
        location: { kind: "posix", path: "/work/app" },
        disabled: true,
      }),
    );
    expect(result.response.project?.scripts?.setupScript).toBe("pnpm install");
    expect(result.response.project?.ghAccount).toEqual({ host: "github.com", login: "octocat" });
  });

  it("clears optional project settings when the patch uses null", async () => {
    const { deps, projects, updateProject } = makeDeps();
    projects.push({
      id: "p1",
      name: "App",
      icon: "lucide:rocket",
      location: { kind: "posix", path: "/work/app" },
      scripts: { actions: [], setupScript: "pnpm install" },
      searchSettings: { useIgnoreFiles: false },
      mcpServers: [],
      ghAccount: { host: "github.com", login: "octocat" },
      createdAt: NOW,
    });

    const result = await applyRemoteProjectCommand(
      {
        kind: "update",
        projectId: "p1",
        patch: {
          icon: null,
          scripts: null,
          searchSettings: null,
          mcpServers: null,
          ghAccount: null,
        },
      },
      deps,
    );

    expect(updateProject).toHaveBeenCalledWith({
      id: "p1",
      name: "App",
      location: { kind: "posix", path: "/work/app" },
      createdAt: NOW,
    });
    expect(result.response.project).not.toHaveProperty("icon");
    expect(result.response.project).not.toHaveProperty("scripts");
    expect(result.response.project).not.toHaveProperty("searchSettings");
    expect(result.response.project).not.toHaveProperty("mcpServers");
    expect(result.response.project).not.toHaveProperty("ghAccount");
  });

  it("sets and updates the project icon through the patch", async () => {
    const { deps, projects, updateProject } = makeDeps();
    projects.push({
      id: "p1",
      name: "App",
      location: { kind: "posix", path: "/work/app" },
      createdAt: NOW,
    });

    await applyRemoteProjectCommand(
      { kind: "update", projectId: "p1", patch: { icon: "lucide:rocket" } },
      deps,
    );
    expect(updateProject).toHaveBeenCalledWith(
      expect.objectContaining({ id: "p1", icon: "lucide:rocket" }),
    );

    await applyRemoteProjectCommand(
      { kind: "update", projectId: "p1", patch: { icon: "auto" } },
      deps,
    );
    expect(updateProject).toHaveBeenCalledWith(expect.objectContaining({ id: "p1", icon: "auto" }));
  });

  it("rejects icon values that would escape the project folder", async () => {
    const { deps, projects, updateProject } = makeDeps();
    projects.push({
      id: "p1",
      name: "App",
      location: { kind: "posix", path: "/work/app" },
      createdAt: NOW,
    });

    for (const icon of [
      "file:../../etc/passwd",
      "file:..\\..\\secret.png",
      "file:/etc/passwd",
      "file://server/share/icon.png",
      "bogus:value",
    ]) {
      await expect(
        applyRemoteProjectCommand({ kind: "update", projectId: "p1", patch: { icon } }, deps),
      ).rejects.toMatchObject({ status: 400, code: "invalid_project_path" });
    }
    expect(updateProject).not.toHaveBeenCalled();
    expect(projects[0]?.icon).toBeUndefined();
  });

  it("preserves MCP settings when the parsed patch omits them", async () => {
    const { deps, projects, updateProject } = makeDeps();
    projects.push({
      id: "p1",
      name: "App",
      location: { kind: "posix", path: "/work/app" },
      mcpServers: [
        {
          id: "memory-id",
          name: "memory-server",
          description: "Memory tools",
          enabled: true,
          timeoutMs: 30_000,
          transport: { type: "stdio", command: "node", args: ["server.js"], env: {} },
        },
      ],
      createdAt: NOW,
    });
    const command = remoteProjectCommandSchema.parse({
      kind: "update",
      projectId: "p1",
      patch: { name: "Renamed" },
    });
    if (command.kind !== "update") throw new Error("Expected an update command.");

    expect(command.patch).not.toHaveProperty("mcpServers");
    await applyRemoteProjectCommand(command, deps);

    expect(updateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Renamed",
        mcpServers: [expect.objectContaining({ id: "memory-id" })],
      }),
    );
  });

  it("restores redacted MCP values echoed from the settings read, and refuses markers without a stored source", async () => {
    const { deps, projects, updateProject } = makeDeps();
    projects.push({
      id: "p1",
      name: "App",
      location: { kind: "posix", path: "/work/app" },
      mcpServers: [
        {
          id: "memory-id",
          name: "memory-server",
          description: "Memory tools",
          enabled: true,
          timeoutMs: 30_000,
          transport: {
            type: "stdio",
            command: "node",
            args: ["--api-key=real-secret"],
            env: { API_KEY: "real-secret" },
          },
        },
      ],
      createdAt: NOW,
    });
    // A client echoing the redacted `GET /api/projects/{id}/settings` read
    // back inside a whole-list patch: marker values for the stored server,
    // plus an unrelated real edit (a new server) in the same list.
    const command = remoteProjectCommandSchema.parse({
      kind: "update",
      projectId: "p1",
      patch: {
        mcpServers: [
          {
            id: "memory-id",
            name: "memory-server",
            description: "Memory tools",
            enabled: true,
            timeoutMs: 30_000,
            transport: {
              type: "stdio",
              command: "node",
              args: ["--api-key=«redacted»"],
              env: { API_KEY: "«redacted»" },
            },
          },
          {
            id: "fresh-id",
            name: "fresh-server",
            enabled: true,
            timeoutMs: 30_000,
            transport: { type: "stdio", command: "node", args: [], env: {} },
          },
        ],
      },
    });
    if (command.kind !== "update") throw new Error("Expected an update command.");

    await applyRemoteProjectCommand(command, deps);

    expect(updateProject).toHaveBeenCalledWith(
      expect.objectContaining({
        mcpServers: [
          expect.objectContaining({
            id: "memory-id",
            transport: {
              type: "stdio",
              command: "node",
              args: ["--api-key=real-secret"],
              env: { API_KEY: "real-secret" },
            },
          }),
          expect.objectContaining({ id: "fresh-id" }),
        ],
      }),
    );

    // A marker with no stored source cannot define a new server's secret.
    const orphan = remoteProjectCommandSchema.parse({
      kind: "update",
      projectId: "p1",
      patch: {
        mcpServers: [
          {
            id: "unknown-id",
            name: "unknown-server",
            enabled: true,
            timeoutMs: 30_000,
            transport: { type: "stdio", command: "node", args: [], env: { TOKEN: "«redacted»" } },
          },
        ],
      },
    });
    if (orphan.kind !== "update") throw new Error("Expected an update command.");
    await expect(applyRemoteProjectCommand(orphan, deps)).rejects.toMatchObject({
      code: "mcp_redaction_without_existing_secret",
    });
  });

  it("relocates an idle project and rejects relocation while a thread is running", async () => {
    const baseProject: Project = {
      id: "p1",
      name: "App",
      location: { kind: "posix", path: "/work/app" },
      createdAt: NOW,
    };
    const idle = makeDeps();
    idle.projects.push(baseProject);
    await expect(
      applyRemoteProjectCommand({ kind: "relocate", projectId: "p1", path: "/srv/app" }, idle.deps),
    ).resolves.toMatchObject({
      response: { project: { location: { kind: "posix", path: "/srv/app" } } },
    });

    const running = makeDeps({ hasRunningProjectThread: () => true });
    running.projects.push(baseProject);
    await expect(
      applyRemoteProjectCommand(
        { kind: "relocate", projectId: "p1", path: "/srv/app" },
        running.deps,
      ),
    ).rejects.toMatchObject({ code: "project_has_running_threads", status: 409 });
  });

  it("rejects removing an unknown project", async () => {
    const { deps } = makeDeps();
    await expect(
      applyRemoteProjectCommand({ kind: "remove", projectId: "missing" }, deps),
    ).rejects.toMatchObject({ status: 404, code: "project_not_found" });
  });

  it("removes a project's experiments before closing threads and deleting the project", async () => {
    const calls: string[] = [];
    const closeThread = vi.fn<RemoteProjectCommandDeps["closeThread"]>(async () => {
      calls.push("close-thread");
    });
    const removeProjectExperiments = vi.fn<RemoteProjectCommandDeps["removeProjectExperiments"]>(
      async () => {
        calls.push("remove-experiments");
      },
    );
    const { deps, projects, deleteProject } = makeDeps({
      closeThread,
      removeProjectExperiments,
      listProjectThreadIds: () => ["t1"],
    });
    deleteProject.mockImplementation((id) => {
      calls.push("delete-project");
      const index = projects.findIndex((project) => project.id === id);
      if (index !== -1) projects.splice(index, 1);
    });
    projects.push({
      id: "p1",
      name: "x",
      location: { kind: "posix", path: "/x" },
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    await expect(
      applyRemoteProjectCommand({ kind: "remove", projectId: "p1" }, deps),
    ).resolves.toMatchObject({ response: { projects: [] } });
    expect(removeProjectExperiments).toHaveBeenCalledWith(expect.objectContaining({ id: "p1" }));
    expect(calls).toEqual(["remove-experiments", "close-thread", "delete-project"]);
  });

  it("keeps the project when experiment cleanup fails", async () => {
    const closeThread = vi.fn<RemoteProjectCommandDeps["closeThread"]>(async () => {});
    const { deps, projects, deleteProject } = makeDeps({
      closeThread,
      removeProjectExperiments: async () => {
        throw new Error("cleanup failed");
      },
      listProjectThreadIds: () => ["t1"],
    });
    projects.push({
      id: "p1",
      name: "x",
      location: { kind: "posix", path: "/x" },
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    await expect(
      applyRemoteProjectCommand({ kind: "remove", projectId: "p1" }, deps),
    ).rejects.toThrow("cleanup failed");
    expect(closeThread).not.toHaveBeenCalled();
    expect(deleteProject).not.toHaveBeenCalled();
    expect(projects).toHaveLength(1);
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
    expect(ok.response.project?.location).toEqual({ kind: "posix", path: "/home/me/app" });
  });

  describe("clone URL transport validation", () => {
    async function clone(url: string) {
      const { deps } = makeDeps();
      return applyRemoteProjectCommand(
        { kind: "clone", parentPath: "/work", name: "r", source: { kind: "url", url } },
        deps,
      );
    }

    it("rejects the ext:: remote-helper transport (RCE via git)", async () => {
      await expect(clone("ext::sh -c 'touch /tmp/pwned'")).rejects.toMatchObject({
        status: 400,
        code: "invalid_clone_url",
      });
    });

    it("rejects any <helper>:: transport", async () => {
      await expect(clone("fd::17")).rejects.toMatchObject({
        status: 400,
        code: "invalid_clone_url",
      });
    });

    it("rejects the file: transport", async () => {
      await expect(clone("file:///etc/passwd")).rejects.toMatchObject({
        status: 400,
        code: "invalid_clone_url",
      });
      await expect(clone("file:/etc/passwd")).rejects.toMatchObject({
        status: 400,
        code: "invalid_clone_url",
      });
    });

    it("rejects a leading-dash URL (argument injection)", async () => {
      await expect(clone("--upload-pack=touch /tmp/x")).rejects.toMatchObject({
        status: 400,
        code: "invalid_clone_url",
      });
    });

    it("rejects an unknown scheme", async () => {
      await expect(clone("gopher://example.com/x")).rejects.toMatchObject({
        status: 400,
        code: "invalid_clone_url",
      });
    });

    it("allows a valid https URL", async () => {
      const cloneRepo = vi.fn<RemoteProjectCommandDeps["cloneRepo"]>(async () => ({
        path: "/work/r",
      }));
      const { deps } = makeDeps({ cloneRepo });
      const result = await applyRemoteProjectCommand(
        {
          kind: "clone",
          parentPath: "/work",
          name: "r",
          source: { kind: "url", url: "https://github.com/owner/repo.git" },
        },
        deps,
      );
      expect(cloneRepo).toHaveBeenCalledOnce();
      expect(result.response.project?.location).toEqual({ kind: "posix", path: "/work/r" });
    });

    it("allows valid ssh and scp-style URLs", async () => {
      await expect(clone("ssh://git@github.com/owner/repo.git")).resolves.toBeDefined();
      await expect(clone("git@github.com:owner/repo.git")).resolves.toBeDefined();
    });

    it("does not validate a url for github sources (no free URL)", async () => {
      const cloneRepo = vi.fn<RemoteProjectCommandDeps["cloneRepo"]>(async () => ({
        path: "/work/r",
      }));
      const { deps } = makeDeps({ cloneRepo });
      await applyRemoteProjectCommand(
        {
          kind: "clone",
          parentPath: "/work",
          name: "r",
          source: {
            kind: "github",
            nameWithOwner: "owner/repo",
            account: { host: "github.com", login: "me" },
          },
        },
        deps,
      );
      expect(cloneRepo).toHaveBeenCalledOnce();
    });
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

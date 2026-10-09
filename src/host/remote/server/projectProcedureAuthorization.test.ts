import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, ProjectLocation } from "@/shared/contracts";
import { dbGetProjects, dbGetThreads } from "@/host/db";
import { testThread } from "@/host/db/runtimeItems.testFixtures";
import { HOME_PROJECT_ID } from "@/shared/homeScope";
import { authorizeProjectProcedurePayload } from "./projectProcedureAuthorization";

vi.mock("@/host/db", () => ({
  dbGetProjects: vi.fn<typeof dbGetProjects>(),
  dbGetThreads: vi.fn<typeof dbGetThreads>(),
}));

const root: ProjectLocation = { kind: "posix", path: "/repo" };
function register(location: ProjectLocation = root): void {
  vi.mocked(dbGetProjects).mockReturnValue([
    { id: "project-1", name: "Repo", createdAt: "2026-01-01", location } satisfies Project,
  ]);
}

describe("project procedure authorization", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    register();
    vi.mocked(dbGetThreads).mockReturnValue([]);
  });

  it.each(["readProjectFile", "writeProjectFile", "getGitStatus", "scanSkills"] as const)(
    "refuses an unregistered root for %s",
    (procedure) => {
      expect(() =>
        authorizeProjectProcedurePayload(procedure, {
          projectLocation: { kind: "posix", path: "/private" },
        }),
      ).toThrow(expect.objectContaining({ code: "project_location_not_registered", status: 403 }));
    },
  );

  it("normalizes dot segments and dispatches only the stored location", () => {
    const payload = { projectLocation: { kind: "posix", path: "/repo/src/.." } };
    authorizeProjectProcedurePayload("readProjectFile", payload);
    expect(payload.projectLocation).toEqual(root);
    expect(() =>
      authorizeProjectProcedurePayload("readProjectFile", {
        projectLocation: { kind: "posix", path: "/repo/../private" },
      }),
    ).toThrow("Project location is not registered");
  });

  it("accepts durable worktrees", () => {
    vi.mocked(dbGetThreads).mockReturnValue([{ ...testThread(), worktreePath: "/worktrees/one" }]);
    const payload = { worktreeLocation: { kind: "posix", path: "/worktrees/one/" } };
    authorizeProjectProcedurePayload("gitAbortMerge", payload);
    expect(payload.worktreeLocation).toEqual({ kind: "posix", path: "/worktrees/one" });
  });

  it("binds project/canonical location independently of shared-worktree thread order and equivalent path spelling", () => {
    const a = { ...testThread(), id: "a", worktreePath: "/worktrees/one" };
    const c = { ...a, id: "c", worktreePath: "/worktrees/one/./" };
    const owner = () =>
      authorizeProjectProcedurePayload("readProjectFile", {
        projectLocation: { kind: "posix", path: "/worktrees/one" },
      })?.projectLocation;
    vi.mocked(dbGetThreads).mockReturnValue([a]);
    const original = owner();
    expect(original).toBeDefined();
    for (const threads of [[c, a], [a, c], [c]]) {
      vi.mocked(dbGetThreads).mockReturnValue(threads);
      expect(owner()).toBe(original);
    }
    vi.mocked(dbGetThreads).mockReturnValue([]);
    expect(owner).toThrow("Project location is not registered");
  });

  it("replaces forged WSL UNC and distro values with stored identity", () => {
    const location: ProjectLocation = {
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath: "/home/user/repo",
      uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\user\\repo",
    };
    register(location);
    const payload = { projectLocation: { ...location, distro: "ubuntu", uncPath: "C:\\private" } };
    authorizeProjectProcedurePayload("readProjectFile", payload);
    expect(payload.projectLocation).toEqual(location);
  });

  it("binds the stored WSL UNC root while preserving canonical equivalent UNC spelling", () => {
    // Public-helper policy proof only; this does not exercise Windows or WSL I/O.
    const location: ProjectLocation = {
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath: "/home/user/repo",
      uncPath: String.raw`\\wsl.localhost\Ubuntu\home\user\repo`,
    };
    const owner = () =>
      authorizeProjectProcedurePayload("readProjectFile", {
        projectLocation: { ...location },
      })?.projectLocation;
    register(location);
    const original = owner();
    expect(original).toBeDefined();
    register({ ...location, uncPath: `${location.uncPath.toUpperCase()}\\` });
    expect(owner()).toBe(original);
    // Distro and Linux path stay the same; only the trusted host route changes.
    register({ ...location, uncPath: String.raw`\\wsl.localhost\Ubuntu\other\repo` });
    const changed = owner();
    expect(changed).toBeDefined();
    expect(changed).not.toBe(original);
  });

  it("preserves broad management and optional global procedures", () => {
    authorizeProjectProcedurePayload("readAbsoluteFile", {
      projectLocation: { kind: "posix", path: "/private" },
    });
    authorizeProjectProcedurePayload("scanSkills", {});
    expect(dbGetProjects).not.toHaveBeenCalled();
  });

  it("does not turn the synthetic Home runtime into viewer filesystem authority", () => {
    vi.mocked(dbGetProjects).mockReturnValue([
      { id: HOME_PROJECT_ID, name: "Home", createdAt: "2026-01-01", location: root },
    ]);
    expect(() =>
      authorizeProjectProcedurePayload("readProjectFile", { projectLocation: root }),
    ).toThrow("Project location is not registered");
    expect(() =>
      authorizeProjectProcedurePayload("getGitFileContent", { projectLocation: root }),
    ).toThrow("Project location is not registered");
    authorizeProjectProcedurePayload("startThread", { projectLocation: root });
    authorizeProjectProcedurePayload("workflowGetRun", { location: root });
    authorizeProjectProcedurePayload("readProjectFile", { projectLocation: root }, () => true);
  });

  it("fails closed when the registry cannot be read", () => {
    vi.mocked(dbGetProjects).mockImplementation(() => {
      throw new Error("database unavailable");
    });
    expect(() =>
      authorizeProjectProcedurePayload("readProjectFile", { projectLocation: root }),
    ).toThrow(expect.objectContaining({ code: "project_registry_unavailable", status: 503 }));
  });
});

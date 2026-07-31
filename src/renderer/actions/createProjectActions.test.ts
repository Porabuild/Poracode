import { beforeEach, describe, expect, test, vi } from "vitest";

const ACTIVE_WORKSPACE_ID = "ws-active";

const mocks = vi.hoisted(() => ({
  createProjectDirectory: vi.fn<(p: unknown) => Promise<{ path: string }>>(),
  cloneRepo: vi.fn<(p: unknown) => Promise<{ path: string }>>(),
  pickFolder: vi.fn<(d?: string) => Promise<string | null>>(),
  addProject: vi.fn<(location: unknown, name?: string, workspaceId?: string) => unknown>(
    (location, name) => ({
      id: "p1",
      name: name ?? "x",
      location,
      createdAt: "t",
    }),
  ),
  openDraft: vi.fn<(id: string) => void>(),
  setLastUsedProjectDir: vi.fn<(key: string, dir: string) => void>(),
  autoDetectSetupScript: vi.fn<(project: unknown) => void>(),
  loadHomeScopeLocation: vi.fn<() => Promise<{ kind: string; path: string }>>(),
  lastUsedProjectDirs: {} as Record<string, string>,
}));

const { createProjectDirectory, addProject, openDraft, setLastUsedProjectDir } = mocks;

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({
    platform: "darwin",
    createProjectDirectory: mocks.createProjectDirectory,
    cloneRepo: mocks.cloneRepo,
    pickFolder: mocks.pickFolder,
  }),
}));
vi.mock("@/renderer/actions/projectActions", () => ({
  loadHomeScopeLocation: mocks.loadHomeScopeLocation,
}));
vi.mock("@/renderer/state/appStore", () => ({
  useAppStore: { getState: () => ({ addProject: mocks.addProject, openDraft: mocks.openDraft }) },
}));
// New projects inherit whichever workspace the user is currently viewing.
vi.mock("@/renderer/state/workspaceStore", () => ({
  getActiveWorkspaceId: () => ACTIVE_WORKSPACE_ID,
}));
vi.mock("@/renderer/state/sharedSettingsStore", () => ({
  useSharedSettings: {
    getState: () => ({
      setLastUsedProjectDir: mocks.setLastUsedProjectDir,
      lastUsedProjectDirs: mocks.lastUsedProjectDirs,
    }),
  },
}));
vi.mock("@/renderer/utils/gitHelpers", () => ({
  autoDetectSetupScript: mocks.autoDetectSetupScript,
}));

import {
  addExistingProject,
  commitCloneProject,
  commitCreateProject,
} from "./createProjectActions";

const { cloneRepo } = mocks;

describe("commitCreateProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("existing folder: adds the project and records its parent as last-used", async () => {
    await commitCreateProject({
      mode: "existing",
      choice: { kind: "native" },
      dir: "/Users/me/code/app",
      name: "app",
    });

    expect(createProjectDirectory).not.toHaveBeenCalled();
    expect(addProject).toHaveBeenCalledWith(
      { kind: "posix", path: "/Users/me/code/app" },
      "app",
      ACTIVE_WORKSPACE_ID,
    );
    expect(setLastUsedProjectDir).toHaveBeenCalledWith("native", "/Users/me/code");
    expect(openDraft).toHaveBeenCalledWith("p1");
  });

  test("scratch: creates the directory, then adds the project at the returned path", async () => {
    createProjectDirectory.mockResolvedValue({ path: "/Users/me/code/new" });

    await commitCreateProject({
      mode: "scratch",
      choice: { kind: "native" },
      dir: "/Users/me/code",
      name: "new",
    });

    expect(createProjectDirectory).toHaveBeenCalledWith({
      parent: "/Users/me/code",
      name: "new",
      kind: "posix",
    });
    expect(addProject).toHaveBeenCalledWith(
      { kind: "posix", path: "/Users/me/code/new" },
      "new",
      ACTIVE_WORKSPACE_ID,
    );
    // scratch records the parent the user browsed, not the new folder.
    expect(setLastUsedProjectDir).toHaveBeenCalledWith("native", "/Users/me/code");
  });

  test("scratch failure propagates and does not add a project", async () => {
    createProjectDirectory.mockRejectedValue(
      new Error('A folder named "new" already exists here.'),
    );

    await expect(
      commitCreateProject({
        mode: "scratch",
        choice: { kind: "native" },
        dir: "/Users/me/code",
        name: "new",
      }),
    ).rejects.toThrow(/already exists/i);

    expect(addProject).not.toHaveBeenCalled();
    expect(setLastUsedProjectDir).not.toHaveBeenCalled();
  });
});

describe("commitCloneProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("github source: clones, then adds the project at the returned path", async () => {
    cloneRepo.mockResolvedValue({ path: "/Users/me/code/poracode" });

    await commitCloneProject({
      choice: { kind: "native" },
      parentDir: "/Users/me/code",
      name: "poracode",
      source: {
        kind: "github",
        nameWithOwner: "poracode/poracode",
        account: { host: "github.com", login: "poracode" },
      },
    });

    expect(cloneRepo).toHaveBeenCalledWith({
      parentLocation: { kind: "posix", path: "/Users/me/code" },
      name: "poracode",
      source: {
        kind: "github",
        nameWithOwner: "poracode/poracode",
        account: { host: "github.com", login: "poracode" },
      },
    });
    expect(addProject).toHaveBeenCalledWith(
      { kind: "posix", path: "/Users/me/code/poracode" },
      "poracode",
      ACTIVE_WORKSPACE_ID,
    );
    // Records the parent the user cloned into, not the new folder.
    expect(setLastUsedProjectDir).toHaveBeenCalledWith("native", "/Users/me/code");
    expect(openDraft).toHaveBeenCalledWith("p1");
  });

  test("url source: passes the url through and opens the clone", async () => {
    cloneRepo.mockResolvedValue({ path: "/Users/me/code/repo" });

    await commitCloneProject({
      choice: { kind: "native" },
      parentDir: "/Users/me/code",
      name: "repo",
      source: { kind: "url", url: "https://github.com/owner/repo.git" },
    });

    expect(cloneRepo).toHaveBeenCalledWith({
      parentLocation: { kind: "posix", path: "/Users/me/code" },
      name: "repo",
      source: { kind: "url", url: "https://github.com/owner/repo.git" },
    });
    expect(addProject).toHaveBeenCalledWith(
      { kind: "posix", path: "/Users/me/code/repo" },
      "repo",
      ACTIVE_WORKSPACE_ID,
    );
  });

  test("clone failure propagates and does not add a project", async () => {
    cloneRepo.mockRejectedValue(new Error("Authentication failed"));

    await expect(
      commitCloneProject({
        choice: { kind: "native" },
        parentDir: "/Users/me/code",
        name: "repo",
        source: { kind: "url", url: "bad" },
      }),
    ).rejects.toThrow(/authentication/i);

    expect(addProject).not.toHaveBeenCalled();
    expect(setLastUsedProjectDir).not.toHaveBeenCalled();
  });
});

describe("addExistingProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.lastUsedProjectDirs = {};
    mocks.loadHomeScopeLocation.mockResolvedValue({ kind: "posix", path: "/Users/me" });
  });

  test("opens the picker at home when no last-used dir, then adds the picked folder", async () => {
    mocks.pickFolder.mockResolvedValue("/Users/me/code/app");

    await addExistingProject();

    expect(mocks.pickFolder).toHaveBeenCalledWith("/Users/me");
    expect(addProject).toHaveBeenCalledWith(
      { kind: "posix", path: "/Users/me/code/app" },
      undefined,
      ACTIVE_WORKSPACE_ID,
    );
    expect(setLastUsedProjectDir).toHaveBeenCalledWith("native", "/Users/me/code");
    expect(createProjectDirectory).not.toHaveBeenCalled();
  });

  test("opens the picker at the last-used native dir when present", async () => {
    mocks.lastUsedProjectDirs = { native: "/Users/me/projects" };
    mocks.pickFolder.mockResolvedValue("/Users/me/projects/app");

    await addExistingProject();

    expect(mocks.pickFolder).toHaveBeenCalledWith("/Users/me/projects");
    expect(mocks.loadHomeScopeLocation).not.toHaveBeenCalled();
  });

  test("adds a WSL project selected through the shared folder picker", async () => {
    mocks.pickFolder.mockResolvedValue("\\\\wsl.localhost\\Ubuntu\\home\\demo\\app");

    await addExistingProject();

    expect(addProject).toHaveBeenCalledWith(
      {
        kind: "wsl",
        distro: "Ubuntu",
        linuxPath: "/home/demo/app",
        uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\demo\\app",
      },
      undefined,
      ACTIVE_WORKSPACE_ID,
    );
    expect(setLastUsedProjectDir).toHaveBeenCalledWith(
      "Ubuntu",
      "\\\\wsl.localhost\\Ubuntu\\home\\demo",
    );
  });

  test("opens the WSL picker in the selected distro", async () => {
    mocks.pickFolder.mockResolvedValue(null);

    await addExistingProject({ kind: "wsl", distro: "Ubuntu" });

    expect(mocks.pickFolder).toHaveBeenCalledWith("\\\\wsl.localhost\\Ubuntu\\home");
    expect(mocks.loadHomeScopeLocation).not.toHaveBeenCalled();
  });

  test("does nothing when the picker is cancelled", async () => {
    mocks.pickFolder.mockResolvedValue(null);

    await addExistingProject();

    expect(addProject).not.toHaveBeenCalled();
    expect(setLastUsedProjectDir).not.toHaveBeenCalled();
  });
});

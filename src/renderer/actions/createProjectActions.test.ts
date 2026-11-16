import { beforeEach, describe, expect, test, vi } from "vitest";

const ACTIVE_WORKSPACE_ID = "ws-active";

const mocks = vi.hoisted(() => ({
  managed: false,
  register: vi.fn<(input: unknown) => Promise<unknown>>(),
  createProjectDirectory: vi.fn<(p: unknown) => Promise<{ path: string }>>(),
  cloneRepo: vi.fn<(p: unknown) => Promise<{ path: string }>>(),
  pickFolder: vi.fn<(d?: string) => Promise<string | null>>(),
  addProjectWithResult: vi.fn<(location: unknown, name?: string, workspaceId?: string) => unknown>(
    (location, name) => ({
      project: { id: "p1", name: name ?? "x", location, createdAt: "t" },
      created: true,
    }),
  ),
  openDraft: vi.fn<(id: string) => void>(),
  setLastUsedProjectDir: vi.fn<(key: string, dir: string) => void>(),
  autoDetectSetupScript: vi.fn<(project: unknown) => void>(),
  toastInfo: vi.fn<(message: string) => void>(),
  toastDanger: vi.fn<(message: string) => void>(),
  loadHomeScopeLocation: vi.fn<() => Promise<{ kind: string; path: string }>>(),
  lastUsedProjectDirs: {} as Record<string, string>,
  projects: [] as { id: string }[],
  appListeners: new Set<() => void>(),
  runProjectCommand: vi.fn<(connectionKey: string, command: unknown) => Promise<unknown>>(),
  setRemoteProjectSynced:
    vi.fn<(connectionKey: string, remoteProjectId: string, synced: boolean) => void>(),
  browseHostDirectory: vi.fn<(connectionKey: string, path: string) => Promise<unknown>>(),
  servers: [] as { desktopId: string; platform?: string }[],
}));

const { createProjectDirectory, addProjectWithResult, openDraft, setLastUsedProjectDir } = mocks;

vi.mock("@heroui/react", () => ({
  toast: { info: mocks.toastInfo, danger: mocks.toastDanger },
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({
    platform: "darwin",
    createProjectDirectory: mocks.createProjectDirectory,
    cloneRepo: mocks.cloneRepo,
    pickFolder: mocks.pickFolder,
  }),
}));
vi.mock("@/renderer/state/managedRootCatalog/rootCatalogCommands", () => ({
  isManagedRootDesktopRuntime: () => mocks.managed,
  isApplyingHostOriginatedManagedRootMutation: () => false,
  sendManagedRootProjectCommand: mocks.register,
}));
vi.mock("@/renderer/actions/projectActions", () => ({
  loadHomeScopeLocation: mocks.loadHomeScopeLocation,
}));
vi.mock("@/renderer/state/appStore", () => ({
  useAppStore: {
    getState: () => ({
      addProjectWithResult: mocks.addProjectWithResult,
      openDraft: mocks.openDraft,
      projects: mocks.projects,
    }),
    subscribe: (listener: () => void) => {
      mocks.appListeners.add(listener);
      return () => mocks.appListeners.delete(listener);
    },
  },
}));
vi.mock("@/renderer/state/remoteServersStore", () => ({
  useRemoteServersStore: {
    getState: () => ({
      runProjectCommand: mocks.runProjectCommand,
      setRemoteProjectSynced: mocks.setRemoteProjectSynced,
      browseHostDirectory: mocks.browseHostDirectory,
      servers: mocks.servers,
    }),
  },
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
  addRemoteExistingProject,
  commitCloneProject,
  commitCreateProject,
  commitRemoteCloneProject,
  commitRemoteCreateProject,
  machinePathLocation,
  resolveMachineHomeLocation,
} from "./createProjectActions";

const { cloneRepo } = mocks;

describe("commitCreateProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.managed = false;
  });

  test("propagates a refused host registration to the modal instead of completing", async () => {
    mocks.managed = true;
    mocks.register.mockRejectedValueOnce(new Error("registration refused"));
    await expect(
      commitCreateProject({
        mode: "existing",
        choice: { kind: "native" },
        dir: "/repo",
        name: "Repo",
      }),
    ).rejects.toThrow("registration refused");
    expect(openDraft).not.toHaveBeenCalled();
    mocks.managed = false;
  });

  test("existing folder: adds the project and records its parent as last-used", async () => {
    await commitCreateProject({
      mode: "existing",
      choice: { kind: "native" },
      dir: "/Users/me/code/app",
      name: "app",
    });

    expect(createProjectDirectory).not.toHaveBeenCalled();
    expect(addProjectWithResult).toHaveBeenCalledWith(
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
    expect(addProjectWithResult).toHaveBeenCalledWith(
      { kind: "posix", path: "/Users/me/code/new" },
      "new",
      ACTIVE_WORKSPACE_ID,
    );
    // scratch records the parent the user browsed, not the new folder.
    expect(setLastUsedProjectDir).toHaveBeenCalledWith("native", "/Users/me/code");
  });

  test("reopens a reused project without running setup detection again", async () => {
    addProjectWithResult.mockReturnValueOnce({ project: { id: "existing" }, created: false });
    await commitCreateProject({
      mode: "existing",
      choice: { kind: "native" },
      dir: "/repo",
      name: "Repo",
    });
    expect(mocks.autoDetectSetupScript).not.toHaveBeenCalled();
    expect(mocks.toastInfo).toHaveBeenCalledWith("This folder is already registered as a project.");
    expect(openDraft).toHaveBeenCalledWith("existing");
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

    expect(addProjectWithResult).not.toHaveBeenCalled();
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
    expect(addProjectWithResult).toHaveBeenCalledWith(
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
    expect(addProjectWithResult).toHaveBeenCalledWith(
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

    expect(addProjectWithResult).not.toHaveBeenCalled();
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
    expect(addProjectWithResult).toHaveBeenCalledWith(
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

    expect(addProjectWithResult).toHaveBeenCalledWith(
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

    expect(addProjectWithResult).not.toHaveBeenCalled();
    expect(setLastUsedProjectDir).not.toHaveBeenCalled();
  });
});

describe("addRemoteExistingProject", () => {
  const remoteProject = {
    id: "host-p1",
    name: "app",
    location: { kind: "posix", path: "/srv/app" },
    createdAt: "t",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.projects = [{ id: "remote:mac:project:host-p1" }];
  });

  test("registers the folder on the paired machine and opens its mirrored draft", async () => {
    mocks.runProjectCommand.mockResolvedValue({ ok: true, project: remoteProject, created: true });

    await addRemoteExistingProject("mac", "/srv/app");

    expect(mocks.runProjectCommand).toHaveBeenCalledWith("mac", {
      kind: "add-existing",
      path: "/srv/app",
    });
    expect(mocks.setRemoteProjectSynced).toHaveBeenCalledWith("mac", "host-p1", true);
    expect(openDraft).toHaveBeenCalledWith("remote:mac:project:host-p1");
    expect(mocks.toastInfo).not.toHaveBeenCalled();
    // A remote add never touches the local catalog or local last-used folders.
    expect(addProjectWithResult).not.toHaveBeenCalled();
    expect(setLastUsedProjectDir).not.toHaveBeenCalled();
  });

  test("reopens a folder the machine already registered", async () => {
    mocks.runProjectCommand.mockResolvedValue({
      projects: [remoteProject],
      project: remoteProject,
      created: false,
    });

    await addRemoteExistingProject("mac", "/srv/app");

    expect(mocks.toastInfo).toHaveBeenCalledWith("This folder is already registered as a project.");
    expect(openDraft).toHaveBeenCalledWith("remote:mac:project:host-p1");
  });

  test("opens the draft once the catalog refresh mirrors the new row", async () => {
    mocks.projects = [];
    mocks.runProjectCommand.mockResolvedValue({ ok: true, project: remoteProject, created: true });

    await addRemoteExistingProject("mac", "/srv/app");
    expect(openDraft).not.toHaveBeenCalled();

    mocks.projects = [{ id: "remote:mac:project:host-p1" }];
    for (const listener of [...mocks.appListeners]) listener();

    expect(openDraft).toHaveBeenCalledExactlyOnceWith("remote:mac:project:host-p1");
    expect(mocks.appListeners.size).toBe(0);
  });

  test("surfaces a refused registration as a toast", async () => {
    mocks.runProjectCommand.mockRejectedValue(new Error("registration refused"));

    await addRemoteExistingProject("mac", "/srv/missing");

    expect(mocks.toastDanger).toHaveBeenCalledWith("registration refused");
    expect(mocks.setRemoteProjectSynced).not.toHaveBeenCalled();
    expect(openDraft).not.toHaveBeenCalled();
  });
});

describe("commitRemoteCloneProject", () => {
  const cloned = {
    id: "host-repo",
    name: "repo",
    location: { kind: "posix", path: "/srv/code/repo" },
    createdAt: "t",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.projects = [{ id: "remote:mac:project:host-repo" }];
  });

  test("clones and registers on the paired machine, then opens the mirrored draft", async () => {
    mocks.runProjectCommand.mockResolvedValue({ ok: true, project: cloned, created: true });

    await commitRemoteCloneProject({
      connectionKey: "mac",
      parentDir: "/srv/code",
      name: " repo ",
      source: { kind: "url", url: "https://github.com/owner/repo.git" },
    });

    expect(mocks.runProjectCommand).toHaveBeenCalledWith("mac", {
      kind: "clone",
      parentPath: "/srv/code",
      name: "repo",
      source: { kind: "url", url: "https://github.com/owner/repo.git" },
    });
    expect(openDraft).toHaveBeenCalledWith("remote:mac:project:host-repo");
    // The machine clones it; nothing runs or registers on this computer.
    expect(cloneRepo).not.toHaveBeenCalled();
    expect(addProjectWithResult).not.toHaveBeenCalled();
    expect(setLastUsedProjectDir).not.toHaveBeenCalled();
  });

  test("propagates a failed clone to the modal", async () => {
    mocks.runProjectCommand.mockRejectedValue(new Error("Authentication failed"));

    await expect(
      commitRemoteCloneProject({
        connectionKey: "mac",
        parentDir: "/srv/code",
        name: "repo",
        source: { kind: "url", url: "https://github.com/owner/private.git" },
      }),
    ).rejects.toThrow(/authentication/i);
    expect(openDraft).not.toHaveBeenCalled();
    expect(mocks.toastDanger).not.toHaveBeenCalled();
  });
});

describe("commitRemoteCreateProject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.projects = [{ id: "remote:mac:project:host-new" }];
  });

  test("creates and registers the folder on the paired machine, then opens its draft", async () => {
    mocks.runProjectCommand.mockResolvedValue({
      ok: true,
      project: {
        id: "host-new",
        name: "my-app",
        location: { kind: "posix", path: "/srv/code/my-app" },
        createdAt: "t",
      },
      created: true,
    });

    await commitRemoteCreateProject({
      connectionKey: "mac",
      parentDir: "/srv/code",
      name: " my-app ",
    });

    expect(mocks.runProjectCommand).toHaveBeenCalledWith("mac", {
      kind: "create",
      parentPath: "/srv/code",
      name: "my-app",
    });
    expect(openDraft).toHaveBeenCalledWith("remote:mac:project:host-new");
    expect(createProjectDirectory).not.toHaveBeenCalled();
    expect(addProjectWithResult).not.toHaveBeenCalled();
  });

  test("propagates a refused create to the modal", async () => {
    mocks.runProjectCommand.mockRejectedValue(new Error("Folder already exists."));

    await expect(
      commitRemoteCreateProject({ connectionKey: "mac", parentDir: "/srv/code", name: "my-app" }),
    ).rejects.toThrow("Folder already exists.");
    expect(openDraft).not.toHaveBeenCalled();
  });
});

describe("machinePathLocation", () => {
  test("uses the machine's reported platform", () => {
    expect(machinePathLocation("pc", "D:\\code", "win32")).toEqual({
      kind: "windows",
      path: "D:\\code",
      remoteServerId: "pc",
    });
  });

  test("falls back to the path's shape for records without a platform", () => {
    expect(machinePathLocation("box", "/home/me/code", undefined)).toEqual({
      kind: "posix",
      path: "/home/me/code",
      remoteServerId: "box",
    });
    expect(machinePathLocation("pc", "\\\\wsl.localhost\\Ubuntu\\home\\me", undefined)).toEqual({
      kind: "wsl",
      distro: "Ubuntu",
      linuxPath: "/home/me",
      uncPath: "\\\\wsl.localhost\\Ubuntu\\home\\me",
      remoteServerId: "pc",
    });
  });
});

describe("resolveMachineHomeLocation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.servers = [];
  });

  test("returns the machine's home as a location that machine owns", async () => {
    mocks.servers = [{ desktopId: "mac", platform: "darwin" }];
    mocks.browseHostDirectory.mockResolvedValue({ path: "/Users/me", homePath: "/Users/me" });

    await expect(resolveMachineHomeLocation("mac")).resolves.toEqual({
      kind: "posix",
      path: "/Users/me",
      remoteServerId: "mac",
    });
    expect(mocks.browseHostDirectory).toHaveBeenCalledWith("mac", "");
  });

  test("recognizes a Windows home when the pairing record predates platform reporting", async () => {
    mocks.servers = [{ desktopId: "pc" }];
    mocks.browseHostDirectory.mockResolvedValue({
      path: "C:\\Users\\me",
      homePath: "C:\\Users\\me",
    });

    await expect(resolveMachineHomeLocation("pc")).resolves.toEqual({
      kind: "windows",
      path: "C:\\Users\\me",
      remoteServerId: "pc",
    });
  });
});

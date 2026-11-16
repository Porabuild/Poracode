import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { GhListAccountsResult, GhListReposResult } from "@/shared/contracts";
import type { RemoteServerRecord } from "@/renderer/state/remoteServers/types";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";

const MACHINE_HOME = { kind: "posix", path: "/Users/remote", remoteServerId: "mac" };

const mocks = vi.hoisted(() => ({
  listWslDistros: vi.fn<() => Promise<string[]>>().mockResolvedValue([]),
  pickFolder: vi.fn<(d?: string) => Promise<string | null>>().mockResolvedValue(null),
  ghListAccounts: vi.fn<(payload: unknown) => Promise<GhListAccountsResult>>(),
  ghListRepos: vi.fn<(payload: unknown) => Promise<GhListReposResult>>(),
  loadHomeScopeLocation: vi.fn<() => Promise<{ kind: string; path: string }>>(),
  resolveRuntimeContextLocation: vi.fn<() => Promise<{ kind: string; path: string }>>(),
  resolveMachineHomeLocation: vi.fn<(connectionKey: string) => Promise<unknown>>(),
  commitCloneProject: vi.fn<(p: unknown) => Promise<void>>().mockResolvedValue(undefined),
  commitRemoteCloneProject: vi.fn<(p: unknown) => Promise<void>>().mockResolvedValue(undefined),
  remote: {
    servers: [] as RemoteServerRecord[],
    runtime: {} as Record<string, { status: "online" | "offline" | "connecting" | "error" }>,
    browseHostDirectory: vi.fn<(desktopId: string, path: string) => Promise<unknown>>(),
  },
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({
    platform: "darwin",
    listWslDistros: mocks.listWslDistros,
    pickFolder: mocks.pickFolder,
    ghListAccounts: mocks.ghListAccounts,
    ghListRepos: mocks.ghListRepos,
  }),
  isWindows: () => false,
}));
vi.mock("@/renderer/actions/projectActions", () => ({
  loadHomeScopeLocation: mocks.loadHomeScopeLocation,
}));
vi.mock("@/renderer/actions/createProjectActions", () => ({
  resolveRuntimeContextLocation: mocks.resolveRuntimeContextLocation,
  resolveMachineHomeLocation: mocks.resolveMachineHomeLocation,
  commitCloneProject: mocks.commitCloneProject,
  commitRemoteCloneProject: mocks.commitRemoteCloneProject,
}));
vi.mock("@/renderer/state/remoteServersStore", () => ({
  useRemoteServersStore: (selector: (state: typeof mocks.remote) => unknown) =>
    selector(mocks.remote),
}));

import { usePanelStore } from "@/renderer/state/panelStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { CloneProjectModal } from "./CloneProjectModal";

const ONE_ACCOUNT: GhListAccountsResult = {
  accounts: [{ host: "github.com", login: "poracode", active: true }],
};
const ONE_REPO: GhListReposResult = {
  repos: [
    {
      nameWithOwner: "poracode/poracode",
      owner: "poracode",
      name: "poracode",
      description: "agents",
      isPrivate: false,
      isFork: false,
      sshUrl: "git@github.com:poracode/poracode.git",
      httpsUrl: "https://github.com/poracode/poracode.git",
      pushedAt: "2026-06-01T00:00:00Z",
    },
  ],
};

describe("CloneProjectModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listWslDistros.mockResolvedValue([]);
    mocks.pickFolder.mockResolvedValue(null);
    mocks.ghListAccounts.mockResolvedValue(ONE_ACCOUNT);
    mocks.ghListRepos.mockResolvedValue(ONE_REPO);
    mocks.loadHomeScopeLocation.mockResolvedValue({ kind: "posix", path: "/Users/me" });
    mocks.resolveRuntimeContextLocation.mockResolvedValue({ kind: "posix", path: "/Users/me" });
    mocks.resolveMachineHomeLocation.mockResolvedValue(MACHINE_HOME);
    mocks.commitCloneProject.mockResolvedValue(undefined);
    mocks.commitRemoteCloneProject.mockResolvedValue(undefined);
    mocks.remote.servers = [];
    mocks.remote.runtime = {};
    mocks.remote.browseHostDirectory.mockResolvedValue({
      path: "/Users/remote/code",
      parentPath: "/Users/remote",
      homePath: "/Users/remote",
      entries: [],
      truncated: false,
    });
    useSharedSettings.setState({ lastUsedProjectDirs: {} });
    usePanelStore.setState({ cloneProjectModalOpen: false });
  });

  function pairMachine() {
    mocks.remote.servers = [
      {
        desktopId: "mac",
        label: "Poracode on MacBook",
        endpoint: "http://mac.test/",
        accessToken: "token",
        scopes: ["projects:manage"],
      },
    ];
    mocks.remote.runtime = { mac: { status: "online" } };
  }

  async function chooseMachineRuntime() {
    fireEvent.click(await screen.findByRole("button", { name: "Runtime" }));
    fireEvent.click(await screen.findByText("MacBook"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Runtime" })).toHaveTextContent("MacBook"),
    );
  }

  afterEach(() => {
    cleanup();
    usePanelStore.setState({ cloneProjectModalOpen: false });
  });

  test("github mode: selecting a repo fills the folder name and clones it", async () => {
    usePanelStore.getState().openCloneProjectModal();
    render(<CloneProjectModal />);

    const cloneButton = await screen.findByRole("button", { name: "Clone" });
    expect(cloneButton).toBeDisabled();

    fireEvent.click(await screen.findByText("poracode/poracode"));

    await waitFor(() => expect(screen.getByLabelText("Folder name")).toHaveValue("poracode"));
    await waitFor(() => expect(cloneButton).toBeEnabled());

    fireEvent.click(cloneButton);

    await waitFor(() =>
      expect(mocks.commitCloneProject).toHaveBeenCalledWith({
        choice: { kind: "native" },
        parentDir: "/Users/me",
        name: "poracode",
        source: {
          kind: "github",
          nameWithOwner: "poracode/poracode",
          account: { host: "github.com", login: "poracode" },
        },
      }),
    );
  });

  test("url mode: pasting a URL fills the name and clones via url source", async () => {
    usePanelStore.getState().openCloneProjectModal();
    render(<CloneProjectModal />);

    fireEvent.click(await screen.findByRole("button", { name: "Clone URL" }));

    const urlInput = screen.getByLabelText("Repository URL");
    fireEvent.change(urlInput, { target: { value: "https://github.com/owner/repo.git" } });

    await waitFor(() => expect(screen.getByLabelText("Folder name")).toHaveValue("repo"));

    const cloneButton = screen.getByRole("button", { name: "Clone" });
    await waitFor(() => expect(cloneButton).toBeEnabled());
    fireEvent.click(cloneButton);

    await waitFor(() =>
      expect(mocks.commitCloneProject).toHaveBeenCalledWith({
        choice: { kind: "native" },
        parentDir: "/Users/me",
        name: "repo",
        source: { kind: "url", url: "https://github.com/owner/repo.git" },
      }),
    );
  });

  test("falls back to URL mode when no GitHub accounts are signed in", async () => {
    mocks.ghListAccounts.mockResolvedValue({ accounts: [] });

    usePanelStore.getState().openCloneProjectModal();
    render(<CloneProjectModal />);

    await waitFor(() => expect(screen.getByLabelText("Repository URL")).toBeInTheDocument());
  });

  test("shows a loading view with the target while the clone is in flight", async () => {
    let resolveClone: () => void = () => {};
    mocks.commitCloneProject.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveClone = resolve;
      }),
    );

    usePanelStore.getState().openCloneProjectModal();
    render(<CloneProjectModal />);

    fireEvent.click(await screen.findByText("poracode/poracode"));
    fireEvent.click(await screen.findByRole("button", { name: "Clone" }));

    // The form is replaced by a loading view naming what's being cloned.
    await waitFor(() => expect(screen.getByText(/Cloning poracode\/poracode/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Cloning…" })).toBeDisabled();
    expect(screen.queryByLabelText("Folder name")).not.toBeInTheDocument();

    resolveClone();
    await waitFor(() => expect(usePanelStore.getState().cloneProjectModalOpen).toBe(false));
  });

  test("hides the runtime picker when this computer is the only place to clone to", async () => {
    usePanelStore.getState().openCloneProjectModal();
    render(<CloneProjectModal />);

    await screen.findByText("poracode/poracode");
    expect(screen.queryByRole("button", { name: "Runtime" })).not.toBeInTheDocument();
  });

  test("clones on a connected machine with that machine's GitHub accounts and home", async () => {
    pairMachine();
    usePanelStore.getState().openCloneProjectModal();
    render(<CloneProjectModal />);

    await chooseMachineRuntime();

    expect(mocks.resolveMachineHomeLocation).toHaveBeenCalledWith("mac");
    await waitFor(() =>
      expect(mocks.ghListAccounts).toHaveBeenCalledWith({ runtime: MACHINE_HOME }),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Browse for parent folder" })).toHaveTextContent(
        "/Users/remote",
      ),
    );
    fireEvent.click(await screen.findByText("poracode/poracode"));
    expect(mocks.ghListRepos).toHaveBeenLastCalledWith({
      runtime: MACHINE_HOME,
      account: { host: "github.com", login: "poracode" },
    });
    const cloneButton = screen.getByRole("button", { name: "Clone" });
    await waitFor(() => expect(cloneButton).toBeEnabled());
    fireEvent.click(cloneButton);

    await waitFor(() =>
      expect(mocks.commitRemoteCloneProject).toHaveBeenCalledWith({
        connectionKey: "mac",
        parentDir: "/Users/remote",
        name: "poracode",
        source: {
          kind: "github",
          nameWithOwner: "poracode/poracode",
          account: { host: "github.com", login: "poracode" },
        },
      }),
    );
    expect(mocks.commitCloneProject).not.toHaveBeenCalled();
    // One round trip resolves the machine's home for both browsing and GitHub.
    expect(mocks.resolveMachineHomeLocation).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(usePanelStore.getState().cloneProjectModalOpen).toBe(false));
  });

  test("browses a connected machine's folders with its own folder picker", async () => {
    pairMachine();
    usePanelStore.getState().openCloneProjectModal();
    render(<CloneProjectModal />);

    await chooseMachineRuntime();
    fireEvent.click(screen.getByRole("button", { name: "Browse for parent folder" }));

    expect(await screen.findByText("Choose a folder on MacBook")).toBeInTheDocument();
    const useFolder = await screen.findByRole("button", { name: "Use this folder" });
    await waitFor(() => expect(useFolder).toBeEnabled());
    fireEvent.click(useFolder);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Browse for parent folder" })).toHaveTextContent(
        "/Users/remote/code",
      ),
    );
    expect(mocks.pickFolder).not.toHaveBeenCalled();
  });
});

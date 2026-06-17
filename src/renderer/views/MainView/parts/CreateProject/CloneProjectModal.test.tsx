import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { GhListAccountsResult, GhListReposResult } from "@/shared/contracts";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";

const mocks = vi.hoisted(() => ({
  listWslDistros: vi.fn<() => Promise<string[]>>().mockResolvedValue([]),
  pickFolder: vi.fn<(d?: string) => Promise<string | null>>().mockResolvedValue(null),
  ghListAccounts: vi.fn<() => Promise<GhListAccountsResult>>(),
  ghListRepos: vi.fn<() => Promise<GhListReposResult>>(),
  loadHomeScopeLocation: vi.fn<() => Promise<{ kind: string; path: string }>>(),
  resolveRuntimeContextLocation: vi.fn<() => Promise<{ kind: string; path: string }>>(),
  commitCloneProject: vi.fn<(p: unknown) => Promise<void>>().mockResolvedValue(undefined),
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
  commitCloneProject: mocks.commitCloneProject,
}));

import { usePanelStore } from "@/renderer/state/panelStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { CloneProjectModal } from "./CloneProjectModal";

const ONE_ACCOUNT: GhListAccountsResult = {
  accounts: [{ host: "github.com", login: "SDSLeon", active: true }],
};
const ONE_REPO: GhListReposResult = {
  repos: [
    {
      nameWithOwner: "SDSLeon/lightcode",
      owner: "SDSLeon",
      name: "lightcode",
      description: "agents",
      isPrivate: false,
      isFork: false,
      sshUrl: "git@github.com:SDSLeon/lightcode.git",
      httpsUrl: "https://github.com/SDSLeon/lightcode.git",
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
    mocks.commitCloneProject.mockResolvedValue(undefined);
    useSharedSettings.setState({ lastUsedProjectDirs: {} });
    usePanelStore.setState({ cloneProjectModalOpen: false });
  });

  afterEach(() => {
    usePanelStore.setState({ cloneProjectModalOpen: false });
  });

  test("github mode: selecting a repo fills the folder name and clones it", async () => {
    usePanelStore.getState().openCloneProjectModal();
    render(<CloneProjectModal />);

    const cloneButton = await screen.findByRole("button", { name: "Clone" });
    expect(cloneButton).toBeDisabled();

    fireEvent.click(await screen.findByText("SDSLeon/lightcode"));

    await waitFor(() => expect(screen.getByLabelText("Folder name")).toHaveValue("lightcode"));
    await waitFor(() => expect(cloneButton).toBeEnabled());

    fireEvent.click(cloneButton);

    await waitFor(() =>
      expect(mocks.commitCloneProject).toHaveBeenCalledWith({
        choice: { kind: "native" },
        parentDir: "/Users/me",
        name: "lightcode",
        source: {
          kind: "github",
          nameWithOwner: "SDSLeon/lightcode",
          account: { host: "github.com", login: "SDSLeon" },
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

    fireEvent.click(await screen.findByText("SDSLeon/lightcode"));
    fireEvent.click(await screen.findByRole("button", { name: "Clone" }));

    // The form is replaced by a loading view naming what's being cloned.
    await waitFor(() => expect(screen.getByText(/Cloning SDSLeon\/lightcode/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Cloning…" })).toBeDisabled();
    expect(screen.queryByLabelText("Folder name")).not.toBeInTheDocument();

    resolveClone();
    await waitFor(() => expect(usePanelStore.getState().cloneProjectModalOpen).toBe(false));
  });
});

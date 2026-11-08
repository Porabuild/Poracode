import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { RemoteServerRecord } from "@/renderer/state/remoteServers/types";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";

const mocks = vi.hoisted(() => ({
  listWslDistros: vi.fn<() => Promise<string[]>>().mockResolvedValue([]),
  loadHomeScopeLocation: vi.fn<() => Promise<{ kind: string; path: string }>>(),
  commitCreateProject: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  commitRemoteCreateProject: vi.fn<(p: unknown) => Promise<void>>().mockResolvedValue(undefined),
  resolveMachineHomeLocation: vi.fn<(connectionKey: string) => Promise<unknown>>(),
  pickFolder: vi.fn<(d?: string) => Promise<string | null>>().mockResolvedValue(null),
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
  }),
  isWindows: () => false,
}));
vi.mock("@/renderer/actions/projectActions", () => ({
  loadHomeScopeLocation: mocks.loadHomeScopeLocation,
}));
vi.mock("@/renderer/actions/createProjectActions", () => ({
  commitCreateProject: mocks.commitCreateProject,
  commitRemoteCreateProject: mocks.commitRemoteCreateProject,
  resolveMachineHomeLocation: mocks.resolveMachineHomeLocation,
  machinePathLocation: (connectionKey: string, path: string) => ({
    kind: "posix",
    path,
    remoteServerId: connectionKey,
  }),
}));
vi.mock("@/renderer/state/remoteServersStore", () => ({
  useRemoteServersStore: (selector: (state: typeof mocks.remote) => unknown) =>
    selector(mocks.remote),
}));

import { usePanelStore } from "@/renderer/state/panelStore";
import { useSharedSettings } from "@/renderer/state/sharedSettingsStore";
import { CreateProjectModal } from "./CreateProjectModal";

describe("CreateProjectModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listWslDistros.mockResolvedValue([]);
    mocks.loadHomeScopeLocation.mockResolvedValue({ kind: "posix", path: "/Users/me" });
    mocks.pickFolder.mockResolvedValue(null);
    mocks.commitRemoteCreateProject.mockResolvedValue(undefined);
    mocks.resolveMachineHomeLocation.mockResolvedValue({
      kind: "posix",
      path: "/Users/remote",
      remoteServerId: "mac",
    });
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
    usePanelStore.setState({ createProjectModalOpen: false });
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
    usePanelStore.setState({ createProjectModalOpen: false });
  });

  test("hides the runtime selector when no WSL distros exist", async () => {
    usePanelStore.getState().openCreateProjectModal();
    render(<CreateProjectModal />);

    await waitFor(() => expect(screen.getByLabelText("Project name")).toBeInTheDocument());
    expect(screen.queryByLabelText("Runtime")).not.toBeInTheDocument();
  });

  test("disables the create button until a valid name is entered (scratch)", async () => {
    usePanelStore.getState().openCreateProjectModal();
    render(<CreateProjectModal />);

    // Parent prefilled from home once resolved.
    await waitFor(() => expect(mocks.loadHomeScopeLocation).toHaveBeenCalled());

    const createButton = screen.getByRole("button", { name: "Create project" });
    expect(createButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Project name"), { target: { value: "my-app" } });

    await waitFor(() => expect(createButton).toBeEnabled());
  });

  test("shows the full target path in the picker, with no separate preview line", async () => {
    usePanelStore.getState().openCreateProjectModal();
    render(<CreateProjectModal />);
    await waitFor(() => expect(mocks.loadHomeScopeLocation).toHaveBeenCalled());

    const picker = screen.getByLabelText("Browse for parent folder");
    // Parent alone until a valid name is entered.
    await waitFor(() => expect(picker).toHaveTextContent("/Users/me"));
    expect(picker).not.toHaveTextContent("/Users/me/my-app");

    fireEvent.change(screen.getByLabelText("Project name"), { target: { value: "my-app" } });

    await waitFor(() => expect(picker).toHaveTextContent("/Users/me/my-app"));
    expect(screen.queryByText(/Will create/i)).not.toBeInTheDocument();
  });

  test("rejects an invalid name", async () => {
    usePanelStore.getState().openCreateProjectModal();
    render(<CreateProjectModal />);

    await waitFor(() => expect(mocks.loadHomeScopeLocation).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText("Project name"), { target: { value: "a/b" } });

    expect(screen.getByRole("button", { name: "Create project" })).toBeDisabled();
  });

  test("keeps a browsed folder when shared-settings object identity changes (hydration)", async () => {
    mocks.pickFolder.mockResolvedValue("/Users/me/projects/picked");
    usePanelStore.getState().openCreateProjectModal();
    render(<CreateProjectModal />);
    await waitFor(() => expect(mocks.loadHomeScopeLocation).toHaveBeenCalled());

    await act(async () => {
      fireEvent.click(screen.getByLabelText("Browse for parent folder"));
    });
    await waitFor(() =>
      expect(screen.getByLabelText("Browse for parent folder")).toHaveTextContent(
        "/Users/me/projects/picked",
      ),
    );

    // Hydration replaces the lastUsedProjectDirs object with an equal-but-new
    // reference; the user's picked folder must not be wiped.
    act(() => {
      useSharedSettings.setState({ lastUsedProjectDirs: {} });
    });

    expect(screen.getByLabelText("Browse for parent folder")).toHaveTextContent(
      "/Users/me/projects/picked",
    );
  });

  test("creates the project on a connected machine, starting in that machine's home", async () => {
    pairMachine();
    usePanelStore.getState().openCreateProjectModal();
    render(<CreateProjectModal />);

    await chooseMachineRuntime();
    expect(mocks.resolveMachineHomeLocation).toHaveBeenCalledWith("mac");
    const picker = screen.getByLabelText("Browse for parent folder");
    await waitFor(() => expect(picker).toHaveTextContent("/Users/remote"));

    fireEvent.change(screen.getByLabelText("Project name"), { target: { value: "my-app" } });
    await waitFor(() => expect(picker).toHaveTextContent("/Users/remote/my-app"));
    const createButton = screen.getByRole("button", { name: "Create project" });
    await waitFor(() => expect(createButton).toBeEnabled());
    fireEvent.click(createButton);

    await waitFor(() =>
      expect(mocks.commitRemoteCreateProject).toHaveBeenCalledWith({
        connectionKey: "mac",
        parentDir: "/Users/remote",
        name: "my-app",
      }),
    );
    expect(mocks.commitCreateProject).not.toHaveBeenCalled();
    await waitFor(() => expect(usePanelStore.getState().createProjectModalOpen).toBe(false));
  });

  test("browses a connected machine's folders with its own folder picker", async () => {
    pairMachine();
    usePanelStore.getState().openCreateProjectModal();
    render(<CreateProjectModal />);

    await chooseMachineRuntime();
    fireEvent.click(screen.getByLabelText("Browse for parent folder"));

    expect(await screen.findByText("Choose a folder on MacBook")).toBeInTheDocument();
    const useFolder = await screen.findByRole("button", { name: "Use this folder" });
    await waitFor(() => expect(useFolder).toBeEnabled());
    fireEvent.click(useFolder);

    await waitFor(() =>
      expect(screen.getByLabelText("Browse for parent folder")).toHaveTextContent(
        "/Users/remote/code",
      ),
    );
    expect(mocks.pickFolder).not.toHaveBeenCalled();
  });

  test("shows a machine's refusal inline and keeps the dialog open", async () => {
    pairMachine();
    mocks.commitRemoteCreateProject.mockRejectedValue(new Error("Folder already exists."));
    usePanelStore.getState().openCreateProjectModal();
    render(<CreateProjectModal />);

    await chooseMachineRuntime();
    await waitFor(() =>
      expect(screen.getByLabelText("Browse for parent folder")).toHaveTextContent("/Users/remote"),
    );
    fireEvent.change(screen.getByLabelText("Project name"), { target: { value: "my-app" } });
    const createButton = screen.getByRole("button", { name: "Create project" });
    await waitFor(() => expect(createButton).toBeEnabled());
    fireEvent.click(createButton);

    expect(await screen.findByText("Folder already exists.")).toBeInTheDocument();
    expect(usePanelStore.getState().createProjectModalOpen).toBe(true);
  });
});

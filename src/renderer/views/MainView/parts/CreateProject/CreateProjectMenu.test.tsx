import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { Button } from "@heroui/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteServerRecord } from "@/renderer/state/remoteServers/types";
import { usePanelStore } from "@/renderer/state/panelStore";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";

const mocks = vi.hoisted(() => ({
  addExistingProject: vi.fn<(choice?: unknown) => Promise<void>>().mockResolvedValue(undefined),
  localBackend: true,
  listWslDistros: vi.fn<() => Promise<string[]>>().mockResolvedValue([]),
  remote: {
    servers: [] as RemoteServerRecord[],
    runtime: {} as Record<string, { status: "online" | "offline" | "connecting" | "error" }>,
  },
}));

vi.mock("@/renderer/actions/createProjectActions", () => ({
  addExistingProject: mocks.addExistingProject,
}));
vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({ listWslDistros: mocks.listWslDistros }),
}));
vi.mock("@/renderer/clientRuntime", () => ({
  hasClientCapability: () => mocks.localBackend,
  isCompactClientRuntimeSurface: () => false,
  hasAnyClientBridge: () =>
    Boolean(
      (window as { poracode?: unknown }).poracode ??
      (window as { poracodeHost?: unknown }).poracodeHost,
    ),
  hasElectronHostBridge: () => Boolean((window as { poracodeHost?: unknown }).poracodeHost),
}));
vi.mock("@/renderer/state/remoteServersStore", () => ({
  useRemoteServersStore: (selector: (state: typeof mocks.remote) => unknown) =>
    selector(mocks.remote),
}));

import { CreateProjectMenu } from "./CreateProjectMenu";

function pairedMachine(desktopId: string, name: string, scopes = ["projects:manage"]) {
  return {
    desktopId,
    label: `Poracode on ${name}`,
    endpoint: `http://${desktopId}.test/`,
    accessToken: "token",
    scopes,
  } as RemoteServerRecord;
}

function renderMenu(onSelect?: (action: string) => void) {
  render(
    <CreateProjectMenu {...(onSelect ? { onSelect } : {})}>
      <Button aria-label="Add project">+</Button>
    </CreateProjectMenu>,
  );
}

function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: "Add project" }));
}

/**
 * Open the "Add folder" environment flyout. Callers act on it in
 * the same tick: under jsdom's virtual clicks React Aria may close a flyout
 * once focus settles, which a real pointer or keyboard never triggers.
 */
function openFolderSubmenu() {
  act(() => {
    fireEvent.click(screen.getByText("Add folder"));
  });
}

function resetPanels() {
  usePanelStore.setState({
    createProjectModalOpen: false,
    cloneProjectModalOpen: false,
    remoteFolderPickerConnectionKey: null,
    settingsOpen: false,
    settingsSection: null,
  });
}

describe("CreateProjectMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.localBackend = true;
    mocks.listWslDistros.mockResolvedValue([]);
    mocks.remote.servers = [];
    mocks.remote.runtime = {};
    resetPanels();
  });
  afterEach(resetPanels);

  it("opens the scratch modal when 'New project' is chosen", async () => {
    renderMenu();

    openMenu();
    fireEvent.click(await screen.findByText("New project"));

    await waitFor(() => expect(usePanelStore.getState().createProjectModalOpen).toBe(true));
    expect(mocks.addExistingProject).not.toHaveBeenCalled();
  });

  it("opens the clone modal when 'Clone a repository' is chosen", async () => {
    renderMenu();

    openMenu();
    fireEvent.click(await screen.findByText("Clone a repository"));

    await waitFor(() => expect(usePanelStore.getState().cloneProjectModalOpen).toBe(true));
    expect(usePanelStore.getState().createProjectModalOpen).toBe(false);
    expect(mocks.addExistingProject).not.toHaveBeenCalled();
  });

  it("goes straight to the folder picker when this computer is the only environment", async () => {
    renderMenu();

    openMenu();
    fireEvent.click(await screen.findByText("Add folder"));

    await waitFor(() => expect(mocks.addExistingProject).toHaveBeenCalledWith({ kind: "native" }));
    expect(usePanelStore.getState().createProjectModalOpen).toBe(false);
    expect(screen.queryByText("Local")).not.toBeInTheDocument();
  });

  it("groups the native and WSL folder actions under one submenu", async () => {
    mocks.listWslDistros.mockResolvedValue(["Ubuntu"]);
    renderMenu();
    await waitFor(() => expect(mocks.listWslDistros).toHaveBeenCalledTimes(1));
    await act(async () => {});

    openMenu();
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      "New project",
      "Clone a repository",
      "Add folder",
      "Add remote connection",
    ]);
    openFolderSubmenu();
    fireEvent.click(screen.getByText("Local"));
    await waitFor(() => expect(mocks.addExistingProject).toHaveBeenCalledWith({ kind: "native" }));

    openMenu();
    openFolderSubmenu();
    fireEvent.click(screen.getByText("Ubuntu"));
    await waitFor(() =>
      expect(mocks.addExistingProject).toHaveBeenCalledWith({ kind: "wsl", distro: "Ubuntu" }),
    );
  });

  it("adds a folder on a connected machine through that machine's folder browser", async () => {
    mocks.remote.servers = [pairedMachine("mac", "MacBook")];
    mocks.remote.runtime = { mac: { status: "online" } };
    const onSelect = vi.fn<(action: string) => void>();
    renderMenu(onSelect);

    openMenu();
    openFolderSubmenu();
    const submenu = screen.getByRole("menu", { name: "Add folder" });
    expect(
      [...submenu.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent),
    ).toEqual(["Local", "MacBook"]);
    fireEvent.click(screen.getByText("MacBook"));

    await waitFor(() =>
      expect(usePanelStore.getState().remoteFolderPickerConnectionKey).toBe("mac"),
    );
    expect(onSelect).toHaveBeenCalledWith("existing");
    expect(mocks.addExistingProject).not.toHaveBeenCalled();
  });

  it("leaves out machines that are offline or cannot manage projects", async () => {
    mocks.remote.servers = [
      pairedMachine("mac", "MacBook", ["session:read"]),
      pairedMachine("linux", "Linux box"),
      pairedMachine("pending", "Office PC"),
    ];
    mocks.remote.runtime = { mac: { status: "online" }, linux: { status: "offline" } };
    renderMenu();

    openMenu();
    fireEvent.click(await screen.findByText("Add folder"));

    await waitFor(() => expect(mocks.addExistingProject).toHaveBeenCalledWith({ kind: "native" }));
    expect(screen.queryByText("MacBook")).not.toBeInTheDocument();
    expect(screen.queryByText("Linux box")).not.toBeInTheDocument();
    expect(screen.queryByText("Office PC")).not.toBeInTheDocument();
  });

  it("opens Remote Environments from 'Add remote connection'", async () => {
    renderMenu();

    openMenu();
    expect(screen.queryByText("Open over SSH")).not.toBeInTheDocument();
    fireEvent.click(await screen.findByText("Add remote connection"));

    await waitFor(() => {
      expect(usePanelStore.getState().settingsOpen).toBe(true);
      expect(usePanelStore.getState().settingsSection).toBe("remoteServers");
    });
  });

  it("routes browser-hosted project creation to the paired environment", async () => {
    mocks.localBackend = false;
    renderMenu();

    openMenu();
    expect(await screen.findByText("Add remote connection")).toBeInTheDocument();
    expect(screen.queryByText("New project")).not.toBeInTheDocument();
    expect(screen.queryByText("Add folder")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Add remote connection"));

    await waitFor(() => {
      expect(usePanelStore.getState().settingsOpen).toBe(true);
      expect(usePanelStore.getState().settingsSection).toBe("remoteServers");
    });
    expect(mocks.listWslDistros).not.toHaveBeenCalled();
  });

  it("adds a folder on a browser client's only paired machine without a submenu", async () => {
    mocks.localBackend = false;
    mocks.remote.servers = [pairedMachine("mac", "MacBook")];
    mocks.remote.runtime = { mac: { status: "error" } };
    renderMenu();

    openMenu();
    const item = await screen.findByRole("menuitem", { name: /Add folder/ });
    expect(item).toHaveTextContent("MacBook");
    fireEvent.click(item);

    await waitFor(() =>
      expect(usePanelStore.getState().remoteFolderPickerConnectionKey).toBe("mac"),
    );
    expect(screen.queryByText("New project")).not.toBeInTheDocument();
    expect(mocks.addExistingProject).not.toHaveBeenCalled();
  });
});

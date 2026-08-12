import { fireEvent, screen, waitFor } from "@testing-library/react";
import { Button } from "@heroui/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePanelStore } from "@/renderer/state/panelStore";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";

const mocks = vi.hoisted(() => ({
  addExistingProject: vi.fn<(choice?: unknown) => Promise<void>>().mockResolvedValue(undefined),
  localBackend: true,
  listWslDistros: vi.fn<() => Promise<string[]>>().mockResolvedValue([]),
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
}));

import { CreateProjectMenu } from "./CreateProjectMenu";

describe("CreateProjectMenu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.localBackend = true;
    mocks.listWslDistros.mockResolvedValue([]);
    usePanelStore.setState({
      createProjectModalOpen: false,
      cloneProjectModalOpen: false,
      settingsOpen: false,
      settingsSection: null,
    });
  });
  afterEach(() =>
    usePanelStore.setState({
      createProjectModalOpen: false,
      cloneProjectModalOpen: false,
      settingsOpen: false,
      settingsSection: null,
    }),
  );

  it("opens the scratch modal when 'Start from scratch' is chosen", async () => {
    render(
      <CreateProjectMenu>
        <Button aria-label="Add project">+</Button>
      </CreateProjectMenu>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add project" }));
    fireEvent.click(await screen.findByText("Start from scratch"));

    await waitFor(() => expect(usePanelStore.getState().createProjectModalOpen).toBe(true));
    expect(mocks.addExistingProject).not.toHaveBeenCalled();
  });

  it("opens the clone modal when 'Clone a repository' is chosen", async () => {
    render(
      <CreateProjectMenu>
        <Button aria-label="Add project">+</Button>
      </CreateProjectMenu>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add project" }));
    fireEvent.click(await screen.findByText("Clone a repository"));

    await waitFor(() => expect(usePanelStore.getState().cloneProjectModalOpen).toBe(true));
    expect(usePanelStore.getState().createProjectModalOpen).toBe(false);
    expect(mocks.addExistingProject).not.toHaveBeenCalled();
  });

  it("goes straight to the folder picker for 'Use an existing folder' (no modal)", async () => {
    render(
      <CreateProjectMenu>
        <Button aria-label="Add project">+</Button>
      </CreateProjectMenu>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add project" }));
    fireEvent.click(await screen.findByText("Use an existing folder"));

    await waitFor(() => expect(mocks.addExistingProject).toHaveBeenCalledWith({ kind: "native" }));
    expect(usePanelStore.getState().createProjectModalOpen).toBe(false);
  });

  it("shows separate native and WSL folder actions when a distro is detected", async () => {
    mocks.listWslDistros.mockResolvedValue(["Ubuntu"]);
    render(
      <CreateProjectMenu>
        <Button aria-label="Add project">+</Button>
      </CreateProjectMenu>,
    );

    await waitFor(() => expect(mocks.listWslDistros).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Add project" }));
    fireEvent.click(await screen.findByText("Windows"));
    await waitFor(() => expect(mocks.addExistingProject).toHaveBeenCalledWith({ kind: "native" }));

    fireEvent.click(screen.getByRole("button", { name: "Add project" }));
    fireEvent.click(await screen.findByText("Ubuntu"));
    await waitFor(() =>
      expect(mocks.addExistingProject).toHaveBeenCalledWith({ kind: "wsl", distro: "Ubuntu" }),
    );
  });

  it("opens Remote Environments when 'Open over SSH' is chosen", async () => {
    render(
      <CreateProjectMenu>
        <Button aria-label="Add project">+</Button>
      </CreateProjectMenu>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add project" }));
    fireEvent.click(await screen.findByText("Open over SSH"));

    await waitFor(() => {
      expect(usePanelStore.getState().settingsOpen).toBe(true);
      expect(usePanelStore.getState().settingsSection).toBe("remoteServers");
    });
  });

  it("routes browser-hosted project creation to the paired environment", async () => {
    mocks.localBackend = false;
    render(
      <CreateProjectMenu>
        <Button aria-label="Add project">+</Button>
      </CreateProjectMenu>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add project" }));
    expect(await screen.findByText("Remote Environments")).toBeInTheDocument();
    expect(screen.queryByText("Start from scratch")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Remote Environments"));

    await waitFor(() => {
      expect(usePanelStore.getState().settingsOpen).toBe(true);
      expect(usePanelStore.getState().settingsSection).toBe("remoteServers");
    });
    expect(mocks.listWslDistros).not.toHaveBeenCalled();
  });
});

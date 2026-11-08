import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RemoteServerRecord } from "@/renderer/state/remoteServers/types";
import { usePanelStore } from "@/renderer/state/panelStore";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";

const mocks = vi.hoisted(() => ({
  addRemoteExistingProject: vi.fn<(connectionKey: string, path: string) => Promise<void>>(),
  remote: {
    servers: [] as RemoteServerRecord[],
    browseHostDirectory: vi.fn<(desktopId: string, path: string) => Promise<unknown>>(),
  },
}));

vi.mock("@/renderer/actions/createProjectActions", () => ({
  addRemoteExistingProject: mocks.addRemoteExistingProject,
}));
vi.mock("@/renderer/state/remoteServersStore", () => ({
  useRemoteServersStore: (selector: (state: typeof mocks.remote) => unknown) =>
    selector(mocks.remote),
}));

import { AddRemoteFolderModal } from "./AddRemoteFolderModal";

describe("AddRemoteFolderModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.addRemoteExistingProject.mockResolvedValue(undefined);
    mocks.remote.servers = [
      {
        desktopId: "mac",
        label: "Poracode on MacBook",
        endpoint: "http://mac.test/",
        accessToken: "token",
        scopes: ["projects:manage"],
      },
    ];
    mocks.remote.browseHostDirectory.mockResolvedValue({
      path: "/Users/me/code",
      parentPath: "/Users/me",
      homePath: "/Users/me",
      entries: [],
      truncated: false,
    });
    usePanelStore.setState({ remoteFolderPickerConnectionKey: null });
  });
  afterEach(() => usePanelStore.setState({ remoteFolderPickerConnectionKey: null }));

  it("renders nothing until a paired machine is chosen", () => {
    render(<AddRemoteFolderModal />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.remote.browseHostDirectory).not.toHaveBeenCalled();
  });

  it("browses the chosen machine and registers the picked folder there", async () => {
    usePanelStore.setState({ remoteFolderPickerConnectionKey: "mac" });
    render(<AddRemoteFolderModal />);

    expect(await screen.findByText("Choose a folder on MacBook")).toBeInTheDocument();
    await waitFor(() => expect(mocks.remote.browseHostDirectory).toHaveBeenCalledWith("mac", ""));
    const useFolder = await screen.findByRole("button", { name: "Use this folder" });
    await waitFor(() => expect(useFolder).toBeEnabled());
    fireEvent.click(useFolder);

    expect(mocks.addRemoteExistingProject).toHaveBeenCalledWith("mac", "/Users/me/code");
    expect(usePanelStore.getState().remoteFolderPickerConnectionKey).toBeNull();
  });

  it("closes without registering anything when cancelled", async () => {
    usePanelStore.setState({ remoteFolderPickerConnectionKey: "mac" });
    render(<AddRemoteFolderModal />);

    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(usePanelStore.getState().remoteFolderPickerConnectionKey).toBeNull();
    expect(mocks.addRemoteExistingProject).not.toHaveBeenCalled();
  });
});

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { RemoteHostUpdateDock } from "./RemoteHostUpdateDock";

describe("RemoteHostUpdateDock", () => {
  const installHostUpdate = vi.fn<(desktopId: string) => Promise<void>>(async () => {});

  beforeEach(() => {
    installHostUpdate.mockClear();
    useRemoteServersStore.setState({
      runtime: {
        "desktop-1": { status: "online", projects: [], threads: [] },
      },
      hostUpdates: {},
      installHostUpdate,
    });
  });

  it("shows remote host download progress", () => {
    useRemoteServersStore.setState({
      hostUpdates: {
        "desktop-1": {
          currentVersion: "1.0.0",
          status: {
            type: "downloading",
            percent: 42.4,
            bytesPerSecond: 1,
            transferred: 42,
            total: 100,
          },
        },
      },
    });

    render(<RemoteHostUpdateDock desktopId="desktop-1" />);

    expect(screen.getByText("Remote host update is downloading… 42%")).toBeInTheDocument();
  });

  it("installs and restarts when the downloaded update is ready", async () => {
    useRemoteServersStore.setState({
      hostUpdates: {
        "desktop-1": {
          currentVersion: "1.0.0",
          status: { type: "downloaded", version: "1.1.0" },
        },
      },
    });

    render(<RemoteHostUpdateDock desktopId="desktop-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Install and restart" }));

    await waitFor(() => expect(installHostUpdate).toHaveBeenCalledWith("desktop-1"));
  });
});

import { act, fireEvent, screen, waitFor } from "@testing-library/react";
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
      hostUpdateRestarts: {},
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
    const button = screen.getByRole("button", { name: "Install and restart" });
    expect(button).toHaveClass("button--ghost");
    fireEvent.click(button);

    await waitFor(() => expect(installHostUpdate).toHaveBeenCalledWith("desktop-1"));
  });

  it("shows the restart spinner while the install request is pending", async () => {
    let rejectInstall: (error: Error) => void = () => {};
    installHostUpdate.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectInstall = reject;
        }),
    );
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

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Install and restart" })).not.toBeInTheDocument();

    await act(async () => rejectInstall(new Error("Install failed")));

    expect(await screen.findByText("Install failed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Install and restart" })).toBeInTheDocument();
  });

  it("replaces the install button with a restart spinner", () => {
    useRemoteServersStore.setState({
      runtime: {
        "desktop-1": { status: "connecting", projects: [], threads: [] },
      },
      hostUpdateRestarts: { "desktop-1": "1.1.0" },
    });

    render(<RemoteHostUpdateDock desktopId="desktop-1" />);

    expect(screen.getByText("The host is restarting to install the update.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Install and restart" })).not.toBeInTheDocument();
  });
});

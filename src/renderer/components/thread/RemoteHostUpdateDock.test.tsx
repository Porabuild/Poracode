import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "@heroui/react";
import { RemoteClientError } from "@/shared/remote/client";
import { useRemoteServersStore } from "@/renderer/state/remoteServersStore";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { RemoteHostUpdateDock } from "./RemoteHostUpdateDock";

describe("RemoteHostUpdateDock", () => {
  const installHostUpdate = vi.fn<(desktopId: string) => Promise<void>>(async () => {});
  const getHostUpdateState = vi.fn<
    ReturnType<typeof useRemoteServersStore.getState>["getHostUpdateState"]
  >(async () => ({ currentVersion: "1.0.0", status: null }));

  beforeEach(() => {
    installHostUpdate.mockReset();
    getHostUpdateState.mockClear();
    useRemoteServersStore.setState({
      runtime: {
        "desktop-1": { status: "online", projects: [], threads: [] },
      },
      hostUpdates: {},
      hostUpdateRestarts: {},
      installHostUpdate,
      getHostUpdateState,
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it("revalidates a ready update and hides the banner when it is no longer pending", async () => {
    const interval = vi.spyOn(globalThis, "setInterval");
    const clear = vi.spyOn(globalThis, "clearInterval");
    useRemoteServersStore.setState({
      hostUpdates: {
        "desktop-1": {
          currentVersion: "1.0.0",
          status: { type: "downloaded", version: "1.1.0" },
        },
      },
    });

    render(<RemoteHostUpdateDock desktopId="desktop-1" />);
    expect(getHostUpdateState).toHaveBeenCalledWith("desktop-1");
    expect(screen.getByRole("button", { name: "Install and restart" })).toBeInTheDocument();

    const pollIndex = interval.mock.calls.findIndex(([, delay]) => delay === 10_000);
    expect(pollIndex).toBeGreaterThanOrEqual(0);
    await act(async () => {
      const poll = interval.mock.calls[pollIndex]?.[0];
      if (typeof poll !== "function") throw new Error("Missing update poll");
      poll();
    });
    expect(getHostUpdateState).toHaveBeenCalledTimes(2);

    act(() => {
      useRemoteServersStore.setState({
        hostUpdates: {
          "desktop-1": {
            currentVersion: "1.1.0",
            status: { type: "update-not-available" },
          },
        },
      });
    });
    expect(screen.queryByText(/Remote host update/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Install and restart" })).not.toBeInTheDocument();
    expect(clear).toHaveBeenCalledWith(interval.mock.results[pollIndex]?.value);
  });

  it("does not poll an offline host and revalidates when it reconnects", () => {
    useRemoteServersStore.setState({
      runtime: { "desktop-1": { status: "offline", projects: [], threads: [] } },
      hostUpdates: {
        "desktop-1": {
          currentVersion: "1.0.0",
          status: { type: "downloaded", version: "1.1.0" },
        },
      },
    });
    render(<RemoteHostUpdateDock desktopId="desktop-1" />);
    expect(getHostUpdateState).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Install and restart" })).toBeDisabled();

    act(() => {
      useRemoteServersStore.setState({
        runtime: { "desktop-1": { status: "online", projects: [], threads: [] } },
      });
    });
    expect(getHostUpdateState).toHaveBeenCalledWith("desktop-1");
  });

  it("hides a rejected stale offer without retaining its error or showing a success toast", async () => {
    const success = vi.spyOn(toast, "success");
    installHostUpdate.mockImplementationOnce(async () => {
      useRemoteServersStore.setState({ hostUpdates: {} });
      throw new RemoteClientError(
        "No host update is ready to install.",
        409,
        "host_update_not_ready",
      );
    });
    const offer = {
      currentVersion: "1.0.0",
      status: { type: "downloaded", version: "1.1.0" } as const,
    };
    useRemoteServersStore.setState({ hostUpdates: { "desktop-1": offer } });
    render(<RemoteHostUpdateDock desktopId="desktop-1" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Install and restart" }));
    });

    await waitFor(() => expect(installHostUpdate).toHaveBeenCalledOnce());
    expect(screen.queryByText(/Remote host update/)).not.toBeInTheDocument();
    expect(success).not.toHaveBeenCalled();

    act(() => {
      useRemoteServersStore.setState({ hostUpdates: { "desktop-1": offer } });
    });
    expect(screen.getByRole("button", { name: "Install and restart" })).toBeInTheDocument();
    expect(screen.queryByText("No host update is ready to install.")).not.toBeInTheDocument();
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

import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";

const bridgeMock = vi.hoisted(() => ({
  remote: false,
  requestLegacyDataMigration:
    vi.fn<() => Promise<{ status: "scheduled" | "no-legacy-data" | "unavailable" }>>(),
  relaunchApp: vi.fn<() => Promise<void>>(),
  openExternal: vi.fn<(url: string) => Promise<void>>(),
  checkForUpdate: vi.fn<() => Promise<void>>(),
  installUpdate: vi.fn<() => Promise<void>>(),
  isDev: false,
}));

vi.mock("@/renderer/bridge", () => ({
  isRemoteSession: () => bridgeMock.remote,
  readBridge: () => ({
    appVersion: "1.0.0",
    channel: "stable",
    electronVersion: "43.1.0",
    isDev: bridgeMock.isDev,
    requestLegacyDataMigration: bridgeMock.requestLegacyDataMigration,
    relaunchApp: bridgeMock.relaunchApp,
    openExternal: bridgeMock.openExternal,
    checkForUpdate: bridgeMock.checkForUpdate,
    installUpdate: bridgeMock.installUpdate,
  }),
}));

import { useUpdateStore } from "@/renderer/state/updateStore";
import { AboutSettings } from "./AboutSettings";

describe("AboutSettings update download", () => {
  beforeEach(() => {
    useUpdateStore.setState({
      phase: "idle",
      version: null,
      downloadPercent: 0,
      errorMessage: null,
      downloadTransferred: null,
      downloadTotal: null,
      downloadBytesPerSecond: null,
    });
  });

  it("does not show a stuck 0% before the first download-progress event", () => {
    useUpdateStore.setState({ phase: "downloading", version: "1.6.3-nightly.202608160500" });
    render(<AboutSettings />);

    expect(screen.getByRole("progressbar", { name: "Downloading update" })).not.toHaveAttribute(
      "aria-valuenow",
    );
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });

  it("shows percent once a real total arrives", () => {
    useUpdateStore.setState({
      phase: "downloading",
      version: "1.6.3-nightly.202608160500",
      downloadPercent: 42.4,
      downloadTransferred: 424,
      downloadTotal: 1000,
    });
    render(<AboutSettings />);

    expect(screen.getByRole("progressbar", { name: "Downloading update" })).toHaveAttribute(
      "aria-valuenow",
      "42",
    );
    expect(screen.getByText("42%")).toBeInTheDocument();
  });
});

describe("AboutSettings Lightcode data import", () => {
  beforeEach(() => {
    bridgeMock.remote = false;
    bridgeMock.isDev = false;
    bridgeMock.requestLegacyDataMigration.mockReset();
    bridgeMock.requestLegacyDataMigration.mockResolvedValue({ status: "scheduled" });
    bridgeMock.relaunchApp.mockReset();
    bridgeMock.relaunchApp.mockResolvedValue(undefined);
  });

  it("confirms, schedules the complete import, and relaunches", async () => {
    render(<AboutSettings />);

    fireEvent.click(screen.getByRole("button", { name: "Import again" }));
    expect(screen.getByRole("alertdialog", { name: "Import Lightcode data again?" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Import and restart" }));

    await waitFor(() => expect(bridgeMock.requestLegacyDataMigration).toHaveBeenCalledOnce());
    expect(bridgeMock.relaunchApp).toHaveBeenCalledOnce();
  });

  it("does not relaunch when no Lightcode data exists", async () => {
    bridgeMock.requestLegacyDataMigration.mockResolvedValue({ status: "no-legacy-data" });
    render(<AboutSettings />);

    fireEvent.click(screen.getByRole("button", { name: "Import again" }));
    fireEvent.click(screen.getByRole("button", { name: "Import and restart" }));

    await waitFor(() => expect(bridgeMock.requestLegacyDataMigration).toHaveBeenCalledOnce());
    expect(bridgeMock.relaunchApp).not.toHaveBeenCalled();
  });

  it("hides the local migration action in remote and development sessions", () => {
    bridgeMock.remote = true;
    const { rerender } = render(<AboutSettings />);
    expect(screen.queryByRole("button", { name: "Import again" })).not.toBeInTheDocument();

    bridgeMock.remote = false;
    bridgeMock.isDev = true;
    rerender(<AboutSettings />);
    expect(screen.queryByRole("button", { name: "Import again" })).not.toBeInTheDocument();
  });
});

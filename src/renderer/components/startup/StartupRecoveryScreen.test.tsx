import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { useUpdateStore } from "@/renderer/state/updateStore";

const bridge = vi.hoisted(() => ({
  checkForUpdate: vi.fn<() => Promise<void>>(),
  installUpdate: vi.fn<() => Promise<void>>(),
  relaunchApp: vi.fn<() => Promise<void>>(),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridge,
}));

import { StartupRecoveryScreen } from "./StartupRecoveryScreen";

describe("StartupRecoveryScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bridge.checkForUpdate.mockResolvedValue(undefined);
    bridge.installUpdate.mockResolvedValue(undefined);
    bridge.relaunchApp.mockResolvedValue(undefined);
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

  it("offers update, restart, and keep-waiting recovery actions", () => {
    const onKeepWaiting = vi.fn<() => void>();
    render(<StartupRecoveryScreen onKeepWaiting={onKeepWaiting} />);

    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    fireEvent.click(screen.getByRole("button", { name: "Restart Poracode" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep waiting" }));

    expect(bridge.checkForUpdate).toHaveBeenCalledOnce();
    expect(bridge.relaunchApp).toHaveBeenCalledOnce();
    expect(onKeepWaiting).toHaveBeenCalledOnce();
  });

  it("installs a downloaded update directly from recovery", () => {
    useUpdateStore.setState({ phase: "downloaded", version: "1.5.5", downloadPercent: 100 });
    render(<StartupRecoveryScreen onKeepWaiting={() => undefined} />);

    fireEvent.click(screen.getByRole("button", { name: "Install v1.5.5" }));

    expect(bridge.installUpdate).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Check for updates" })).not.toBeInTheDocument();
  });

  it("shows download progress without enabling another update check", () => {
    useUpdateStore.setState({
      phase: "downloading",
      version: "1.5.5",
      downloadPercent: 42.4,
      downloadTransferred: 424,
      downloadTotal: 1000,
    });
    render(<StartupRecoveryScreen onKeepWaiting={() => undefined} />);

    expect(screen.getByRole("progressbar", { name: "Downloading update" })).toHaveAttribute(
      "aria-valuenow",
      "42",
    );
    expect(screen.getByRole("button", { name: "Check for updates" })).toBeDisabled();
  });

  it("does not report a determinate 0% before the first progress event", () => {
    useUpdateStore.setState({ phase: "downloading", version: "1.5.5", downloadPercent: 0 });
    render(<StartupRecoveryScreen onKeepWaiting={() => undefined} />);

    expect(screen.getByRole("progressbar", { name: "Downloading update" })).not.toHaveAttribute(
      "aria-valuenow",
    );
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });
});

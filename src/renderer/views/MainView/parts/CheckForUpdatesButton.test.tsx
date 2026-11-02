import { act, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";

const bridgeMock = vi.hoisted(() => ({
  checkForUpdate: vi.fn<() => Promise<void>>(),
}));

const toastMock = vi.hoisted(() => ({
  success: vi.fn<(message: string) => void>(),
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => ({
    checkForUpdate: bridgeMock.checkForUpdate,
  }),
}));

vi.mock("@heroui/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@heroui/react")>()),
  toast: toastMock,
}));

import { useUpdateStore } from "@/renderer/state/updateStore";
import { CheckForUpdatesButton } from "./CheckForUpdatesButton";

describe("CheckForUpdatesButton", () => {
  beforeEach(() => {
    bridgeMock.checkForUpdate.mockReset();
    bridgeMock.checkForUpdate.mockResolvedValue(undefined);
    toastMock.success.mockReset();
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

  it("calls bridge.checkForUpdate once when pressed", () => {
    const { getByRole } = render(<CheckForUpdatesButton />);
    fireEvent.click(getByRole("button", { name: "Check for updates" }));
    expect(bridgeMock.checkForUpdate).toHaveBeenCalledTimes(1);
  });

  it("disables and spins while checking, disables while downloading", () => {
    const { getByRole } = render(<CheckForUpdatesButton />);
    act(() => useUpdateStore.getState().setChecking());
    const checkingButton = getByRole("button", { name: "Checking for updates…" });
    expect(checkingButton).toBeDisabled();
    expect(checkingButton.querySelector("svg")).toHaveClass("animate-spin");

    act(() => useUpdateStore.getState().beginUpdateDownload("1.2.3"));
    expect(getByRole("button", { name: "Downloading update" })).toBeDisabled();
  });

  it("toasts success when a manual check ends idle", () => {
    const { getByRole } = render(<CheckForUpdatesButton />);
    fireEvent.click(getByRole("button", { name: "Check for updates" }));
    act(() => useUpdateStore.getState().setChecking());
    act(() => useUpdateStore.getState().setNotAvailable());
    expect(toastMock.success).toHaveBeenCalledTimes(1);
    expect(toastMock.success).toHaveBeenCalledWith("You're on the latest version");
  });

  it("does not toast for a background check", () => {
    render(<CheckForUpdatesButton />);
    act(() => useUpdateStore.getState().setChecking());
    act(() => useUpdateStore.getState().setNotAvailable());
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it("does not toast when a manual check finds an update or errors", () => {
    const { getByRole } = render(<CheckForUpdatesButton />);
    fireEvent.click(getByRole("button", { name: "Check for updates" }));
    act(() => useUpdateStore.getState().setChecking());
    act(() => useUpdateStore.getState().setDownloaded("1.2.3"));
    expect(toastMock.success).not.toHaveBeenCalled();
  });
});

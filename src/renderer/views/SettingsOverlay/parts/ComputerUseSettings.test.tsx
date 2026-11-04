import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithI18n as render } from "@/renderer/testUtils/i18n";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  LockedComputerUseActionResult,
  LockedComputerUseStatus,
} from "@/shared/contracts/lockedComputerUse";
import { ComputerUseSettings } from "./ComputerUseSettings";

const { bridgeMock, platformState, capabilityState, settingsState } = vi.hoisted(() => ({
  bridgeMock: {
    getLockedComputerUseStatus: vi.fn<() => Promise<LockedComputerUseStatus>>(),
    installLockedComputerUse: vi.fn<() => Promise<LockedComputerUseActionResult>>(),
    uninstallLockedComputerUse: vi.fn<() => Promise<LockedComputerUseActionResult>>(),
  },
  platformState: { mac: true },
  capabilityState: { localBackend: true },
  settingsState: {
    computerUseLockedUse: false,
    computerUseLockedUseDimDisplay: false,
    setComputerUseLockedUseDimDisplay: vi.fn<(value: boolean) => void>(),
    setComputerUseLockedUse: vi.fn<(value: boolean) => void>(),
  },
}));

vi.mock("@/renderer/bridge", () => ({
  readBridge: () => bridgeMock,
  isMac: () => platformState.mac,
}));

vi.mock("@/renderer/clientRuntime", () => ({
  hasClientCapability: (capability: string) =>
    capability === "localBackend" ? capabilityState.localBackend : false,
}));

vi.mock("@/renderer/state/sharedSettingsStore", () => ({
  useSharedSettings: (selector: (state: typeof settingsState) => unknown) =>
    selector(settingsState),
}));

const NOT_INSTALLED: LockedComputerUseStatus = {
  platformSupported: true,
  installed: false,
  needsRepair: false,
  signed: true,
  paused: false,
  active: false,
};
const INSTALLED: LockedComputerUseStatus = { ...NOT_INSTALLED, installed: true };

function lockedSwitch(): HTMLInputElement {
  return screen.getByRole("switch", { name: "Locked Computer Use" }) as HTMLInputElement;
}

function statusLine(): HTMLElement {
  return screen.getByTestId("locked-use-status");
}

describe("ComputerUseSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    platformState.mac = true;
    capabilityState.localBackend = true;
    settingsState.computerUseLockedUse = false;
    settingsState.computerUseLockedUseDimDisplay = false;
    bridgeMock.getLockedComputerUseStatus.mockResolvedValue(NOT_INSTALLED);
  });

  it("explains that the feature is macOS only on other platforms", () => {
    platformState.mac = false;
    render(<ComputerUseSettings />);
    expect(screen.getByText("Locked Computer Use is available only on macOS.")).toBeTruthy();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(bridgeMock.getLockedComputerUseStatus).not.toHaveBeenCalled();
  });

  it("is read-only for remote and attached clients", () => {
    capabilityState.localBackend = false;
    render(<ComputerUseSettings />);
    expect(
      screen.getByText("Locked Computer Use is set up in Poracode on the Mac it runs on."),
    ).toBeTruthy();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(bridgeMock.installLockedComputerUse).not.toHaveBeenCalled();
  });

  it("keeps dimming off and disabled until Locked Computer Use is enabled", () => {
    render(<ComputerUseSettings />);
    const dim = screen.getByRole("switch", {
      name: "Dim displays during Locked Computer Use",
    }) as HTMLInputElement;
    expect(dim.checked).toBe(false);
    expect(dim.disabled).toBe(true);
  });

  it("lets the user opt into dimming without an installer prompt", async () => {
    settingsState.computerUseLockedUse = true;
    bridgeMock.getLockedComputerUseStatus.mockResolvedValue(INSTALLED);
    render(<ComputerUseSettings />);
    await waitFor(() => expect(statusLine().textContent).toBe("Installed"));
    fireEvent.click(
      screen.getByRole("switch", { name: "Dim displays during Locked Computer Use" }),
    );
    expect(settingsState.setComputerUseLockedUseDimDisplay).toHaveBeenCalledWith(true);
    expect(bridgeMock.installLockedComputerUse).not.toHaveBeenCalled();
  });

  it("installs through the host, shows the pending prompt, then turns the setting on", async () => {
    const result = Promise.withResolvers<LockedComputerUseActionResult>();
    bridgeMock.installLockedComputerUse.mockReturnValue(result.promise);
    render(<ComputerUseSettings />);
    await waitFor(() => expect(statusLine().textContent).toBe("Not installed"));
    fireEvent.click(lockedSwitch());
    await waitFor(() =>
      expect(statusLine().textContent).toBe("Waiting for administrator approval…"),
    );
    expect(lockedSwitch().disabled).toBe(true);
    expect(settingsState.setComputerUseLockedUse).not.toHaveBeenCalled();
    result.resolve({ ok: true, status: INSTALLED });
    await waitFor(() => expect(settingsState.setComputerUseLockedUse).toHaveBeenCalledWith(true));
    expect(statusLine().textContent).toBe("Installed, turned off");
  });

  it.each([
    ["cancelled", "The administrator prompt was cancelled. Nothing was changed."],
    [
      "unsupported_rule",
      "This Mac's screen unlock rule has been customized, for example by device management, so Locked Computer Use can't be installed. Check with your IT team.",
    ],
    [
      "verification_failed",
      "Installation couldn't be verified, so it was rolled back. Nothing was changed.",
    ],
    ["unsigned_build", "Locked Computer Use is unavailable in development builds."],
  ] as const)("shows the %s error and leaves the setting off", async (error, message) => {
    bridgeMock.installLockedComputerUse.mockResolvedValue({
      ok: false,
      error,
      status: NOT_INSTALLED,
    });
    render(<ComputerUseSettings />);
    await waitFor(() => expect(lockedSwitch().disabled).toBe(false));
    fireEvent.click(lockedSwitch());
    expect((await screen.findByRole("alert")).textContent).toBe(message);
    expect(settingsState.setComputerUseLockedUse).not.toHaveBeenCalled();
  });

  it("turns intent off before removing the plug-in", async () => {
    settingsState.computerUseLockedUse = true;
    bridgeMock.getLockedComputerUseStatus.mockResolvedValue(INSTALLED);
    bridgeMock.uninstallLockedComputerUse.mockResolvedValue({
      ok: false,
      error: "cancelled",
      status: INSTALLED,
    });
    render(<ComputerUseSettings />);
    await waitFor(() => expect(statusLine().textContent).toBe("Installed"));
    fireEvent.click(lockedSwitch());
    await waitFor(() => expect(bridgeMock.uninstallLockedComputerUse).toHaveBeenCalledOnce());
    expect(settingsState.setComputerUseLockedUse).toHaveBeenCalledWith(false);
    expect((await screen.findByRole("alert")).textContent).toContain("cancelled");
  });

  it.each([
    [{ ...NOT_INSTALLED, signed: false }, "Unavailable in development builds"],
    [{ ...INSTALLED, paused: true }, "Paused until you unlock this Mac manually"],
    [{ ...NOT_INSTALLED, needsRepair: true }, "Needs repair"],
  ])("reports status %o", async (status, text) => {
    bridgeMock.getLockedComputerUseStatus.mockResolvedValue(status);
    render(<ComputerUseSettings />);
    await waitFor(() => expect(statusLine().textContent).toBe(text));
  });

  it("keeps a development build switch off and disabled", async () => {
    bridgeMock.getLockedComputerUseStatus.mockResolvedValue({ ...NOT_INSTALLED, signed: false });
    render(<ComputerUseSettings />);
    await waitFor(() => expect(statusLine().textContent).toBe("Unavailable in development builds"));
    expect(lockedSwitch().disabled).toBe(true);
  });
});

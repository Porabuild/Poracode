import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const autoUpdaterMock = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  return {
    autoDownload: false,
    autoInstallOnAppQuit: true,
    forceDevUpdateConfig: false,
    allowPrerelease: false,
    channel: "",
    checkForUpdates: vi.fn<() => Promise<void>>(),
    downloadUpdate: vi.fn<() => Promise<void>>(),
    on: vi.fn<(event: string, listener: (...args: unknown[]) => void) => void>(
      (event, listener) => {
        handlers.set(event, listener);
      },
    ),
    quitAndInstall: vi.fn<(isSilent?: boolean, isForceRunAfter?: boolean) => void>(),
    setFeedURL: vi.fn<(options: unknown) => void>(),
    /** Test helper: invoke a registered electron-updater event listener. */
    emit(event: string, ...args: unknown[]) {
      handlers.get(event)?.(...args);
    },
  };
});

vi.mock("electron-updater", () => ({
  autoUpdater: autoUpdaterMock,
}));

import { createAutoUpdaterController } from "./autoUpdater";

const INITIAL_CHECK_DELAY_MS = 30_000;
const PERIODIC_CHECK_INTERVAL_MS = 60 * 60 * 1_000;

describe("createAutoUpdaterController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    autoUpdaterMock.checkForUpdates.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs the install hook before quitAndInstall", () => {
    const beforeInstall = vi.fn<() => void>();
    const controller = createAutoUpdaterController(
      vi.fn(),
      "stable",
      false,
      vi.fn(),
      beforeInstall,
    );

    controller.installUpdate();

    expect(beforeInstall.mock.invocationCallOrder[0]!).toBeLessThan(
      autoUpdaterMock.quitAndInstall.mock.invocationCallOrder[0]!,
    );
    expect(autoUpdaterMock.quitAndInstall).toHaveBeenCalledWith(process.platform === "win32", true);
  });

  it("installs a downloaded update when the user quits a stuck app", () => {
    autoUpdaterMock.autoInstallOnAppQuit = false;
    const controller = createAutoUpdaterController(vi.fn(), "stable", false);

    controller.initialize();

    expect(autoUpdaterMock.autoDownload).toBe(true);
    expect(autoUpdaterMock.autoInstallOnAppQuit).toBe(true);
  });

  it("does not reject from a manual check when checkForUpdates() fails", async () => {
    // A freshly-published release whose channel manifest hasn't finished
    // uploading 404s, so electron-updater emits "error" and then rejects.
    // The renderer invokes checkForUpdate() fire-and-forget, so a rejection
    // here would escalate into a fatal unhandled-rejection crash screen.
    const sendStatus = vi.fn<(status: { type: string; message?: string }) => void>();
    const reportError = vi.fn<(error: unknown, tags?: Record<string, string>) => void>();
    const controller = createAutoUpdaterController(sendStatus, "nightly", false, reportError);
    controller.initialize();

    const failure = new Error("Cannot find latest-mac.yml in the latest release artifacts");
    autoUpdaterMock.checkForUpdates.mockRejectedValueOnce(failure);

    await expect(controller.checkForUpdate()).resolves.toBeUndefined();

    // The user still sees the failure: electron-updater's "error" event drives
    // the toast + Sentry report, independent of the swallowed rejection.
    autoUpdaterMock.emit("error", failure);
    expect(sendStatus).toHaveBeenCalledWith({ type: "error", message: failure.message });
    expect(reportError).toHaveBeenCalledWith(failure, { "poracode.feature_area": "updates" });
  });

  it("runs an initial check after launch and then keeps checking on the hourly interval", async () => {
    const controller = createAutoUpdaterController(vi.fn(), "stable", false);
    controller.initialize();

    expect(autoUpdaterMock.checkForUpdates).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(INITIAL_CHECK_DELAY_MS);
    expect(autoUpdaterMock.checkForUpdates).toHaveBeenCalledTimes(1);

    // Settle the in-flight flag (nothing new found) so the next tick may run.
    autoUpdaterMock.emit("update-not-available");

    await vi.advanceTimersByTimeAsync(PERIODIC_CHECK_INTERVAL_MS);
    expect(autoUpdaterMock.checkForUpdates).toHaveBeenCalledTimes(2);
  });

  it("skips a periodic check while a check or download is still in flight", async () => {
    const controller = createAutoUpdaterController(vi.fn(), "stable", false);
    controller.initialize();

    await vi.advanceTimersByTimeAsync(INITIAL_CHECK_DELAY_MS);
    expect(autoUpdaterMock.checkForUpdates).toHaveBeenCalledTimes(1);

    // Simulate a check that found an update and is mid-download (no terminal
    // event yet), so the updater is still busy when the interval fires.
    autoUpdaterMock.emit("checking-for-update");
    autoUpdaterMock.emit("download-progress", {
      percent: 42,
      bytesPerSecond: 1000,
      transferred: 420,
      total: 1000,
    });

    await vi.advanceTimersByTimeAsync(PERIODIC_CHECK_INTERVAL_MS);
    expect(autoUpdaterMock.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it("stops checking once an update is downloaded and after install", async () => {
    const controller = createAutoUpdaterController(vi.fn(), "stable", false);
    controller.initialize();

    await vi.advanceTimersByTimeAsync(INITIAL_CHECK_DELAY_MS);
    autoUpdaterMock.emit("update-downloaded", { version: "1.2.3" });

    // An update is staged for install — no point polling further.
    await vi.advanceTimersByTimeAsync(PERIODIC_CHECK_INTERVAL_MS);
    expect(autoUpdaterMock.checkForUpdates).toHaveBeenCalledTimes(1);

    // Installing clears the interval, so advancing time does nothing more.
    controller.installUpdate();
    await vi.advanceTimersByTimeAsync(PERIODIC_CHECK_INTERVAL_MS);
    expect(autoUpdaterMock.checkForUpdates).toHaveBeenCalledTimes(1);
  });
});

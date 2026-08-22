import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UpdateStatus } from "@/shared/ipc";

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
    autoUpdaterMock.downloadUpdate.mockResolvedValue(undefined);
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

  it("keeps automatic delivery controller-owned and installs on app quit", () => {
    autoUpdaterMock.autoInstallOnAppQuit = false;
    const controller = createAutoUpdaterController(vi.fn(), "stable", false);

    controller.initialize();

    expect(autoUpdaterMock.autoDownload).toBe(false);
    expect(autoUpdaterMock.autoInstallOnAppQuit).toBe(true);
  });

  it("starts the controller-owned download when a check finds an update", async () => {
    const controller = createAutoUpdaterController(vi.fn(), "stable", false);
    controller.initialize();
    autoUpdaterMock.checkForUpdates.mockImplementationOnce(async () => {
      autoUpdaterMock.emit("update-available", { version: "1.2.3" });
    });

    await controller.checkForUpdate();

    expect(autoUpdaterMock.downloadUpdate).toHaveBeenCalledOnce();
  });

  it("treats a missing nightly manifest as an optional probe", async () => {
    const sendStatus = vi.fn<(status: { type: string; message?: string }) => void>();
    const reportError = vi.fn<(error: unknown, tags?: Record<string, string>) => void>();
    const controller = createAutoUpdaterController(sendStatus, "nightly", false, reportError);
    controller.initialize();

    const failure = Object.assign(
      new Error("Cannot find nightly-mac.yml in the latest release artifacts (404)"),
      { statusCode: 404 },
    );
    autoUpdaterMock.checkForUpdates.mockImplementationOnce(async () => {
      autoUpdaterMock.emit("error", failure);
      throw failure;
    });

    await expect(controller.checkForUpdate()).resolves.toBeUndefined();

    expect(sendStatus).toHaveBeenCalledWith({ type: "update-not-available" });
    expect(reportError).not.toHaveBeenCalled();
  });

  it("keeps a missing stable manifest observable with normalized tags", async () => {
    const reportError = vi.fn<(error: unknown, tags?: Record<string, string>) => void>();
    const controller = createAutoUpdaterController(vi.fn(), "stable", false, reportError);
    controller.initialize();
    const failure = Object.assign(new Error("latest-mac.yml returned 404"), { statusCode: 404 });
    autoUpdaterMock.checkForUpdates.mockImplementationOnce(async () => {
      autoUpdaterMock.emit("error", failure);
      throw failure;
    });

    await controller.checkForUpdate();

    expect(reportError).toHaveBeenCalledOnce();
    expect(reportError.mock.calls[0]?.[0]).toMatchObject({
      name: "UpdateDiagnosticError",
      message: "Updater check failed: required-manifest-missing.",
    });
    expect(reportError.mock.calls[0]?.[1]).toEqual({
      "poracode.feature_area": "updates",
      "poracode.channel": "stable",
      "poracode.platform": process.platform,
      "event.origin": "updater.check.required-manifest-missing",
    });
  });

  it("does not report transient check failures when a retry succeeds", async () => {
    const reportError = vi.fn<(error: unknown, tags?: Record<string, string>) => void>();
    const controller = createAutoUpdaterController(vi.fn(), "stable", false, reportError);
    controller.initialize();
    const transient = Object.assign(new Error("socket closed"), { code: "ECONNRESET" });
    autoUpdaterMock.checkForUpdates
      .mockImplementationOnce(async () => {
        autoUpdaterMock.emit("error", transient);
        throw transient;
      })
      .mockImplementationOnce(async () => {
        autoUpdaterMock.emit("error", transient);
        throw transient;
      })
      .mockResolvedValueOnce(undefined);

    const checking = controller.checkForUpdate();
    await vi.advanceTimersByTimeAsync(1_500);
    await checking;

    expect(autoUpdaterMock.checkForUpdates).toHaveBeenCalledTimes(3);
    expect(reportError).not.toHaveBeenCalled();
  });

  it("logs one bounded warning without capturing exhausted transient retries as errors", async () => {
    const reportError = vi.fn<(error: unknown, tags?: Record<string, string>) => void>();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const sendStatus = vi.fn<(status: UpdateStatus) => void>();
    const controller = createAutoUpdaterController(sendStatus, "stable", false, reportError);
    controller.initialize();
    const transient = Object.assign(new Error("socket closed"), { code: "EPIPE" });
    autoUpdaterMock.checkForUpdates.mockImplementation(async () => {
      autoUpdaterMock.emit("error", transient);
      throw transient;
    });

    const first = controller.checkForUpdate();
    await vi.advanceTimersByTimeAsync(1_500);
    await first;
    const second = controller.checkForUpdate();
    await vi.advanceTimersByTimeAsync(1_500);
    await second;

    expect(autoUpdaterMock.checkForUpdates).toHaveBeenCalledTimes(6);
    expect(reportError).not.toHaveBeenCalled();
    expect(sendStatus).toHaveBeenLastCalledWith({
      type: "error",
      messageKey: "update.serviceUnavailable",
    });
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith("[poracode] updater check transient failure after retries.");
    warn.mockRestore();
  });

  it("uses a localized message key when update checks are unavailable in development", async () => {
    const sendStatus = vi.fn<(status: UpdateStatus) => void>();
    const controller = createAutoUpdaterController(sendStatus, "stable", true);

    await controller.checkForUpdate();

    expect(sendStatus).toHaveBeenCalledWith({
      type: "error",
      messageKey: "update.devUnavailable",
    });
  });

  it("keeps signature failures observable without sending the raw error", async () => {
    const reportError = vi.fn<(error: unknown, tags?: Record<string, string>) => void>();
    const controller = createAutoUpdaterController(vi.fn(), "stable", false, reportError);
    controller.initialize();
    const failure = new Error(
      "Code signature invalid for /Users/person/private/Poracode.zip from https://example.test",
    );
    autoUpdaterMock.downloadUpdate.mockImplementationOnce(async () => {
      autoUpdaterMock.emit("error", failure);
      throw failure;
    });

    await expect(controller.startUpdateDownload()).rejects.toBe(failure);

    expect(reportError).toHaveBeenCalledOnce();
    const reported = reportError.mock.calls[0]?.[0] as Error;
    expect(reported.message).toBe("Updater download failed: artifact-integrity.");
    expect(reported.message).not.toContain("/Users/");
    expect(reported.message).not.toContain("https://");
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

  it("keeps checking after an update is downloaded and supersedes it with a newer release", async () => {
    const sendStatus = vi.fn<(status: UpdateStatus) => void>();
    const controller = createAutoUpdaterController(sendStatus, "stable", false);
    controller.initialize();

    await vi.advanceTimersByTimeAsync(INITIAL_CHECK_DELAY_MS);
    autoUpdaterMock.emit("update-downloaded", { version: "1.2.3" });
    expect(autoUpdaterMock.checkForUpdates).toHaveBeenCalledTimes(1);

    // A staged update must not stop polling: the next interval check runs and
    // finds a newer release, which is downloaded in place of the staged one.
    autoUpdaterMock.checkForUpdates.mockImplementationOnce(async () => {
      autoUpdaterMock.emit("update-available", { version: "1.2.4" });
    });
    await vi.advanceTimersByTimeAsync(PERIODIC_CHECK_INTERVAL_MS);

    expect(autoUpdaterMock.checkForUpdates).toHaveBeenCalledTimes(2);
    expect(autoUpdaterMock.downloadUpdate).toHaveBeenCalledOnce();

    autoUpdaterMock.emit("update-downloaded", { version: "1.2.4" });
    expect(sendStatus).toHaveBeenLastCalledWith({ type: "downloaded", version: "1.2.4" });

    // Installing clears the interval, so advancing time does nothing more.
    controller.installUpdate();
    await vi.advanceTimersByTimeAsync(PERIODIC_CHECK_INTERVAL_MS);
    expect(autoUpdaterMock.checkForUpdates).toHaveBeenCalledTimes(2);
  });

  it("does not re-download when a check re-finds the staged version", async () => {
    const sendStatus = vi.fn<(status: UpdateStatus) => void>();
    const controller = createAutoUpdaterController(sendStatus, "stable", false);
    controller.initialize();

    await vi.advanceTimersByTimeAsync(INITIAL_CHECK_DELAY_MS);
    autoUpdaterMock.emit("update-downloaded", { version: "1.2.3" });

    autoUpdaterMock.checkForUpdates.mockImplementationOnce(async () => {
      autoUpdaterMock.emit("update-available", { version: "1.2.3" });
    });
    await vi.advanceTimersByTimeAsync(PERIODIC_CHECK_INTERVAL_MS);

    expect(autoUpdaterMock.checkForUpdates).toHaveBeenCalledTimes(2);
    expect(autoUpdaterMock.downloadUpdate).not.toHaveBeenCalled();
    // The staged install affordance stays visible after the redundant check.
    expect(sendStatus).toHaveBeenLastCalledWith({ type: "downloaded", version: "1.2.3" });
  });

  it("keeps the staged install visible when a background check finds nothing newer", async () => {
    const sendStatus = vi.fn<(status: UpdateStatus) => void>();
    const controller = createAutoUpdaterController(sendStatus, "stable", false);
    controller.initialize();

    await vi.advanceTimersByTimeAsync(INITIAL_CHECK_DELAY_MS);
    autoUpdaterMock.emit("update-downloaded", { version: "1.2.3" });

    autoUpdaterMock.checkForUpdates.mockImplementationOnce(async () => {
      autoUpdaterMock.emit("checking-for-update");
      autoUpdaterMock.emit("update-not-available");
    });
    await vi.advanceTimersByTimeAsync(PERIODIC_CHECK_INTERVAL_MS);

    expect(autoUpdaterMock.checkForUpdates).toHaveBeenCalledTimes(2);
    expect(sendStatus).toHaveBeenLastCalledWith({ type: "downloaded", version: "1.2.3" });
  });
});

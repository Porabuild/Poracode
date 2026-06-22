import { autoUpdater } from "electron-updater";
import type { LightcodeChannel } from "@/shared/channel";
import type { UpdateStatus } from "@/shared/ipc";
import type { LightcodeDiagnosticTags } from "@/shared/diagnostics/sentryPrivacy";

/**
 * Delay before the first update check once the app is ready. Matches VS Code's
 * update service, which waits ~30s after startup before its first check.
 */
const INITIAL_CHECK_DELAY_MS = 30_000;

/**
 * Cadence for recurring background update checks while the app keeps running.
 * Modeled on VS Code's update service, which polls hourly after startup so a
 * long-lived window still discovers releases without ever being restarted.
 */
const PERIODIC_CHECK_INTERVAL_MS = 60 * 60 * 1_000;

export interface AutoUpdaterController {
  initialize(): void;
  checkForUpdate(): Promise<void>;
  startUpdateDownload(): Promise<void>;
  installUpdate(): void;
}

export function createAutoUpdaterController(
  sendStatus: (status: UpdateStatus) => void,
  channel: LightcodeChannel,
  isDev: boolean,
  reportError: (error: unknown, tags?: LightcodeDiagnosticTags) => void = () => {},
  beforeInstall: () => void = () => {},
): AutoUpdaterController {
  let initialized = false;
  // True while a check or download is in flight; gates the periodic timer so a
  // scheduled tick never stacks a redundant check on top of an active one.
  let checkInFlight = false;
  // True once an update is downloaded and waiting to install; we stop polling
  // until the user restarts to apply it.
  let updateReady = false;
  let periodicTimer: ReturnType<typeof setInterval> | null = null;

  // Fire a background check, but only when the updater is otherwise idle. Used
  // by both the initial launch check and the recurring interval.
  function runScheduledCheck(): void {
    if (checkInFlight || updateReady) {
      return;
    }
    checkInFlight = true;
    void autoUpdater.checkForUpdates().catch((error: unknown) => {
      checkInFlight = false;
      reportError(error, { "lightcode.feature_area": "updates" });
    });
  }

  function initialize(): void {
    if (initialized) {
      return;
    }
    initialized = true;

    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.forceDevUpdateConfig = Boolean(process.env.UPDATE_SERVER_URL);

    if (channel === "nightly") {
      autoUpdater.channel = "nightly";
      autoUpdater.allowPrerelease = true;
    } else {
      autoUpdater.allowPrerelease = false;
    }

    const localUpdateUrl = process.env.UPDATE_SERVER_URL;
    if (localUpdateUrl) {
      autoUpdater.setFeedURL({ provider: "generic", url: localUpdateUrl });
    }

    autoUpdater.on("checking-for-update", () => {
      checkInFlight = true;
      sendStatus({ type: "checking" });
    });
    autoUpdater.on("update-available", (info) => {
      // A download starts automatically (autoDownload), so stay "in flight".
      checkInFlight = true;
      sendStatus({ type: "update-available", version: info.version });
    });
    autoUpdater.on("update-not-available", () => {
      checkInFlight = false;
      sendStatus({ type: "update-not-available" });
    });
    autoUpdater.on("download-progress", (progress) => {
      checkInFlight = true;
      sendStatus({
        type: "downloading",
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total,
      });
    });
    autoUpdater.on("update-downloaded", (info) => {
      checkInFlight = false;
      updateReady = true;
      sendStatus({ type: "downloaded", version: info.version });
    });
    autoUpdater.on("error", (error) => {
      checkInFlight = false;
      reportError(error, { "lightcode.feature_area": "updates" });
      sendStatus({ type: "error", message: error.message });
    });

    // First check ~30s after launch, then keep checking hourly so an app that
    // is never restarted still surfaces new releases (the sidebar install
    // affordance reacts to the resulting status).
    setTimeout(runScheduledCheck, INITIAL_CHECK_DELAY_MS);
    periodicTimer = setInterval(runScheduledCheck, PERIODIC_CHECK_INTERVAL_MS);
    // Don't let the recurring timer keep the process alive on its own.
    periodicTimer.unref?.();
  }

  async function checkForUpdate(): Promise<void> {
    if (isDev && !process.env.UPDATE_SERVER_URL) {
      sendStatus({ type: "error", message: "Update check is not available in dev mode." });
      return;
    }
    try {
      await autoUpdater.checkForUpdates();
    } catch {
      // checkForUpdates() rejects on any check failure — most commonly a
      // freshly-published release whose channel manifest (e.g. nightly-mac.yml)
      // hasn't finished uploading yet, which 404s and then falls back to a
      // 404 on latest-mac.yml. electron-updater emits an "error" event before
      // this promise rejects, and the listener registered in initialize()
      // already reports it (reportError) and surfaces it to the UI (sendStatus
      // error → toast). Swallow the rejection here so this IPC never rejects:
      // the renderer invokes it fire-and-forget, where an unhandled rejection
      // is escalated into a fatal full-screen crash. This mirrors the
      // .catch() guard on the background runScheduledCheck path.
    }
  }

  async function startUpdateDownload(): Promise<void> {
    try {
      await autoUpdater.downloadUpdate();
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === "EPIPE") {
        return;
      }
      reportError(error, { "lightcode.feature_area": "updates" });
      throw error;
    }
  }

  function installUpdate(): void {
    // Stop the recurring check so it can't race quitAndInstall.
    if (periodicTimer) {
      clearInterval(periodicTimer);
      periodicTimer = null;
    }
    beforeInstall();
    autoUpdater.quitAndInstall(process.platform === "win32", true);
  }

  return {
    initialize,
    checkForUpdate,
    startUpdateDownload,
    installUpdate,
  };
}

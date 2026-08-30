import { autoUpdater } from "electron-updater";
import type { PoracodeChannel } from "@/shared/channel";
import type { UpdateStatus } from "@/shared/ipc";
import type { PoracodeDiagnosticTags } from "@/shared/diagnostics/sentryPrivacy";
import {
  buildUpdateDiagnosticTags,
  classifyUpdateFailure,
  UpdateDiagnosticError,
  type UpdateFailureKind,
  type UpdateOperation,
} from "./updateErrorPolicy";
import { createDownloadStallWatch, downloadUpdateWithStallFallback } from "./updateDownload";

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
const TRANSIENT_RETRY_DELAYS_MS = [500, 1_000] as const;
const TRANSIENT_REPORT_COOLDOWN_MS = 6 * 60 * 60 * 1_000;

export interface AutoUpdaterController {
  initialize(): void;
  getStatus(): UpdateStatus | null;
  checkForUpdate(): Promise<void>;
  startUpdateDownload(): Promise<void>;
  installUpdate(): void;
}

export function createAutoUpdaterController(
  onStatus: (status: UpdateStatus) => void,
  channel: PoracodeChannel,
  isDev: boolean,
  reportError: (error: unknown, tags?: PoracodeDiagnosticTags) => void = () => {},
  beforeInstall: () => void = () => {},
): AutoUpdaterController {
  let lastStatus: UpdateStatus | null = null;
  let initialized = false;
  // True while a check or download is in flight; gates the periodic timer so a
  // scheduled tick never stacks a redundant check on top of an active one.
  let checkInFlight = false;
  // True once an update is downloaded and waiting to install. Checks keep
  // running so a newer release can supersede the staged one before the user
  // ever restarts.
  let updateReady = false;
  // Version of the staged download, and of the release the in-flight check
  // found. Compared so a check that re-discovers the staged version doesn't
  // trigger a redundant re-download.
  let downloadedVersion: string | null = null;
  let availableVersion: string | null = null;
  let periodicTimer: ReturnType<typeof setInterval> | null = null;
  let checkPromise: Promise<void> | null = null;
  let downloadPromise: Promise<void> | null = null;
  let updateAvailable = false;
  let activeAttempt: { operation: UpdateOperation; eventError: unknown | null } | null = null;
  const transientReportTimes = new Map<string, number>();
  const downloadStallWatch = createDownloadStallWatch();

  function sendStatus(status: UpdateStatus): void {
    lastStatus = status;
    onStatus(status);
  }

  function reportClassifiedFailure(operation: UpdateOperation, outcome: UpdateFailureKind): void {
    if (outcome === "optional-manifest-missing") {
      console.warn("[poracode] optional nightly update manifest is not available.");
      return;
    }
    if (outcome === "transient-network") {
      const key = `${operation}:${outcome}`;
      const now = Date.now();
      const lastReportAt = transientReportTimes.get(key);
      if (lastReportAt !== undefined && now - lastReportAt < TRANSIENT_REPORT_COOLDOWN_MS) {
        return;
      }
      transientReportTimes.set(key, now);
      console.warn(`[poracode] updater ${operation} transient failure after retries.`);
      return;
    }
    reportError(
      new UpdateDiagnosticError(operation, outcome),
      buildUpdateDiagnosticTags(channel, operation, outcome),
    );
  }

  async function runOperation(
    operation: UpdateOperation,
    invoke: () => Promise<unknown>,
  ): Promise<void> {
    for (let attempt = 0; ; attempt += 1) {
      const attemptState = { operation, eventError: null as unknown | null };
      activeAttempt = attemptState;
      try {
        await invoke();
        if (attemptState.eventError) {
          throw attemptState.eventError instanceof Error
            ? attemptState.eventError
            : new Error("Updater emitted a non-Error failure.");
        }
        return;
      } catch (error) {
        const failure = classifyUpdateFailure(attemptState.eventError ?? error, operation, channel);
        const retryDelay = TRANSIENT_RETRY_DELAYS_MS[attempt];
        if (failure.retryable && retryDelay !== undefined) {
          if (activeAttempt === attemptState) activeAttempt = null;
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
          continue;
        }
        reportClassifiedFailure(operation, failure.kind);
        if (updateReady) {
          // A background check/download failed while an update is staged; keep
          // the install affordance instead of replacing it with an error state.
          sendStagedStatus();
        } else if (failure.kind === "optional-manifest-missing") {
          sendStatus({ type: "update-not-available" });
          return;
        } else {
          sendStatus({
            type: "error",
            messageKey:
              failure.kind === "transient-network"
                ? "update.serviceUnavailable"
                : "update.operationFailed",
          });
        }
        throw error;
      } finally {
        if (activeAttempt === attemptState) {
          activeAttempt = null;
        }
      }
    }
  }

  function beginDownload(): Promise<void> {
    if (downloadPromise) return downloadPromise;
    checkInFlight = true;
    downloadPromise = runOperation("download", () =>
      downloadUpdateWithStallFallback(
        (token) => autoUpdater.downloadUpdate(token as never),
        (disabled) => {
          autoUpdater.disableDifferentialDownload = disabled;
        },
        { stallWatch: downloadStallWatch },
      ),
    ).finally(() => {
      downloadPromise = null;
      // downloadUpdate resolves after update-downloaded fired (which already
      // cleared the flag); on failure nothing else will, so reset here either
      // way. updateReady may still hold for a previously staged version, so it
      // can't be used to tell whether this download finished.
      checkInFlight = false;
    });
    return downloadPromise;
  }

  function beginCheck(): Promise<void> {
    if (checkPromise) return checkPromise;
    checkInFlight = true;
    updateAvailable = false;
    availableVersion = null;
    checkPromise = runOperation("check", () => autoUpdater.checkForUpdates())
      .then(() => {
        if (updateAvailable && availableVersion !== downloadedVersion) {
          // A newer (or first) release — download it. When an older update is
          // already staged, electron-updater supersedes it, so the pending
          // install is discarded in favor of the fresh one.
          void beginDownload().catch(() => {});
        } else {
          checkInFlight = false;
          // The check re-found the version that is already staged: no new
          // download, but restore the staged status so the install affordance
          // stays visible.
          sendStagedStatus();
        }
      })
      .catch(() => {
        checkInFlight = false;
      })
      .finally(() => {
        checkPromise = null;
      });
    return checkPromise;
  }

  // Re-emit the staged-update status after a background check finishes without
  // a newer release, so the renderer's install affordance is not clobbered by
  // the intermediate "checking"/"update-not-available" states.
  function sendStagedStatus(): void {
    if (updateReady && downloadedVersion) {
      sendStatus({ type: "downloaded", version: downloadedVersion });
    }
  }

  // Fire a background check, but only when the updater is otherwise idle. Used
  // by both the initial launch check and the recurring interval. A staged
  // update does not block checks: a newer release must still be discovered and
  // downloaded, superseding the pending install.
  function runScheduledCheck(): void {
    if (checkInFlight) {
      return;
    }
    void beginCheck();
  }

  function initialize(): void {
    if (initialized) {
      return;
    }
    initialized = true;

    // Keep downloads automatic from the user's perspective, while invoking
    // downloadUpdate ourselves so transient retries and final reporting belong
    // to one typed operation instead of the updater's global error event.
    autoUpdater.autoDownload = false;
    // Prefer the small blockmap delta. GitHub's Azure CDN can stall that
    // path; downloadUpdateWithStallFallback then retries once as a full
    // download so the UI cannot sit at 0% forever.
    autoUpdater.disableDifferentialDownload = false;
    // A renderer stuck during hydration cannot reach the normal install
    // button. Once an update is downloaded, Cmd/Ctrl+Q still provides a
    // main-process-owned recovery path that applies it on quit.
    autoUpdater.autoInstallOnAppQuit = true;
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
      updateAvailable = true;
      availableVersion = info.version;
      checkInFlight = true;
      sendStatus({ type: "update-available", version: info.version });
    });
    autoUpdater.on("update-not-available", () => {
      checkInFlight = false;
      if (updateReady) {
        // Nothing newer than the staged download — keep it visible.
        sendStagedStatus();
      } else {
        sendStatus({ type: "update-not-available" });
      }
    });
    autoUpdater.on("download-progress", (progress) => {
      checkInFlight = true;
      downloadStallWatch.markProgress();
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
      downloadedVersion = info.version;
      sendStatus({ type: "downloaded", version: info.version });
    });
    autoUpdater.on("error", (error) => {
      if (activeAttempt) {
        activeAttempt.eventError = error;
        return;
      }
      const operation: UpdateOperation = downloadPromise ? "download" : "check";
      const failure = classifyUpdateFailure(error, operation, channel);
      reportClassifiedFailure(operation, failure.kind);
      checkInFlight = false;
      if (updateReady) {
        sendStagedStatus();
      } else if (failure.kind === "optional-manifest-missing") {
        sendStatus({ type: "update-not-available" });
      } else {
        sendStatus({
          type: "error",
          messageKey:
            failure.kind === "transient-network"
              ? "update.serviceUnavailable"
              : "update.operationFailed",
        });
      }
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
      sendStatus({ type: "error", messageKey: "update.devUnavailable" });
      return;
    }
    try {
      await beginCheck();
    } catch {
      // beginCheck owns classification, reporting, and UI status. Keep this IPC
      // resolved because the renderer invokes it fire-and-forget.
    }
  }

  async function startUpdateDownload(): Promise<void> {
    await beginDownload();
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
    getStatus: () => lastStatus,
    checkForUpdate,
    startUpdateDownload,
    installUpdate,
  };
}

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
  checkForUpdate(): Promise<void>;
  startUpdateDownload(): Promise<void>;
  installUpdate(): void;
}

export function createAutoUpdaterController(
  sendStatus: (status: UpdateStatus) => void,
  channel: PoracodeChannel,
  isDev: boolean,
  reportError: (error: unknown, tags?: PoracodeDiagnosticTags) => void = () => {},
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
  let checkPromise: Promise<void> | null = null;
  let downloadPromise: Promise<void> | null = null;
  let updateAvailable = false;
  let activeAttempt: { operation: UpdateOperation; eventError: unknown | null } | null = null;
  const transientReportTimes = new Map<string, number>();

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
        if (failure.kind === "optional-manifest-missing") {
          sendStatus({ type: "update-not-available" });
          return;
        }
        sendStatus({
          type: "error",
          messageKey:
            failure.kind === "transient-network"
              ? "update.serviceUnavailable"
              : "update.operationFailed",
        });
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
    downloadPromise = runOperation("download", () => autoUpdater.downloadUpdate()).finally(() => {
      downloadPromise = null;
      if (!updateReady) checkInFlight = false;
    });
    return downloadPromise;
  }

  function beginCheck(): Promise<void> {
    if (checkPromise) return checkPromise;
    checkInFlight = true;
    updateAvailable = false;
    checkPromise = runOperation("check", () => autoUpdater.checkForUpdates())
      .then(() => {
        if (updateAvailable && !updateReady) {
          void beginDownload().catch(() => {});
        } else {
          checkInFlight = false;
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

  // Fire a background check, but only when the updater is otherwise idle. Used
  // by both the initial launch check and the recurring interval.
  function runScheduledCheck(): void {
    if (checkInFlight || updateReady) {
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
      if (activeAttempt) {
        activeAttempt.eventError = error;
        return;
      }
      const operation: UpdateOperation = downloadPromise ? "download" : "check";
      const failure = classifyUpdateFailure(error, operation, channel);
      reportClassifiedFailure(operation, failure.kind);
      checkInFlight = false;
      if (failure.kind === "optional-manifest-missing") {
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
    checkForUpdate,
    startUpdateDownload,
    installUpdate,
  };
}

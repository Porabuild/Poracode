import { join } from "node:path";
import { startNodePerformanceDiagnostics } from "@/shared/diagnostics/nodePerformanceDiagnostics";
import { app, dialog } from "electron";
import { preparePoracodeDataRoot } from "./poracodeData";
import { registerLocalFileProtocolScheme } from "./attachments/localFiles";
import { registerPickerProtocolScheme } from "./browser";
import { buildBrowserUserAgent } from "./browser/userAgent";
import { sampleElectronAppMetrics } from "./diagnostics/appMetricsSample";
import { showAndFocusWindow } from "./window/showAndFocusWindow";
import { shouldStartMinimized } from "./startupSettings";
import { handleStartupFailure } from "./startupFailureDialog";
import { reportSingleInstanceRefusal } from "./singleInstanceRefusal";
import { toError } from "@/shared/errorMessage";
import { readSharedSettingsFile } from "./sharedSettingsFile";
import { captureMainException, initializeMainSentry } from "./diagnostics/sentry";
import { legacyProductNameFor } from "@/shared/legacyProductPaths";
import { shouldUseMockKeychain } from "./mockKeychain";
import { migrateLegacyDataOutOfProcess } from "./legacyMigrationClient";
import { installProcessStdioErrorHandlers } from "./processStdio";
import { HostDataFence, HostDataFenceInUseError } from "@/backend/ownership/hostDataFence";
import { HostOwnerLease, HostRootInUseError } from "@/backend/ownership/hostOwnerLease";
import { prepareOwnedHostRoot } from "@/backend/ownership/hostRootManifest";
import {
  DesktopRootPromotionRefusalError,
  inspectDesktopRootPromotion,
} from "@/backend/ownership/promoteDesktopRoot";
import { resolveDesktopHostRootPaths } from "@/backend/ownership/hostRootPaths";
import {
  resolveDesktopBaseDir,
  shouldDeferLeaseForAttachProbe,
} from "./backend/standaloneAttachBootstrap";
import { probeLegacyOwnerConflict } from "./backend/desktopOwnerAdmission";
import {
  baseDirOverride,
  channel,
  defaultElectronUserDataDir,
  desktopApp,
  isDev,
  legacyBaseDirOverride,
  legacyElectronUserDataDir,
  preserveLegacySafeStorageIdentity,
} from "./desktopAppState";
import { ensureMainWindow } from "./desktopAppWindows";
import { startDesktopApp } from "./desktopAppReady";

// Electron can remain alive after its launching terminal or dev runner exits.
// Install this before any startup logging so a detached diagnostic pipe cannot
// recurse through the global exception handler below and wedge the main loop.
installProcessStdioErrorHandlers();

// Electron keys macOS Keychain and Linux secret-store entries by app name.
// Initialize Chromium's crypto under the pre-rebrand technical identity so
// migrated secrets and browser sessions remain decryptable. The visible name
// is restored after Electron captures the crypto configuration during startup.
if (preserveLegacySafeStorageIdentity) {
  app.setName(legacyProductNameFor(channel));
  app.setPath("userData", defaultElectronUserDataDir);
}

if (process.env.PORACODE_CDP_PORT) {
  app.commandLine.appendSwitch("remote-debugging-port", process.env.PORACODE_CDP_PORT);
}

// Isolated smoke runs replace HOME so they cannot read developer credentials;
// on macOS that hides the login keychain from Chromium. Dev-identity Electron
// binaries on macOS can also fail keychain resolution outright (blocking
// "Keychain Not Found" dialog each launch), so darwin DEV launches default to
// Chromium's mock keychain — dev profiles are disposable. Packaged launches
// always keep the real OS keychain; PORACODE_USE_REAL_KEYCHAIN=1 opts a dev
// launch back in, and PORACODE_USE_MOCK_KEYCHAIN=1 lets a harness-driven
// unpackaged launch (built bundle on the node_modules electron binary) opt
// into the mock — never a packaged app.
if (shouldUseMockKeychain({ isDev, isPackaged: app.isPackaged })) {
  app.commandLine.appendSwitch("use-mock-keychain");
}

// Windows HDR can make DWM acrylic visibly change opacity when Chromium starts
// compositing image content in the display color space. Keep Chromium in sRGB so
// acrylic stays translucent without breathing as image planes appear/disappear.
if (process.platform === "win32") {
  app.commandLine.appendSwitch("force-color-profile", "srgb");
}
if (process.platform === "linux") {
  app.commandLine.appendSwitch("enable-features", "GlobalShortcutsPortal");
}

desktopApp.browserUserAgent = buildBrowserUserAgent(app.userAgentFallback);
app.userAgentFallback = desktopApp.browserUserAgent;

if (baseDirOverride) {
  app.setPath("userData", join(baseDirOverride, "userData"));
} else if (isDev) {
  app.setPath("userData", join(app.getPath("userData"), "Dev"));
}

const hasSingleInstanceLock = isDev || app.requestSingleInstanceLock();
if (hasSingleInstanceLock) {
  const electronUserDataDir = app.getPath("userData");
  const baseDir = resolveDesktopBaseDir({
    ...(baseDirOverride ? { baseDirOverride } : {}),
    isDev,
    channel,
  });
  // Decision-before-authority: when an existing owner may hold this profile,
  // defer the lease so the authenticated describe runs first. Otherwise keep
  // the existing synchronous managed path untouched.
  if (shouldDeferLeaseForAttachProbe(baseDir)) {
    desktopApp.deferredStandaloneProbe = { baseDir };
  } else {
    try {
      // Legacy-owner refusal: a live legacy server with a still-pending data
      // import refuses BEFORE any acquire — never acquire-and-fight the
      // importer on the desktop mapping.
      probeLegacyOwnerConflict({
        baseDir,
        channel,
        electronUserDataDir,
        ...(legacyElectronUserDataDir ? { legacyElectronUserDataDir } : {}),
        ...(legacyBaseDirOverride ? { legacyBaseDir: legacyBaseDirOverride } : {}),
        allowCustomDataRoot: app.isPackaged,
      });
      desktopApp.desktopOwnerLease = HostOwnerLease.acquire(
        resolveDesktopHostRootPaths(baseDir),
        "desktop",
      );
      // Data-custody fence, fast-path single shot: an orphaned backend of a
      // killed owner still holds it. The bounded wait lives on the deferred
      // readiness path; a busy fence defers there instead of failing.
      const fence = HostDataFence.acquire(resolveDesktopHostRootPaths(baseDir).dataFencePath);
      fence.release();
    } catch (error) {
      desktopApp.desktopOwnerLease?.release();
      desktopApp.desktopOwnerLease = null;
      if (error instanceof HostRootInUseError || error instanceof HostDataFenceInUseError) {
        // Another owner may still be quitting or draining: defer to the
        // readiness path, which re-probes with a bounded wait before the
        // loud refusal (concurrent-launch UX).
        console.warn("[poracode] desktop owner is busy; re-probing at startup:", error);
        desktopApp.deferredStandaloneProbe = { baseDir };
      } else {
        // Normalized so the rethrow at readiness is always an Error with its
        // identity intact (pre-existing type-aware lint finding at the rethrow).
        desktopApp.desktopOwnerAcquisitionError = toError(error);
        console.error("[poracode] failed to acquire the desktop host owner:", error);
      }
    }
    if (
      !desktopApp.desktopOwnerAcquisitionError &&
      !desktopApp.deferredStandaloneProbe &&
      desktopApp.desktopOwnerLease !== null
    ) {
      try {
        const result = migrateLegacyDataOutOfProcess({
          baseDir,
          channel,
          electronUserDataDir,
          legacyElectronUserDataDir,
          ...(legacyBaseDirOverride ? { legacyBaseDir: legacyBaseDirOverride } : {}),
          allowCustomDataRoot: app.isPackaged,
        });
        if (result.status === "migrated") {
          console.info(`[migrate] imported all available Lightcode data into ${baseDir}`);
        }
      } catch (error) {
        console.warn(`[migrate] failed to import Lightcode data into ${baseDir}:`, error);
      }
      // Unified data root (V5 plan 1.3): the desktop owns the `.host-v1`
      // sibling. The synchronous fast path finishes only the cases that need
      // no promotion; a promotable or resumable plain root (including one the
      // legacy import above just filled) is left to `admitDesktopStartup`,
      // which promotes it under the held lease with OS-key cooperation after
      // the ready event.
      const paths = resolveDesktopHostRootPaths(baseDir);
      const decision = inspectDesktopRootPromotion(paths);
      if (decision.kind === "refuse") {
        desktopApp.desktopOwnerLease.release();
        desktopApp.desktopOwnerLease = null;
        desktopApp.desktopOwnerAcquisitionError = new DesktopRootPromotionRefusalError(
          decision.reason,
        );
        console.error(
          "[poracode] refused to start with this profile's data roots:",
          decision.reason,
        );
      } else if (decision.kind === "required" || decision.kind === "resumable") {
        console.info(
          `[poracode] this profile's data root will be promoted to ${paths.dataRoot} at startup`,
        );
      } else {
        if (decision.kind === "fresh") prepareOwnedHostRoot(desktopApp.desktopOwnerLease);
        desktopApp.poracodePaths = preparePoracodeDataRoot(paths.dataRoot);
      }
    }
  }
}

desktopApp.sentryEnabled = initializeMainSentry({
  appVersion: app.getVersion(),
  isDev,
  channel,
});

// Fallback global handlers so a stray throw in any main-process callback
// (IPC handler, Electron event listener, timer) is reported rather than
// silently taking the whole app — and the supervisor and all windows — down.
// Sentry's Electron integration also hooks these, but only when a DSN is
// configured and initialization succeeded; this guarantees coverage otherwise.
process.on("uncaughtException", (error) => {
  console.error("[poracode] uncaught exception:", error);
  captureMainException(error, { "poracode.feature_area": "main" });
});
process.on("unhandledRejection", (reason) => {
  console.error("[poracode] unhandled rejection:", reason);
  captureMainException(reason, { "poracode.feature_area": "main" });
});

// Rider (Gate 4 plan, folded into this lane): opt-in Electron per-process
// CPU/memory samples appended to each NDJSON sample line. Purely additive to
// format v2 (optional new field, sample lines only).
desktopApp.performanceDiagnostics =
  startNodePerformanceDiagnostics("desktop-main", process.env, {
    sampleAppMetrics: sampleElectronAppMetrics,
  }) ?? null;

registerLocalFileProtocolScheme();
registerPickerProtocolScheme();

if (!hasSingleInstanceLock) {
  // Never-silent refusal (P2): disclose who holds the profile before quitting.
  // A modal error box (not just the console) because Finder-launched copies
  // have no terminal to read — the user would otherwise see nothing at all.
  const refusal = reportSingleInstanceRefusal(app.getPath("userData"));
  dialog.showErrorBox("Poracode is already running", refusal);
  app.quit();
} else {
  app.on("second-instance", (_event, commandLine) => {
    if (!app.isReady()) return;
    if (
      desktopApp.poracodePaths &&
      shouldStartMinimized(
        readSharedSettingsFile(desktopApp.poracodePaths.settingsPath),
        commandLine,
        process.platform,
      )
    ) {
      return;
    }
    if (desktopApp.standaloneAttachShellState) {
      showAndFocusWindow(ensureMainWindow(true, desktopApp.standaloneAttachShellState));
      return;
    }
    showAndFocusWindow(ensureMainWindow());
  });

  void app
    .whenReady()
    .then(startDesktopApp)
    .catch((error: unknown) => {
      captureMainException(error, { "poracode.feature_area": "main-initialization" });
      // Never-silent refusal (V5 H5): a startup failure — e.g. a standalone
      // owner that is still starting — gets the same modal disclosure as the
      // single-instance refusal, with Retry (relaunch re-runs the decision).
      // Harness/CI launches (no user to click) log and exit non-zero instead.
      handleStartupFailure(error);
    });
}

app.on("will-quit", () => {
  desktopApp.backendHostClient?.dispose();
  desktopApp.backendHostClient = null;
  desktopApp.backendStateStore = null;
  desktopApp.desktopOwnerLease?.release();
  desktopApp.desktopOwnerLease = null;
});

app.on("window-all-closed", () => {
  if (process.platform === "darwin" || desktopApp.tray?.available) return;
  app.quit();
});

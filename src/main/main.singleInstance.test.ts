import type { App, BrowserWindow, Dialog } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  app: {
    commandLine: { appendSwitch: vi.fn<App["commandLine"]["appendSwitch"]>() },
    userAgentFallback: "Poracode/2.0.0 Electron/44.4.4",
    getPath: vi.fn<App["getPath"]>(() => "/profiles/poracode"),
    getVersion: vi.fn<App["getVersion"]>(() => "2.0.0"),
    requestSingleInstanceLock: vi.fn<App["requestSingleInstanceLock"]>(() => false),
    isReady: vi.fn<App["isReady"]>(() => true),
    on: vi.fn<(event: string, listener: (...args: unknown[]) => void) => void>(),
    whenReady: vi.fn<App["whenReady"]>(() => Promise.resolve()),
    quit: vi.fn<App["quit"]>(),
  },
  dialog: { showErrorBox: vi.fn<Dialog["showErrorBox"]>() },
  window: {
    isMinimized: vi.fn<BrowserWindow["isMinimized"]>(() => false),
    isVisible: vi.fn<BrowserWindow["isVisible"]>(() => false),
    restore: vi.fn<BrowserWindow["restore"]>(),
    show: vi.fn<BrowserWindow["show"]>(),
    focus: vi.fn<BrowserWindow["focus"]>(),
  },
  desktopApp: {
    poracodePaths: { settingsPath: "/profiles/poracode/shared-settings.json" },
    standaloneAttachShellState: null,
    deferredStandaloneProbe: null,
  },
  reportSingleInstanceRefusal: vi.fn<(userDataDir: string) => string>(),
  ensureMainWindow: vi.fn<() => Partial<BrowserWindow>>(),
  startDesktopApp: vi.fn<() => Promise<void>>(),
}));

vi.mock("electron", () => ({ app: mocks.app, dialog: mocks.dialog }));
vi.mock("@/shared/diagnostics/nodePerformanceDiagnostics", () => ({
  startNodePerformanceDiagnostics: () => null,
}));
vi.mock("@/host/poracodeData", () => ({}));
vi.mock("./attachments/localFiles", () => ({ registerLocalFileProtocolScheme: () => undefined }));
vi.mock("./browser", () => ({ registerPickerProtocolScheme: () => undefined }));
vi.mock("./diagnostics/appMetricsSample", () => ({ sampleElectronAppMetrics: () => [] }));
vi.mock("./startupFailureDialog", () => ({ handleStartupFailure: () => undefined }));
vi.mock("./singleInstanceRefusal", () => ({
  reportSingleInstanceRefusal: mocks.reportSingleInstanceRefusal,
}));
vi.mock("@/host/sharedSettingsFile", () => ({
  readSharedSettingsFile: () => ({ launchAtStartup: true, startMinimized: true }),
}));
vi.mock("./diagnostics/sentry", () => ({
  captureMainException: () => undefined,
  initializeMainSentry: () => false,
}));
vi.mock("./mockKeychain", () => ({ shouldUseMockKeychain: () => false }));
vi.mock("./legacyMigrationClient", () => ({}));
vi.mock("./processStdio", () => ({ installProcessStdioErrorHandlers: () => undefined }));
vi.mock("@/backend/ownership/hostDataFence", () => ({}));
vi.mock("@/backend/ownership/hostOwnerLease", () => ({}));
vi.mock("@/backend/ownership/hostRootManifest", () => ({}));
vi.mock("@/backend/ownership/promoteDesktopRoot", () => ({}));
vi.mock("./backend/standaloneAttachBootstrap", () => ({
  resolveDesktopBaseDir: () => "/profiles/poracode",
  shouldDeferLeaseForAttachProbe: () => true,
}));
vi.mock("./backend/desktopOwnerAdmission", () => ({}));
vi.mock("./desktopAppState", () => ({
  baseDirOverride: undefined,
  channel: "stable",
  defaultElectronUserDataDir: "/profiles/poracode",
  desktopApp: mocks.desktopApp,
  isDev: false,
  legacyBaseDirOverride: undefined,
  legacyElectronUserDataDir: undefined,
  preserveLegacySafeStorageIdentity: false,
}));
vi.mock("./desktopAppWindows", () => ({ ensureMainWindow: mocks.ensureMainWindow }));
vi.mock("./desktopAppReady", () => ({ startDesktopApp: mocks.startDesktopApp }));

beforeEach(() => {
  vi.resetModules();
  vi.spyOn(process, "on").mockReturnValue(process);
  mocks.app.requestSingleInstanceLock.mockReturnValue(false);
  mocks.window.isMinimized.mockReturnValue(false);
  mocks.window.isVisible.mockReturnValue(false);
  mocks.ensureMainWindow.mockReturnValue(mocks.window);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("desktop single-instance launch", () => {
  it("exits a second launch without showing an error or starting another app", async () => {
    await import("./main");

    expect(mocks.app.requestSingleInstanceLock).toHaveBeenCalledOnce();
    expect(mocks.reportSingleInstanceRefusal).toHaveBeenCalledWith("/profiles/poracode");
    expect(mocks.app.quit).toHaveBeenCalledOnce();
    expect(mocks.dialog.showErrorBox).not.toHaveBeenCalled();
    expect(mocks.app.whenReady).not.toHaveBeenCalled();
    expect(mocks.startDesktopApp).not.toHaveBeenCalled();
    expect(mocks.ensureMainWindow).not.toHaveBeenCalled();
  });

  it.each([
    { state: "hidden in the tray", minimized: false, visible: false },
    { state: "minimized", minimized: true, visible: true },
  ])("restores and focuses the running window when $state", async ({ minimized, visible }) => {
    mocks.app.requestSingleInstanceLock.mockReturnValue(true);
    mocks.window.isMinimized.mockReturnValue(minimized);
    mocks.window.isVisible.mockReturnValue(visible);
    await import("./main");

    const onSecondInstance = mocks.app.on.mock.calls.find(([event]) => event === "second-instance");
    expect(onSecondInstance).toBeDefined();
    onSecondInstance![1]({}, ["poracode.exe"]);

    expect(mocks.ensureMainWindow).toHaveBeenCalledOnce();
    expect(mocks.window.restore).toHaveBeenCalledTimes(minimized ? 1 : 0);
    expect(mocks.window.show).toHaveBeenCalledTimes(visible ? 0 : 1);
    expect(mocks.window.focus).toHaveBeenCalledOnce();
    expect(mocks.dialog.showErrorBox).not.toHaveBeenCalled();
    expect(mocks.app.quit).not.toHaveBeenCalled();
  });

  it.runIf(process.platform === "win32")(
    "keeps an automatic startup launch minimized when configured",
    async () => {
      mocks.app.requestSingleInstanceLock.mockReturnValue(true);
      await import("./main");

      const onSecondInstance = mocks.app.on.mock.calls.find(
        ([event]) => event === "second-instance",
      );
      expect(onSecondInstance).toBeDefined();
      onSecondInstance![1]({}, ["poracode.exe", "--startup"]);

      expect(mocks.ensureMainWindow).not.toHaveBeenCalled();
      expect(mocks.window.focus).not.toHaveBeenCalled();
      expect(mocks.dialog.showErrorBox).not.toHaveBeenCalled();
    },
  );
});

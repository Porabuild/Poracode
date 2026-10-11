import type {
  ContextBridge,
  IpcMain,
  IpcMainInvokeEvent,
  IpcRenderer,
  WebContents,
} from "electron";

// Separate QA-only boundary. This does not extend the public client runtime or
// backend protocol; an old driver must fail rather than invoke a different action.
const SMOKE_NATIVE_VERSION = 2;
const QUICK_COMPOSER_CHANNEL = `poracode:smoke-toggle-quick-composer:v${SMOKE_NATIVE_VERSION}`;
const QUICK_COMPOSER_STATE_CHANNEL = `poracode:smoke-inspect-quick-composer:v${SMOKE_NATIVE_VERSION}`;
const CLOSE_MAIN_WINDOW_CHANNEL = `poracode:smoke-close-main-window:v${SMOKE_NATIVE_VERSION}`;
const QUIT_APP_CHANNEL = `poracode:smoke-quit-app:v${SMOKE_NATIVE_VERSION}`;

interface SmokeMode {
  isDev: boolean;
  mockAgents: boolean;
}

export function registerSmokeNativeControls(
  options: SmokeMode & {
    isPackaged: boolean;
    ipcMain: Pick<IpcMain, "handle">;
    getMainWebContents(): WebContents | null;
    toggleQuickComposer(): void;
    inspectQuickComposer(): { visible: boolean; focused: boolean } | null;
    closeMainWindow(): void;
    quitApp(): void;
  },
): void {
  if (!options.isDev || options.isPackaged || !options.mockAgents) return;
  const authorize = (event: IpcMainInvokeEvent, version: unknown) => {
    if (version !== SMOKE_NATIVE_VERSION) throw new Error("Unsupported native smoke version");
    const main = options.getMainWebContents();
    if (
      !main ||
      main.isDestroyed() ||
      event.sender !== main ||
      event.senderFrame !== main.mainFrame
    ) {
      throw new Error("Native smoke controls require the current main window's top frame");
    }
  };
  for (const [channel, action] of [
    [QUICK_COMPOSER_CHANNEL, options.toggleQuickComposer],
    [QUICK_COMPOSER_STATE_CHANNEL, options.inspectQuickComposer],
    [CLOSE_MAIN_WINDOW_CHANNEL, options.closeMainWindow],
    [QUIT_APP_CHANNEL, options.quitApp],
  ] as const) {
    options.ipcMain.handle(channel, (event, version: unknown) => {
      authorize(event, version);
      return action();
    });
  }
}

export function installSmokeNativePreload(
  options: SmokeMode & {
    contextBridge: Pick<ContextBridge, "exposeInMainWorld">;
    ipcRenderer: Pick<IpcRenderer, "invoke">;
  },
): void {
  if (!options.isDev || !options.mockAgents) return;
  options.contextBridge.exposeInMainWorld("__poracodeSmokeNative", {
    version: SMOKE_NATIVE_VERSION,
    toggleQuickComposer: () =>
      options.ipcRenderer.invoke(QUICK_COMPOSER_CHANNEL, SMOKE_NATIVE_VERSION),
    inspectQuickComposer: () =>
      options.ipcRenderer.invoke(QUICK_COMPOSER_STATE_CHANNEL, SMOKE_NATIVE_VERSION),
    closeMainWindow: () =>
      options.ipcRenderer.invoke(CLOSE_MAIN_WINDOW_CHANNEL, SMOKE_NATIVE_VERSION),
    quitApp: () => options.ipcRenderer.invoke(QUIT_APP_CHANNEL, SMOKE_NATIVE_VERSION),
  });
}

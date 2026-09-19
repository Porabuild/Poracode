// Main-side device-only IPC for standalone attach mode.
//
// Attached Electron owns native device/window functions; the headless owner
// owns backend processes, authoritative SQLite/settings/keys and server
// procedures. This module registers the explicit attach allowlist (real
// implementations only) plus the quick-composer/renderer-reload window
// channels, and loud-rejects everything else. It never acquires the owner
// lease, never forks a backend host, never runs migration or secret-key init,
// and never opens SQLite: attach startup stays backend-free by construction.
//
// `getSharedSettings` is intentionally not served here: settings are
// server-authoritative and sync over the existing remote owner pull/push path.
import { join } from "node:path";
import { BrowserWindow, ipcMain, type WebContents } from "electron";
import type { PoracodeChannel } from "@/shared/channel";
import type { PoracodeDiagnosticTags } from "@/shared/diagnostics/sentryPrivacy";
import {
  IPC_EVENT_CHANNELS,
  IPC_WINDOW_CHANNELS,
  ipcProcedureMap,
  parseIpcProcedureArgs,
  quickComposerSubmissionSchema,
  type IpcProcedureName,
} from "@/shared/ipc";
import { isAttachDeviceProcedure } from "@/shared/ipc/attachProcedureAllowlist";
import type { KeybindingsFile } from "@/shared/keybindings";
import { readKeybindingsFile } from "../keybindingsFile";
import { applyKeybindingsWrite } from "../keybindingsApply";
import { showAndFocusWindow } from "../window/showAndFocusWindow";
import { requestTrackedRendererReload } from "../window/windowHardening";
import type { QuickComposerLifecycle } from "../window/quickComposerLifecycle";
import { createAutoUpdaterController, type AutoUpdaterController } from "../updates/autoUpdater";

export interface StandaloneAttachIpcDeps {
  getMainWindow(): BrowserWindow | null;
  getQuickComposerWindow(): BrowserWindow | null;
  /** Owned profile namespace from the attach payload; device keybindings live here. */
  profileNamespace: string;
  channel: PoracodeChannel;
  isDev: boolean;
  reportError(error: unknown, tags?: PoracodeDiagnosticTags): void;
  markQuitting(): void;
  /**
   * Shared quick-composer device lifecycle (pending submit flush, graceful
   * dismiss, picker focus). Constructed by the attach startup with the
   * ephemeral shell state, so submit/dismiss behave exactly like managed.
   */
  quickComposer: QuickComposerLifecycle;
  /** Re-applies the device shortcut registration after keybinding changes. */
  onKeybindingsChanged?(file: KeybindingsFile): void;
  /** Truthful global-shortcut suspension while the renderer captures keys. */
  setShortcutsSuspended?(suspended: boolean): void;
}

/** Sender must be the attach main window or the quick-composer window. */
function attachSenderWindow(
  sender: WebContents,
  deps: StandaloneAttachIpcDeps,
): BrowserWindow | null {
  const window = BrowserWindow.fromWebContents(sender);
  if (!window || window.isDestroyed()) return null;
  const mainWindow = deps.getMainWindow();
  const quickComposerWindow = deps.getQuickComposerWindow();
  if (window !== mainWindow && window !== quickComposerWindow) return null;
  return window;
}

/**
 * Register the attach-mode `clientProcedureInvoke` handler (device allowlist
 * only) and the attach window channels. Call once from
 * `startStandaloneAttachMode` before the main window is created. Returns the
 * attach auto-update controller (real updater, renderer notifications only).
 */
export function registerStandaloneAttachIpc(deps: StandaloneAttachIpcDeps): AutoUpdaterController {
  const autoUpdater = createAutoUpdaterController(
    (status) => {
      deps.getMainWindow()?.webContents.send(IPC_EVENT_CHANNELS.updateStatus, status);
    },
    deps.channel,
    deps.isDev,
    deps.reportError,
    () => deps.markQuitting(),
  );
  autoUpdater.initialize();

  const keybindingsPath = join(deps.profileNamespace, "keybindings.json");

  ipcMain.handle(
    IPC_WINDOW_CHANNELS.clientProcedureInvoke,
    (event, request: { name?: unknown; args?: unknown }) => {
      if (!attachSenderWindow(event.sender, deps)) {
        throw new Error("Unknown client procedure sender.");
      }
      if (
        typeof request?.name !== "string" ||
        !Object.hasOwn(ipcProcedureMap, request.name) ||
        !Array.isArray(request.args)
      ) {
        throw new Error("Invalid client procedure request.");
      }
      const name = request.name as IpcProcedureName;
      if (!isAttachDeviceProcedure(name)) {
        throw new Error(`Client procedure '${name}' is not available in standalone attach.`);
      }
      switch (name) {
        // No local event registry exists in attach (remote sockets own events):
        // validate the payload shape, then accept and no-op.
        case "setRendererEventInterests":
          parseIpcProcedureArgs("setRendererEventInterests", request.args);
          return;
        case "getKeybindings":
          return readKeybindingsFile(keybindingsPath);
        case "setKeybindings": {
          // Managed parity via the shared write-with-rollback helper: un-
          // suspend capture, re-apply the device shortcuts, then persist; on
          // write failure roll the shortcuts back to the file still on disk.
          const file = parseIpcProcedureArgs("setKeybindings", request.args);
          deps.setShortcutsSuspended?.(false);
          return applyKeybindingsWrite({
            path: keybindingsPath,
            file,
            ...(deps.onKeybindingsChanged
              ? { onKeybindingsChanged: deps.onKeybindingsChanged }
              : {}),
          });
        }
        case "setGlobalShortcutsSuspended":
          deps.setShortcutsSuspended?.(
            parseIpcProcedureArgs("setGlobalShortcutsSuspended", request.args).suspended,
          );
          return;
        case "focusWindow": {
          const mainWindow = deps.getMainWindow();
          if (mainWindow && !mainWindow.isDestroyed()) showAndFocusWindow(mainWindow);
          return;
        }
        case "getUpdateStatus":
          return autoUpdater.getStatus();
        // Real updater actions on the same controller managed uses: check and
        // download resolve (the controller owns status/error reporting), and
        // install keeps its quit semantics via beforeInstall -> markQuitting.
        // No update is ever installed by tests: delegation is observed through
        // the controller, never by running an installer.
        case "checkForUpdate":
          return autoUpdater.checkForUpdate();
        case "startUpdateDownload":
          return autoUpdater.startUpdateDownload();
        case "installUpdate":
          return autoUpdater.installUpdate();
        default:
          // Unreachable: the allowlist check above already rejected anything
          // else, but kept as a throw so a future list/desync can never fall
          // through to an undefined reply.
          throw new Error(`Client procedure '${name}' is not available in standalone attach.`);
      }
    },
  );

  // Quick-composer device lifecycle: the shared state machine owns
  // open/ready/submit/pending-flush/dismiss/picker-focus with managed parity,
  // while the main window's ready ping resolves instead of crash-looping the
  // boot. Sender checks stay here; transitions live in the lifecycle.
  ipcMain.handle(IPC_WINDOW_CHANNELS.quickComposerMainReady, (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const mainWindow = deps.getMainWindow();
    if (!window || window !== mainWindow || window.isDestroyed()) return;
    deps.quickComposer.handleMainReady();
  });
  ipcMain.handle(IPC_WINDOW_CHANNELS.quickComposerSubmit, (event, payload: unknown) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const overlay = deps.getQuickComposerWindow();
    if (!window || !overlay || window !== overlay || window.isDestroyed()) return;
    deps.quickComposer.handleSubmit(overlay, quickComposerSubmissionSchema.parse(payload));
  });
  ipcMain.handle(IPC_WINDOW_CHANNELS.quickComposerDismiss, (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const overlay = deps.getQuickComposerWindow();
    if (!window || !overlay || window !== overlay || window.isDestroyed()) return;
    deps.quickComposer.finishDismiss(overlay);
  });
  ipcMain.handle(IPC_WINDOW_CHANNELS.quickComposerPickFiles, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    const overlay = deps.getQuickComposerWindow();
    if (!window || !overlay || window !== overlay || window.isDestroyed()) return null;
    return deps.quickComposer.handlePickFiles(overlay);
  });
  // Crash-screen recovery: the reload button must work instead of re-rejecting
  // into the crash loop.
  ipcMain.handle(IPC_WINDOW_CHANNELS.rendererReload, (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window && !window.isDestroyed()) requestTrackedRendererReload(window);
  });

  return autoUpdater;
}

import { contextBridge, ipcRenderer, webUtils } from "electron";
import { type PoracodeChannel, normalizeChannel } from "@/shared/channel";
import type { RemoteThreadCommand } from "@/shared/contracts";
import type { SharedSettings } from "@/shared/settings";
import {
  createInvokeBridge,
  IPC_EVENT_CHANNELS,
  IPC_WINDOW_CHANNELS,
  PORACODE_WINDOW_KINDS,
  type BrowserEvent,
  type PoracodeBridge,
  type PoracodeWindowKind,
  type QuickComposerSubmission,
  type SupervisorEvent,
  type ThreadOpenRequestedEvent,
  type UpdateStatus,
} from "@/shared/ipc";

/**
 * Host home dir without `node:os` — sandboxed preload must not import Node
 * built-ins that can fail and drop `window.poracode` (index.html then redirects
 * to mobile.html).
 */
function resolveHomeDir(): string | undefined {
  const env = process.env;
  const userProfile = env.USERPROFILE?.trim();
  if (userProfile) return userProfile;
  const home = env.HOME?.trim();
  if (home) return home;
  // Windows often has HOMEDRIVE+HOMEPATH when USERPROFILE is unset.
  const combined = `${env.HOMEDRIVE ?? ""}${env.HOMEPATH ?? ""}`.trim();
  return combined.length > 0 ? combined : undefined;
}

function resolveAppVersion(): string {
  const prefix = "--lc-app-version=";
  for (const arg of process.argv) {
    if (arg.startsWith(prefix)) {
      const raw = arg.slice(prefix.length);
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }
  return process.env.npm_package_version ?? "dev";
}

function resolveIsDev(): boolean {
  const prefix = "--lc-is-dev=";
  for (const arg of process.argv) {
    if (arg.startsWith(prefix)) {
      return arg.slice(prefix.length) === "1";
    }
  }
  return false;
}

function resolveChannel(): PoracodeChannel {
  const prefix = "--lc-channel=";
  for (const arg of process.argv) {
    if (arg.startsWith(prefix)) {
      return normalizeChannel(arg.slice(prefix.length));
    }
  }
  return "stable";
}

function resolveWindowKind(): PoracodeWindowKind {
  const kind = resolveArgValue("--lc-window-kind=");
  return (PORACODE_WINDOW_KINDS as readonly string[]).includes(kind)
    ? (kind as PoracodeWindowKind)
    : "main";
}

function resolveSentryEnabled(): boolean {
  const prefix = "--lc-sentry-enabled=";
  for (const arg of process.argv) {
    if (arg.startsWith(prefix)) {
      return arg.slice(prefix.length) === "1";
    }
  }
  return false;
}

function resolveArgValue(prefix: string): string {
  for (const arg of process.argv) {
    if (arg.startsWith(prefix)) {
      const raw = arg.slice(prefix.length);
      try {
        return decodeURIComponent(raw);
      } catch {
        return raw;
      }
    }
  }
  return "";
}

function resolveArgBoolean(prefix: string): boolean {
  return resolveArgValue(prefix) === "1";
}

const homeDir = resolveHomeDir();

const bridge: PoracodeBridge = {
  platform: process.platform,
  appVersion: resolveAppVersion(),
  arch: process.arch,
  chromeVersion: process.versions.chrome ?? "unknown",
  isDev: resolveIsDev(),
  windowKind: resolveWindowKind(),
  channel: resolveChannel(),
  ...(homeDir ? { homeDir } : {}),
  electronVersion: process.versions.electron ?? "unknown",
  nodeVersion: process.versions.node,
  posthogEnableDev: resolveArgBoolean("--lc-posthog-enable-dev="),
  posthogEnabled: resolveArgValue("--lc-posthog-enabled=") !== "0",
  posthogHost: resolveArgValue("--lc-posthog-host="),
  posthogKey: resolveArgValue("--lc-posthog-key="),
  sentryEnabled: resolveSentryEnabled(),
  getDroppedFilePaths(files) {
    return files.map((file) => webUtils.getPathForFile(file)).filter((path) => path.length > 0);
  },
  ...createInvokeBridge((channel, ...args) => ipcRenderer.invoke(channel, ...args)),
  onSupervisorEvent(listener) {
    const handler = (_event: Electron.IpcRendererEvent, payload: SupervisorEvent) => {
      listener(payload);
    };
    ipcRenderer.on(IPC_EVENT_CHANNELS.supervisorEvent, handler);
    return () => {
      ipcRenderer.removeListener(IPC_EVENT_CHANNELS.supervisorEvent, handler);
    };
  },
  onUpdateStatus(listener) {
    const handler = (_event: Electron.IpcRendererEvent, status: UpdateStatus) => {
      listener(status);
    };
    ipcRenderer.on(IPC_EVENT_CHANNELS.updateStatus, handler);
    return () => {
      ipcRenderer.removeListener(IPC_EVENT_CHANNELS.updateStatus, handler);
    };
  },
  onBrowserEvent(listener) {
    const handler = (_event: Electron.IpcRendererEvent, payload: BrowserEvent) => {
      listener(payload);
    };
    ipcRenderer.on(IPC_EVENT_CHANNELS.browserEvent, handler);
    return () => {
      ipcRenderer.removeListener(IPC_EVENT_CHANNELS.browserEvent, handler);
    };
  },
  onRemoteThreadCommand(listener) {
    const handler = (_event: Electron.IpcRendererEvent, command: RemoteThreadCommand) => {
      listener(command);
    };
    ipcRenderer.on(IPC_EVENT_CHANNELS.remoteThreadCommand, handler);
    return () => {
      ipcRenderer.removeListener(IPC_EVENT_CHANNELS.remoteThreadCommand, handler);
    };
  },
  onSharedSettingsChanged(listener) {
    const handler = (_event: Electron.IpcRendererEvent, settings: SharedSettings) => {
      listener(settings);
    };
    ipcRenderer.on(IPC_EVENT_CHANNELS.sharedSettingsChanged, handler);
    return () => {
      ipcRenderer.removeListener(IPC_EVENT_CHANNELS.sharedSettingsChanged, handler);
    };
  },
  onThreadOpenRequested(listener) {
    const handler = (_event: Electron.IpcRendererEvent, payload: ThreadOpenRequestedEvent) => {
      listener(payload);
    };
    ipcRenderer.on(IPC_EVENT_CHANNELS.threadOpenRequested, handler);
    return () => {
      ipcRenderer.removeListener(IPC_EVENT_CHANNELS.threadOpenRequested, handler);
    };
  },
  submitQuickComposer(submission) {
    return ipcRenderer.invoke(IPC_WINDOW_CHANNELS.quickComposerSubmit, submission);
  },
  dismissQuickComposer() {
    return ipcRenderer.invoke(IPC_WINDOW_CHANNELS.quickComposerDismiss);
  },
  pickQuickComposerFiles() {
    return ipcRenderer.invoke(IPC_WINDOW_CHANNELS.quickComposerPickFiles);
  },
  notifyQuickComposerMainReady() {
    return ipcRenderer.invoke(IPC_WINDOW_CHANNELS.quickComposerMainReady);
  },
  onQuickComposerSubmit(listener) {
    const handler = (_event: Electron.IpcRendererEvent, payload: QuickComposerSubmission) => {
      listener(payload);
    };
    ipcRenderer.on(IPC_EVENT_CHANNELS.quickComposerSubmit, handler);
    return () => {
      ipcRenderer.removeListener(IPC_EVENT_CHANNELS.quickComposerSubmit, handler);
    };
  },
  onQuickComposerDismissRequested(listener) {
    const handler = () => listener();
    ipcRenderer.on(IPC_EVENT_CHANNELS.quickComposerDismissRequested, handler);
    return () => {
      ipcRenderer.removeListener(IPC_EVENT_CHANNELS.quickComposerDismissRequested, handler);
    };
  },
};

contextBridge.exposeInMainWorld("poracode", bridge);

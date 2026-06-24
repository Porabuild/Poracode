import { contextBridge, ipcRenderer, webUtils } from "electron";
import { type LightcodeChannel, normalizeChannel } from "@/shared/channel";
import type { RemoteThreadCommand } from "@/shared/contracts";
import type { SharedSettings } from "@/shared/settings";
import {
  createInvokeBridge,
  IPC_EVENT_CHANNELS,
  type BrowserEvent,
  type LightcodeBridge,
  type LightcodeWindowKind,
  type SupervisorEvent,
  type UpdateStatus,
} from "@/shared/ipc";

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

function resolveChannel(): LightcodeChannel {
  const prefix = "--lc-channel=";
  for (const arg of process.argv) {
    if (arg.startsWith(prefix)) {
      return normalizeChannel(arg.slice(prefix.length));
    }
  }
  return "stable";
}

function resolveWindowKind(): LightcodeWindowKind {
  return resolveArgValue("--lc-window-kind=") === "browserExtract" ? "browserExtract" : "main";
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

const bridge: LightcodeBridge = {
  platform: process.platform,
  appVersion: resolveAppVersion(),
  arch: process.arch,
  chromeVersion: process.versions.chrome ?? "unknown",
  isDev: resolveIsDev(),
  windowKind: resolveWindowKind(),
  channel: resolveChannel(),
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
};

contextBridge.exposeInMainWorld("lightcode", bridge);

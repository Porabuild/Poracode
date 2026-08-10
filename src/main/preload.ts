import { contextBridge, ipcRenderer, webUtils } from "electron";
import { type PoracodeChannel, normalizeChannel } from "@/shared/channel";
import type { RemoteThreadCommand } from "@/shared/contracts";
import type { RemoteAccessPairingInfo } from "@/shared/remote";
import type { SharedSettings } from "@/shared/settings";
import type { GitStatePatch } from "@/shared/gitState";
import type { BackendRendererStreamInfo } from "@/shared/backendHostProtocol";
import {
  rendererIpcInterests,
  shouldDispatchRendererIpcEvent,
} from "./backend/rendererDeliveryPolicy";
import {
  createInvokeBridge,
  IPC_EVENT_CHANNELS,
  IPC_WINDOW_CHANNELS,
  PORACODE_WINDOW_KINDS,
  type BrowserEvent,
  type PoracodeBridge,
  type PoracodeWindowKind,
  type PrWatchMergedEvent,
  type PrWatchStatusEvent,
  type ProjectStateChangedEvent,
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
const invokeBridge = createInvokeBridge((channel, ...args) => ipcRenderer.invoke(channel, ...args));
const supervisorListeners = new Set<(event: SupervisorEvent) => void>();
let rendererInterests = { terminalThreadIds: [] as string[], runtimeThreadIds: [] as string[] };
let backendLiveSocket: WebSocket | null = null;
let backendLiveLastSequence = 0;
let backendLiveReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let backendLiveStreamInfo: BackendRendererStreamInfo | null = null;
let backendLiveStreamExpected = resolveArgValue("--lc-backend-live-version=") === "1";

function dispatchSupervisorEvent(event: SupervisorEvent): void {
  for (const listener of supervisorListeners) listener(event);
}

function sendBackendLiveInterests(): void {
  if (backendLiveSocket?.readyState !== WebSocket.OPEN) return;
  backendLiveSocket.send(
    JSON.stringify({
      version: 1,
      type: "interests",
      terminalThreadIds: rendererInterests.terminalThreadIds,
      runtimeThreadIds: rendererInterests.runtimeThreadIds,
      lastSeq: backendLiveLastSequence,
    }),
  );
}

function connectBackendLiveStream(): void {
  backendLiveReconnectTimer = null;
  const info = backendLiveStreamInfo;
  if (!info) return;
  const endpoint = new URL(info.url);
  endpoint.searchParams.set("token", info.token);
  const socket = new WebSocket(endpoint);
  backendLiveSocket = socket;
  socket.addEventListener("open", () => sendBackendLiveInterests());
  socket.addEventListener("message", (message) => {
    let payload: unknown;
    try {
      payload = JSON.parse(String(message.data));
    } catch {
      socket.close();
      return;
    }
    if (!isBackendLiveMessage(payload)) {
      socket.close();
      return;
    }
    if (payload.type === "interests-ack") {
      void invokeBridge.setRendererEventInterests(rendererIpcInterests(true, rendererInterests));
      return;
    }
    if (payload.type === "event") {
      if (payload.seq <= backendLiveLastSequence) return;
      backendLiveLastSequence = payload.seq;
      dispatchSupervisorEvent(payload.event);
      return;
    }
    if (payload.type === "resync-required") {
      backendLiveLastSequence = payload.latestSeq;
      for (const threadId of rendererInterests.terminalThreadIds) {
        dispatchSupervisorEvent({ type: "thread-scrollback-resync", threadId });
      }
      for (const threadId of rendererInterests.runtimeThreadIds) {
        dispatchSupervisorEvent({ type: "thread-reset", threadId });
      }
    }
  });
  socket.addEventListener("close", () => {
    if (backendLiveSocket !== socket) return;
    backendLiveSocket = null;
    void invokeBridge.setRendererEventInterests(
      rendererIpcInterests(backendLiveStreamExpected, rendererInterests),
    );
    backendLiveReconnectTimer = setTimeout(connectBackendLiveStream, 1_000);
  });
}

function replaceBackendLiveStream(info: BackendRendererStreamInfo): void {
  backendLiveStreamInfo = info;
  backendLiveStreamExpected = true;
  backendLiveLastSequence = 0;
  if (backendLiveReconnectTimer) clearTimeout(backendLiveReconnectTimer);
  backendLiveReconnectTimer = null;
  const previous = backendLiveSocket;
  backendLiveSocket = null;
  previous?.close();
  void invokeBridge.setRendererEventInterests(rendererIpcInterests(true, rendererInterests));
  connectBackendLiveStream();
}

ipcRenderer.on(
  IPC_EVENT_CHANNELS.supervisorEvent,
  (_event: Electron.IpcRendererEvent, payload: SupervisorEvent) => {
    if (shouldDispatchRendererIpcEvent(backendLiveStreamExpected)) {
      dispatchSupervisorEvent(payload);
    }
  },
);
ipcRenderer.on(
  IPC_EVENT_CHANNELS.backendRendererStreamChanged,
  (_event: Electron.IpcRendererEvent, info: unknown) => {
    if (isBackendRendererStreamInfo(info)) replaceBackendLiveStream(info);
  },
);
if (backendLiveStreamExpected) {
  void ipcRenderer
    .invoke(IPC_WINDOW_CHANNELS.backendRendererStreamInfo)
    .then((info: unknown) => {
      if (isBackendRendererStreamInfo(info)) replaceBackendLiveStream(info);
    })
    .catch(() => undefined);
}

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
  ...invokeBridge,
  async setRendererEventInterests(interests) {
    rendererInterests = {
      terminalThreadIds: [...new Set(interests.terminalThreadIds)],
      runtimeThreadIds: [...new Set(interests.runtimeThreadIds)],
    };
    sendBackendLiveInterests();
    await invokeBridge.setRendererEventInterests(
      rendererIpcInterests(backendLiveStreamExpected, rendererInterests),
    );
  },
  onSupervisorEvent(listener) {
    supervisorListeners.add(listener);
    return () => {
      supervisorListeners.delete(listener);
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
  onRemoteAccessPairingChanged(listener) {
    const handler = (_event: Electron.IpcRendererEvent, info: RemoteAccessPairingInfo) => {
      listener(info);
    };
    ipcRenderer.on(IPC_EVENT_CHANNELS.remoteAccessPairingChanged, handler);
    return () => {
      ipcRenderer.removeListener(IPC_EVENT_CHANNELS.remoteAccessPairingChanged, handler);
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
  onProjectStateChanged(listener) {
    const handler = (_event: Electron.IpcRendererEvent, payload: ProjectStateChangedEvent) => {
      listener(payload);
    };
    ipcRenderer.on(IPC_EVENT_CHANNELS.projectStateChanged, handler);
    return () => {
      ipcRenderer.removeListener(IPC_EVENT_CHANNELS.projectStateChanged, handler);
    };
  },
  onGitStateChanged(listener) {
    const handler = (_event: Electron.IpcRendererEvent, patch: GitStatePatch) => {
      listener(patch);
    };
    ipcRenderer.on(IPC_EVENT_CHANNELS.gitStateChanged, handler);
    return () => {
      ipcRenderer.removeListener(IPC_EVENT_CHANNELS.gitStateChanged, handler);
    };
  },
  onPrWatchMerged(listener) {
    const handler = (_event: Electron.IpcRendererEvent, payload: PrWatchMergedEvent) => {
      listener(payload);
    };
    ipcRenderer.on(IPC_EVENT_CHANNELS.prWatchMerged, handler);
    return () => {
      ipcRenderer.removeListener(IPC_EVENT_CHANNELS.prWatchMerged, handler);
    };
  },
  onPrWatchStatus(listener) {
    const handler = (_event: Electron.IpcRendererEvent, payload: PrWatchStatusEvent) => {
      listener(payload);
    };
    ipcRenderer.on(IPC_EVENT_CHANNELS.prWatchStatus, handler);
    return () => {
      ipcRenderer.removeListener(IPC_EVENT_CHANNELS.prWatchStatus, handler);
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
  reloadRenderer() {
    return ipcRenderer.invoke(IPC_WINDOW_CHANNELS.rendererReload);
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

function isBackendLiveMessage(
  value: unknown,
): value is
  | { version: 1; type: "hello" | "interests-ack" | "resync-required"; latestSeq: number }
  | { version: 1; type: "event"; seq: number; event: SupervisorEvent } {
  if (typeof value !== "object" || value === null) return false;
  const message = value as Record<string, unknown>;
  if (message.version !== 1 || typeof message.type !== "string") return false;
  if (message.type === "event") {
    return (
      typeof message.seq === "number" &&
      typeof message.event === "object" &&
      message.event !== null &&
      typeof (message.event as { type?: unknown }).type === "string"
    );
  }
  return (
    (message.type === "hello" ||
      message.type === "interests-ack" ||
      message.type === "resync-required") &&
    typeof message.latestSeq === "number"
  );
}

function isBackendRendererStreamInfo(value: unknown): value is BackendRendererStreamInfo {
  if (typeof value !== "object" || value === null) return false;
  const info = value as Record<string, unknown>;
  return info.version === 1 && typeof info.url === "string" && typeof info.token === "string";
}

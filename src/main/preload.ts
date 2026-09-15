import { contextBridge, ipcRenderer, webUtils } from "electron";
import { installSmokeNativePreload } from "./testing/smokeNativeControls";
import { type PoracodeChannel, normalizeChannel } from "@/shared/channel";
import type { RemoteThreadCommand } from "@/shared/contracts";
import type { RemoteAccessPairingInfo } from "@/shared/remote";
import type { SharedSettings } from "@/shared/settings";
import type { GitStatePatch } from "@/shared/gitState";
import type { UserNotification } from "@/shared/threadNotification";
import {
  BACKEND_RENDERER_STREAM_VERSION,
  isRendererStreamOwnershipGrant,
  isRendererStreamRecoveryBarrier,
  isSupervisorEventGap,
  type BackendRendererStreamInfo,
} from "@/shared/backendHostProtocol";
import { PORACODE_CLIENT_RUNTIME_VERSION, type ElectronHostBridge } from "@/shared/clientRuntime";
import type { StandaloneAttachInfo } from "@/shared/standaloneAttach";
import { standaloneAttachInfoSchema } from "@/shared/standaloneAttach";
import {
  REMOTE_HTTP_BRIDGE_VERSION,
  isRemoteHttpBridgePortEnvelope,
} from "@/shared/remote/httpBridgeProtocol";
import {
  IPC_EVENT_CHANNELS,
  IPC_WINDOW_CHANNELS,
  PORACODE_WINDOW_KINDS,
  type PoracodeWindowKind,
} from "@/shared/ipc/channels";
import {
  type BrowserEvent,
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
 * built-ins that can fail and drop the native host bridge during index.html boot.
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
const bridge: ElectronHostBridge = {
  clientRuntimeVersion: PORACODE_CLIENT_RUNTIME_VERSION,
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
  invokeProcedure(name, args) {
    return ipcRenderer.invoke(IPC_WINDOW_CHANNELS.clientProcedureInvoke, { name, args });
  },
  remoteHttpBridgeVersion: REMOTE_HTTP_BRIDGE_VERSION,
  openRemoteHttpBridge(request) {
    return ipcRenderer.invoke(IPC_WINDOW_CHANNELS.remoteHttpBridgeOpen, request) as Promise<
      Awaited<ReturnType<NonNullable<ElectronHostBridge["openRemoteHttpBridge"]>>>
    >;
  },
  cancelRemoteHttpBridge(request) {
    return ipcRenderer.invoke(IPC_WINDOW_CHANNELS.remoteHttpBridgeCancel, request) as Promise<void>;
  },
  async getStandaloneAttachInfo() {
    const info: unknown = await ipcRenderer.invoke(IPC_WINDOW_CHANNELS.standaloneAttachInfo);
    // Fail closed: only an explicit null selects managed-local. A present
    // getter that resolves to undefined or a schema-invalid payload must
    // reject so the renderer refuses instead of installing managed. Thrown
    // IPC rejections propagate unchanged. (An absent optional method on older
    // managed preloads is handled renderer-side as managed.)
    if (info === null) return null;
    const parsed = standaloneAttachInfoSchema.safeParse(info);
    if (!parsed.success) {
      throw new Error("Invalid standalone attach configuration.");
    }
    return parsed.data as StandaloneAttachInfo;
  },
  async getBackendRendererStreamInfo() {
    const info: unknown = await ipcRenderer.invoke(IPC_WINDOW_CHANNELS.backendRendererStreamInfo);
    return isBackendRendererStreamInfo(info) ? info : null;
  },
  async getRendererStreamOwnershipGrant() {
    const grant: unknown = await ipcRenderer.invoke(
      IPC_WINDOW_CHANNELS.rendererStreamOwnershipGrant,
    );
    return isRendererStreamOwnershipGrant(grant) ? grant : null;
  },
  onBackendRendererStreamChanged(listener) {
    const handler = (_event: Electron.IpcRendererEvent, info: unknown) => {
      if (isBackendRendererStreamInfo(info)) listener(info);
    };
    ipcRenderer.on(IPC_EVENT_CHANNELS.backendRendererStreamChanged, handler);
    return () => {
      ipcRenderer.removeListener(IPC_EVENT_CHANNELS.backendRendererStreamChanged, handler);
    };
  },
  onSupervisorEventGap(listener) {
    const handler = (_event: Electron.IpcRendererEvent, gap: unknown) => {
      if (isSupervisorEventGap(gap)) listener(gap);
    };
    ipcRenderer.on(IPC_EVENT_CHANNELS.backendSupervisorEventGap, handler);
    return () => {
      ipcRenderer.removeListener(IPC_EVENT_CHANNELS.backendSupervisorEventGap, handler);
    };
  },
  onRendererStreamRecovery(listener) {
    const handler = (_event: Electron.IpcRendererEvent, barrier: unknown) => {
      if (isRendererStreamRecoveryBarrier(barrier)) listener(barrier);
    };
    ipcRenderer.on(IPC_EVENT_CHANNELS.rendererStreamRecovery, handler);
    return () => {
      ipcRenderer.removeListener(IPC_EVENT_CHANNELS.rendererStreamRecovery, handler);
    };
  },
  onSupervisorEvent(listener) {
    const handler = (
      _event: Electron.IpcRendererEvent,
      payload: SupervisorEvent,
      rendererSequence?: number,
    ) => {
      listener(payload, rendererSequence);
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
  onUserNotification(listener) {
    const handler = (_event: Electron.IpcRendererEvent, notification: UserNotification) => {
      listener(notification);
    };
    ipcRenderer.on(IPC_EVENT_CHANNELS.userNotification, handler);
    return () => {
      ipcRenderer.removeListener(IPC_EVENT_CHANNELS.userNotification, handler);
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
  onQuickComposerShown(listener) {
    const handler = () => listener();
    ipcRenderer.on(IPC_EVENT_CHANNELS.quickComposerShown, handler);
    return () => {
      ipcRenderer.removeListener(IPC_EVENT_CHANNELS.quickComposerShown, handler);
    };
  },
};

contextBridge.exposeInMainWorld("poracodeHost", bridge);
// Facade 11: forward each per-request bridge port into the main world via the
// documented preload -> main-world port pattern. The isolated world never sees
// body bytes; only the port handle crosses. Unknown/malformed envelopes are
// dropped and their ports closed.
const windowLoaded = new Promise<void>((resolve) => {
  if (document.readyState === "complete") {
    resolve();
    return;
  }
  window.addEventListener("load", () => resolve(), { once: true });
});
ipcRenderer.on(IPC_WINDOW_CHANNELS.remoteHttpBridgePort, (event, payload: unknown) => {
  if (event.ports.length !== 1 || !isRemoteHttpBridgePortEnvelope(payload)) {
    for (const port of event.ports) port.close();
    return;
  }
  void windowLoaded.then(() => {
    window.postMessage(payload, "*", event.ports);
  });
});
installSmokeNativePreload({
  contextBridge,
  ipcRenderer,
  isDev: bridge.isDev,
  mockAgents: process.env.PORACODE_MOCK_AGENTS === "1",
});

function isBackendRendererStreamInfo(value: unknown): value is BackendRendererStreamInfo {
  if (typeof value !== "object" || value === null) return false;
  const info = value as Record<string, unknown>;
  return (
    info.version === BACKEND_RENDERER_STREAM_VERSION &&
    typeof info.url === "string" &&
    typeof info.token === "string"
  );
}

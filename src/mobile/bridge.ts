import type {
  ClearPendingSteerPayload,
  CloseThreadPayload,
  InterruptThreadPayload,
  ResizeTerminalPayload,
  ResolveThreadServerRequestPayload,
  SendThreadInputPayload,
  SetPendingSteerPayload,
  StartShellPayload,
  WriteTerminalPayload,
} from "@/shared/contracts";
import type { BrowserState, BrowserTabInfo, LightcodeBridge } from "@/shared/ipc";
import {
  isGitRemoteNoopProcedure,
  isGitRemoteProcedure,
  type RemoteBrowserCommand,
} from "@/shared/remote";
import type { SharedSettingsInput } from "@/shared/settings";
import { useBrowserMirrorStore } from "./browserMirror";
import type { RemoteDesktopClient } from "./remoteClient";
import { pushDesktopSettingsDiff } from "./settingsSync";

/**
 * Remote-session implementation of `window.lightcode`. The desktop renderer
 * components reused by the PWA (ChatPane, ThreadComposerSection,
 * ThreadDraftView, …) call the bridge for thread mutations and shell
 * conveniences. Here those calls are routed to the paired desktop over the
 * remote HTTP API; everything desktop-only resolves to a benign empty result
 * or a rejected promise the callers already handle.
 */

let activeClient: RemoteDesktopClient | null = null;

/** The remote session hook keeps this pointing at the active desktop. */
export function setRemoteBridgeClient(client: RemoteDesktopClient | null): void {
  activeClient = client;
}

/** Mobile-native views (BrowserView) call the remote API directly. */
export function getRemoteBridgeClient(): RemoteDesktopClient | null {
  return activeClient;
}

function requireClient(): RemoteDesktopClient {
  if (!activeClient) {
    throw new Error("Not connected to a desktop.");
  }
  return activeClient;
}

/** Runs a remote browser command and propagates the resulting tab state. */
async function runBrowserCommand(command: RemoteBrowserCommand): Promise<BrowserState> {
  const state = await requireClient().browserCommand(command);
  useBrowserMirrorStore.getState().setState(state);
  return state;
}

function detectPlatform(): NodeJS.Platform {
  const ua = navigator.userAgent;
  if (/Mac|iPhone|iPad|iPod/i.test(ua)) return "darwin";
  if (/Win/i.test(ua)) return "win32";
  return "linux";
}

const remoteBridge = {
  // Metadata reads. Analytics/diagnostics stay disabled in remote sessions.
  platform: detectPlatform(),
  appVersion: "remote",
  arch: "web",
  chromeVersion: "",
  isDev: false,
  channel: "stable",
  electronVersion: "",
  nodeVersion: "",
  posthogEnableDev: false,
  posthogEnabled: false,
  posthogHost: "",
  posthogKey: "",
  sentryEnabled: false,

  // Thread mutations forwarded to the paired desktop.
  sendThreadInput: (payload: SendThreadInputPayload) => requireClient().sendThreadInput(payload),
  interruptThread: (payload: InterruptThreadPayload) =>
    requireClient().interruptThread(payload.threadId),
  writeTerminal: (payload: WriteTerminalPayload) => requireClient().writeTerminal(payload),
  resizeTerminal: (payload: ResizeTerminalPayload) => requireClient().resizeTerminal(payload),
  startShell: (payload: StartShellPayload) => requireClient().startShell(payload),
  closeThread: (payload: CloseThreadPayload) => requireClient().closeShell(payload),
  // Live PTY bytes arrive over the WebSocket (terminalFeed); the surface gets
  // its initial scrollback via prop, so the bridge read is a no-op here.
  readTerminalScrollback: () => Promise.resolve(""),
  setPendingSteer: (payload: SetPendingSteerPayload) => requireClient().setPendingSteer(payload),
  clearPendingSteer: (payload: ClearPendingSteerPayload) =>
    requireClient().clearPendingSteer(payload.threadId),
  resolveThreadServerRequest: (payload: ResolveThreadServerRequestPayload) =>
    requireClient().resolveRequest(payload),

  // Usage panel: snapshots come from the paired desktop's supervisor cache.
  // Login state stays unknown (no remote secrets); login actions are
  // desktop-only and fall through to the rejecting proxy below.
  getProviderUsage: () => requireClient().providerUsage(),
  getUsageLoginState: () => Promise.resolve({ stored: {} }),

  // Shared settings persist per device via the store's localStorage fallback.
  // Remote-editable keys (the desktop's AI helpers) are additionally diffed
  // and forwarded to the paired desktop — see settingsSync.ts.
  setSharedSettings: (settings: SharedSettingsInput) => {
    pushDesktopSettingsDiff(activeClient, settings);
    return Promise.resolve();
  },

  // Shell conveniences with browser-native equivalents.
  openExternal: (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
    return Promise.resolve();
  },
  // Notification click handlers focus the app window.
  focusWindow: () => {
    window.focus();
    return Promise.resolve();
  },
  getDroppedFilePaths: () => [],
  pickFiles: () => Promise.resolve(null),
  searchProjectFiles: () => Promise.resolve({ entries: [], totalIndexed: 0 }),
  getAgentHookPluginStatuses: () => Promise.resolve([]),

  // Runtime history hydration is fed by the remote sync layer instead of the
  // local DB; empty results keep `hydrateThreadRuntimeItems` a no-op.
  dbGetThreadRuntimeItems: () => Promise.resolve([]),
  dbGetThreadCompletedTurns: () => Promise.resolve([]),
  dbGetThreadContextUsage: () => Promise.resolve(null),

  // Zustand persist writes through these on every store change; the remote
  // session keeps its state in the desktop's DB, so they are silent no-ops.
  dbGetProjects: () => Promise.resolve([]),
  dbGetThreads: () => Promise.resolve([]),
  dbGetState: () => Promise.resolve(null),
  dbSetState: () => Promise.resolve(),
  dbSyncAll: () => Promise.resolve(),

  // Browser panel: the reused desktop components (tab strip, toolbar) drive
  // the desktop's built-in browser through the remote command API. The state
  // they read arrives via runBrowserCommand/the mirror watch stream.
  browserGetState: () => requireClient().browserState(),
  browserCreateTab: async (payload: {
    url?: string;
    activate?: boolean;
  }): Promise<BrowserTabInfo> => {
    const state = await runBrowserCommand({
      kind: "create-tab",
      ...(payload.url ? { url: payload.url } : {}),
    });
    const tab = state.tabs.find((t) => t.tabId === state.activeTabId) ?? state.tabs.at(-1);
    if (!tab) throw new Error("The desktop did not open a tab.");
    return tab;
  },
  browserCloseTab: async (payload: { tabId: string }) => {
    await runBrowserCommand({ kind: "close-tab", tabId: payload.tabId });
  },
  browserActivateTab: async (payload: { tabId: string }) => {
    await runBrowserCommand({ kind: "activate-tab", tabId: payload.tabId });
  },
  browserNavigate: async (payload: { tabId: string; url: string }) => {
    await runBrowserCommand({ kind: "navigate", tabId: payload.tabId, url: payload.url });
  },
  browserBack: async (payload: { tabId: string }) => {
    await runBrowserCommand({ kind: "back", tabId: payload.tabId });
  },
  browserForward: async (payload: { tabId: string }) => {
    await runBrowserCommand({ kind: "forward", tabId: payload.tabId });
  },
  browserReload: async (payload: { tabId: string }) => {
    await runBrowserCommand({ kind: "reload", tabId: payload.tabId });
  },
  // Tab reordering is desktop-only; swallow so drag interactions stay inert.
  browserMoveTab: () => Promise.resolve(),

  // Event subscriptions: remote events arrive over the WebSocket instead.
  onSupervisorEvent: () => () => undefined,
  onUpdateStatus: () => () => undefined,
  onBrowserEvent: () => () => undefined,
  onRemoteThreadCommand: () => () => undefined,
  onSharedSettingsChanged: () => () => undefined,
};

export function installRemoteBridge(): void {
  if (typeof window === "undefined" || window.lightcode !== undefined) return;
  window.lightcode = new Proxy(remoteBridge, {
    get(target, prop, receiver) {
      if (prop in target) {
        return Reflect.get(target, prop, receiver) as unknown;
      }
      if (typeof prop !== "string") return undefined;
      // The reused desktop git-review components call git/gh bridge methods
      // directly; forward each to the paired desktop over the passthrough API.
      if (isGitRemoteProcedure(prop)) {
        return (payload: unknown) => requireClient().gitCall(prop, payload);
      }
      // Watchers are desktop-only; resolve so manual-refresh paths don't reject.
      if (isGitRemoteNoopProcedure(prop)) {
        return () => Promise.resolve();
      }
      return () => Promise.reject(new Error(`"${prop}" is not available in a remote session.`));
    },
  }) as unknown as LightcodeBridge;
}

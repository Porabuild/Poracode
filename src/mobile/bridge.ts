import type {
  ClearPendingSteerPayload,
  CloseThreadPayload,
  ControlThreadGoalPayload,
  RefreshAgentScope,
  InterruptThreadPayload,
  ProfileIdentity,
  ProfileStatsRequest,
  ProjectNotes,
  ResizeTerminalPayload,
  ResolveThreadServerRequestPayload,
  SearchProjectFilesPayload,
  SearchProjectFilesResult,
  SendThreadInputPayload,
  SetPendingSteerPayload,
  StartShellPayload,
  StartThreadPayload,
  WriteTerminalPayload,
  ScheduledTaskInput,
} from "@/shared/contracts";
import type { BrowserState, BrowserTabInfo, PoracodeBridge } from "@/shared/ipc";
import {
  isGitRemoteNoopProcedure,
  isGitRemoteProcedure,
  type RemoteBrowserCommand,
  type RemoteRuntimeItemsPageRequest,
} from "@/shared/remote";
import { setRemoteLocalImageResolver } from "@/shared/localImageDisplay";
import { resolveLocalFileUrlPath } from "@/shared/promptContent";
import type { SharedSettingsInput } from "@/shared/settings";
import { useBrowserMirrorStore } from "./browserMirror";
import type { RemoteDesktopClient } from "./remoteClient";
import { pushDesktopSettingsDiff } from "./settingsSync";
import { applyAgentStatuses } from "./storeSync";

/**
 * Remote-session implementation of `window.poracode`. The desktop renderer
 * components reused by the PWA (ChatPane, ThreadComposerSection,
 * ThreadDraftView, …) call the bridge for thread mutations and shell
 * conveniences. Here those calls are routed to the paired desktop over the
 * remote HTTP API; everything desktop-only resolves to a benign empty result
 * or a rejected promise the callers already handle.
 */

let activeClient: RemoteDesktopClient | null = null;
/** Host OS of the paired desktop (`win32`/`darwin`/`linux`), when known. */
let hostPlatform: NodeJS.Platform | null = null;

/**
 * The remote session hook keeps this pointing at the active desktop.
 * Pass the desktop's advertised `platform` so host-gated features (Computer Use)
 * key off the paired machine, not the phone's user-agent.
 */
export function setRemoteBridgeClient(
  client: RemoteDesktopClient | null,
  platform?: NodeJS.Platform | null,
): void {
  activeClient = client;
  hostPlatform = client ? (platform ?? null) : null;
  // poracode-local <img> sources load only inside the desktop's Electron
  // shell; in the PWA, swap them for the desktop's authenticated HTTP image
  // endpoint at render time (see shared/localImageDisplay.ts).
  setRemoteLocalImageResolver(client ? (url) => remoteLocalImageUrl(client, url) : null);
}

/**
 * Maps a poracode-local image URL to the desktop's authenticated image
 * endpoint. The PWA has no `process.platform`, so the path decode keys off the
 * paired desktop's advertised platform when known, else just strips a leading
 * "/" before a Windows drive letter. Falls back to the original URL when the
 * client has no access token or the URL can't be parsed.
 */
function remoteLocalImageUrl(client: RemoteDesktopClient, url: string): string {
  try {
    const path = hostPlatform
      ? resolveLocalFileUrlPath(url, hostPlatform)
      : decodeLocalFileUrlPath(url);
    return client.localImageUrl(path) || url;
  } catch {
    return url;
  }
}

function decodeLocalFileUrlPath(url: string): string {
  const raw = decodeURIComponent(new URL(url).pathname);
  return /^\/[A-Za-z]:/.test(raw) ? raw.slice(1) : raw;
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

function detectClientPlatform(): NodeJS.Platform {
  const ua = navigator.userAgent;
  if (/Mac|iPhone|iPad|iPod/i.test(ua)) return "darwin";
  if (/Win/i.test(ua)) return "win32";
  return "linux";
}

/**
 * Prefer the paired desktop's OS. Fall back to the client UA only when the
 * server hasn't advertised a platform yet (older desktops / pre-pair).
 */
function resolveBridgePlatform(): NodeJS.Platform {
  if (hostPlatform === "win32" || hostPlatform === "darwin" || hostPlatform === "linux") {
    return hostPlatform;
  }
  return detectClientPlatform();
}

/** Copy a Uint8Array's bytes into a standalone ArrayBuffer for Blob/clipboard. */
function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(data.byteLength);
  new Uint8Array(buffer).set(data);
  return buffer;
}

async function pickBrowserFiles(options?: {
  readonly attachmentThreadId?: string;
  readonly filters?: readonly { readonly extensions: readonly string[] }[];
}): Promise<string[] | null> {
  if (!options?.attachmentThreadId) {
    throw new Error("Remote file selection requires an attachment destination.");
  }
  const attachmentThreadId = options.attachmentThreadId;
  const input = document.createElement("input");
  input.type = "file";
  input.multiple = true;
  const extensions = options.filters?.flatMap((filter) => filter.extensions) ?? [];
  if (extensions.length > 0) {
    input.accept = extensions.map((extension) => `.${extension.replace(/^\./, "")}`).join(",");
  }

  const files = await new Promise<File[]>((resolve) => {
    let settled = false;
    const finish = (selected: File[]) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(selected);
    };
    input.addEventListener("change", () => finish(Array.from(input.files ?? [])), { once: true });
    input.addEventListener("cancel", () => finish([]), { once: true });
    input.click();
  });
  if (files.length === 0) return null;

  const client = requireClient();
  return Promise.all(
    files.map(async (file) =>
      client.uploadAttachment({
        threadId: attachmentThreadId,
        fileName: file.name,
        data: new Uint8Array(await file.arrayBuffer()),
      }),
    ),
  );
}

const remoteBridge = {
  // Metadata reads. Analytics/diagnostics stay disabled in remote sessions.
  // `platform` is a getter so it tracks the paired desktop after connect.
  get platform(): NodeJS.Platform {
    return resolveBridgePlatform();
  },
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
  controlThreadGoal: (payload: ControlThreadGoalPayload) =>
    requireClient().controlThreadGoal(payload),
  writeTerminal: (payload: WriteTerminalPayload) => requireClient().writeTerminal(payload),
  resizeTerminal: (payload: ResizeTerminalPayload) => requireClient().resizeTerminal(payload),
  startThread: (payload: StartThreadPayload) => requireClient().startThread(payload),
  startShell: (payload: StartShellPayload) => requireClient().startShell(payload),
  closeThread: (payload: CloseThreadPayload) => requireClient().closeThread(payload.threadId),
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
  refreshProviderUsage: () => requireClient().providerUsage(),
  getUsageLoginState: () => Promise.resolve({ stored: {} }),
  dbGetProjectNotes: (projectId: string) => requireClient().projectNotes(projectId),
  dbSetProjectNotes: (notes: ProjectNotes) => requireClient().setProjectNotes(notes),
  refreshAgentStatuses: async (_wslDistros?: string[], _scope?: RefreshAgentScope) => {
    const statuses = await requireClient().agentStatuses();
    applyAgentStatuses(statuses);
    return {
      windows: statuses.windows,
      wsl: statuses.wsl,
    };
  },

  // Profile: identity + local usage stats, read from the paired desktop's
  // SQLite aggregation. copyShareImage is desktop-only (native clipboard) and
  // falls through to the rejecting proxy below.
  getProfileDevices: () => requireClient().profileDevices(),
  getProfileCoreStats: (req: ProfileStatsRequest) => requireClient().profileCoreStats(req),
  getProfileTokenStats: (req: ProfileStatsRequest) => requireClient().profileTokenStats(req),
  setProfileIdentity: (identity: ProfileIdentity) => requireClient().setProfileIdentity(identity),

  getSchedules: () => requireClient().schedules(),
  createSchedule: (task: ScheduledTaskInput) => requireClient().createSchedule(task),
  updateSchedule: ({ id, task }: { id: string; task: ScheduledTaskInput }) =>
    requireClient().updateSchedule(id, task),
  deleteSchedule: ({ id }: { id: string }) => requireClient().deleteSchedule(id),
  runScheduleNow: ({ id }: { id: string }) => requireClient().runScheduleNow(id),

  // Shared settings persist per device via the store's localStorage fallback.
  // Remote-editable keys (including persistent composer MCP enablement) are
  // additionally diffed and forwarded to the paired desktop — see settingsSync.ts.
  setSharedSettings: (settings: SharedSettingsInput) => {
    pushDesktopSettingsDiff(activeClient, settings);
    return Promise.resolve();
  },
  removeCrossagentRoutingOverride: () =>
    Promise.reject(new Error("Manual routing preferences can only be changed on desktop.")),

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
  pickFiles: pickBrowserFiles,
  saveClipboardImage: (payload: { threadId: string; data: Uint8Array; extension: string }) =>
    requireClient().uploadAttachment({
      threadId: payload.threadId,
      fileName: `Image.${payload.extension || "png"}`,
      data: payload.data,
    }),
  // Image copy/download use the browser clipboard and an anchor download in
  // place of the desktop's native clipboard and Save dialog.
  copyImageToClipboard: async ({ data }: { data: Uint8Array }): Promise<boolean> => {
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
      throw new Error("Browser clipboard image writes are not available.");
    }
    const blob = new Blob([toArrayBuffer(data)], { type: "image/png" });
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  },
  readLocalImageFile: async ({ url }: { url: string }): Promise<Uint8Array> => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to load image (${response.status})`);
    return new Uint8Array(await response.arrayBuffer());
  },
  saveImageFile: ({
    data,
    suggestedName,
  }: {
    data: Uint8Array;
    suggestedName: string;
  }): Promise<string | null> => {
    const url = URL.createObjectURL(new Blob([toArrayBuffer(data)]));
    const link = document.createElement("a");
    link.href = url;
    link.download = suggestedName;
    link.rel = "noopener";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    return Promise.resolve(null);
  },
  searchProjectFiles: (payload: SearchProjectFilesPayload) =>
    requireClient().gitCall("searchProjectFiles", payload) as Promise<SearchProjectFilesResult>,
  getAgentHookPluginStatuses: () => Promise.resolve([]),

  // Runtime history hydration is fed by the remote sync layer instead of the
  // local DB. The selected thread's tail arrives with its snapshot; older
  // pages are fetched lazily when ChatPane reaches the start.
  dbGetThreadRuntimeItems: () => Promise.resolve([]),
  dbGetThreadRuntimeItemsPage: (payload: RemoteRuntimeItemsPageRequest) =>
    payload.beforePosition === undefined
      ? Promise.resolve({ items: [], nextCursor: null })
      : requireClient().threadRuntimeItemsPage(payload),
  dbTruncateThreadRuntimeAfter: () => Promise.resolve(),
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
  browserMoveTab: async (payload: {
    tabId: string;
    targetTabId: string;
    position: "before" | "after";
  }) => {
    await runBrowserCommand({
      kind: "move-tab",
      tabId: payload.tabId,
      targetTabId: payload.targetTabId,
      position: payload.position,
    });
  },

  // Event subscriptions: remote events arrive over the WebSocket instead.
  onSupervisorEvent: () => () => undefined,
  onUpdateStatus: () => () => undefined,
  onBrowserEvent: () => () => undefined,
  onRemoteThreadCommand: () => () => undefined,
  onSharedSettingsChanged: () => () => undefined,
  onThreadOpenRequested: () => () => undefined,
};

export function installRemoteBridge(): void {
  if (typeof window === "undefined" || window.poracode !== undefined) return;
  window.poracode = new Proxy(remoteBridge, {
    get(target, prop, receiver) {
      if (prop in target) {
        return Reflect.get(target, prop, receiver) as unknown;
      }
      if (typeof prop !== "string") return undefined;
      // Optional bridge metadata is genuinely unavailable in a browser. Do not
      // expose the missing value as the generic unavailable-method fallback.
      if (prop === "homeDir") return undefined;
      // Reused/mobile desktop-backed surfaces call bridge methods directly;
      // forward allowlisted git/gh/project-tree calls to the paired desktop.
      if (isGitRemoteProcedure(prop)) {
        return (payload: unknown) => requireClient().gitCall(prop, payload);
      }
      // Watchers are desktop-only; resolve so manual-refresh paths don't reject.
      if (isGitRemoteNoopProcedure(prop)) {
        return () => Promise.resolve();
      }
      return () => Promise.reject(new Error(`"${prop}" is not available in a remote session.`));
    },
  }) as unknown as PoracodeBridge;
}

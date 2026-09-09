import { REMOTE_BROWSER_FORWARD_VERSION } from "@/shared/remote/protocol";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { msg } from "@lingui/core/macro";
import { toast } from "@heroui/react";
import type { BrowseHostDirectoryResult, Thread, TerminalSize } from "@/shared/contracts";
import { friendlyError, msg as sharedMsg } from "@/shared/messages";
import {
  isRemoteTransportFailure,
  isUnauthorizedRemoteError,
  RemoteClientError,
  RemoteDesktopClient,
} from "@/shared/remote/client";
import {
  isUnauthorizedRemoteSocketClose,
  REMOTE_SOCKET_POLICY,
  RemoteSocketHealthMonitor,
  RemoteSocketReconnectPolicy,
} from "@/shared/remote/socketPolicy";
import { waitForRemoteThreadAppearance } from "@/shared/remote/threadAppearance";
import { filterKnownRemoteAccessScopes, REMOTE_STANDARD_SCOPES } from "@/shared/remote";
import { readBridge } from "@/renderer/bridge";
import { readClientRuntime } from "@/renderer/clientRuntime";
import { i18n } from "@/renderer/i18n/i18n";
import { setRemoteBridgeClient } from "@/renderer/browser/remoteBridge";
import {
  handleBrowserServerMessage,
  setBrowserSocketSender,
} from "@/renderer/browser/browserMirror";
import { applyDesktopSettings, resetDesktopSettings } from "@/renderer/browser/remoteSettingsSync";
import {
  registerRemoteProcedureHost,
  releaseRemoteTerminal,
  releaseRemoteTerminalsForServer,
  remoteTerminalOwner,
  resetRemoteProcedureRouterForTest,
} from "@/renderer/remoteProcedureRouter";
import {
  applyThreadSnapshot,
  collectRuntimeEventsFromSupervisoryMessage,
  dispatchRemoteSupervisorEvent,
  type ApplyThreadSnapshotResult,
} from "@/renderer/state/remote";
import { snapshotOlderThanAppliedSeq } from "@/renderer/state/remote/snapshotSeqArbitration";
import {
  finishTruncateReload,
  getTruncateNeededSeq,
  isTruncateCheckpointLoaded,
  isTruncateReloadLeaseCurrent,
  listPendingTruncateReloads,
  noteTruncateNeeded,
  recordAuthoritativeHistoryInstall,
  resetTruncateRecoveryEpoch,
  resetTruncateReloadBackoff,
  shouldSuppressTruncatedReplay,
  tryBeginTruncateReload,
  __resetTruncateRecoveryForTest,
} from "@/renderer/state/remote/truncateRecovery";
import { useAppStore } from "@/renderer/state/appStore";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import {
  runtimePageOverlapsExistingTranscript,
  seedOlderThreadRuntimeItemsCursor,
} from "@/renderer/state/chatRuntimePersister";
import {
  projectRemoteThread,
  projectRemoteThreadEvent,
  projectRemoteThreadSnapshot,
  remoteOwner,
  remoteProjectId,
  remoteThreadId,
  unprojectRemoteThreadMentionSegments,
} from "@/renderer/state/remoteProjection";
import {
  emitRemoteTerminalExited,
  emitRemoteTerminalReset,
  handleRemoteTerminalServerMessage,
  resetRemoteTerminalFeed,
  setRemoteTerminalSocketSender,
} from "@/renderer/state/remoteTerminalFeed";
import { pickAndUploadBrowserFiles } from "@/renderer/utils/browserFilePicker";
import { noteShellExited } from "@/renderer/utils/shellStartRegistry";
import {
  createTerminalFeedConnections,
  prepareTerminalConnection,
  terminalCapabilitiesFromEnvironment,
  type TerminalConnectionCapabilities,
} from "@/renderer/state/remoteServers/terminalCapabilities";
import {
  filterRemoteThreadEvents,
  shouldRefreshRemoteAgentStatusesAfterEvent,
  shouldRefreshRemoteServerAfterEvent,
} from "@/renderer/state/remoteServers/eventRouting";
import { syncRemoteGitSummaries } from "@/renderer/state/remoteServers/gitSummaries";
import { waitForHostUpdateReconnect } from "@/renderer/state/remoteServers/hostUpdateReconnect";
import { mainProcessFetch } from "@/renderer/state/remoteServers/mainProcessFetch";
import {
  persistedRemoteServersState,
  removeCachedProjects,
  replaceCachedProjects,
} from "@/renderer/state/remoteServers/projectCache";
import {
  clearRemoteGitState,
  syncRemoteGitStatePatch,
  syncRemoteGitStateSnapshot,
} from "@/renderer/state/remoteServers/gitState";
import { withRemoteProjectSync } from "@/renderer/state/remoteServers/projectSync";
import { syncRemoteAppRows, removeRemoteAppRows } from "@/renderer/state/remoteServers/appRows";
import type {
  OpenRemoteThread,
  RemoteClientFactory,
  RemoteServerRecord,
  RemoteServerRuntime,
  RemoteServersState,
  RemoteSocketFactory,
  RemoteSocketLike,
  RemoteThreadLaunchResult,
} from "@/renderer/state/remoteServers/types";
import { createSecureRemoteServersStorage } from "@/renderer/state/remoteServers/secureStorage";

/**
 * Desktop-as-client. Lets the Electron desktop connect to *other* Poracode
 * servers (another desktop's remote access, or a headless `pnpm run server`)
 * and surface their projects in the sidebar — the mirror image of the PWA,
 * which connects to a single desktop. See docs/REMOTE_ARCHITECTURE.md, Phase 4.
 *
 * Connection bookkeeping (endpoint + bearer token + label) is persisted to
 * localStorage; live snapshot data is kept in memory and re-fetched on connect.
 */
function reuseRemoteRows<T extends { readonly id: string }>(current: T[], incoming: T[]): T[] {
  if (current.length === 0) return incoming.length === 0 ? current : incoming;
  const currentById = new Map(current.map((row) => [row.id, row]));
  let changed = current.length !== incoming.length;
  const next = incoming.map((row, index) => {
    const existing = currentById.get(row.id);
    const resolved = existing && JSON.stringify(existing) === JSON.stringify(row) ? existing : row;
    if (resolved !== current[index]) changed = true;
    return resolved;
  });
  return changed ? next : current;
}

/**
 * A debounced snapshot GET is built on the server before events the live
 * socket applies while it is in flight; when it resolves it must not move
 * those threads backwards. For every thread the live stream has already
 * moved past this snapshot (its applied seq is newer): keep the current row
 * in place of the snapshot's older row, and re-append the row when the stale
 * snapshot omits the thread entirely. The returned ids also let the app-row
 * sync leave those threads' live mirrored rows untouched (the app-store row,
 * not the cached HTTP row, is what the user is looking at). A snapshot at or
 * past the applied seq — including one built after a later server-side
 * deletion, whose seq is newer than any event this client applied — is
 * authoritative and applies unchanged.
 */
function reconcileThreadRowsWithAppliedEvents(
  desktopId: string,
  snapshotSeq: number,
  incoming: Thread[],
  current: readonly Thread[],
): { rows: Thread[]; staleThreadIds: ReadonlySet<string> } {
  const currentById = new Map(current.map((thread) => [thread.id, thread]));
  const staleThreadIds = new Set<string>();
  const isStale = (threadId: string): boolean =>
    snapshotOlderThanAppliedSeq(snapshotSeq, remoteThreadAppliedSeq(desktopId, threadId));
  let changed = false;
  const rows = incoming.map((thread) => {
    if (!isStale(thread.id)) return thread;
    const existing = currentById.get(thread.id);
    if (!existing) return thread;
    staleThreadIds.add(thread.id);
    changed = true;
    return existing;
  });
  const incomingIds = new Set(incoming.map((thread) => thread.id));
  for (const thread of current) {
    if (incomingIds.has(thread.id) || !isStale(thread.id)) continue;
    staleThreadIds.add(thread.id);
    changed = true;
    rows.push(thread);
  }
  return { rows: changed ? rows : incoming, staleThreadIds };
}

const defaultClientFactory: RemoteClientFactory = (endpoint, accessToken) =>
  new RemoteDesktopClient(endpoint, accessToken, mainProcessFetch);

const defaultSocketFactory: RemoteSocketFactory = (url) =>
  new WebSocket(url) as unknown as RemoteSocketLike;

let openRemoteThreadRequestSeq = 0;

/** In-flight connectAll(), so concurrent callers coalesce onto one pass. */
let connectAllInFlight: Promise<void> | null = null;
let desktopBrowserBridgeServerId: string | null = null;
let desktopBrowserBridgeClientKey: string | null = null;
let desktopBrowserMirrorSocket: RemoteSocketLike | null = null;

export function selectBrowserBridgeServer(
  state: RemoteServersState,
): RemoteServerRecord | undefined {
  const onlineServers = state.servers.filter(
    (server) => state.runtime[server.desktopId]?.status === "online",
  );
  const sameOriginServer = onlineServers.find((server) => {
    try {
      return new URL(server.endpoint).origin === window.location.origin;
    } catch {
      return false;
    }
  });
  const currentServer = onlineServers.find(
    (server) => server.desktopId === desktopBrowserBridgeServerId,
  );
  return currentServer ?? sameOriginServer ?? onlineServers[0];
}

/** Explicitly scope browser-backed machine settings and shared remote RPCs. */
export function selectBrowserBridgeDesktop(desktopId: string): void {
  desktopBrowserBridgeServerId = desktopId;
  desktopBrowserBridgeClientKey = null;
  syncDesktopBrowserBridgeClient(useRemoteServersStore.getState());
}

function selectBrowserBridgeClientServer(
  state: RemoteServersState,
): RemoteServerRecord | undefined {
  return (
    selectBrowserBridgeServer(state) ??
    state.servers.find((server) => server.desktopId === desktopBrowserBridgeServerId)
  );
}

/** Browser webContents are available locally in Electron and remotely only
 * when the selected browser transport terminates at an Electron desktop host. */
export function selectBrowserPanelAvailable(state: RemoteServersState): boolean {
  if (typeof window === "undefined") return false;
  if (!window.poracodeHost && !window.poracode) return true;
  const runtime = readClientRuntime();
  if (runtime.host === "electron") return runtime.capabilities.nativeBrowserWebContents;
  const selected = selectBrowserBridgeServer(state);
  return selected !== undefined && selected.hostMode !== "helper";
}

function syncDesktopBrowserBridgeClient(state: RemoteServersState): void {
  if (typeof window === "undefined" || (!window.poracodeHost && !window.poracode)) return;
  const runtime = readClientRuntime();
  if (runtime.host !== "browser") return;

  const server = selectBrowserBridgeClientServer(state);
  const socket = server ? (remoteServerEventSockets.get(server.desktopId)?.socket ?? null) : null;
  if (desktopBrowserMirrorSocket !== socket) {
    desktopBrowserMirrorSocket = socket;
    setBrowserSocketSender(
      socket?.send
        ? (message) => {
            if (remoteServerEventSockets.get(server?.desktopId ?? "")?.socket !== socket) {
              return false;
            }
            try {
              socket.send?.(JSON.stringify(message));
              return true;
            } catch {
              return false;
            }
          }
        : null,
    );
  }
  if (!server) {
    desktopBrowserBridgeServerId = null;
    desktopBrowserBridgeClientKey = null;
    setRemoteBridgeClient(null);
    resetDesktopSettings();
    useAgentStatusesStore.getState().setAgentStatuses([]);
    useAgentStatusesStore.getState().setWslAgentStatuses([]);
    return;
  }
  const agentStatuses = state.runtime[server.desktopId]?.agentStatuses;
  if (agentStatuses) {
    useAgentStatusesStore.getState().setAgentStatuses(agentStatuses.windows);
    useAgentStatusesStore.getState().setWslAgentStatuses(agentStatuses.wsl);
  }
  const clientKey = `${server.desktopId}\0${server.endpoint}\0${server.accessToken}\0${server.platform ?? ""}`;
  if (desktopBrowserBridgeClientKey === clientKey) return;
  desktopBrowserBridgeServerId = server.desktopId;
  desktopBrowserBridgeClientKey = clientKey;
  const client = state.clientFactory(server.endpoint, server.accessToken);
  setRemoteBridgeClient(client, server.platform ?? null);
  resetDesktopSettings();
  void client
    .settings()
    .then((settings) => {
      if (desktopBrowserBridgeClientKey === clientKey) applyDesktopSettings(settings);
    })
    .catch(() => {
      if (desktopBrowserBridgeClientKey === clientKey) resetDesktopSettings();
    });
}

interface RemoteServerEventSocketEntry {
  readonly serverKey: string;
  socket: RemoteSocketLike | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  readonly reconnectPolicy: RemoteSocketReconnectPolicy;
  connecting: boolean;
  connectTimeout: ReturnType<typeof setTimeout> | null;
  healthPingInterval: ReturnType<typeof setInterval> | null;
  health: RemoteSocketHealthMonitor<RemoteSocketLike> | null;
}

const remoteServerEventSockets = new Map<string, RemoteServerEventSocketEntry>();
const remoteServerSnapshotSeqByDesktopId = new Map<string, number>();
/**
 * Highest event seq applied per thread from each server's live stream. The
 * resume watermark above is per server, so it cannot arbitrate one thread's
 * snapshot writes: an unrelated thread's newer event would wrongly freeze it.
 * Keyed [desktopId][remoteThreadId]; shares the watermark's lifecycle.
 */
const remoteThreadAppliedSeqByDesktopId = new Map<string, Map<string, number>>();
const remoteServerThreadItemInterests = new Map<string, readonly string[]>();
const remoteServerIdentityGenerationByDesktopId = new Map<string, number>();

function currentRemoteServerGeneration(desktopId: string): number {
  return remoteServerIdentityGenerationByDesktopId.get(desktopId) ?? 0;
}

function bumpRemoteServerGeneration(desktopId: string): void {
  remoteServerIdentityGenerationByDesktopId.set(
    desktopId,
    currentRemoteServerGeneration(desktopId) + 1,
  );
}

function recordRemoteThreadAppliedSeq(desktopId: string, threadId: string, seq: number): void {
  let byThread = remoteThreadAppliedSeqByDesktopId.get(desktopId);
  if (!byThread) {
    byThread = new Map();
    remoteThreadAppliedSeqByDesktopId.set(desktopId, byThread);
  }
  if ((byThread.get(threadId) ?? 0) >= seq) return;
  byThread.set(threadId, seq);
}

function remoteThreadAppliedSeq(desktopId: string, threadId: string): number | undefined {
  return remoteThreadAppliedSeqByDesktopId.get(desktopId)?.get(threadId);
}

function clearRemoteThreadAppliedSeqs(desktopId: string): void {
  remoteThreadAppliedSeqByDesktopId.delete(desktopId);
}

/** Thread ids a supervisor event frame touches: the supervisory field, or the
 * per-thread batches of a multi frame. */
function supervisorEventThreadIds(event: unknown): readonly string[] {
  if (!event || typeof event !== "object") return [];
  const record = event as { threadId?: unknown; batches?: unknown };
  if (typeof record.threadId === "string") return [record.threadId];
  if (!Array.isArray(record.batches)) return [];
  const threadIds: string[] = [];
  for (const batch of record.batches) {
    const batchThreadId = (batch as { threadId?: unknown } | null)?.threadId;
    if (typeof batchThreadId === "string") threadIds.push(batchThreadId);
  }
  return threadIds;
}

function sameRemoteServerThreadItemInterests(
  left: readonly string[] | undefined,
  right: readonly string[],
): boolean {
  return (
    left?.length === right.length && left.every((threadId, index) => threadId === right[index])
  );
}

function setRemoteServerThreadItemInterests(
  desktopId: string,
  threadIds: readonly string[],
  forceSend = false,
): void {
  const existing = remoteServerThreadItemInterests.get(desktopId);
  remoteServerThreadItemInterests.set(desktopId, threadIds);
  if (!forceSend && sameRemoteServerThreadItemInterests(existing, threadIds)) return;
  const socket = remoteServerEventSockets.get(desktopId)?.socket;
  if (!socket?.send) return;
  try {
    socket.send(JSON.stringify({ type: "thread-item-interests", threadIds }));
  } catch {
    // A connecting socket receives the latest interests from activateSocket.
  }
}

/**
 * Register one more thread whose runtime item content this client wants
 * forwarded. Interests are a per-server set, not a single exclusive thread:
 * several remote panes can be visible at once (desktop split panes), and a
 * pane's live feed must survive another pane's open the same way the last
 * explicit open already survives a pane close.
 */
function addRemoteServerThreadItemInterest(desktopId: string, threadId: string): void {
  const existing = remoteServerThreadItemInterests.get(desktopId);
  if (existing?.includes(threadId)) return;
  setRemoteServerThreadItemInterests(desktopId, existing ? [...existing, threadId] : [threadId]);
}

function removeRemoteServerThreadItemInterest(desktopId: string, threadId: string): void {
  const existing = remoteServerThreadItemInterests.get(desktopId);
  if (!existing?.includes(threadId)) return;
  setRemoteServerThreadItemInterests(
    desktopId,
    existing.filter((candidate) => candidate !== threadId),
  );
}

function setHydratingRemoteServerThreadItemInterest(
  desktopId: string,
  threadId: string,
  previousOpenThread: OpenRemoteThread | null,
): void {
  if (previousOpenThread) {
    addRemoteServerThreadItemInterest(previousOpenThread.desktopId, previousOpenThread.threadId);
  }
  addRemoteServerThreadItemInterest(desktopId, threadId);
}

/** Maps a thread-history snapshot to the openThread slice (terminal fields only when present). */
function buildOpenThread(
  desktopId: string,
  snapshot: {
    readonly thread: Thread;
    readonly terminalScrollback?: string | undefined;
    readonly terminalSize?: TerminalSize | undefined;
  },
): OpenRemoteThread {
  const projectedThread = projectRemoteThread(desktopId, snapshot.thread);
  return {
    desktopId,
    threadId: snapshot.thread.id,
    thread: projectedThread,
    ...(snapshot.terminalScrollback !== undefined
      ? { terminalScrollback: snapshot.terminalScrollback }
      : {}),
    ...(snapshot.terminalSize ? { terminalSize: snapshot.terminalSize } : {}),
  };
}

function clearRemoteServerEventSocketHealth(entry: RemoteServerEventSocketEntry): void {
  if (entry.healthPingInterval) {
    clearInterval(entry.healthPingInterval);
    entry.healthPingInterval = null;
  }
  entry.health?.reset();
}

function clearRemoteServerEventSocketConnectTimeout(entry: RemoteServerEventSocketEntry): void {
  if (!entry.connectTimeout) return;
  clearTimeout(entry.connectTimeout);
  entry.connectTimeout = null;
}

function closeRemoteServerEventSocket(desktopId: string): void {
  // A pending debounced snapshot refresh for this server is now moot; cancel it
  // so a closed/removed server never fires a late GET (finding #5).
  clearRemoteServerRefreshTimer(desktopId);
  const entry = remoteServerEventSockets.get(desktopId);
  if (!entry) return;
  remoteServerEventSockets.delete(desktopId);
  remoteServerSnapshotSeqByDesktopId.delete(desktopId);
  clearRemoteThreadAppliedSeqs(desktopId);
  resetTruncateRecoveryEpoch(desktopId);
  remoteServerRowResyncPendingByDesktopId.delete(desktopId);
  if (entry.reconnectTimer) {
    clearTimeout(entry.reconnectTimer);
    entry.reconnectTimer = null;
  }
  clearRemoteServerEventSocketConnectTimeout(entry);
  clearRemoteServerEventSocketHealth(entry);
  resetRemoteTerminalFeed(desktopId);
  if (!entry.socket) return;
  try {
    entry.socket.close();
  } catch {
    // already closed
  }
  entry.socket = null;
}

function closeAllRemoteServerEventSockets(): void {
  for (const desktopId of [...remoteServerEventSockets.keys()]) {
    closeRemoteServerEventSocket(desktopId);
  }
}

// ── Per-server snapshot refresh: coalesced + debounced ──────────────
// Route qualifying events through one per-desktopId debounced scheduler (mirrors
// the PWA's 600ms) so a burst yields a single GET, and tag each in-flight refresh
// with a monotonic request id so a stale response never overwrites a newer one.
const REMOTE_SERVER_REFRESH_DEBOUNCE_MS = 600;
const remoteServerRefreshTimers = new Map<string, ReturnType<typeof setTimeout>>();
const remoteServerRefreshSeqByDesktopId = new Map<string, number>();
/**
 * Set on `resync-required`: the client may have missed events, so the next
 * refresh re-mirrors the snapshot rows into the app store even when the HTTP
 * cache already matches them (live event rows can be ahead of the cache in
 * exactly the way a restart loses).
 */
const remoteServerRowResyncPendingByDesktopId = new Set<string>();
const remoteServerAgentStatusRefreshes = new Set<string>();
const remoteHostUpdateReconnectSeqByDesktopId = new Map<string, number>();
const remoteHostUpdateRequestSeqByDesktopId = new Map<string, number>();
let remoteHostUpdateSequence = 0;

function nextRemoteHostUpdateSequence(): number {
  remoteHostUpdateSequence += 1;
  return remoteHostUpdateSequence;
}

function clearRemoteServerRefreshTimer(desktopId: string): void {
  const timer = remoteServerRefreshTimers.get(desktopId);
  if (timer) {
    clearTimeout(timer);
    remoteServerRefreshTimers.delete(desktopId);
  }
  remoteServerAgentStatusRefreshes.delete(desktopId);
}

function invalidateRemoteServerRefresh(desktopId: string): void {
  clearRemoteServerRefreshTimer(desktopId);
  remoteServerRefreshSeqByDesktopId.set(
    desktopId,
    (remoteServerRefreshSeqByDesktopId.get(desktopId) ?? 0) + 1,
  );
}

function normalizeEndpoint(raw: string): string {
  const trimmed = raw.trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  // Normalize to an origin with a trailing slash so relative URLs resolve.
  return new URL(withScheme).toString();
}

export const useRemoteServersStore = create<RemoteServersState>()(
  persist(
    (set, get) => {
      const setRemoteServerFailure = (
        desktopId: string,
        status: "offline" | "error",
        message: string,
      ) => {
        const previous = get().runtime[desktopId]?.status;
        set((state) => {
          const current = state.runtime[desktopId];
          if (!current) return {};
          if (current.status === status && current.message === message) return state;
          return {
            runtime: { ...state.runtime, [desktopId]: { ...current, status, message } },
          };
        });
        // Offline/error drops re-arm unknown-checkpoint reload budgets without
        // clearing installed authoritative baselines (transport flap, not a
        // server restart).
        if (previous !== status) resetTruncateReloadBackoff(desktopId);
        syncDesktopBrowserBridgeClient(get());
      };

      /** Surface a remote-server action failure without ever rejecting: toast it
       * and reflect the server's runtime status/message so the sidebar shows it
       * offline/errored. The renderer's global unhandledrejection handler would
       * otherwise crash-screen on any stray rejection from a `void action(...)`. */
      const reportRemoteServerError = (desktopId: string, error: unknown, fallback: string) => {
        const message = friendlyError(error) || fallback;
        toast.danger(message);
        setRemoteServerFailure(
          desktopId,
          isRemoteTransportFailure(error) ? "offline" : "error",
          message,
        );
      };

      /** Resolve the paired server and build a client for it, or throw the
       * shared "not found" error the action callers already surface. An
       * offline runtime is deliberately still probeable: explicit refresh and
       * retry actions are how a paired server proves it has recovered. */
      const requireClient = (desktopId: string): RemoteDesktopClient => {
        const state = get();
        const server = state.servers.find((entry) => entry.desktopId === desktopId);
        if (!server) throw new Error(i18n._(msg`Remote server not found.`));
        return state.clientFactory(server.endpoint, server.accessToken);
      };

      const withClient = async <Result>(
        desktopId: string,
        invoke: (client: RemoteDesktopClient) => Promise<Result>,
      ): Promise<Result> => {
        try {
          const result = await invoke(requireClient(desktopId));
          const status = get().runtime[desktopId]?.status;
          if (status === "error" || status === "offline") {
            set((state) => {
              const current = state.runtime[desktopId];
              if (current?.status !== "error" && current?.status !== "offline") return {};
              return {
                runtime: {
                  ...state.runtime,
                  [desktopId]: {
                    status: "online",
                    projects: current.projects,
                    threads: current.threads,
                    ...(current.agentStatuses ? { agentStatuses: current.agentStatuses } : {}),
                  },
                },
              };
            });
            // Reactivation re-arms bounded reloads (offline cleared them, but
            // an explicit success proves reachability again).
            resetTruncateReloadBackoff(desktopId);
            syncDesktopBrowserBridgeClient(get());
          }
          return result;
        } catch (error) {
          if (!isRemoteTransportFailure(error)) {
            throw error;
          }
          const message = sharedMsg("remote.server.unreachable");
          if (get().runtime[desktopId]?.status !== "connecting") {
            setRemoteServerFailure(desktopId, "offline", message);
          }
          throw new Error(message, { cause: error });
        }
      };

      const checkHostUpdateInBackground = (server: RemoteServerRecord): void => {
        if (server.hostMode === "helper" || !server.scopes.includes("projects:manage")) return;
        const requestSeq = nextRemoteHostUpdateSequence();
        remoteHostUpdateRequestSeqByDesktopId.set(server.desktopId, requestSeq);
        void get()
          .clientFactory(server.endpoint, server.accessToken)
          .checkHostUpdate()
          .then((update) => {
            if (remoteHostUpdateRequestSeqByDesktopId.get(server.desktopId) !== requestSeq) return;
            set((state) => ({
              hostUpdates: { ...state.hostUpdates, [server.desktopId]: update },
            }));
          })
          .catch(() => undefined);
      };

      const terminalConnections = createTerminalFeedConnections(
        setRemoteTerminalSocketSender,
        (desktopId, socket) => remoteServerEventSockets.get(desktopId)?.socket === socket,
      );
      const activateRemoteTerminalFeed = terminalConnections.activate;

      const startRemoteServerEventStream = async (
        server: RemoteServerRecord,
        initialCapabilities?: TerminalConnectionCapabilities,
      ): Promise<void> => {
        const serverKey = `${server.endpoint}\0${server.accessToken}`;
        const existing = remoteServerEventSockets.get(server.desktopId);
        if (existing?.serverKey === serverKey) return;

        closeRemoteServerEventSocket(server.desktopId);
        const entry: RemoteServerEventSocketEntry = {
          serverKey,
          socket: null,
          reconnectTimer: null,
          reconnectPolicy: new RemoteSocketReconnectPolicy(),
          connecting: false,
          connectTimeout: null,
          healthPingInterval: null,
          health: null,
        };
        remoteServerEventSockets.set(server.desktopId, entry);
        let resyncInFlight = false;

        const isCurrent = () =>
          remoteServerEventSockets.get(server.desktopId) === entry &&
          get().servers.some((candidate) => candidate.desktopId === server.desktopId);

        const setSocketStatus = (status: "connecting" | "online") => {
          set((state) => {
            const current = state.runtime[server.desktopId];
            if (!current || (current.status === status && current.message === undefined)) return {};
            return {
              runtime: {
                ...state.runtime,
                [server.desktopId]: {
                  status,
                  projects: current.projects,
                  threads: current.threads,
                  ...(current.agentStatuses ? { agentStatuses: current.agentStatuses } : {}),
                },
              },
            };
          });
          syncDesktopBrowserBridgeClient(get());
        };

        const scheduleReconnect = (minimumDelayMs = 0) => {
          if (!isCurrent()) return;
          if (get().runtime[server.desktopId]?.status === "online") {
            setSocketStatus("connecting");
          }
          if (entry.reconnectTimer) clearTimeout(entry.reconnectTimer);
          const delay = Math.max(entry.reconnectPolicy.nextDelay(), minimumDelayMs);
          entry.reconnectTimer = setTimeout(() => {
            entry.reconnectTimer = null;
            void connect();
          }, delay);
        };

        const disconnectSocket = (socket: RemoteSocketLike) => {
          if (!isCurrent() || entry.socket !== socket) return;
          entry.socket = null;
          clearRemoteServerEventSocketConnectTimeout(entry);
          clearRemoteServerEventSocketHealth(entry);
          setRemoteTerminalSocketSender(server.desktopId, null);
          syncDesktopBrowserBridgeClient(get());
          scheduleReconnect();
        };

        const forceReconnect = (socket: RemoteSocketLike) => {
          disconnectSocket(socket);
          try {
            socket.close();
          } catch {
            // already closed
          }
        };

        entry.health = new RemoteSocketHealthMonitor({
          isCurrent: (socket) => isCurrent() && entry.socket === socket,
          isOpen: (socket) =>
            typeof socket.send === "function" &&
            (socket.readyState === undefined || socket.readyState === 1),
          send: (socket, payload) => socket.send?.(payload),
          onDead: forceReconnect,
        });

        const startHealthProbe = (socket: RemoteSocketLike) => {
          clearRemoteServerEventSocketHealth(entry);
          const sendHealthPing = () => {
            entry.health?.probe(socket);
          };
          entry.healthPingInterval = setInterval(
            sendHealthPing,
            REMOTE_SOCKET_POLICY.healthPingIntervalMs,
          );
        };

        // Consume a freshly fetched descriptor only for the first socket;
        // later automatic reconnects revalidate capabilities from the host.
        let connectionCapabilitiesSeed = initialCapabilities;
        const connect = async () => {
          if (!isCurrent() || entry.connecting || entry.socket) return;
          entry.connecting = true;
          try {
            const client = get().clientFactory(server.endpoint, server.accessToken);
            const seed = connectionCapabilitiesSeed;
            connectionCapabilitiesSeed = undefined;
            const { ticket, capabilities } = await prepareTerminalConnection(client, seed);
            if (!isCurrent()) return;
            const lastSeenSeq = remoteServerSnapshotSeqByDesktopId.get(server.desktopId) ?? 0;
            const openThread = get().openThread;
            const threadItemInterests =
              remoteServerThreadItemInterests.get(server.desktopId) ??
              (openThread?.desktopId === server.desktopId ? [openThread.threadId] : []);
            const socket = get().socketFactory(
              client.websocketUrl(ticket, lastSeenSeq, { threadItemInterests }),
            );
            if (!isCurrent()) {
              try {
                socket.close();
              } catch {
                // already closed
              }
              return;
            }
            terminalConnections.remember(socket, capabilities);
            entry.socket = socket;
            entry.connectTimeout = setTimeout(() => {
              forceReconnect(socket);
            }, REMOTE_SOCKET_POLICY.connectTimeoutMs);
            const requestTruncateAuthoritativeReload = (
              targetRemoteThreadId: string,
              eventSeq: number,
            ): void => {
              if (get().runtime[server.desktopId]?.status !== "online") return;
              if (!get().servers.some((candidate) => candidate.desktopId === server.desktopId)) {
                return;
              }
              noteTruncateNeeded(server.desktopId, targetRemoteThreadId, eventSeq);
              const lease = tryBeginTruncateReload(server.desktopId, targetRemoteThreadId);
              if (!lease) return;
              void (async () => {
                let snapshot: Awaited<ReturnType<RemoteDesktopClient["threadHistory"]>>;
                try {
                  snapshot = await get()
                    .clientFactory(server.endpoint, server.accessToken)
                    .threadHistory(targetRemoteThreadId);
                } catch {
                  finishTruncateReload(lease, null);
                  return;
                }
                if (!isCurrent() || entry.socket !== socket) {
                  finishTruncateReload(lease, null);
                  return;
                }
                if (!isTruncateReloadLeaseCurrent(lease)) return;
                const applied: ApplyThreadSnapshotResult = applyThreadSnapshot(
                  projectRemoteThreadSnapshot(server.desktopId, snapshot),
                  {
                    fromServer: true,
                    lastSeenEventSeq: remoteThreadAppliedSeq(
                      server.desktopId,
                      targetRemoteThreadId,
                    ),
                  },
                );
                if (applied.installedAuthoritativeHistory) {
                  recordAuthoritativeHistoryInstall(
                    server.desktopId,
                    targetRemoteThreadId,
                    snapshot.snapshotSeq,
                  );
                }
                remoteServerSnapshotSeqByDesktopId.set(
                  server.desktopId,
                  Math.max(
                    remoteServerSnapshotSeqByDesktopId.get(server.desktopId) ?? 0,
                    snapshot.snapshotSeq,
                  ),
                );
                const outcome = finishTruncateReload(lease, {
                  installed: applied.installedAuthoritativeHistory,
                  snapshotSeq: snapshot.snapshotSeq,
                });
                if (!outcome.stale && !outcome.covered) {
                  const needed = getTruncateNeededSeq(server.desktopId, targetRemoteThreadId);
                  if (needed !== undefined) {
                    requestTruncateAuthoritativeReload(targetRemoteThreadId, needed);
                  }
                }
              })();
            };
            const resumePendingTruncateReloads = (): void => {
              // A failed authoritative reload keeps its pending seq for a
              // deduped follow-up, and offline/online backoff resets preserve
              // it while re-arming the bounded budget — but nothing restarted
              // it on the next healthy reconnect. A regular WS resume without
              // `resync-required` leaves the stale transcript in place forever
              // (the truncation event already advanced the resume cursor and
              // will never repeat, and the restore hook skips its open when
              // the global openThread already matches). Restart outstanding
              // recoveries here, on the real online transition, through the
              // same owned + bounded gate so a replacement lease is never
              // cleared by a stale completion and exhausted budgets stay
              // parked without a fetch storm. Only still-subscribed threads
              // of the current server restart; unsubscribed pending stays
              // queued until its thread resubscribes (its open fetches fresh
              // history then).
              if (!isCurrent() || entry.socket !== socket) return;
              if (get().runtime[server.desktopId]?.status !== "online") return;
              if (!get().servers.some((candidate) => candidate.desktopId === server.desktopId)) {
                return;
              }
              const open = get().openThread;
              const interests = remoteServerThreadItemInterests.get(server.desktopId) ?? [];
              const subscribed = new Set<string>(interests);
              if (open?.desktopId === server.desktopId) subscribed.add(open.threadId);
              for (const pending of listPendingTruncateReloads(server.desktopId)) {
                if (!subscribed.has(pending.remoteThreadId)) continue;
                requestTruncateAuthoritativeReload(pending.remoteThreadId, pending.neededSeq);
              }
            };
            const activateSocket = () => {
              if (!isCurrent() || entry.socket !== socket) return;
              clearRemoteServerEventSocketConnectTimeout(entry);
              entry.reconnectPolicy.reset();
              activateRemoteTerminalFeed(server.desktopId, socket);
              syncDesktopBrowserBridgeClient(get());
              const currentThreadItemInterests =
                remoteServerThreadItemInterests.get(server.desktopId) ?? threadItemInterests;
              if (
                sameRemoteServerThreadItemInterests(currentThreadItemInterests, threadItemInterests)
              ) {
                remoteServerThreadItemInterests.set(server.desktopId, currentThreadItemInterests);
              } else {
                setRemoteServerThreadItemInterests(
                  server.desktopId,
                  currentThreadItemInterests,
                  true,
                );
              }
              startHealthProbe(socket);
              setSocketStatus("online");
              resumePendingTruncateReloads();
            };
            socket.onopen = activateSocket;
            if (socket.readyState === undefined || socket.readyState === 1) {
              activateSocket();
            }
            const resyncOpenThread = async () => {
              if (resyncInFlight) return;
              const open = get().openThread;
              const interests = remoteServerThreadItemInterests.get(server.desktopId) ?? [];
              const threadIds = new Set<string>();
              if (open?.desktopId === server.desktopId) threadIds.add(open.threadId);
              for (const interest of interests) threadIds.add(interest);
              if (threadIds.size === 0) return;
              resyncInFlight = true;
              try {
                for (const threadId of threadIds) {
                  let nextSnapshot: Awaited<ReturnType<RemoteDesktopClient["threadHistory"]>>;
                  try {
                    nextSnapshot = await client.threadHistory(threadId);
                  } catch {
                    continue;
                  }
                  if (!isCurrent() || entry.socket !== socket) continue;
                  const applied: ApplyThreadSnapshotResult = applyThreadSnapshot(
                    projectRemoteThreadSnapshot(server.desktopId, nextSnapshot),
                    {
                      fromServer: true,
                      lastSeenEventSeq: remoteThreadAppliedSeq(server.desktopId, threadId),
                    },
                  );
                  if (applied.installedAuthoritativeHistory) {
                    recordAuthoritativeHistoryInstall(
                      server.desktopId,
                      threadId,
                      nextSnapshot.snapshotSeq,
                    );
                  }
                  remoteServerSnapshotSeqByDesktopId.set(
                    server.desktopId,
                    Math.max(
                      remoteServerSnapshotSeqByDesktopId.get(server.desktopId) ?? 0,
                      nextSnapshot.snapshotSeq,
                    ),
                  );
                  const currentOpen = get().openThread;
                  if (
                    currentOpen?.desktopId === server.desktopId &&
                    currentOpen.threadId === threadId
                  ) {
                    set({
                      openThread: buildOpenThread(server.desktopId, nextSnapshot),
                    });
                  }
                }
              } catch {
                if (entry.socket === socket) {
                  try {
                    socket.close();
                  } catch {
                    // already closed
                  }
                }
              } finally {
                resyncInFlight = false;
              }
            };
            socket.onmessage = (event) => {
              if (!isCurrent() || entry.socket !== socket) return;
              try {
                const message = client.parseSocketMessage(String(event.data));
                if (message.type === "pong") {
                  entry.health?.acceptPong(message.id);
                  return;
                }
                if (handleRemoteTerminalServerMessage(server.desktopId, message)) {
                  return;
                }
                if (desktopBrowserMirrorSocket === socket && handleBrowserServerMessage(message)) {
                  return;
                }
                if (message.type === "event") {
                  const nextSeq = Math.max(
                    remoteServerSnapshotSeqByDesktopId.get(server.desktopId) ?? 0,
                    message.seq,
                  );
                  remoteServerSnapshotSeqByDesktopId.set(server.desktopId, nextSeq);
                  const open = get().openThread;
                  const remoteThreadIds = new Set(
                    get().runtime[server.desktopId]?.threads.map((thread) => thread.id) ?? [],
                  );
                  const appState = useAppStore.getState();
                  if (Object.keys(appState.provisioningWorktreeThreadIds).length > 0) {
                    for (const thread of appState.threads) {
                      if (
                        appState.provisioningWorktreeThreadIds[thread.id] === true &&
                        thread.remoteServerId === server.desktopId &&
                        thread.remoteId
                      ) {
                        remoteThreadIds.add(thread.remoteId);
                      }
                    }
                  }
                  if (open?.desktopId === server.desktopId) {
                    remoteThreadIds.add(open.threadId);
                  }
                  // Background visible panes keep independent live subscriptions
                  // via additive interests. They must survive even when the
                  // single global `openThread` slice holds a different thread
                  // (multipane split): without this, a cold multipane restore
                  // would drop every background pane's events until its row
                  // arrived in the runtime list.
                  for (const interest of remoteServerThreadItemInterests.get(server.desktopId) ??
                    []) {
                    remoteThreadIds.add(interest);
                  }
                  const terminalEvent = message.event as {
                    type?: unknown;
                    threadId?: unknown;
                    exitCode?: unknown;
                  };
                  const terminalId =
                    typeof terminalEvent.threadId === "string" ? terminalEvent.threadId : null;
                  const isKnownRemoteTerminal =
                    terminalId !== null &&
                    (remoteThreadIds.has(terminalId) ||
                      remoteTerminalOwner(terminalId) === server.desktopId);
                  if (
                    terminalId &&
                    isKnownRemoteTerminal &&
                    terminalEvent.type === "thread-reset"
                  ) {
                    emitRemoteTerminalReset(server.desktopId, terminalId);
                  } else if (
                    terminalId &&
                    isKnownRemoteTerminal &&
                    terminalEvent.type === "thread-exited"
                  ) {
                    emitRemoteTerminalExited(
                      server.desktopId,
                      terminalId,
                      typeof terminalEvent.exitCode === "number" ? terminalEvent.exitCode : null,
                    );
                    // Dev-shell ids can be filtered out of the dispatch below,
                    // so clear the terminal panel's deferred start mark here,
                    // while ownership still identifies the terminal. (The web
                    // bridge's supervisor stream is a no-op, so this branch is
                    // the PWA's only exit signal.)
                    noteShellExited(terminalId);
                    releaseRemoteTerminal(terminalId);
                  }
                  let forward = filterRemoteThreadEvents(message.event, remoteThreadIds);
                  if (forward !== null) {
                    // Destructive-replay guard: an authoritative history that
                    // already incorporated this truncation suppresses its
                    // replay. Uses the installed per-thread history seq, never
                    // the per-server resume watermark and never a shell
                    // snapshot (which proves nothing about the transcript).
                    const batches = collectRuntimeEventsFromSupervisoryMessage(forward);
                    const hasTruncated = batches.some((batch) =>
                      batch.events.some((evt) => evt.type === "runtime.truncated"),
                    );
                    if (hasTruncated && typeof message.seq === "number") {
                      const keptBatches: typeof batches = [];
                      for (const batch of batches) {
                        const keptEvents = batch.events.filter((evt) => {
                          if (evt.type !== "runtime.truncated") return true;
                          return !shouldSuppressTruncatedReplay(
                            server.desktopId,
                            batch.threadId,
                            message.seq as number,
                          );
                        });
                        if (keptEvents.length > 0) {
                          keptBatches.push({ threadId: batch.threadId, events: keptEvents });
                        }
                      }
                      if (keptBatches.length === 0) {
                        forward = null;
                      } else if (
                        keptBatches.length !== batches.length ||
                        keptBatches.some(
                          (batch, index) => batch.events.length !== batches[index]?.events.length,
                        )
                      ) {
                        forward = {
                          type: "thread-runtime-events-multi",
                          batches: keptBatches.map((batch) => ({
                            threadId: batch.threadId,
                            events: [...batch.events],
                          })),
                        };
                      }
                    }
                  }
                  if (forward !== null) {
                    // Mark the threads whose events actually forwarded into
                    // the app store — filtered frames (unknown threads,
                    // irrelevant types) were never applied and must not make
                    // later snapshots look stale for their threads.
                    for (const threadId of supervisorEventThreadIds(forward)) {
                      recordRemoteThreadAppliedSeq(server.desktopId, threadId, message.seq);
                    }
                    dispatchRemoteSupervisorEvent(
                      projectRemoteThreadEvent(server.desktopId, forward),
                      {
                        onGitSummaries: (summaries) =>
                          syncRemoteGitSummaries(server.desktopId, summaries),
                        onGitState: (patch) => syncRemoteGitStatePatch(server.desktopId, patch),
                      },
                    );
                    for (const batch of collectRuntimeEventsFromSupervisoryMessage(forward)) {
                      for (const evt of batch.events) {
                        if (evt.type !== "runtime.truncated") continue;
                        const projectedId = remoteThreadId(server.desktopId, batch.threadId);
                        if (isTruncateCheckpointLoaded(projectedId, evt.itemId)) continue;
                        requestTruncateAuthoritativeReload(batch.threadId, message.seq);
                      }
                    }
                  }
                  if (shouldRefreshRemoteServerAfterEvent(message.event)) {
                    // Debounced so a burst of events yields one snapshot GET.
                    get().scheduleServerRefresh(server.desktopId, {
                      includeAgentStatuses: shouldRefreshRemoteAgentStatusesAfterEvent(
                        message.event,
                      ),
                    });
                  }
                }
                if (message.type === "resync-required") {
                  // The server's in-memory event sequence restarts with the
                  // process. Accept its lower cursor before the authoritative
                  // snapshots advance it again, or every reconnect will ask
                  // for an impossible pre-restart sequence forever.
                  remoteServerSnapshotSeqByDesktopId.set(server.desktopId, message.seq);
                  // Pre-restart per-thread marks would refuse every fresh
                  // (lower-seq) snapshot forever; re-baseline them too.
                  clearRemoteThreadAppliedSeqs(server.desktopId);
                  // Old-epoch authoritative baselines and bounded reload
                  // budgets are meaningless after a restart.
                  resetTruncateRecoveryEpoch(server.desktopId);
                  remoteServerRowResyncPendingByDesktopId.add(server.desktopId);
                  get().scheduleServerRefresh(server.desktopId);
                  void resyncOpenThread();
                }
              } catch {
                // HTTP snapshots remain authoritative; ignore malformed frames.
              }
            };
            socket.onclose = (event) => {
              if (
                isUnauthorizedRemoteSocketClose(event?.code ?? 0, event?.reason ?? "") &&
                isCurrent() &&
                entry.socket === socket
              ) {
                entry.socket = null;
                clearRemoteServerEventSocketConnectTimeout(entry);
                clearRemoteServerEventSocketHealth(entry);
                setRemoteTerminalSocketSender(server.desktopId, null);
                setRemoteServerFailure(
                  server.desktopId,
                  "error",
                  sharedMsg("remote.session.expired"),
                );
                scheduleReconnect(REMOTE_SOCKET_POLICY.unauthorizedReconnectMs);
                return;
              }
              disconnectSocket(socket);
            };
          } catch (error) {
            if (!isCurrent()) return;
            if (error instanceof RemoteClientError && error.code === "protocol_version_mismatch") {
              setRemoteServerFailure(server.desktopId, "error", friendlyError(error));
              // Stop automatic attempts, but retain terminal listeners so a
              // later explicit reconnect can install a fresh supported stream.
              remoteServerEventSockets.delete(server.desktopId);
              setRemoteTerminalSocketSender(server.desktopId, null);
              return;
            }
            if (isUnauthorizedRemoteError(error)) {
              setRemoteServerFailure(
                server.desktopId,
                "error",
                sharedMsg("remote.session.expired"),
              );
              scheduleReconnect(REMOTE_SOCKET_POLICY.unauthorizedReconnectMs);
              return;
            }
            const transportFailure = isRemoteTransportFailure(error);
            setRemoteServerFailure(
              server.desktopId,
              transportFailure ? "offline" : "error",
              transportFailure ? sharedMsg("remote.server.unreachable") : friendlyError(error),
            );
            scheduleReconnect();
          } finally {
            entry.connecting = false;
          }
        };

        await connect();
      };

      const setServersConnecting = (servers: readonly RemoteServerRecord[]) => {
        if (servers.length === 0) return;
        set((state) => {
          const runtime = { ...state.runtime };
          for (const server of servers) {
            const current = state.runtime[server.desktopId];
            runtime[server.desktopId] = {
              status: "connecting",
              projects: current?.projects ?? state.lastKnownProjects[server.desktopId] ?? [],
              threads: current?.threads ?? [],
              ...(current?.agentStatuses ? { agentStatuses: current.agentStatuses } : {}),
            };
          }
          return { runtime };
        });
        syncDesktopBrowserBridgeClient(get());
        for (const server of servers) {
          const runtime = get().runtime[server.desktopId];
          if (runtime) syncRemoteAppRows(server.desktopId, runtime.projects);
        }
      };

      /** Restore a server's transport (SSH tunnel) when needed, then snapshot
       * it and (re)attach its event stream. Shared by connectAll and
       * reconnectServer so transport handling lives in one place. */
      const connectServer = async (
        persistedServer: RemoteServerRecord,
        shouldContinue: () => boolean = () => true,
      ): Promise<void> => {
        const reconnectGeneration = remoteHostUpdateReconnectSeqByDesktopId.get(
          persistedServer.desktopId,
        );
        const canContinue = () =>
          remoteHostUpdateReconnectSeqByDesktopId.get(persistedServer.desktopId) ===
            reconnectGeneration && shouldContinue();
        let server = persistedServer;
        let initialTerminalCapabilities: TerminalConnectionCapabilities | undefined;
        if (server.transport?.kind === "ssh") {
          try {
            const launched = await readBridge().sshConnect({
              connection: server.transport.connection,
            });
            if (!canContinue()) return;
            server = { ...server, endpoint: normalizeEndpoint(launched.endpoint) };
            const updated = server;
            set((state) => ({
              servers: state.servers.map((candidate) =>
                candidate.desktopId === updated.desktopId ? updated : candidate,
              ),
            }));
          } catch (error) {
            if (!canContinue()) return;
            const message = friendlyError(error) || i18n._(msg`SSH connection failed.`);
            toast.danger(message);
            setRemoteServerFailure(server.desktopId, "offline", message);
            return;
          }
        }
        try {
          const environment = await get()
            .clientFactory(server.endpoint, server.accessToken)
            .environment();
          if (!canContinue()) return;
          initialTerminalCapabilities = terminalCapabilitiesFromEnvironment(environment);
          const keepsLocalAlias =
            server.remoteLabel !== undefined && server.label !== server.remoteLabel;
          server = {
            ...server,
            label: keepsLocalAlias ? server.label : environment.label,
            remoteLabel: environment.label,
            appVersion: environment.appVersion,
            // Assigned unconditionally so an authoritative descriptor that
            // drops the capability clears any stale support flag.
            browserForwardAvailable:
              environment.capabilities?.browserForward?.versions.includes(
                REMOTE_BROWSER_FORWARD_VERSION,
              ) ?? false,
            ...(environment.platform ? { platform: environment.platform } : {}),
            ...(environment.hostMode ? { hostMode: environment.hostMode } : {}),
          };
          const updated = server;
          set((state) => ({
            servers: state.servers.map((candidate) =>
              candidate.desktopId === updated.desktopId ? updated : candidate,
            ),
          }));
        } catch (error) {
          if (!canContinue()) return;
          if (error instanceof RemoteClientError && error.code === "protocol_version_mismatch") {
            setRemoteServerFailure(server.desktopId, "error", friendlyError(error));
            return;
          }
          // refreshServer below owns other visible connection errors.
        }
        await get().refreshServer(server.desktopId);
        if (!canContinue()) return;
        await startRemoteServerEventStream(server, initialTerminalCapabilities);
        checkHostUpdateInBackground(server);
      };

      const reconnectAfterHostUpdate = async (
        persistedServer: RemoteServerRecord,
        expectedVersion: string,
        reconnectSeq: number,
      ): Promise<void> => {
        const isCurrent = () =>
          remoteHostUpdateReconnectSeqByDesktopId.get(persistedServer.desktopId) === reconnectSeq &&
          get().servers.some((server) => server.desktopId === persistedServer.desktopId);
        const outcome = await waitForHostUpdateReconnect({
          isCurrent,
          isTerminalError: (error) =>
            error instanceof RemoteClientError && error.code === "protocol_version_mismatch",
          attempt: async () => {
            const environment = await get()
              .clientFactory(persistedServer.endpoint, persistedServer.accessToken)
              .environment();
            if (environment.appVersion !== expectedVersion) return false;
            const current = get().servers.find(
              (server) => server.desktopId === persistedServer.desktopId,
            );
            if (!current || !isCurrent()) return false;
            await connectServer(current, () => isCurrent());
            if (
              isCurrent() &&
              get().runtime[persistedServer.desktopId]?.status === "online" &&
              get().servers.find((server) => server.desktopId === persistedServer.desktopId)
                ?.appVersion === expectedVersion
            ) {
              return true;
            }
            closeRemoteServerEventSocket(persistedServer.desktopId);
            const latest = get().servers.find(
              (server) => server.desktopId === persistedServer.desktopId,
            );
            if (latest && isCurrent()) setServersConnecting([latest]);
            return false;
          },
        });
        if (outcome.type === "cancelled" || !isCurrent()) {
          set((state) => {
            const { [persistedServer.desktopId]: _stale, ...hostUpdateRestarts } =
              state.hostUpdateRestarts;
            return { hostUpdateRestarts };
          });
          return;
        }
        remoteHostUpdateReconnectSeqByDesktopId.set(
          persistedServer.desktopId,
          nextRemoteHostUpdateSequence(),
        );
        if (outcome.type === "connected") {
          set((state) => {
            const { [persistedServer.desktopId]: _finished, ...hostUpdateRestarts } =
              state.hostUpdateRestarts;
            return { hostUpdateRestarts };
          });
          return;
        }
        invalidateRemoteServerRefresh(persistedServer.desktopId);
        closeRemoteServerEventSocket(persistedServer.desktopId);
        const status = outcome.type === "terminal-error" ? "error" : "offline";
        const message =
          outcome.type === "terminal-error"
            ? friendlyError(outcome.error)
            : sharedMsg("remote.server.unreachable");
        setRemoteServerFailure(persistedServer.desktopId, status, message);
        set((state) => {
          const { [persistedServer.desktopId]: _finished, ...hostUpdateRestarts } =
            state.hostUpdateRestarts;
          return { hostUpdateRestarts };
        });
      };

      const pairAtEndpoint = async (input: {
        endpoint: string;
        token: string;
        transport: NonNullable<RemoteServerRecord["transport"]>;
      }): Promise<RemoteServerRecord> => {
        const normalized = normalizeEndpoint(input.endpoint);
        const factory = get().clientFactory;
        const tokenResult = await factory(normalized).exchangePairingCredential({
          credential: input.token,
          scopes: REMOTE_STANDARD_SCOPES,
          client: { label: "Poracode Desktop", deviceType: "desktop" },
        });
        const client = factory(normalized, tokenResult.accessToken);
        const [environment, snapshot, agentStatuses] = await Promise.all([
          client.environment(),
          client.snapshot(),
          client.agentStatuses(),
        ]);
        const record: RemoteServerRecord = {
          desktopId: environment.desktopId,
          label: environment.label,
          remoteLabel: environment.label,
          endpoint: normalized,
          accessToken: tokenResult.accessToken,
          scopes: filterKnownRemoteAccessScopes(tokenResult.scopes),
          appVersion: environment.appVersion,
          browserForwardAvailable:
            environment.capabilities?.browserForward?.versions.includes(
              REMOTE_BROWSER_FORWARD_VERSION,
            ) ?? false,
          ...(environment.platform ? { platform: environment.platform } : {}),
          ...(environment.hostMode ? { hostMode: environment.hostMode } : {}),
          transport: input.transport,
        };
        remoteHostUpdateReconnectSeqByDesktopId.set(
          record.desktopId,
          nextRemoteHostUpdateSequence(),
        );
        bumpRemoteServerGeneration(record.desktopId);
        set((state) => ({
          servers: [...state.servers.filter((s) => s.desktopId !== record.desktopId), record],
          lastKnownProjects: replaceCachedProjects(
            state.lastKnownProjects,
            record.desktopId,
            snapshot.projects,
          ),
          runtime: {
            ...state.runtime,
            [record.desktopId]: {
              status: "online",
              projects: snapshot.projects,
              threads: snapshot.threads,
              agentStatuses,
            },
          },
        }));
        syncRemoteAppRows(record.desktopId, snapshot.projects, snapshot.threads);
        if (snapshot.gitSummariesByThread) {
          syncRemoteGitSummaries(record.desktopId, snapshot.gitSummariesByThread);
        }
        if (snapshot.gitState) syncRemoteGitStateSnapshot(record.desktopId, snapshot.gitState);
        remoteServerSnapshotSeqByDesktopId.set(record.desktopId, snapshot.snapshotSeq);
        // Pairing overwrites the seq baseline; stale per-thread marks from a
        // previous pairing of the same host must not refuse this snapshot.
        clearRemoteThreadAppliedSeqs(record.desktopId);
        resetTruncateRecoveryEpoch(record.desktopId);
        syncDesktopBrowserBridgeClient(get());
        await startRemoteServerEventStream(
          record,
          terminalCapabilitiesFromEnvironment(environment),
        );
        checkHostUpdateInBackground(record);
        return record;
      };

      return {
        servers: [],
        runtime: {},
        hostUpdates: {},
        hostUpdateRestarts: {},
        excludedProjectIds: {},
        projectWorkspaceIds: {},
        projectNameOverrides: {},
        lastKnownProjects: {},
        openThread: null,
        clientFactory: defaultClientFactory,
        socketFactory: defaultSocketFactory,
        setClientFactory: (factory) => {
          closeAllRemoteServerEventSockets();
          set({ clientFactory: factory });
        },
        setSocketFactory: (factory) => {
          closeAllRemoteServerEventSockets();
          set({ socketFactory: factory });
        },

        launchRemoteThread: async (input, options) => {
          const runtime = get().runtime[input.desktopId];
          const project = runtime?.projects.find((entry) => entry.id === input.projectId);
          if (!project) throw new Error(i18n._(msg`Remote project not found.`));
          const result = await withClient(input.desktopId, (client) =>
            client.startNewThread({
              ...(input.threadId ? { threadId: input.threadId } : {}),
              projectId: input.projectId,
              agentKind: input.agentKind,
              config: input.config,
              prompt: input.prompt,
              ...(input.segments
                ? {
                    segments: unprojectRemoteThreadMentionSegments(
                      input.desktopId,
                      input.segments,
                      useAppStore.getState().threads,
                    ),
                  }
                : {}),
              presentationMode: input.presentationMode,
              ...(input.userMessageItemId ? { userMessageItemId: input.userMessageItemId } : {}),
              ...(input.worktreePath ? { worktreePath: input.worktreePath } : {}),
              ...(input.worktreeBranch ? { worktreeBranch: input.worktreeBranch } : {}),
              ...(input.isNewWorktree ? { isNewWorktree: true } : {}),
              ...(input.title ? { title: input.title } : {}),
              ...(input.groupId ? { groupId: input.groupId } : {}),
              ...(input.groupName ? { groupName: input.groupName } : {}),
            }),
          );
          const compensateIfAbandoned = async (): Promise<
            Exclude<RemoteThreadLaunchResult, "started"> | undefined
          > => {
            if (options?.isPendingLaunchOwned?.() !== false) return undefined;
            const clearProjectedLaunch = () => {
              const open = get().openThread;
              if (open?.desktopId === input.desktopId && open.threadId === result.threadId) {
                get().closeRemoteThread();
              }
              useAppStore.getState().deleteThread(remoteThreadId(input.desktopId, result.threadId));
            };
            try {
              await withClient(input.desktopId, (client) =>
                client.sendThreadCommand({ kind: "delete", threadId: result.threadId }),
              );
            } catch (error) {
              toast.danger(friendlyError(error));
              clearProjectedLaunch();
              return "cancellation-failed";
            }
            clearProjectedLaunch();
            return "cancelled";
          };
          let cancellation = await compensateIfAbandoned();
          if (cancellation) return cancellation;
          const appeared = await waitForRemoteThreadAppearance({
            refresh: () => get().refreshServer(input.desktopId),
            hasThread: () =>
              get().runtime[input.desktopId]?.threads.some(
                (thread) => thread.id === result.threadId,
              ) ?? false,
          });
          if (!appeared) throw new Error(i18n._(msg`Unable to start the remote thread.`));
          cancellation = await compensateIfAbandoned();
          if (cancellation) return cancellation;
          await get().openRemoteThread(input.desktopId, result.threadId);
          cancellation = await compensateIfAbandoned();
          if (cancellation) return cancellation;
          return "started";
        },

        openRemoteThread: async (desktopId, threadId, options) => {
          const focus = options?.focus ?? true;
          const requestSeq = openRemoteThreadRequestSeq + 1;
          openRemoteThreadRequestSeq = requestSeq;
          const previousOpenThread = get().openThread;
          const server = get().servers.find((entry) => entry.desktopId === desktopId);
          if (!server) {
            reportRemoteServerError(
              desktopId,
              new Error(i18n._(msg`Remote server not found.`)),
              i18n._(msg`Remote server not found.`),
            );
            return false;
          }
          const serverIdentityAtStart = `${server.endpoint}\0${server.accessToken}`;
          const serverGenerationAtStart = currentRemoteServerGeneration(desktopId);
          setHydratingRemoteServerThreadItemInterest(desktopId, threadId, previousOpenThread);
          // Hydrate the thread's history into the shared, threadId-keyed runtime
          // store so the desktop ChatPane renders it (coexists with local threads).
          // A failed history fetch (server asleep/unreachable) must not reject.
          let snapshot: Awaited<ReturnType<RemoteDesktopClient["threadHistory"]>>;
          try {
            snapshot = await withClient(desktopId, (client) => client.threadHistory(threadId));
          } catch (error) {
            // Drop this thread's hydration interest even when superseded: a
            // refresh that cleared the open slice invalidates the request seq,
            // and leaving the hydrating thread registered would leak a dead
            // interest (e.g. a replacement for a deleted thread). Every other
            // interest stays untouched, so a failed open never strips a live
            // pane; a same-thread retry re-registers on success.
            removeRemoteServerThreadItemInterest(desktopId, threadId);
            if (requestSeq !== openRemoteThreadRequestSeq) return false;
            // Re-assert the previous open thread only while it is still the
            // open slice: a superseding open owns its own registration, and a
            // thread the server deleted (refreshServer cleared the slice) must
            // not be resurrected as an interest.
            const currentOpen = get().openThread;
            if (
              previousOpenThread &&
              currentOpen?.desktopId === previousOpenThread.desktopId &&
              currentOpen.threadId === previousOpenThread.threadId
            ) {
              addRemoteServerThreadItemInterest(
                previousOpenThread.desktopId,
                previousOpenThread.threadId,
              );
            }
            // Background reattaches (focus:false) retry quietly; the sidebar's
            // server status already shows an unreachable host, and one toast
            // per retry attempt would be spam.
            if (!options?.quiet) {
              toast.danger(friendlyError(error) || i18n._(msg`Failed to open remote thread.`));
            }
            return false;
          }
          const currentServer = get().servers.find((entry) => entry.desktopId === desktopId);
          if (
            !currentServer ||
            `${currentServer.endpoint}\0${currentServer.accessToken}` !== serverIdentityAtStart ||
            currentRemoteServerGeneration(desktopId) !== serverGenerationAtStart
          ) {
            return false;
          }
          const projectedSnapshot = projectRemoteThreadSnapshot(desktopId, snapshot);
          const viewThreadId = projectedSnapshot.thread.id;
          const existingRuntimeItemIds =
            useAppStore.getState().runtimeItemIdsByThread[viewThreadId] ?? [];
          seedOlderThreadRuntimeItemsCursor(
            viewThreadId,
            projectedSnapshot.runtimeNextCursor ?? null,
            {
              preserveExistingCursor: runtimePageOverlapsExistingTranscript(
                projectedSnapshot.runtimeItems,
                existingRuntimeItemIds,
              ),
            },
          );
          const applied: ApplyThreadSnapshotResult = applyThreadSnapshot(projectedSnapshot, {
            fromServer: true,
            lastSeenEventSeq: remoteThreadAppliedSeq(desktopId, threadId),
          });
          if (applied.installedAuthoritativeHistory) {
            recordAuthoritativeHistoryInstall(desktopId, threadId, snapshot.snapshotSeq);
          }
          addRemoteServerThreadItemInterest(desktopId, threadId);
          remoteServerSnapshotSeqByDesktopId.set(
            desktopId,
            Math.max(remoteServerSnapshotSeqByDesktopId.get(desktopId) ?? 0, snapshot.snapshotSeq),
          );
          await startRemoteServerEventStream(currentServer);
          const eventSocket = remoteServerEventSockets.get(desktopId)?.socket;
          if (eventSocket) activateRemoteTerminalFeed(desktopId, eventSocket);
          if (!focus) {
            // Background reattach never steals focus and never depends on the
            // single global open slice: history + interests are the attach.
            // Still track the slice when latest so single-pane restores keep
            // the existing `openThread` expectation, but always report success
            // once history installed.
            if (requestSeq === openRemoteThreadRequestSeq) {
              set({ openThread: buildOpenThread(desktopId, snapshot) });
            }
            return true;
          }
          if (requestSeq !== openRemoteThreadRequestSeq) return false;
          const openThread = buildOpenThread(desktopId, snapshot);
          set({ openThread });
          // Focus is caller-owned: the startup restore reattaches the live
          // subscription for an already-visible thread and must not yank the
          // view back if the user navigated away while the history fetch was
          // in flight.
          useAppStore.getState().openThread(openThread.thread.id);
          return true;
        },

        closeRemoteThread: () => {
          openRemoteThreadRequestSeq += 1;
          // Only the closing thread's own interest goes away: other interests
          // (other visible remote panes) are independent live subscriptions.
          const open = get().openThread;
          if (open) removeRemoteServerThreadItemInterest(open.desktopId, open.threadId);
          if (get().openThread) set({ openThread: null });
        },

        sendThreadCommand: async (desktopId, command) => {
          await withClient(desktopId, (client) => client.sendThreadCommand(command));
          get().scheduleServerRefresh(desktopId);
        },

        pairServer: ({ endpoint, token }) =>
          pairAtEndpoint({ endpoint, token, transport: { kind: "direct" } }),

        pairSshServer: async (connection) => {
          const launched = await readBridge().sshConnect({
            connection,
            issuePairingCredential: true,
          });
          if (!launched.pairingCredential) {
            await readBridge().sshDisconnect({ connectionId: connection.id });
            throw new Error(i18n._(msg`The remote server returned no pairing credential.`));
          }
          try {
            return await pairAtEndpoint({
              endpoint: launched.endpoint,
              token: launched.pairingCredential,
              transport: { kind: "ssh", connection },
            });
          } catch (error) {
            await readBridge().sshDisconnect({ connectionId: connection.id });
            throw error;
          }
        },

        renameServer: (desktopId, label) => {
          set((state) => {
            const server = state.servers.find((candidate) => candidate.desktopId === desktopId);
            if (!server || server.label === label) return {};
            return {
              servers: state.servers.map((candidate) =>
                candidate.desktopId === desktopId
                  ? { ...candidate, label, remoteLabel: candidate.remoteLabel ?? candidate.label }
                  : candidate,
              ),
            };
          });
        },

        removeServer: (desktopId) => {
          const removed = get().servers.find((server) => server.desktopId === desktopId);
          remoteHostUpdateReconnectSeqByDesktopId.set(desktopId, nextRemoteHostUpdateSequence());
          remoteHostUpdateRequestSeqByDesktopId.delete(desktopId);
          invalidateRemoteServerRefresh(desktopId);
          closeRemoteServerEventSocket(desktopId);
          resetTruncateRecoveryEpoch(desktopId);
          bumpRemoteServerGeneration(desktopId);
          // If the open live-chat thread belongs to this server, tear it (and its
          // socket) down first so it isn't left orphaned with no way to interact.
          if (get().openThread?.desktopId === desktopId) {
            get().closeRemoteThread();
          }
          remoteServerThreadItemInterests.delete(desktopId);
          set((state) => {
            const { [desktopId]: _removed, ...runtime } = state.runtime;
            const { [desktopId]: _removedUpdate, ...hostUpdates } = state.hostUpdates;
            const { [desktopId]: _removedRestart, ...hostUpdateRestarts } =
              state.hostUpdateRestarts;
            return {
              servers: state.servers.filter((server) => server.desktopId !== desktopId),
              runtime,
              hostUpdates,
              hostUpdateRestarts,
              lastKnownProjects: removeCachedProjects(state.lastKnownProjects, desktopId),
            };
          });
          releaseRemoteTerminalsForServer(desktopId);
          clearRemoteGitState(desktopId);
          removeRemoteAppRows(desktopId);
          if (removed?.transport?.kind === "ssh") {
            void readBridge()
              .sshDisconnect({ connectionId: removed.transport.connection.id })
              .catch(() => undefined);
          }
          syncDesktopBrowserBridgeClient(get());
        },

        refreshServer: async (desktopId, options = {}) => {
          const server = get().servers.find((entry) => entry.desktopId === desktopId);
          if (!server) return;
          // A debounced refresh may already be pending; this immediate refresh
          // supersedes it so we don't fire a second GET moments later.
          clearRemoteServerRefreshTimer(desktopId);
          // Tag this refresh with a monotonic request id. Two sockets can each
          // trigger a refresh, and their snapshot GETs may resolve out of order;
          // ignore any result that isn't the latest so a stale snapshot never
          // overwrites a newer one (e.g. shows "running" after "finished").
          const requestSeq = (remoteServerRefreshSeqByDesktopId.get(desktopId) ?? 0) + 1;
          remoteServerRefreshSeqByDesktopId.set(desktopId, requestSeq);
          const isLatest = () => remoteServerRefreshSeqByDesktopId.get(desktopId) === requestSeq;
          // Replace the whole runtime entry; snapshots are kept across a
          // connecting/error transition so the UI doesn't flash empty. Skip the
          // write if the server was removed while a refresh was in flight, so a
          // late snapshot doesn't resurrect a removed server's runtime.
          const setRuntime = (entry: RemoteServerRuntime) =>
            set((state) => {
              if (!state.servers.some((s) => s.desktopId === desktopId)) return state;
              if (state.runtime[desktopId] === entry) return state;
              return { runtime: { ...state.runtime, [desktopId]: entry } };
            });
          const cached = () => get().runtime[desktopId];
          // Skip the "connecting" flicker once a snapshot is cached — only
          // downgrade the status on failure. First-ever refresh still shows it.
          if (!cached()) {
            setRuntime({ status: "connecting", projects: [], threads: [] });
          }
          try {
            const client = get().clientFactory(server.endpoint, server.accessToken);
            const snapshotPromise = client.snapshot();
            const [snapshot, agentStatuses] =
              options.includeAgentStatuses === false
                ? [await snapshotPromise, cached()?.agentStatuses]
                : await Promise.all([snapshotPromise, client.agentStatuses()]);
            // Drop a stale (superseded) result so out-of-order resolutions don't
            // regress the UI or the seq cursor.
            if (!isLatest()) return;
            // Clamp the stored seq with Math.max so a stale response can't
            // regress the cursor a live socket already advanced past.
            remoteServerSnapshotSeqByDesktopId.set(
              desktopId,
              Math.max(
                remoteServerSnapshotSeqByDesktopId.get(desktopId) ?? 0,
                snapshot.snapshotSeq,
              ),
            );
            const current = cached();
            const projects = reuseRemoteRows(current?.projects ?? [], snapshot.projects);
            const { rows: reconciledThreads, staleThreadIds } =
              reconcileThreadRowsWithAppliedEvents(
                desktopId,
                snapshot.snapshotSeq,
                snapshot.threads,
                current?.threads ?? [],
              );
            const threads = reuseRemoteRows(current?.threads ?? [], reconciledThreads);
            const projectsChanged = projects !== current?.projects;
            const threadsChanged = threads !== current?.threads;
            const nextAgentStatuses =
              agentStatuses === undefined
                ? current?.agentStatuses
                : current?.agentStatuses &&
                    JSON.stringify(current.agentStatuses.windows) ===
                      JSON.stringify(agentStatuses.windows) &&
                    JSON.stringify(current.agentStatuses.wsl) === JSON.stringify(agentStatuses.wsl)
                  ? current.agentStatuses
                  : agentStatuses;
            const nextRuntime: RemoteServerRuntime =
              current?.status === "online" &&
              current.message === undefined &&
              projects === current.projects &&
              threads === current.threads &&
              nextAgentStatuses === current.agentStatuses
                ? current
                : {
                    status: "online",
                    projects,
                    threads,
                    ...(nextAgentStatuses ? { agentStatuses: nextAgentStatuses } : {}),
                  };
            set((state) => {
              if (!state.servers.some((entry) => entry.desktopId === desktopId)) return state;
              const lastKnownProjects = projectsChanged
                ? replaceCachedProjects(state.lastKnownProjects, desktopId, projects)
                : state.lastKnownProjects;
              if (
                state.runtime[desktopId] === nextRuntime &&
                lastKnownProjects === state.lastKnownProjects
              ) {
                return state;
              }
              return {
                runtime: { ...state.runtime, [desktopId]: nextRuntime },
                lastKnownProjects,
              };
            });
            // One-shot: a resync-required refresh re-mirrors authoritative
            // rows even when the HTTP cache already matches them.
            const forceRowSync = remoteServerRowResyncPendingByDesktopId.delete(desktopId);
            if (projectsChanged || threadsChanged || forceRowSync) {
              syncRemoteAppRows(
                desktopId,
                projectsChanged || forceRowSync ? projects : undefined,
                threadsChanged || forceRowSync ? threads : undefined,
                { preserveThreadIds: staleThreadIds },
              );
            }
            if (snapshot.gitSummariesByThread) {
              syncRemoteGitSummaries(desktopId, snapshot.gitSummariesByThread);
            }
            if (snapshot.gitState) syncRemoteGitStateSnapshot(desktopId, snapshot.gitState);
            const openThread = get().openThread;
            if (
              threadsChanged &&
              openThread?.desktopId === desktopId &&
              !threads.some((thread) => thread.id === openThread.threadId)
            ) {
              openRemoteThreadRequestSeq += 1;
              // The open thread no longer exists server-side: drop its interest
              // without touching this server's other live subscriptions.
              removeRemoteServerThreadItemInterest(desktopId, openThread.threadId);
              set({ openThread: null });
            }
            syncDesktopBrowserBridgeClient(get());
          } catch (error) {
            if (!isLatest()) return;
            setRuntime({
              status: isRemoteTransportFailure(error) ? "offline" : "error",
              message: friendlyError(error) || i18n._(msg`Connection failed.`),
              projects: cached()?.projects ?? [],
              threads: cached()?.threads ?? [],
            });
            syncDesktopBrowserBridgeClient(get());
          }
        },

        scheduleServerRefresh: (desktopId, options = {}) => {
          if (!get().servers.some((entry) => entry.desktopId === desktopId)) return;
          const shouldIncludeAgentStatuses =
            options.includeAgentStatuses === true ||
            remoteServerAgentStatusRefreshes.has(desktopId);
          clearRemoteServerRefreshTimer(desktopId);
          if (shouldIncludeAgentStatuses) remoteServerAgentStatusRefreshes.add(desktopId);
          remoteServerRefreshTimers.set(
            desktopId,
            setTimeout(() => {
              remoteServerRefreshTimers.delete(desktopId);
              if (!get().servers.some((entry) => entry.desktopId === desktopId)) return;
              const includeAgentStatuses = remoteServerAgentStatusRefreshes.delete(desktopId);
              void get()
                .refreshServer(desktopId, { includeAgentStatuses })
                .catch(() => undefined);
            }, REMOTE_SERVER_REFRESH_DEBOUNCE_MS),
          );
        },

        connectAll: async () => {
          // Coalesce concurrent callers (the sidebar and the settings panel both
          // connect on mount) so servers aren't snapshotted twice on startup.
          if (connectAllInFlight) return connectAllInFlight;
          connectAllInFlight = (async () => {
            // The secure browser vault hydrates asynchronously. Sidebar mount
            // can otherwise observe the empty initial state, finish a no-op
            // connection pass, and never reconnect the restored servers.
            if (!useRemoteServersStore.persist.hasHydrated()) {
              await useRemoteServersStore.persist.rehydrate();
            }
            const servers = get().servers.filter(
              (server) => get().hostUpdateRestarts[server.desktopId] === undefined,
            );
            setServersConnecting(servers);
            await Promise.all(servers.map((server) => connectServer(server)));
          })().finally(() => {
            connectAllInFlight = null;
          });
          return connectAllInFlight;
        },

        reconnectServer: async (desktopId) => {
          if (get().hostUpdateRestarts[desktopId] !== undefined) return;
          const server = get().servers.find((entry) => entry.desktopId === desktopId);
          if (!server) return;
          setServersConnecting([server]);
          await connectServer(server);
        },

        getHostUpdateState: async (desktopId) => {
          const requestSeq = nextRemoteHostUpdateSequence();
          remoteHostUpdateRequestSeqByDesktopId.set(desktopId, requestSeq);
          const update = await withClient(desktopId, (client) => client.hostUpdateState());
          if (remoteHostUpdateRequestSeqByDesktopId.get(desktopId) !== requestSeq) return update;
          set((state) => ({ hostUpdates: { ...state.hostUpdates, [desktopId]: update } }));
          return update;
        },

        checkHostUpdate: async (desktopId) => {
          const requestSeq = nextRemoteHostUpdateSequence();
          remoteHostUpdateRequestSeqByDesktopId.set(desktopId, requestSeq);
          const update = await withClient(desktopId, (client) => client.checkHostUpdate());
          if (remoteHostUpdateRequestSeqByDesktopId.get(desktopId) !== requestSeq) return update;
          set((state) => ({ hostUpdates: { ...state.hostUpdates, [desktopId]: update } }));
          return update;
        },

        installHostUpdate: async (desktopId) => {
          if (get().hostUpdateRestarts[desktopId] !== undefined) return;
          const server = get().servers.find((entry) => entry.desktopId === desktopId);
          const status = get().hostUpdates[desktopId]?.status;
          if (!server || status?.type !== "downloaded") {
            await withClient(desktopId, (client) => client.installHostUpdate());
            return;
          }

          const reconnectGeneration = remoteHostUpdateReconnectSeqByDesktopId.get(desktopId);
          await withClient(desktopId, (client) => client.installHostUpdate());
          if (remoteHostUpdateReconnectSeqByDesktopId.get(desktopId) !== reconnectGeneration) {
            return;
          }
          remoteHostUpdateRequestSeqByDesktopId.set(desktopId, nextRemoteHostUpdateSequence());
          const reconnectSeq = nextRemoteHostUpdateSequence();
          remoteHostUpdateReconnectSeqByDesktopId.set(desktopId, reconnectSeq);
          invalidateRemoteServerRefresh(desktopId);
          closeRemoteServerEventSocket(desktopId);
          set((state) => {
            const { [desktopId]: _installed, ...hostUpdates } = state.hostUpdates;
            return {
              hostUpdates,
              hostUpdateRestarts: { ...state.hostUpdateRestarts, [desktopId]: status.version },
            };
          });
          setServersConnecting([server]);
          void reconnectAfterHostUpdate(server, status.version, reconnectSeq);
        },

        setProjectNameOverride: (desktopId, remoteId, name) => {
          set((state) => ({
            projectNameOverrides: {
              ...state.projectNameOverrides,
              [desktopId]: {
                ...state.projectNameOverrides[desktopId],
                [remoteId]: name,
              },
            },
          }));
        },

        setRemoteProjectSynced: (desktopId, remoteId, synced) => {
          const current = get().excludedProjectIds;
          const next = withRemoteProjectSync(current, desktopId, remoteId, synced);
          if (next === current) return;
          set({ excludedProjectIds: next });
          // Re-mirror from the cached snapshot. Selection is local state, so
          // adding or dropping a project never needs the server to be reachable.
          const runtime = get().runtime[desktopId];
          if (runtime) syncRemoteAppRows(desktopId, runtime.projects, runtime.threads);
        },

        runProjectCommand: async (desktopId, command) => {
          await withClient(desktopId, (client) => client.projectCommand(command));
          if (command.kind === "update") {
            get().scheduleServerRefresh(desktopId);
          } else {
            await get().refreshServer(desktopId);
          }
        },

        loadProjectSettings: async (desktopId, projectId) => {
          const settings = await withClient(desktopId, (client) =>
            client.projectSettings(projectId),
          );
          const projectedId = remoteProjectId(desktopId, projectId);
          useAppStore.getState().updateProjectMcpServers(projectedId, settings.mcpServers ?? []);
        },

        browseHostDirectory: async (desktopId, path) => {
          return (await withClient(desktopId, (client) =>
            client.callRemoteProcedure("browseHostDirectory", { path }),
          )) as BrowseHostDirectoryResult;
        },

        withClient,

        saveClipboardImage: (desktopId, input) => {
          return withClient(desktopId, (client) =>
            client.uploadAttachment({
              threadId: input.threadId,
              fileName: `clipboard-${crypto.randomUUID()}.${input.extension}`,
              data: input.data,
            }),
          );
        },

        pickAndUploadFiles: async (desktopId, attachmentThreadId) => {
          return withClient(desktopId, (client) =>
            pickAndUploadBrowserFiles({
              attachmentThreadId,
              upload: (input) => client.uploadAttachment(input),
            }),
          );
        },

        localImageUrl: (desktopId, path) => {
          try {
            return requireClient(desktopId).localImageUrl(path);
          } catch {
            return "";
          }
        },

        imageRefUrl: (desktopId, ref) => {
          try {
            return requireClient(desktopId).imageRefUrl(ref);
          } catch {
            return "";
          }
        },
      };
    },
    {
      name: "poracode-remote-servers",
      storage: createSecureRemoteServersStorage((servers) => ({
        servers,
        excludedProjectIds: {},
        projectWorkspaceIds: {},
        projectNameOverrides: {},
        lastKnownProjects: {},
      })),
      // Persist durable connection identity and
      // last-known projects so offline servers keep their sidebar rows. Live
      // runtime state and threads are re-fetched on connect; socket/client
      // factories stay process-local. Bearer tokens live in the native OS
      // keystore or the browser/Electron WebCrypto vault, not plaintext storage.
      partialize: persistedRemoteServersState,
      version: 1,
      // v1 reserves null in projectWorkspaceIds for an explicit "unfiled"
      // override. Older string-valued entries and absent entries remain valid.
      migrate: (persistedState) => persistedState as RemoteServersState,
    },
  ),
);

registerRemoteProcedureHost({
  resolveThreadOwner: (threadId) => {
    const thread = useAppStore.getState().threads.find((candidate) => candidate.id === threadId);
    return remoteOwner(thread);
  },
  resolveProjectOwner: (projectId) => {
    const project = useAppStore.getState().projects.find((candidate) => candidate.id === projectId);
    return remoteOwner(project);
  },
  withClient: (desktopId, invoke) => useRemoteServersStore.getState().withClient(desktopId, invoke),
});

/**
 * Test-only: tear down all process-local connection state (event sockets,
 * debounce/refresh timers, terminal feed, and seq cursors) so each test starts
 * from a clean slate. Pairing opens an event socket, so leaked module state
 * would otherwise bleed across tests.
 */
export function __resetRemoteServersStoreForTest(): void {
  closeAllRemoteServerEventSockets();
  for (const desktopId of [...remoteServerRefreshTimers.keys()]) {
    clearRemoteServerRefreshTimer(desktopId);
  }
  remoteServerSnapshotSeqByDesktopId.clear();
  remoteThreadAppliedSeqByDesktopId.clear();
  __resetTruncateRecoveryForTest();
  remoteServerThreadItemInterests.clear();
  remoteServerIdentityGenerationByDesktopId.clear();
  remoteServerRefreshSeqByDesktopId.clear();
  remoteServerRowResyncPendingByDesktopId.clear();
  remoteServerAgentStatusRefreshes.clear();
  remoteHostUpdateReconnectSeqByDesktopId.clear();
  remoteHostUpdateRequestSeqByDesktopId.clear();
  clearRemoteGitState();
  resetRemoteProcedureRouterForTest();
  connectAllInFlight = null;
  desktopBrowserBridgeServerId = null;
  desktopBrowserBridgeClientKey = null;
  desktopBrowserMirrorSocket = null;
  setBrowserSocketSender(null);
  if (
    typeof window !== "undefined" &&
    (!!window.poracodeHost || !!window.poracode) &&
    readClientRuntime().host === "browser"
  ) {
    setRemoteBridgeClient(null);
  }
  openRemoteThreadRequestSeq = 0;
  resetRemoteTerminalFeed();
  useAppStore.setState((state) => ({
    projects: state.projects.filter((project) => !project.remoteServerId),
    threads: state.threads.filter((thread) => !thread.remoteServerId),
  }));
  useRemoteServersStore.setState({ openThread: null, hostUpdates: {}, hostUpdateRestarts: {} });
}

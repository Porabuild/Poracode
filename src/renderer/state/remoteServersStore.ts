import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { msg } from "@lingui/core/macro";
import { toast } from "@heroui/react";
import type { BrowseHostDirectoryResult, Project, Thread, TerminalSize } from "@/shared/contracts";
import { friendlyError, msg as sharedMsg } from "@/shared/messages";
import { RemoteClientError, RemoteDesktopClient } from "@/shared/remote/client";
import { reconnectBackoffDelay } from "@/shared/remote/backoff";
import { waitForRemoteThreadAppearance } from "@/shared/remote/threadAppearance";
import { filterKnownRemoteAccessScopes, REMOTE_STANDARD_SCOPES } from "@/shared/remote";
import { readBridge } from "@/renderer/bridge";
import { i18n } from "@/renderer/i18n/i18n";
import {
  registerRemoteProcedureHost,
  releaseRemoteTerminal,
  releaseRemoteTerminalsForServer,
  remoteTerminalOwner,
  resetRemoteProcedureRouterForTest,
} from "@/renderer/remoteProcedureRouter";
import { applyThreadSnapshot, dispatchRemoteSupervisorEvent } from "@/renderer/state/remote";
import { useAppStore } from "@/renderer/state/appStore";
import { seedOlderThreadRuntimeItemsCursor } from "@/renderer/state/chatRuntimePersister";
import {
  projectRemoteProject,
  projectRemoteThread,
  projectRemoteThreadEvent,
  projectRemoteThreadSnapshot,
  remoteOwner,
  remoteProjectId,
} from "@/renderer/state/remoteProjection";
import {
  emitRemoteTerminalExited,
  emitRemoteTerminalReset,
  handleRemoteTerminalServerMessage,
  resetRemoteTerminalFeed,
  setRemoteTerminalSocketSender,
} from "@/renderer/state/remoteTerminalFeed";
import { refreshGitProject } from "@/renderer/state/gitRefresh";
import { useGitStore } from "@/renderer/state/gitStore";
import { pickAndUploadBrowserFiles } from "@/renderer/utils/browserFilePicker";
import {
  filterRemoteThreadEvents,
  shouldRefreshRemoteAgentStatusesAfterEvent,
  shouldRefreshRemoteServerAfterEvent,
} from "@/renderer/state/remoteServers/eventRouting";
import { syncRemoteGitSummaries } from "@/renderer/state/remoteServers/gitSummaries";
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
import {
  filterSyncedRemoteProjects,
  withRemoteProjectSync,
} from "@/renderer/state/remoteServers/projectSync";
import type {
  OpenRemoteThread,
  RemoteClientFactory,
  RemoteServerRecord,
  RemoteServerRuntime,
  RemoteServersState,
  RemoteSocketFactory,
  RemoteSocketLike,
} from "@/renderer/state/remoteServers/types";

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

function isRemoteTransportFailure(error: unknown): boolean {
  if (error instanceof TypeError && /fetch|network|load failed/i.test(error.message)) return true;
  if (error instanceof RemoteClientError && error.status === 0) return true;
  return error instanceof Error && error.cause !== undefined
    ? isRemoteTransportFailure(error.cause)
    : false;
}

const defaultClientFactory: RemoteClientFactory = (endpoint, accessToken) =>
  new RemoteDesktopClient(endpoint, accessToken, mainProcessFetch);

const defaultSocketFactory: RemoteSocketFactory = (url) =>
  new WebSocket(url) as unknown as RemoteSocketLike;

let openRemoteThreadRequestSeq = 0;

/** In-flight connectAll(), so concurrent callers coalesce onto one pass. */
let connectAllInFlight: Promise<void> | null = null;
const REMOTE_SOCKET_RECONNECT_BASE_MS = 1000;
const REMOTE_SOCKET_RECONNECT_MAX_MS = 20_000;
const REMOTE_SOCKET_HEALTH_PING_INTERVAL_MS = 25_000;
const REMOTE_SOCKET_HEALTH_PING_TIMEOUT_MS = 5_000;
const REMOTE_SOCKET_CONNECT_TIMEOUT_MS = 15_000;

interface RemoteServerEventSocketEntry {
  readonly serverKey: string;
  socket: RemoteSocketLike | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  reconnectAttempt: number;
  connecting: boolean;
  connectTimeout: ReturnType<typeof setTimeout> | null;
  healthPingInterval: ReturnType<typeof setInterval> | null;
  healthPingTimeout: ReturnType<typeof setTimeout> | null;
  pendingHealthPingId: string | null;
}

const remoteServerEventSockets = new Map<string, RemoteServerEventSocketEntry>();
const remoteServerSnapshotSeqByDesktopId = new Map<string, number>();
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

/**
 * Mirror a server's snapshot into the app store, restricted to the projects the
 * user syncs. Threads of an unsynced project are dropped too — without their
 * project row they would be orphans in the sidebar.
 */
function syncRemoteAppRows(
  desktopId: string,
  allProjects?: readonly Project[],
  allThreads?: readonly Thread[],
): void {
  const remoteState = useRemoteServersStore.getState();
  const excluded = remoteState.excludedProjectIds[desktopId];
  const projects = allProjects ? filterSyncedRemoteProjects(allProjects, excluded) : undefined;
  // A threads-only update has no project list to scope against, so fall back to
  // the cached snapshot — always written before rows are synced.
  const cachedProjects = remoteState.runtime[desktopId]?.projects ?? [];
  const syncedProjectIds = allThreads
    ? new Set(
        (projects ?? filterSyncedRemoteProjects(cachedProjects, excluded)).map(
          (project) => project.id,
        ),
      )
    : undefined;
  const threads = allThreads?.filter((thread) => syncedProjectIds?.has(thread.projectId));
  const currentProjects = projects
    ? new Map(
        useAppStore
          .getState()
          .projects.filter((project) => project.remoteServerId === desktopId)
          .map((project) => [project.remoteId, project]),
      )
    : null;
  const projectedProjects = projects?.map((project) => {
    const projected = projectRemoteProject(desktopId, project);
    const current = currentProjects?.get(project.id);
    const { workspaceId: remoteWorkspaceId, ...projectWithoutWorkspace } = projected;
    const workspaceId =
      remoteState.projectWorkspaceIds[desktopId]?.[project.id] ??
      (current?.workspaceId !== remoteWorkspaceId ? current?.workspaceId : undefined);
    return {
      ...projectWithoutWorkspace,
      name: remoteState.projectNameOverrides[desktopId]?.[project.id] ?? projected.name,
      ...(workspaceId ? { workspaceId } : {}),
      ...(current?.mcpServers ? { mcpServers: current.mcpServers } : {}),
    };
  });
  const projectedThreads = threads?.map((thread) => projectRemoteThread(desktopId, thread));
  if (projectedProjects) {
    const projectedProjectIds = new Set(projectedProjects.map((project) => project.id));
    for (const project of useAppStore.getState().projects) {
      if (project.remoteServerId === desktopId && !projectedProjectIds.has(project.id)) {
        useAppStore.getState().deleteProject(project.id);
      }
    }
  }
  if (projectedThreads) {
    const projectedThreadIds = new Set(projectedThreads.map((thread) => thread.id));
    for (const thread of useAppStore.getState().threads) {
      if (thread.remoteServerId === desktopId && !projectedThreadIds.has(thread.id)) {
        useAppStore.getState().deleteThread(thread.id);
      }
    }
  }
  useAppStore.setState((state) => ({
    ...(projectedProjects
      ? {
          projects: [
            ...state.projects.filter((project) => project.remoteServerId !== desktopId),
            ...projectedProjects,
          ],
        }
      : {}),
    ...(projectedThreads
      ? {
          threads: [
            ...state.threads.filter((thread) => thread.remoteServerId !== desktopId),
            ...projectedThreads,
          ],
        }
      : {}),
  }));
  if (!projectedProjects) return;
  if (useRemoteServersStore.getState().runtime[desktopId]?.status !== "online") return;
  const gitStatuses = useGitStore.getState().statuses;
  for (const project of projectedProjects) {
    if (gitStatuses[project.id]) continue;
    void refreshGitProject(project, "manual", "full").catch(() => undefined);
  }
}

function removeRemoteAppRows(desktopId: string): void {
  syncRemoteAppRows(desktopId, [], []);
}

function remoteServerEventSocketReconnectDelay(attempt: number): number {
  return reconnectBackoffDelay(attempt, {
    baseMs: REMOTE_SOCKET_RECONNECT_BASE_MS,
    maxMs: REMOTE_SOCKET_RECONNECT_MAX_MS,
  });
}

function clearRemoteServerEventSocketHealth(entry: RemoteServerEventSocketEntry): void {
  if (entry.healthPingInterval) {
    clearInterval(entry.healthPingInterval);
    entry.healthPingInterval = null;
  }
  if (entry.healthPingTimeout) {
    clearTimeout(entry.healthPingTimeout);
    entry.healthPingTimeout = null;
  }
  entry.pendingHealthPingId = null;
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
const remoteServerAgentStatusRefreshes = new Set<string>();

function clearRemoteServerRefreshTimer(desktopId: string): void {
  const timer = remoteServerRefreshTimers.get(desktopId);
  if (timer) {
    clearTimeout(timer);
    remoteServerRefreshTimers.delete(desktopId);
  }
  remoteServerAgentStatusRefreshes.delete(desktopId);
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
        set((state) => {
          const current = state.runtime[desktopId];
          if (!current) return {};
          if (current.status === status && current.message === message) return state;
          return {
            runtime: { ...state.runtime, [desktopId]: { ...current, status, message } },
          };
        });
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
       * shared "not found" error the action callers already surface. */
      const requireClient = (desktopId: string): RemoteDesktopClient => {
        const state = get();
        const server = state.servers.find((entry) => entry.desktopId === desktopId);
        if (!server) throw new Error(i18n._(msg`Remote server not found.`));
        const status = state.runtime[desktopId]?.status;
        if (status !== "online" && status !== "error") {
          throw new RemoteClientError(sharedMsg("remote.server.unreachable"), 0, "offline");
        }
        return state.clientFactory(server.endpoint, server.accessToken);
      };

      const withClient = async <Result>(
        desktopId: string,
        invoke: (client: RemoteDesktopClient) => Promise<Result>,
      ): Promise<Result> => {
        try {
          const result = await invoke(requireClient(desktopId));
          if (get().runtime[desktopId]?.status === "error") {
            set((state) => {
              const current = state.runtime[desktopId];
              if (current?.status !== "error") return {};
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
        void get()
          .clientFactory(server.endpoint, server.accessToken)
          .checkHostUpdate()
          .then((update) => {
            set((state) => ({
              hostUpdates: { ...state.hostUpdates, [server.desktopId]: update },
            }));
          })
          .catch(() => undefined);
      };

      const activateRemoteTerminalFeed = (desktopId: string, socket: RemoteSocketLike) => {
        setRemoteTerminalSocketSender(desktopId, (message) => {
          if (remoteServerEventSockets.get(desktopId)?.socket !== socket || !socket.send) {
            return false;
          }
          try {
            socket.send(JSON.stringify(message));
            return true;
          } catch {
            return false;
          }
        });
      };

      const startRemoteServerEventStream = (server: RemoteServerRecord) => {
        const serverKey = `${server.endpoint}\0${server.accessToken}`;
        const existing = remoteServerEventSockets.get(server.desktopId);
        if (existing?.serverKey === serverKey) return;

        closeRemoteServerEventSocket(server.desktopId);
        const entry: RemoteServerEventSocketEntry = {
          serverKey,
          socket: null,
          reconnectTimer: null,
          reconnectAttempt: 0,
          connecting: false,
          connectTimeout: null,
          healthPingInterval: null,
          healthPingTimeout: null,
          pendingHealthPingId: null,
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
        };

        const scheduleReconnect = () => {
          if (!isCurrent()) return;
          if (get().runtime[server.desktopId]?.status === "online") {
            setSocketStatus("connecting");
          }
          if (entry.reconnectTimer) clearTimeout(entry.reconnectTimer);
          const delay = remoteServerEventSocketReconnectDelay(entry.reconnectAttempt);
          entry.reconnectAttempt += 1;
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

        const startHealthProbe = (socket: RemoteSocketLike) => {
          clearRemoteServerEventSocketHealth(entry);
          const sendHealthPing = () => {
            if (!isCurrent() || entry.socket !== socket || !socket.send) return;
            if (socket.readyState !== undefined && socket.readyState !== 1) return;
            if (entry.pendingHealthPingId !== null) return;
            const id = crypto.randomUUID();
            entry.pendingHealthPingId = id;
            try {
              socket.send(JSON.stringify({ type: "ping", id, sentAt: Date.now() }));
            } catch {
              forceReconnect(socket);
              return;
            }
            entry.healthPingTimeout = setTimeout(() => {
              if (entry.pendingHealthPingId !== id) return;
              forceReconnect(socket);
            }, REMOTE_SOCKET_HEALTH_PING_TIMEOUT_MS);
          };
          entry.healthPingInterval = setInterval(
            sendHealthPing,
            REMOTE_SOCKET_HEALTH_PING_INTERVAL_MS,
          );
        };

        const connect = async () => {
          if (!isCurrent() || entry.connecting || entry.socket) return;
          entry.connecting = true;
          try {
            const client = get().clientFactory(server.endpoint, server.accessToken);
            const ticket = await client.websocketTicket();
            if (!isCurrent()) return;
            const lastSeenSeq = remoteServerSnapshotSeqByDesktopId.get(server.desktopId) ?? 0;
            const socket = get().socketFactory(client.websocketUrl(ticket, lastSeenSeq));
            if (!isCurrent()) {
              try {
                socket.close();
              } catch {
                // already closed
              }
              return;
            }
            entry.socket = socket;
            entry.connectTimeout = setTimeout(() => {
              forceReconnect(socket);
            }, REMOTE_SOCKET_CONNECT_TIMEOUT_MS);
            const activateSocket = () => {
              if (!isCurrent() || entry.socket !== socket) return;
              clearRemoteServerEventSocketConnectTimeout(entry);
              entry.reconnectAttempt = 0;
              activateRemoteTerminalFeed(server.desktopId, socket);
              startHealthProbe(socket);
              setSocketStatus("online");
            };
            socket.onopen = activateSocket;
            if (socket.readyState === undefined || socket.readyState === 1) {
              activateSocket();
            }
            const resyncOpenThread = async () => {
              if (resyncInFlight) return;
              const open = get().openThread;
              if (!open || open.desktopId !== server.desktopId) return;
              resyncInFlight = true;
              try {
                const nextSnapshot = await client.threadHistory(open.threadId);
                const currentOpen = get().openThread;
                if (
                  !currentOpen ||
                  currentOpen.desktopId !== server.desktopId ||
                  currentOpen.threadId !== open.threadId
                ) {
                  return;
                }
                applyThreadSnapshot(projectRemoteThreadSnapshot(server.desktopId, nextSnapshot));
                remoteServerSnapshotSeqByDesktopId.set(
                  server.desktopId,
                  Math.max(
                    remoteServerSnapshotSeqByDesktopId.get(server.desktopId) ?? 0,
                    nextSnapshot.snapshotSeq,
                  ),
                );
                set({
                  openThread: buildOpenThread(server.desktopId, nextSnapshot),
                });
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
              try {
                const message = client.parseSocketMessage(String(event.data));
                if (message.type === "pong") {
                  if (
                    entry.pendingHealthPingId !== null &&
                    message.id === entry.pendingHealthPingId
                  ) {
                    entry.pendingHealthPingId = null;
                    if (entry.healthPingTimeout) {
                      clearTimeout(entry.healthPingTimeout);
                      entry.healthPingTimeout = null;
                    }
                  }
                  return;
                }
                if (handleRemoteTerminalServerMessage(server.desktopId, message)) {
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
                  if (open?.desktopId === server.desktopId) {
                    remoteThreadIds.add(open.threadId);
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
                    releaseRemoteTerminal(terminalId);
                  }
                  const forward = filterRemoteThreadEvents(message.event, remoteThreadIds);
                  if (forward !== null) {
                    dispatchRemoteSupervisorEvent(
                      projectRemoteThreadEvent(server.desktopId, forward),
                      {
                        onGitSummaries: (summaries) =>
                          syncRemoteGitSummaries(server.desktopId, summaries),
                        onGitState: (patch) => syncRemoteGitStatePatch(server.desktopId, patch),
                      },
                    );
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
                  get().scheduleServerRefresh(server.desktopId);
                  void resyncOpenThread();
                }
              } catch {
                // HTTP snapshots remain authoritative; ignore malformed frames.
              }
            };
            socket.onclose = () => {
              disconnectSocket(socket);
            };
          } catch (error) {
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

        void connect();
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
        for (const server of servers) {
          const runtime = get().runtime[server.desktopId];
          if (runtime) syncRemoteAppRows(server.desktopId, runtime.projects, runtime.threads);
        }
      };

      /** Restore a server's transport (SSH tunnel) when needed, then snapshot
       * it and (re)attach its event stream. Shared by connectAll and
       * reconnectServer so transport handling lives in one place. */
      const connectServer = async (persistedServer: RemoteServerRecord): Promise<void> => {
        let server = persistedServer;
        if (server.transport?.kind === "ssh") {
          try {
            const launched = await readBridge().sshConnect({
              connection: server.transport.connection,
            });
            server = { ...server, endpoint: normalizeEndpoint(launched.endpoint) };
            const updated = server;
            set((state) => ({
              servers: state.servers.map((candidate) =>
                candidate.desktopId === updated.desktopId ? updated : candidate,
              ),
            }));
          } catch (error) {
            reportRemoteServerError(server.desktopId, error, i18n._(msg`SSH connection failed.`));
            return;
          }
        }
        try {
          const environment = await get()
            .clientFactory(server.endpoint, server.accessToken)
            .environment();
          const keepsLocalAlias =
            server.remoteLabel !== undefined && server.label !== server.remoteLabel;
          server = {
            ...server,
            label: keepsLocalAlias ? server.label : environment.label,
            remoteLabel: environment.label,
            appVersion: environment.appVersion,
            ...(environment.hostMode ? { hostMode: environment.hostMode } : {}),
          };
          const updated = server;
          set((state) => ({
            servers: state.servers.map((candidate) =>
              candidate.desktopId === updated.desktopId ? updated : candidate,
            ),
          }));
        } catch {
          // refreshServer below owns the visible connection error.
        }
        await get().refreshServer(server.desktopId);
        startRemoteServerEventStream(server);
        checkHostUpdateInBackground(server);
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
          ...(environment.hostMode ? { hostMode: environment.hostMode } : {}),
          transport: input.transport,
        };
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
        startRemoteServerEventStream(record);
        checkHostUpdateInBackground(record);
        return record;
      };

      return {
        servers: [],
        runtime: {},
        hostUpdates: {},
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

        launchRemoteThread: async (input) => {
          const runtime = get().runtime[input.desktopId];
          const project = runtime?.projects.find((entry) => entry.id === input.projectId);
          if (!project) throw new Error(i18n._(msg`Remote project not found.`));
          const result = await withClient(input.desktopId, (client) =>
            client.startNewThread({
              projectId: input.projectId,
              agentKind: input.agentKind,
              config: input.config,
              prompt: input.prompt,
              ...(input.segments ? { segments: input.segments } : {}),
              presentationMode: input.presentationMode,
              ...(input.worktreePath ? { worktreePath: input.worktreePath } : {}),
              ...(input.worktreeBranch ? { worktreeBranch: input.worktreeBranch } : {}),
              ...(input.isNewWorktree ? { isNewWorktree: true } : {}),
            }),
          );
          const appeared = await waitForRemoteThreadAppearance({
            refresh: () => get().refreshServer(input.desktopId),
            hasThread: () =>
              get().runtime[input.desktopId]?.threads.some(
                (thread) => thread.id === result.threadId,
              ) ?? false,
          });
          if (!appeared) throw new Error(i18n._(msg`Unable to start the remote thread.`));
          await get().openRemoteThread(input.desktopId, result.threadId);
        },

        openRemoteThread: async (desktopId, threadId) => {
          const requestSeq = openRemoteThreadRequestSeq + 1;
          openRemoteThreadRequestSeq = requestSeq;
          const server = get().servers.find((entry) => entry.desktopId === desktopId);
          if (!server) {
            // Never reject: sidebar rows call this via `void openRemoteThread(...)`
            // and the renderer's global unhandledrejection handler crash-screens
            // on any stray rejection. Surface the failure as a toast instead.
            reportRemoteServerError(
              desktopId,
              new Error(i18n._(msg`Remote server not found.`)),
              i18n._(msg`Remote server not found.`),
            );
            return;
          }
          // Hydrate the thread's history into the shared, threadId-keyed runtime
          // store so the desktop ChatPane renders it (coexists with local threads).
          // A failed history fetch (server asleep/unreachable) must not reject.
          let snapshot: Awaited<ReturnType<RemoteDesktopClient["threadHistory"]>>;
          try {
            snapshot = await withClient(desktopId, (client) => client.threadHistory(threadId));
          } catch (error) {
            if (requestSeq !== openRemoteThreadRequestSeq) return;
            toast.danger(friendlyError(error) || i18n._(msg`Failed to open remote thread.`));
            return;
          }
          if (requestSeq !== openRemoteThreadRequestSeq) return;
          const projectedSnapshot = projectRemoteThreadSnapshot(desktopId, snapshot);
          const viewThreadId = projectedSnapshot.thread.id;
          const firstSnapshotItemId = projectedSnapshot.runtimeItems[0]?.id;
          const existingRuntimeItemIds =
            useAppStore.getState().runtimeItemIdsByThread[viewThreadId] ?? [];
          seedOlderThreadRuntimeItemsCursor(
            viewThreadId,
            projectedSnapshot.runtimeNextCursor ?? null,
            {
              preserveExistingCursor:
                firstSnapshotItemId !== undefined &&
                existingRuntimeItemIds.includes(firstSnapshotItemId),
            },
          );
          applyThreadSnapshot(projectedSnapshot);
          const openThread = buildOpenThread(desktopId, snapshot);
          set({ openThread });
          useAppStore.getState().openThread(openThread.thread.id);
          remoteServerSnapshotSeqByDesktopId.set(
            desktopId,
            Math.max(remoteServerSnapshotSeqByDesktopId.get(desktopId) ?? 0, snapshot.snapshotSeq),
          );
          startRemoteServerEventStream(server);
          const eventSocket = remoteServerEventSockets.get(desktopId)?.socket;
          if (eventSocket) activateRemoteTerminalFeed(desktopId, eventSocket);
        },

        closeRemoteThread: () => {
          openRemoteThreadRequestSeq += 1;
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
          closeRemoteServerEventSocket(desktopId);
          // If the open live-chat thread belongs to this server, tear it (and its
          // socket) down first so it isn't left orphaned with no way to interact.
          if (get().openThread?.desktopId === desktopId) {
            get().closeRemoteThread();
          }
          set((state) => {
            const { [desktopId]: _removed, ...runtime } = state.runtime;
            const { [desktopId]: _removedUpdate, ...hostUpdates } = state.hostUpdates;
            return {
              servers: state.servers.filter((server) => server.desktopId !== desktopId),
              runtime,
              hostUpdates,
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
            const threads = reuseRemoteRows(current?.threads ?? [], snapshot.threads);
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
            if (projectsChanged || threadsChanged) {
              syncRemoteAppRows(
                desktopId,
                projectsChanged ? projects : undefined,
                threadsChanged ? threads : undefined,
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
              set({ openThread: null });
            }
          } catch (error) {
            if (!isLatest()) return;
            setRuntime({
              status: isRemoteTransportFailure(error) ? "offline" : "error",
              message: friendlyError(error) || i18n._(msg`Connection failed.`),
              projects: cached()?.projects ?? [],
              threads: cached()?.threads ?? [],
            });
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
          const servers = get().servers;
          setServersConnecting(servers);
          connectAllInFlight = Promise.all(servers.map(connectServer))
            .then(() => undefined)
            .finally(() => {
              connectAllInFlight = null;
            });
          return connectAllInFlight;
        },

        reconnectServer: async (desktopId) => {
          const server = get().servers.find((entry) => entry.desktopId === desktopId);
          if (!server) return;
          setServersConnecting([server]);
          await connectServer(server);
        },

        getHostUpdateState: async (desktopId) => {
          const update = await withClient(desktopId, (client) => client.hostUpdateState());
          set((state) => ({ hostUpdates: { ...state.hostUpdates, [desktopId]: update } }));
          return update;
        },

        checkHostUpdate: async (desktopId) => {
          const update = await withClient(desktopId, (client) => client.checkHostUpdate());
          set((state) => ({ hostUpdates: { ...state.hostUpdates, [desktopId]: update } }));
          return update;
        },

        installHostUpdate: (desktopId) =>
          withClient(desktopId, (client) => client.installHostUpdate()),

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
      storage: createJSONStorage(() => localStorage),
      // Persist durable connection identity (incl. the bearer accessToken) and
      // last-known projects so offline servers keep their sidebar rows. Live
      // runtime state and threads are re-fetched on connect; socket/client
      // factories stay process-local. Storing the token in renderer localStorage
      // mirrors the PWA (IndexedDB) and is scoped to the Electron renderer; the
      // server can revoke a session at any time.
      partialize: persistedRemoteServersState,
    },
  ),
);

/**
 * Mirror local project workspace assignments back into the remote state so the
 * sync layer keeps a stable record across reloads and server reconnects.
 *
 * Installed from `app.tsx` (like `installRemoteGitSummaryPublisher`): the
 * module-scope equivalent would touch `useAppStore` during its own
 * initialization, which hits the `appStore` ⇄ `remoteServersStore` import
 * cycle's TDZ before `useAppStore` is defined.
 */
export function installRemoteProjectWorkspaceSync(): () => void {
  return useAppStore.subscribe((state, previousState) => {
    if (state.projects === previousState.projects) return;
    const previousProjects = new Map(
      previousState.projects.map((project) => [project.id, project]),
    );
    const changes: Array<{
      desktopId: string;
      remoteId: string;
      workspaceId: string | undefined;
    }> = [];
    for (const project of state.projects) {
      if (!project.remoteServerId || !project.remoteId) continue;
      const previous = previousProjects.get(project.id);
      if (!previous || previous.workspaceId === project.workspaceId) continue;
      changes.push({
        desktopId: project.remoteServerId,
        remoteId: project.remoteId,
        workspaceId: project.workspaceId,
      });
    }
    if (changes.length === 0) return;

    useRemoteServersStore.setState((remoteState) => {
      let projectWorkspaceIds = remoteState.projectWorkspaceIds;
      for (const change of changes) {
        const currentForServer = projectWorkspaceIds[change.desktopId] ?? {};
        const currentWorkspaceId = currentForServer[change.remoteId];
        if (currentWorkspaceId === change.workspaceId) continue;
        const nextForServer = { ...currentForServer };
        if (change.workspaceId) nextForServer[change.remoteId] = change.workspaceId;
        else delete nextForServer[change.remoteId];
        projectWorkspaceIds = {
          ...projectWorkspaceIds,
          [change.desktopId]: nextForServer,
        };
      }
      return projectWorkspaceIds === remoteState.projectWorkspaceIds ? {} : { projectWorkspaceIds };
    });
  });
}

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
  remoteServerRefreshSeqByDesktopId.clear();
  remoteServerAgentStatusRefreshes.clear();
  clearRemoteGitState();
  resetRemoteProcedureRouterForTest();
  connectAllInFlight = null;
  openRemoteThreadRequestSeq = 0;
  resetRemoteTerminalFeed();
  useAppStore.setState((state) => ({
    projects: state.projects.filter((project) => !project.remoteServerId),
    threads: state.threads.filter((thread) => !thread.remoteServerId),
  }));
  useRemoteServersStore.setState({ openThread: null, hostUpdates: {} });
}

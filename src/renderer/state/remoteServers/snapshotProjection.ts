import { msg } from "@lingui/core/macro";
import { toast } from "@heroui/react";
import type { Thread, Project, TerminalSize } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import {
  REMOTE_BOUNDED_READ_DEFAULT_MAX_DECODE_BYTES,
  REMOTE_BOUNDED_READ_DEFAULT_MAX_WIRE_BYTES,
  isRemoteBoundedReadProtocolError,
  isRemoteTransportFailure,
  type RemoteBoundedShellSnapshotPage,
  type RemoteDesktopClient,
} from "@/shared/remote/client";
import { i18n } from "@/renderer/i18n/i18n";
import { useAppStore } from "@/renderer/state/appStore";
import { finalizeProjectRemoval } from "@/renderer/state/projectRemovalPresentation";
import {
  applyCachedSlashCommandCatalogs,
  fetchSlashCommandCatalog,
  refreshSlashCommandCatalogs,
} from "./slashCommandCatalogs";
import {
  setOlderThreadHistoryContinuation,
  setOlderThreadHistoryInvalidation,
} from "@/renderer/state/chatRuntimePersister";
import { trackPendingRemoteThreadOpen } from "./pendingRemoteThreadOpens";
import { removeConfirmedHostThread } from "@/renderer/state/hostThreadRowRemoval";
import { readHostThreadHistory } from "@/renderer/state/hostThreadHistory";
import { protectedThreadRowIds } from "@/renderer/state/protectedThreadRows";
import {
  projectRemoteThread,
  remoteProjectId,
  remoteThreadId,
  unprojectRemoteThreadId,
} from "@/renderer/state/remoteProjection";
import {
  bumpRemoteServerSnapshotSeq,
  currentRemoteServerGeneration,
  getRemoteServerEventSocketEntry,
  remoteServerResumeFence,
  remoteServerSnapshotSeq,
  remoteThreadAppliedSeq,
} from "./eventSocketRegistry";
import { syncDesktopBrowserBridgeClient } from "./browserBridge";
import {
  clearRemoteServerRefreshTimer,
  isRemoteServerRefreshCurrent,
  nextRemoteServerRefreshRequestSeq,
  takeRemoteServerRowResyncPending,
} from "./connectionRefresh";
import { syncRemoteGitSummaries } from "./gitSummaries";
import { syncRemoteGitStateSnapshot } from "./gitState";
import { replaceCachedProjects } from "./projectCache";
import { applyRemoteCatalogOrder, syncRemoteAppRows } from "./appRows";
import { recordHostWorkspaces } from "./hostWorkspacePlacement";
import { reconcileThreadRowsWithAppliedEvents, reuseRemoteRows } from "./rowReuse";
import {
  beginBoundedCatalogAttempt,
  boundedCatalogRemovalMark,
  configureBoundedCatalogController,
  installBoundedCatalogShellPage,
  isKnownLegacyCatalogConnection,
  noteBoundedCatalogLegacy,
} from "./catalog/boundedCatalogController";
import {
  bumpCatalogOrderGenerationFor,
  catalogOrderGenerationFor,
  catalogOrderIntentInFlightFor,
} from "./catalog/catalogOrderFence";
import { orderCatalogRowsById, type CatalogKind } from "./catalog/boundedCatalogAlgorithm";
import {
  forgetBoundedHistoryThreadByViewId,
  loadOlderBoundedCompletedTurns,
} from "./catalog/boundedHistory";
import { REMOTE_SHELL_THREAD_PAGE_LIMIT } from "./pairing";
import { remoteConnectionKey } from "./types";
import { remoteServerFailureMessage } from "./failureMessage";
import type {
  OpenRemoteThread,
  RemoteServerRecord,
  RemoteServerRuntime,
  RemoteSocketLike,
} from "./types";
import type {
  RemoteServerClientBindings,
  RemoteServersStoreApi,
  StartRemoteServerEventStream,
} from "./storeClient";

let openRemoteThreadRequestSeq = 0;

/**
 * Stable identity of the paired/remote bounded-catalog consumer. The consumer
 * registry is keyed by this id, so re-registering the store never displaces
 * the managed root's consumer (and vice versa).
 */
export const REMOTE_SERVERS_CATALOG_CONSUMER_ID = "remote-servers";

export function __resetOpenRemoteThreadRequestSeqForTest(): void {
  openRemoteThreadRequestSeq = 0;
}

/** Maps a thread-history snapshot to the openThread slice (terminal fields only when present). */
export function buildOpenThread(
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

export interface SnapshotProjectionActionDeps extends RemoteServersStoreApi {
  readonly withClient: RemoteServerClientBindings["withClient"];
  readonly clientForServer: RemoteServerClientBindings["clientForServer"];
  readonly reportRemoteServerError: RemoteServerClientBindings["reportRemoteServerError"];
  readonly startRemoteServerEventStream: StartRemoteServerEventStream;
  readonly activateRemoteTerminalFeed: (desktopId: string, socket: RemoteSocketLike) => void;
}

export function createSnapshotProjectionActions(deps: SnapshotProjectionActionDeps) {
  const {
    set,
    get,
    withClient,
    clientForServer,
    reportRemoteServerError,
    startRemoteServerEventStream,
    activateRemoteTerminalFeed,
  } = deps;

  const findServer = (connectionKey: string) =>
    get().servers.find((entry) => remoteConnectionKey(entry) === connectionKey);

  const commitBoundedThreadRows = (
    connectionKey: string,
    rows: Thread[],
    preserveThreadIds: ReadonlySet<string>,
  ): void => {
    set((state) => {
      const current = state.runtime[connectionKey];
      if (!current) return state;
      if (
        current.threads === rows &&
        current.status === "online" &&
        current.message === undefined
      ) {
        return state;
      }
      const { message: _message, ...rest } = current;
      return {
        runtime: {
          ...state.runtime,
          [connectionKey]: { ...rest, status: "online", threads: rows },
        },
      };
    });
    syncRemoteAppRows(connectionKey, undefined, rows, { preserveThreadIds, partial: true });
  };

  const commitBoundedProjectRows = (connectionKey: string, rows: Project[]): void => {
    set((state) => {
      const current = state.runtime[connectionKey];
      if (!current) return state;
      const projectsChanged = current.projects !== rows;
      const lastKnownProjects = projectsChanged
        ? replaceCachedProjects(state.lastKnownProjects, connectionKey, rows)
        : state.lastKnownProjects;
      if (!projectsChanged && lastKnownProjects === state.lastKnownProjects) return state;
      return {
        runtime: { ...state.runtime, [connectionKey]: { ...current, projects: rows } },
        lastKnownProjects,
      };
    });
    syncRemoteAppRows(connectionKey, rows, undefined, { partial: true });
  };

  const removeBoundedThreadRows = (connectionKey: string, threadIds: readonly string[]): void => {
    const removed = new Set(threadIds);
    const server = findServer(connectionKey);
    const visualHostId = server ? connectionIdentityCache.get(server)?.visualHostId : undefined;
    set((state) => {
      const current = state.runtime[connectionKey];
      if (!current) return state;
      const threads = current.threads.filter((thread) => !removed.has(thread.id));
      if (threads.length === current.threads.length) return state;
      return { runtime: { ...state.runtime, [connectionKey]: { ...current, threads } } };
    });
    for (const threadId of threadIds) {
      const viewThreadId = remoteThreadId(connectionKey, threadId);
      removeConfirmedHostThread({ viewThreadId, hostThreadId: threadId, visualHostId });
    }
  };

  const removeBoundedProjectRows = (connectionKey: string, projectIds: readonly string[]): void => {
    const removed = new Set(projectIds);
    set((state) => {
      const current = state.runtime[connectionKey];
      if (!current) return state;
      const projects = current.projects.filter((project) => !removed.has(project.id));
      if (projects.length === current.projects.length) return state;
      const lastKnownProjects = current.projects.some((project) => removed.has(project.id))
        ? replaceCachedProjects(
            state.lastKnownProjects,
            connectionKey,
            current.projects.filter((project) => !removed.has(project.id)),
          )
        : state.lastKnownProjects;
      return {
        runtime: { ...state.runtime, [connectionKey]: { ...current, projects } },
        lastKnownProjects,
      };
    });
    for (const projectId of projectIds) {
      const viewProjectId = remoteProjectId(connectionKey, projectId);
      finalizeProjectRemoval(viewProjectId);
    }
  };

  const protectedBoundedThreadIds = (connectionKey: string): ReadonlySet<string> => {
    const protectedIds = new Set<string>();
    // The connection's open thread (a background attach keeps its terminal
    // seed) and every row protected on any host, in this host's ids.
    const openThread = get().openThread;
    if (openThread?.desktopId === connectionKey) protectedIds.add(openThread.threadId);
    for (const viewThreadId of protectedThreadRowIds()) {
      const remoteId = unprojectRemoteThreadId(connectionKey, viewThreadId);
      if (remoteId) protectedIds.add(remoteId);
    }
    return protectedIds;
  };

  // The controller only needs a stable per-connection client: the record
  // reference changes on re-pairing/rotation, so the WeakMap naturally drops
  // the retired client instead of serving it to a successor generation.
  const connectionIdentityCache = new WeakMap<
    RemoteServerRecord,
    { client: RemoteDesktopClient; visualHostId: string }
  >();
  // Authoritative manual order for one connection: the runtime rows and the
  // exact projected app-store slots that belong to this connection (other
  // hosts and managed-root rows keep their positions).
  const reorderBoundedRuntimeRows = (
    connectionKey: string,
    kind: CatalogKind,
    orderedIds: readonly string[],
  ): void => {
    set((state) => {
      const current = state.runtime[connectionKey];
      if (!current) return state;
      if (kind === "threads") {
        const threads = orderCatalogRowsById(current.threads, orderedIds);
        if (threads === current.threads) return state;
        return { runtime: { ...state.runtime, [connectionKey]: { ...current, threads } } };
      }
      const projects = orderCatalogRowsById(current.projects, orderedIds);
      if (projects === current.projects) return state;
      return { runtime: { ...state.runtime, [connectionKey]: { ...current, projects } } };
    });
  };
  configureBoundedCatalogController(
    {
      id: REMOTE_SERVERS_CATALOG_CONSUMER_ID,
      ownsConnection: (connectionKey) => findServer(connectionKey) !== undefined,
    },
    {
      connectionIdentity: (connectionKey) => {
        const server = findServer(connectionKey);
        if (!server) return undefined;
        let cached = connectionIdentityCache.get(server);
        if (!cached) {
          cached = { client: clientForServer(server), visualHostId: server.desktopId };
          connectionIdentityCache.set(server, cached);
        }
        return {
          generation: currentRemoteServerGeneration(connectionKey),
          identity: `${server.desktopId}\u0000${server.endpoint}`,
          client: cached.client,
        };
      },
      runtimeThreads: (connectionKey) => get().runtime[connectionKey]?.threads,
      runtimeProjects: (connectionKey) => get().runtime[connectionKey]?.projects,
      runtimeStatus: (connectionKey) => get().runtime[connectionKey]?.status,
      commitThreadRows: commitBoundedThreadRows,
      commitProjectRows: commitBoundedProjectRows,
      removeThreadRows: removeBoundedThreadRows,
      removeProjectRows: removeBoundedProjectRows,
      withClient: (connectionKey, invoke) => withClient(connectionKey, invoke),
      reportProtocolError: (connectionKey, error) => {
        reportRemoteServerError(connectionKey, error, i18n._(msg`The remote catalog read failed.`));
      },
      appliedThreadSeq: remoteThreadAppliedSeq,
      connectionSeq: remoteServerSnapshotSeq,
      bumpConnectionSeq: bumpRemoteServerSnapshotSeq,
      protectedThreadIds: protectedBoundedThreadIds,
      // Paired connections declare manual-order convergence exactly like the
      // managed root: a completed manual paint pass applies the host's id order
      // to this connection's runtime rows and projected app-store slots, and
      // membership events refresh the paint so an external reorder or a
      // host-prepended row converges without a reconnect. The fence is keyed by
      // this connection key, so one host's order can never invalidate another's
      // walk and a local reorder keeps its optimistic paint until the host
      // confirms it.
      manualOrderConvergence: {
        generation: (connectionKey, kind) => catalogOrderGenerationFor(connectionKey, kind),
        apply: (connectionKey, kind, orderedIds, generation) => {
          if (generation !== catalogOrderGenerationFor(connectionKey, kind)) return "stale";
          if (catalogOrderIntentInFlightFor(connectionKey, kind)) return "deferred";
          bumpCatalogOrderGenerationFor(connectionKey, kind);
          reorderBoundedRuntimeRows(connectionKey, kind, orderedIds);
          applyRemoteCatalogOrder(connectionKey, kind, orderedIds);
          return "applied";
        },
      },
      isForeground: () => typeof document === "undefined" || document.visibilityState === "visible",
    },
  );
  setOlderThreadHistoryContinuation((viewThreadId) => loadOlderBoundedCompletedTurns(viewThreadId));
  setOlderThreadHistoryInvalidation((viewThreadId) =>
    forgetBoundedHistoryThreadByViewId(viewThreadId),
  );

  const patchBoundedAgentStatuses = async (
    connectionKey: string,
    statusesPromise: Promise<RemoteServerRuntime["agentStatuses"]>,
    isLatest: () => boolean,
  ): Promise<void> => {
    const statuses = await statusesPromise;
    if (statuses === undefined || !isLatest()) return;
    set((state) => {
      const current = state.runtime[connectionKey];
      if (!current) return state;
      if (current.agentStatuses === statuses) return state;
      if (
        current.agentStatuses &&
        JSON.stringify(current.agentStatuses.windows) === JSON.stringify(statuses.windows) &&
        JSON.stringify(current.agentStatuses.wsl) === JSON.stringify(statuses.wsl)
      ) {
        return state;
      }
      return {
        runtime: { ...state.runtime, [connectionKey]: { ...current, agentStatuses: statuses } },
      };
    });
  };

  const installBoundedShellPage = (
    connectionKey: string,
    page: RemoteBoundedShellSnapshotPage,
    readStartedAt: number,
  ): void => {
    bumpRemoteServerSnapshotSeq(connectionKey, page.snapshotSeq, undefined, page.snapshotEpoch);
    installBoundedCatalogShellPage(connectionKey, page, readStartedAt);
    if (page.gitSummariesByThread) {
      syncRemoteGitSummaries(connectionKey, page.gitSummariesByThread);
    }
    if (page.gitState) syncRemoteGitStateSnapshot(connectionKey, page.gitState);
  };

  const loadAgentSlashCommands = async (desktopId: string, agentKind: string): Promise<void> => {
    const server = findServer(desktopId);
    if (!server) return;
    const generation = currentRemoteServerGeneration(desktopId);
    await fetchSlashCommandCatalog(server.endpoint, agentKind, () =>
      withClient(desktopId, (client) => client.agentSlashCommands(agentKind)).then(
        (result) => result.commands,
      ),
    );
    if (
      findServer(desktopId)?.endpoint !== server.endpoint ||
      currentRemoteServerGeneration(desktopId) !== generation
    ) {
      return;
    }
    set((state) => {
      const current = state.runtime[desktopId];
      if (!current?.agentStatuses) return state;
      return {
        runtime: {
          ...state.runtime,
          [desktopId]: {
            ...current,
            agentStatuses: applyCachedSlashCommandCatalogs(server.endpoint, current.agentStatuses),
          },
        },
      };
    });
    syncDesktopBrowserBridgeClient(get());
  };

  return {
    loadAgentSlashCommands,
    openRemoteThread: (
      desktopId: string,
      threadId: string,
      options?: {
        readonly focus?: boolean;
        readonly quiet?: boolean;
        readonly signal?: AbortSignal;
      },
    ): Promise<boolean> =>
      // Registered so a pane's hydration joins this read instead of starting
      // its own.
      trackPendingRemoteThreadOpen(
        remoteThreadId(desktopId, threadId),
        (async (): Promise<boolean> => {
          const focus = options?.focus ?? true;
          const requestSeq = openRemoteThreadRequestSeq + 1;
          openRemoteThreadRequestSeq = requestSeq;
          const read = await readHostThreadHistory(
            {
              id: remoteThreadId(desktopId, threadId),
              remoteServerId: desktopId,
              remoteId: threadId,
            },
            options?.signal ? { signal: options.signal } : {},
          );
          const server = findServer(desktopId);
          if (read.kind !== "installed" || !server) {
            if (requestSeq !== openRemoteThreadRequestSeq) return false;
            // Background attaches pass quiet: the sidebar's server status
            // already shows an unreachable host.
            if ((read.kind === "failed" || read.kind === "offline") && !options?.quiet) {
              toast.danger(friendlyError(read.error) || i18n._(msg`Failed to open remote thread.`));
            }
            return false;
          }
          const snapshot = read.hostSnapshot;
          // WS3-A: the agent-statuses fetch omitted slash-command catalogs, so
          // the opened thread's agent catalog is fetched once, on first use.
          const openedThread = snapshot.thread;
          if (openedThread.agentKind) {
            void loadAgentSlashCommands(desktopId, openedThread.agentKind).catch(() => {
              // Slash commands stay absent until the next open/refresh; the
              // menu must not crash or toast for a lazy enhancement.
            });
          }
          await startRemoteServerEventStream(server);
          const eventSocket = getRemoteServerEventSocketEntry(desktopId)?.socket;
          if (eventSocket) activateRemoteTerminalFeed(desktopId, eventSocket);
          if (!focus) {
            // Background attach never steals focus. Still track the slice when
            // latest so a single-pane restore keeps its terminal seed.
            if (requestSeq === openRemoteThreadRequestSeq) {
              set({ openThread: buildOpenThread(desktopId, snapshot) });
            }
            return true;
          }
          if (requestSeq !== openRemoteThreadRequestSeq) return false;
          const openThread = buildOpenThread(desktopId, snapshot);
          set({ openThread });
          // Focus is caller-owned: a restore must not yank the view back if the
          // user navigated away while the history read was in flight.
          useAppStore.getState().openThread(openThread.thread.id);
          return true;
        })(),
      ),

    closeRemoteThread: () => {
      // Live content follows the panes' interest leases; closing the slice
      // only ends this open.
      openRemoteThreadRequestSeq += 1;
      if (get().openThread) set({ openThread: null });
    },

    refreshServer: async (
      desktopId: string,
      options: { readonly includeAgentStatuses?: boolean } = {},
    ): Promise<void> => {
      const server = get().servers.find((entry) => remoteConnectionKey(entry) === desktopId);
      if (!server) return;
      // A debounced refresh may already be pending; this immediate refresh
      // supersedes it so we don't fire a second GET moments later.
      clearRemoteServerRefreshTimer(desktopId);
      // Tag this refresh with a monotonic request id. Two sockets can each
      // trigger a refresh, and their snapshot GETs may resolve out of order;
      // ignore any result that isn't the latest so a stale snapshot never
      // overwrites a newer one (e.g. shows "running" after "finished").
      const requestSeq = nextRemoteServerRefreshRequestSeq(desktopId);
      const isLatest = () => isRemoteServerRefreshCurrent(desktopId, requestSeq);
      // A refresh whose snapshot crossed an event-stream epoch change may
      // describe the previous server instance; it repaints from a new read
      // instead of raising the new epoch's resume cursor.
      const resumeFenceAtStart = remoteServerResumeFence(desktopId);
      const crossedEpochChange = (): boolean => {
        if (remoteServerResumeFence(desktopId) === resumeFenceAtStart) return false;
        get().scheduleServerRefresh(desktopId);
        return true;
      };
      // Replace the whole runtime entry; snapshots are kept across a
      // connecting/error transition so the UI doesn't flash empty. Skip the
      // write if the server was removed while a refresh was in flight, so a
      // late snapshot doesn't resurrect a removed server's runtime.
      const setRuntime = (entry: RemoteServerRuntime) =>
        set((state) => {
          if (!state.servers.some((s) => remoteConnectionKey(s) === desktopId)) return state;
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
        const client = clientForServer(server);
        // A reconnect starts fresh bounded passes; an in-memory cursor from
        // the previous session must not be resumed across the gap.
        if (cached()?.status !== "online") beginBoundedCatalogAttempt(desktopId);
        const includeAgentStatuses = options.includeAgentStatuses !== false;
        const agentStatusesPromise: Promise<RemoteServerRuntime["agentStatuses"]> =
          includeAgentStatuses
            ? client
                .agentStatuses({ omitSlashCommands: true })
                .then((statuses) =>
                  isLatest()
                    ? refreshSlashCommandCatalogs(server.endpoint, statuses, (kind) =>
                        client.agentSlashCommands(kind).then((result) => result.commands),
                      )
                    : statuses,
                )
            : Promise.resolve(cached()?.agentStatuses);
        // The request starts eagerly so it overlaps the shell probe, but the
        // probe may throw or be superseded before anything awaits this
        // promise. Mark its rejection observed at creation: the awaited
        // branches below still surface a failure through the refresh's error
        // state, while the superseded/probe-failure branches can never reach
        // the renderer's global unhandled-rejection handler (crash screen).
        void agentStatusesPromise.catch(() => undefined);
        // B4 declared read: ONE bounded shell page paints first. The result's
        // negotiation verdict decides the path; only an absent echo downgrades
        // to the assembled legacy snapshot, anything else must throw.
        if (!isKnownLegacyCatalogConnection(desktopId)) {
          const removalMark = boundedCatalogRemovalMark();
          const bounded = await client.boundedShellSnapshot({
            order: "manual",
            threadLimit: REMOTE_SHELL_THREAD_PAGE_LIMIT,
            summaries: false,
            maxBytes: REMOTE_BOUNDED_READ_DEFAULT_MAX_WIRE_BYTES,
            maxDecodeBytes: REMOTE_BOUNDED_READ_DEFAULT_MAX_DECODE_BYTES,
          });
          if (!isLatest() || crossedEpochChange()) return;
          if (bounded.negotiation === "bounded") {
            if (takeRemoteServerRowResyncPending(desktopId)) {
              beginBoundedCatalogAttempt(desktopId);
            }
            recordHostWorkspaces(desktopId, bounded.page.workspaces);
            installBoundedShellPage(desktopId, bounded.page, removalMark);
            await patchBoundedAgentStatuses(desktopId, agentStatusesPromise, isLatest);
            if (!isLatest()) return;
            syncDesktopBrowserBridgeClient(get());
            return;
          }
          noteBoundedCatalogLegacy(desktopId);
        }
        const snapshotPromise = client.snapshot({
          threadListPageLimit: REMOTE_SHELL_THREAD_PAGE_LIMIT,
        });
        const [snapshot, agentStatuses] = includeAgentStatuses
          ? await Promise.all([snapshotPromise, agentStatusesPromise])
          : [await snapshotPromise, cached()?.agentStatuses];
        // Drop a stale (superseded) result so out-of-order resolutions don't
        // regress the UI or the seq cursor.
        if (!isLatest() || crossedEpochChange()) return;
        // Clamp the stored seq with Math.max so a stale response can't
        // regress the cursor a live socket already advanced past.
        bumpRemoteServerSnapshotSeq(
          desktopId,
          snapshot.snapshotSeq,
          resumeFenceAtStart,
          snapshot.snapshotEpoch,
        );
        const current = cached();
        const projects = reuseRemoteRows(current?.projects ?? [], snapshot.projects);
        // Renamed or new host workspaces re-place projects even when the rows
        // themselves are unchanged.
        const hostWorkspacesChanged = recordHostWorkspaces(desktopId, snapshot.workspaces);
        const { rows: reconciledThreads, staleThreadIds } = reconcileThreadRowsWithAppliedEvents(
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
          if (!state.servers.some((entry) => remoteConnectionKey(entry) === desktopId))
            return state;
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
        const forceRowSync = takeRemoteServerRowResyncPending(desktopId);
        if (projectsChanged || threadsChanged || forceRowSync || hostWorkspacesChanged) {
          syncRemoteAppRows(
            desktopId,
            projectsChanged || forceRowSync || hostWorkspacesChanged ? projects : undefined,
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
          // The open thread no longer exists server-side. Its pane closes with
          // the row, releasing that pane's interest lease.
          openRemoteThreadRequestSeq += 1;
          set({ openThread: null });
        }
        syncDesktopBrowserBridgeClient(get());
      } catch (error) {
        if (!isLatest()) return;
        // A bounded-read protocol violation is a typed failure of this
        // connection's read contract, not the host being offline, and its SDK
        // prose is English-only: surface the localized catalog message instead.
        const protocolViolation = isRemoteBoundedReadProtocolError(error);
        const current = cached();
        setRuntime({
          status: protocolViolation || !isRemoteTransportFailure(error) ? "error" : "offline",
          message: protocolViolation
            ? i18n._(msg`The remote catalog read failed.`)
            : remoteServerFailureMessage(error, i18n._(msg`Connection failed.`)),
          projects: current?.projects ?? [],
          threads: current?.threads ?? [],
          // A failed read says nothing about installed agents; later
          // event-driven refreshes skip them, so dropping the list here
          // would leave the host's composer without agents.
          ...(current?.agentStatuses ? { agentStatuses: current.agentStatuses } : {}),
        });
        syncDesktopBrowserBridgeClient(get());
      }
    },
  };
}

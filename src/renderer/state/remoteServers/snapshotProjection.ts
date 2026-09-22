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
  type RemoteBoundedThreadHistoryPage,
  type RemoteDesktopClient,
  type StartRemoteNewThreadInput,
} from "@/shared/remote/client";
import { waitForRemoteThreadAppearance } from "@/shared/remote/threadAppearance";
import { i18n } from "@/renderer/i18n/i18n";
import { applyThreadSnapshot, type ApplyThreadSnapshotResult } from "@/renderer/state/remote";
import {
  clearThreadHistoryNotice,
  noteThreadHistoryRecoveryNeeded,
  recordThreadHistoryNoticeRead,
} from "@/renderer/state/remote/historyNoticeStore";
import { hostSupportsRuntimeHistoryNotices } from "@/renderer/state/remote/historyNoticeCapability";
import { recordAuthoritativeHistoryInstall } from "@/renderer/state/remote/truncateRecovery";
import { useAppStore } from "@/renderer/state/appStore";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { applyCachedSlashCommandCatalogs, fetchSlashCommandCatalog } from "./slashCommandCatalogs";
import { captureThreadFollowUpQueueSnapshot } from "@/renderer/state/threadFollowUpQueueStore";
import {
  runtimePageOverlapsExistingTranscript,
  seedOlderThreadRuntimeItemsCursor,
  setOlderThreadHistoryContinuation,
  setOlderThreadHistoryInvalidation,
} from "@/renderer/state/chatRuntimePersister";
import {
  projectRemoteThread,
  projectRemoteThreadSnapshot,
  remoteProjectId,
  remoteThreadId,
  unprojectRemoteThreadId,
  unprojectRemoteThreadMentionSegments,
} from "@/renderer/state/remoteProjection";
import {
  addRemoteServerThreadItemInterest,
  bumpRemoteServerSnapshotSeq,
  currentRemoteServerGeneration,
  getRemoteServerEventSocketEntry,
  hasRemoteServerCursorSyncV2,
  remoteServerSnapshotSeq,
  remoteThreadAppliedSeq,
  removeRemoteServerThreadItemInterest,
  setHydratingRemoteServerThreadItemInterest,
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
import { reconcileThreadRowsWithAppliedEvents, reuseRemoteRows } from "./rowReuse";
import {
  beginBoundedCatalogAttempt,
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
  configureBoundedHistoryClient,
  forgetBoundedHistoryThreadByViewId,
  mergeBoundedTailTurns,
  loadOlderBoundedCompletedTurns,
  recordBoundedHistoryTail,
} from "./catalog/boundedHistory";
import { REMOTE_SHELL_THREAD_PAGE_LIMIT } from "./pairing";
import { remoteConnectionKey } from "./types";
import type {
  OpenRemoteThread,
  RemoteServerRecord,
  RemoteServerRuntime,
  RemoteSocketLike,
  RemoteThreadLaunchResult,
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
    set((state) => {
      const current = state.runtime[connectionKey];
      if (!current) return state;
      const threads = current.threads.filter((thread) => !removed.has(thread.id));
      if (threads.length === current.threads.length) return state;
      return { runtime: { ...state.runtime, [connectionKey]: { ...current, threads } } };
    });
    for (const threadId of threadIds) {
      const viewThreadId = remoteThreadId(connectionKey, threadId);
      // Authoritative host removal: the durable notice state goes with the
      // thread instead of surviving to re-attach to a future row.
      clearThreadHistoryNotice(viewThreadId);
      useAppStore.getState().deleteThread(viewThreadId);
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
      useAppStore.getState().deleteProject(remoteProjectId(connectionKey, projectId));
    }
  };

  const protectedBoundedThreadIds = (connectionKey: string): ReadonlySet<string> => {
    const protectedIds = new Set<string>();
    const openThread = get().openThread;
    if (openThread?.desktopId === connectionKey) protectedIds.add(openThread.threadId);
    const provisioning = useAppStore.getState().provisioningWorktreeThreadIds;
    for (const [viewThreadId, value] of Object.entries(provisioning)) {
      if (value !== true) continue;
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
    { client: RemoteDesktopClient }
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
          cached = { client: clientForServer(server) };
          connectionIdentityCache.set(server, cached);
        }
        return {
          generation: currentRemoteServerGeneration(connectionKey),
          identity: `${server.endpoint}\u0000${server.accessToken}`,
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
  configureBoundedHistoryClient((desktopId, invoke) => withClient(desktopId, invoke));
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
  ): void => {
    installBoundedCatalogShellPage(connectionKey, page);
    if (page.gitSummariesByThread) {
      syncRemoteGitSummaries(connectionKey, page.gitSummariesByThread);
    }
    if (page.gitState) syncRemoteGitStateSnapshot(connectionKey, page.gitState);
  };

  return {
    launchRemoteThread: async (
      input: StartRemoteNewThreadInput & { readonly desktopId: string },
      options?: { readonly isPendingLaunchOwned?: () => boolean },
    ): Promise<RemoteThreadLaunchResult> => {
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
          get().runtime[input.desktopId]?.threads.some((thread) => thread.id === result.threadId) ??
          false,
      });
      if (!appeared) throw new Error(i18n._(msg`Unable to start the remote thread.`));
      cancellation = await compensateIfAbandoned();
      if (cancellation) return cancellation;
      await get().openRemoteThread(input.desktopId, result.threadId);
      cancellation = await compensateIfAbandoned();
      if (cancellation) return cancellation;
      return "started";
    },

    openRemoteThread: async (
      desktopId: string,
      threadId: string,
      options?: {
        readonly focus?: boolean;
        readonly quiet?: boolean;
        readonly signal?: AbortSignal;
      },
    ): Promise<boolean> => {
      const focus = options?.focus ?? true;
      const requestSeq = openRemoteThreadRequestSeq + 1;
      openRemoteThreadRequestSeq = requestSeq;
      const previousOpenThread = get().openThread;
      const server = get().servers.find((entry) => remoteConnectionKey(entry) === desktopId);
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
      let boundedHistoryPage: RemoteBoundedThreadHistoryPage | undefined;
      const followUpQueueSnapshotGuard = captureThreadFollowUpQueueSnapshot(
        remoteThreadId(desktopId, threadId),
      );
      try {
        // WS3 #2: cursor-sync v2 connections get the authoritative tail
        // from the chunked watch baseline — never send it twice.
        const omitScrollback = hasRemoteServerCursorSyncV2(desktopId);
        // B1: declare only when this host advertises the durable notice and the
        // renderer can display it (the ChatPane banner + explicit ack are
        // installed). An incapable reader would be refused 409 on a notice
        // thread, so the gate is the capability, not optimism.
        const noticesCapable = hostSupportsRuntimeHistoryNotices(server);
        const historyOptions = {
          ...(omitScrollback ? { omitScrollback: true as const } : {}),
          ...(options?.signal ? { signal: options.signal } : {}),
          ...(noticesCapable ? { noticesCapable: true as const } : {}),
          maxBytes: REMOTE_BOUNDED_READ_DEFAULT_MAX_WIRE_BYTES,
          maxDecodeBytes: REMOTE_BOUNDED_READ_DEFAULT_MAX_DECODE_BYTES,
        };
        const result = await withClient(desktopId, (client) =>
          client.boundedThreadHistory(threadId, historyOptions),
        );
        snapshot = result.page;
        if (result.negotiation === "bounded") boundedHistoryPage = result.page;
        // Durable notice from the authoritative snapshot: retained across
        // later reads that omit the field, fenced by connection identity.
        recordThreadHistoryNoticeRead(
          remoteThreadId(desktopId, threadId),
          remoteConnectionKey(server),
          result.page.runtimeNotice,
        );
      } catch (error) {
        // Drop this thread's hydration interest even when superseded: a
        // refresh that cleared the open slice invalidates the request seq,
        // and leaving the hydrating thread registered would leak a dead
        // interest (e.g. a replacement for a deleted thread). Every other
        // interest stays untouched, so a failed open never strips a live
        // pane; a same-thread retry re-registers on success.
        removeRemoteServerThreadItemInterest(desktopId, threadId);
        if (requestSeq !== openRemoteThreadRequestSeq) return false;
        // A definite declared-read refusal on a notice-capable host is the
        // open-gap recovery signal: surface the explicit review path instead
        // of only a generic load failure.
        if (hostSupportsRuntimeHistoryNotices(server) && !isRemoteTransportFailure(error)) {
          noteThreadHistoryRecoveryNeeded(
            remoteThreadId(desktopId, threadId),
            remoteConnectionKey(server),
          );
        }
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
      const currentServer = get().servers.find((entry) => remoteConnectionKey(entry) === desktopId);
      if (
        !currentServer ||
        `${currentServer.endpoint}\0${currentServer.accessToken}` !== serverIdentityAtStart ||
        currentRemoteServerGeneration(desktopId) !== serverGenerationAtStart
      ) {
        return false;
      }
      const projectedSnapshot = projectRemoteThreadSnapshot(desktopId, snapshot);
      const viewThreadId = projectedSnapshot.thread.id;
      // Retain the bounded tail cursor + page proof so older completed-turn
      // pages and older runtime-item pages can continue on this connection.
      if (boundedHistoryPage) {
        recordBoundedHistoryTail({ desktopId, threadId, page: boundedHistoryPage });
      }
      const installSnapshot = mergeBoundedTailTurns(projectedSnapshot, viewThreadId);
      const existingRuntimeItemIds =
        useAppStore.getState().runtimeItemIdsByThread[viewThreadId] ?? [];
      seedOlderThreadRuntimeItemsCursor(viewThreadId, installSnapshot.runtimeNextCursor ?? null, {
        preserveExistingCursor: runtimePageOverlapsExistingTranscript(
          installSnapshot.runtimeItems,
          existingRuntimeItemIds,
        ),
      });
      const applied: ApplyThreadSnapshotResult = applyThreadSnapshot(installSnapshot, {
        fromServer: true,
        lastSeenEventSeq: remoteThreadAppliedSeq(desktopId, threadId),
        followUpQueueSnapshotGuard,
      });
      if (applied.installedAuthoritativeHistory) {
        recordAuthoritativeHistoryInstall(desktopId, threadId, snapshot.snapshotSeq);
      }
      addRemoteServerThreadItemInterest(desktopId, threadId);
      bumpRemoteServerSnapshotSeq(desktopId, snapshot.snapshotSeq);
      // WS3-A: the agent-statuses fetch omitted slash-command catalogs, so
      // the opened thread's agent catalog is fetched once, on first use.
      const openedThread = snapshot.thread;
      if (openedThread.agentKind) {
        const catalogScope = currentServer.endpoint;
        void fetchSlashCommandCatalog(catalogScope, openedThread.agentKind, () =>
          withClient(desktopId, (client) => client.agentSlashCommands(openedThread.agentKind)).then(
            (result) => result.commands,
          ),
        )
          .then(() => {
            const statuses = get().runtime[desktopId]?.agentStatuses;
            if (!statuses) return;
            const patched = applyCachedSlashCommandCatalogs(catalogScope, statuses);
            set((state) => {
              const latest = state.runtime[desktopId];
              if (!latest || latest.agentStatuses !== statuses) return state;
              return {
                runtime: {
                  ...state.runtime,
                  [desktopId]: { ...latest, agentStatuses: patched },
                },
              };
            });
            useAgentStatusesStore.getState().setAgentStatuses(patched.windows);
          })
          .catch(() => {
            // Slash commands stay absent until the next open/refresh; the
            // menu must not crash or toast for a lazy enhancement.
          });
      }
      await startRemoteServerEventStream(currentServer);
      const eventSocket = getRemoteServerEventSocketEntry(desktopId)?.socket;
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
                .then((statuses) => applyCachedSlashCommandCatalogs(server.endpoint, statuses))
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
          const bounded = await client.boundedShellSnapshot({
            order: "manual",
            threadLimit: REMOTE_SHELL_THREAD_PAGE_LIMIT,
            summaries: false,
            maxBytes: REMOTE_BOUNDED_READ_DEFAULT_MAX_WIRE_BYTES,
            maxDecodeBytes: REMOTE_BOUNDED_READ_DEFAULT_MAX_DECODE_BYTES,
          });
          if (!isLatest()) return;
          if (bounded.negotiation === "bounded") {
            if (takeRemoteServerRowResyncPending(desktopId)) {
              beginBoundedCatalogAttempt(desktopId);
            }
            installBoundedShellPage(desktopId, bounded.page);
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
        if (!isLatest()) return;
        // Clamp the stored seq with Math.max so a stale response can't
        // regress the cursor a live socket already advanced past.
        bumpRemoteServerSnapshotSeq(desktopId, snapshot.snapshotSeq);
        const current = cached();
        const projects = reuseRemoteRows(current?.projects ?? [], snapshot.projects);
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
        // A bounded-read protocol violation is a typed failure of this
        // connection's read contract, not the host being offline, and its SDK
        // prose is English-only: surface the localized catalog message instead.
        const protocolViolation = isRemoteBoundedReadProtocolError(error);
        setRuntime({
          status: protocolViolation || !isRemoteTransportFailure(error) ? "error" : "offline",
          message: protocolViolation
            ? i18n._(msg`The remote catalog read failed.`)
            : friendlyError(error) || i18n._(msg`Connection failed.`),
          projects: cached()?.projects ?? [],
          threads: cached()?.threads ?? [],
        });
        syncDesktopBrowserBridgeClient(get());
      }
    },
  };
}

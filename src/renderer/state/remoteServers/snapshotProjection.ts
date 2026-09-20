import { msg } from "@lingui/core/macro";
import { toast } from "@heroui/react";
import type { Thread, TerminalSize } from "@/shared/contracts";
import { friendlyError } from "@/shared/messages";
import {
  isRemoteTransportFailure,
  type RemoteDesktopClient,
  type StartRemoteNewThreadInput,
} from "@/shared/remote/client";
import { waitForRemoteThreadAppearance } from "@/shared/remote/threadAppearance";
import { i18n } from "@/renderer/i18n/i18n";
import { applyThreadSnapshot, type ApplyThreadSnapshotResult } from "@/renderer/state/remote";
import { recordAuthoritativeHistoryInstall } from "@/renderer/state/remote/truncateRecovery";
import { useAppStore } from "@/renderer/state/appStore";
import { useAgentStatusesStore } from "@/renderer/state/agentStatusesStore";
import { applyCachedSlashCommandCatalogs, fetchSlashCommandCatalog } from "./slashCommandCatalogs";
import { captureThreadFollowUpQueueSnapshot } from "@/renderer/state/threadFollowUpQueueStore";
import {
  runtimePageOverlapsExistingTranscript,
  seedOlderThreadRuntimeItemsCursor,
} from "@/renderer/state/chatRuntimePersister";
import {
  projectRemoteThread,
  projectRemoteThreadSnapshot,
  remoteThreadId,
  unprojectRemoteThreadMentionSegments,
} from "@/renderer/state/remoteProjection";
import {
  addRemoteServerThreadItemInterest,
  bumpRemoteServerSnapshotSeq,
  currentRemoteServerGeneration,
  getRemoteServerEventSocketEntry,
  hasRemoteServerCursorSyncV2,
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
import { syncRemoteAppRows } from "./appRows";
import { reconcileThreadRowsWithAppliedEvents, reuseRemoteRows } from "./rowReuse";
import { REMOTE_SHELL_THREAD_PAGE_LIMIT } from "./pairing";
import type {
  OpenRemoteThread,
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
      options?: { readonly focus?: boolean; readonly quiet?: boolean },
    ): Promise<boolean> => {
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
      const followUpQueueSnapshotGuard = captureThreadFollowUpQueueSnapshot(
        remoteThreadId(desktopId, threadId),
      );
      try {
        // WS3 #2: cursor-sync v2 connections get the authoritative tail
        // from the chunked watch baseline — never send it twice.
        const omitScrollback = hasRemoteServerCursorSyncV2(desktopId);
        snapshot = await withClient(desktopId, (client) =>
          omitScrollback
            ? client.threadHistory(threadId, { omitScrollback: true })
            : client.threadHistory(threadId),
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
      seedOlderThreadRuntimeItemsCursor(viewThreadId, projectedSnapshot.runtimeNextCursor ?? null, {
        preserveExistingCursor: runtimePageOverlapsExistingTranscript(
          projectedSnapshot.runtimeItems,
          existingRuntimeItemIds,
        ),
      });
      const applied: ApplyThreadSnapshotResult = applyThreadSnapshot(projectedSnapshot, {
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
      const server = get().servers.find((entry) => entry.desktopId === desktopId);
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
        const client = clientForServer(server);
        const snapshotPromise = client.snapshot({
          threadListPageLimit: REMOTE_SHELL_THREAD_PAGE_LIMIT,
        });
        const [snapshot, agentStatuses] =
          options.includeAgentStatuses === false
            ? [await snapshotPromise, cached()?.agentStatuses]
            : await Promise.all([
                snapshotPromise,
                client
                  .agentStatuses({ omitSlashCommands: true })
                  .then((statuses) => applyCachedSlashCommandCatalogs(server.endpoint, statuses)),
              ]);
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
        setRuntime({
          status: isRemoteTransportFailure(error) ? "offline" : "error",
          message: friendlyError(error) || i18n._(msg`Connection failed.`),
          projects: cached()?.projects ?? [],
          threads: cached()?.threads ?? [],
        });
        syncDesktopBrowserBridgeClient(get());
      }
    },
  };
}

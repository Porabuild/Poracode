import type { TerminalSize, Thread } from "@/shared/contracts";
import { friendlyError, msg as sharedMsg } from "@/shared/messages";
import {
  isRemoteTransportFailure,
  isUnauthorizedRemoteError,
  RemoteClientError,
  type RemoteDesktopClient,
} from "@/shared/remote/client";
import {
  isUnauthorizedRemoteSocketClose,
  REMOTE_SOCKET_POLICY,
  RemoteSocketHealthMonitor,
  RemoteSocketReconnectPolicy,
} from "@/shared/remote/socketPolicy";
import { handleBrowserServerMessage } from "@/renderer/browser/browserMirror";
import { getRemoteSocketEngine, type ClientEngineHost } from "@/renderer/state/remote/engine";
import { releaseRemoteTerminal, remoteTerminalOwner } from "@/renderer/remoteProcedureRouter";
import {
  applyThreadSnapshot,
  collectRuntimeEventsFromSupervisoryMessage,
  dispatchRemoteSupervisorEvent,
  type ApplyThreadSnapshotResult,
} from "@/renderer/state/remote";
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
} from "@/renderer/state/remote/truncateRecovery";
import { useAppStore } from "@/renderer/state/appStore";
import { captureThreadFollowUpQueueSnapshot } from "@/renderer/state/threadFollowUpQueueStore";
import {
  projectRemoteThreadEvent,
  projectRemoteThreadSnapshot,
  remoteThreadId,
} from "@/renderer/state/remoteProjection";
import {
  emitRemoteTerminalExited,
  emitRemoteTerminalReset,
  handleRemoteTerminalServerMessage,
  setRemoteTerminalSocketSender,
} from "@/renderer/state/remoteTerminalFeed";
import { noteShellExited } from "@/renderer/utils/shellStartRegistry";
import { getDesktopBrowserMirrorSocket, syncDesktopBrowserBridgeClient } from "./browserBridge";
import { markRemoteServerRowResyncPending } from "./connectionRefresh";
import {
  bumpRemoteServerSnapshotSeq,
  clearRemoteServerEventSocketConnectTimeout,
  clearRemoteServerEventSocketHealth,
  clearRemoteThreadAppliedSeqs,
  currentRemoteServerThreadItemInterests,
  deleteRemoteServerEventSocketEntry,
  forgetRemoteServerCursorSyncV2,
  getRemoteServerEventSocketEntry,
  getRemoteServerThreadItemInterests,
  hasRemoteServerCursorSyncV2,
  recordRemoteThreadAppliedSeq,
  rememberRemoteServerThreadItemInterests,
  remoteServerSnapshotSeq,
  remoteThreadAppliedSeq,
  sameRemoteServerThreadItemInterests,
  setRemoteServerEventSocketEntry,
  setRemoteServerSnapshotSeq,
  setRemoteServerThreadItemInterests,
  supervisorEventThreadIds,
  type RemoteServerEventSocketEntry,
} from "./eventSocketRegistry";
import {
  filterRemoteThreadEvents,
  shouldRefreshRemoteAgentStatusesAfterEvent,
  shouldRefreshRemoteServerAfterEvent,
  type ThreadIdMatcher,
} from "./eventRouting";
import { syncRemoteGitStatePatch } from "./gitState";
import { syncRemoteGitSummaries } from "./gitSummaries";
import { cachedThreadIds } from "./rowReuse";
import {
  prepareTerminalConnection,
  type TerminalConnectionCapabilities,
} from "./terminalCapabilities";
import type {
  OpenRemoteThread,
  RemoteServerRecord,
  RemoteServersState,
  RemoteSocketLike,
} from "./types";

const MAX_RECOVERY_QUEUED_EVENTS = 512;
const MAX_RECOVERY_QUEUED_BYTES = 2 * 1024 * 1024;
const recoveryTextEncoder = new TextEncoder();

/**
 * The remote-socket engine is shared by every paired-server session in this
 * window, so exactly ONE overflow listener is registered for the module and
 * the latest session re-points it. A stale session's sink is inert: its
 * handler checks `isCurrent()` before touching any socket. Overflow resets
 * the engine, so every session with an in-flight `decodeRemote` also sees a
 * typed rejection and resyncs through the per-frame catch — the sink only
 * covers overflow with no locally pending decode.
 */
let engineOverflowSink: (() => void) | null = null;
let engineOverflowBoundTo: ClientEngineHost | null = null;

function bindRemoteEngineOverflowListener(engine: ClientEngineHost): void {
  if (engineOverflowBoundTo === engine) return;
  engineOverflowBoundTo = engine;
  engine.addOverflowListener(() => engineOverflowSink?.());
}

export interface StartRemoteServerEventStreamDeps {
  readonly server: RemoteServerRecord;
  readonly initialCapabilities?: TerminalConnectionCapabilities;
  readonly options?: { readonly resyncInterestedThreads?: boolean };
  readonly set: (
    partial:
      | RemoteServersState
      | Partial<RemoteServersState>
      | ((state: RemoteServersState) => RemoteServersState | Partial<RemoteServersState>),
  ) => void;
  readonly get: () => RemoteServersState;
  readonly setRemoteServerFailure: (
    desktopId: string,
    status: "offline" | "error",
    message: string,
  ) => void;
  readonly closeRemoteServerEventSocket: (
    desktopId: string,
    options?: { readonly preserveReplayState?: boolean },
  ) => void;
  readonly activateRemoteTerminalFeed: (desktopId: string, socket: RemoteSocketLike) => void;
  readonly rememberTerminalConnection: (
    socket: RemoteSocketLike,
    capabilities: TerminalConnectionCapabilities,
  ) => void;
  readonly buildOpenThread: (
    desktopId: string,
    snapshot: {
      readonly thread: Thread;
      readonly terminalScrollback?: string | undefined;
      readonly terminalSize?: TerminalSize | undefined;
    },
  ) => OpenRemoteThread;
}

export async function startRemoteServerEventStream(
  deps: StartRemoteServerEventStreamDeps,
): Promise<void> {
  const {
    server,
    initialCapabilities,
    options = {},
    set,
    get,
    setRemoteServerFailure,
    closeRemoteServerEventSocket,
    activateRemoteTerminalFeed,
    rememberTerminalConnection,
    buildOpenThread,
  } = deps;

  const serverKey = `${server.endpoint}\0${server.accessToken}`;
  // This session's consumer-scoped decode engine (V5 2.2): independent of the
  // desktop renderer-stream and persist engines, so their resets and overflows
  // cannot reject this session's in-flight decodes.
  const engine = getRemoteSocketEngine();
  const existing = getRemoteServerEventSocketEntry(server.desktopId);
  if (existing?.serverKey === serverKey && !options.resyncInterestedThreads) return;

  closeRemoteServerEventSocket(
    server.desktopId,
    options.resyncInterestedThreads ? { preserveReplayState: true } : undefined,
  );
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
  setRemoteServerEventSocketEntry(server.desktopId, entry);
  let resyncPromise: Promise<boolean> | null = null;
  /** Socket the in-flight {@link resyncPromise} belongs to. A recovery must
   * never be reused across connections: a dead socket's recovery resolving
   * `false` would force-reconnect a healthy replacement and report a false
   * offline. */
  let resyncPromiseSocket: RemoteSocketLike | null = null;
  /** Set when a frame was provably dropped client-side (engine overflow/reset
   * rejection, expected-seq gap). The next connection re-baselines interested
   * threads from authoritative snapshots after resuming from the last APPLIED
   * seq — the resume cursor never advances past a lost frame. */
  let resyncRequired = false;
  let recoveryThreadIds = new Set<string>();
  let recoveryQueuedEvents: Array<{ readonly seq: number; readonly event: unknown }> = [];
  let recoveryQueuedBytes = 0;
  let recoveryQueueOverflowed = false;
  let recoveryBaselineSeqByThread = new Map<string, number>();

  const isCurrent = () =>
    getRemoteServerEventSocketEntry(server.desktopId) === entry &&
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
    forgetRemoteServerCursorSyncV2(server.desktopId);
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

  /**
   * Client-detected frame loss (engine overflow/reset rejection, expected-seq
   * gap). The dropped frame(s) cannot be recovered in place, so the session
   * marks itself resync-required and reconnects: the resume cursor sent on
   * the next connect is the last APPLIED seq (the watermark only advances
   * after a frame is applied), so the server replays exactly the lost range,
   * and the next connection re-baselines interested threads from
   * authoritative snapshots in case replay retention already expired.
   */
  const noteClientDetectedLoss = (): void => {
    resyncRequired = true;
    if (!isCurrent()) return;
    const current = entry.socket;
    if (current) forceReconnect(current);
  };

  bindRemoteEngineOverflowListener(engine);
  engineOverflowSink = () => {
    if (!isCurrent()) return;
    noteClientDetectedLoss();
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
      const lastSeenSeq = remoteServerSnapshotSeq(server.desktopId);
      const openThread = get().openThread;
      const threadItemInterests =
        getRemoteServerThreadItemInterests(server.desktopId) ??
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
      rememberTerminalConnection(socket, capabilities);
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
              lastSeenEventSeq: remoteThreadAppliedSeq(server.desktopId, targetRemoteThreadId),
            },
          );
          if (applied.installedAuthoritativeHistory) {
            recordAuthoritativeHistoryInstall(
              server.desktopId,
              targetRemoteThreadId,
              snapshot.snapshotSeq,
            );
          }
          bumpRemoteServerSnapshotSeq(server.desktopId, snapshot.snapshotSeq);
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
        // A consumed truncate will not replay after reconnect. Retry its
        // outstanding baseline through the same bounded gate, but only
        // for threads that still have a live subscription.
        if (!isCurrent() || entry.socket !== socket) return;
        if (get().runtime[server.desktopId]?.status !== "online") return;
        if (!get().servers.some((candidate) => candidate.desktopId === server.desktopId)) {
          return;
        }
        const open = get().openThread;
        const interests = currentRemoteServerThreadItemInterests(server.desktopId);
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
          getRemoteServerThreadItemInterests(server.desktopId) ?? threadItemInterests;
        if (sameRemoteServerThreadItemInterests(currentThreadItemInterests, threadItemInterests)) {
          rememberRemoteServerThreadItemInterests(server.desktopId, currentThreadItemInterests);
        } else {
          setRemoteServerThreadItemInterests(server.desktopId, currentThreadItemInterests, true);
        }
        startHealthProbe(socket);
        if (get().runtime[server.desktopId]?.status !== "online") {
          resetTruncateReloadBackoff(server.desktopId);
        }
        setSocketStatus("online");
        resumePendingTruncateReloads();
      };
      socket.onopen = activateSocket;
      if (socket.readyState === undefined || socket.readyState === 1) {
        activateSocket();
      }
      const resyncOpenThread = (beforeReplay?: () => void): Promise<boolean> => {
        // Dedupe only within the SAME connection: a stale recovery from a
        // dead socket must not be handed to the replacement connection.
        if (resyncPromise && resyncPromiseSocket === socket) return resyncPromise;
        const open = get().openThread;
        const interests = currentRemoteServerThreadItemInterests(server.desktopId);
        const threadIds = new Set<string>();
        if (open?.desktopId === server.desktopId) threadIds.add(open.threadId);
        for (const interest of interests) threadIds.add(interest);
        if (threadIds.size === 0) return Promise.resolve(true);
        recoveryThreadIds = new Set(threadIds);
        recoveryQueuedEvents = [];
        recoveryQueuedBytes = 0;
        recoveryQueueOverflowed = false;
        recoveryBaselineSeqByThread = new Map<string, number>();
        const promise = (async (): Promise<boolean> => {
          let restored = true;
          try {
            // Fetch all interested threads concurrently (N−1 RTTs saved on
            // server-restart resync), then apply in the original order so
            // per-thread state transitions stay deterministic.
            const omitScrollback = hasRemoteServerCursorSyncV2(server.desktopId);
            const fetched = await Promise.all(
              [...threadIds].map(async (threadId) => {
                try {
                  return {
                    threadId,
                    followUpQueueSnapshotGuard: captureThreadFollowUpQueueSnapshot(
                      remoteThreadId(server.desktopId, threadId),
                    ),
                    snapshot: await client.threadHistory(
                      threadId,
                      ...(omitScrollback ? [{ omitScrollback: true }] : []),
                    ),
                  };
                } catch {
                  return null;
                }
              }),
            );
            for (const result of fetched) {
              if (!result) {
                restored = false;
                continue;
              }
              const { threadId, snapshot: nextSnapshot, followUpQueueSnapshotGuard } = result;
              if (!isCurrent() || entry.socket !== socket) {
                restored = false;
                break;
              }
              const applied: ApplyThreadSnapshotResult = applyThreadSnapshot(
                projectRemoteThreadSnapshot(server.desktopId, nextSnapshot),
                {
                  fromServer: true,
                  followUpQueueSnapshotGuard,
                  lastSeenEventSeq: remoteThreadAppliedSeq(server.desktopId, threadId),
                },
              );
              if (applied.installedAuthoritativeHistory) {
                recoveryBaselineSeqByThread.set(threadId, nextSnapshot.snapshotSeq);
                recordAuthoritativeHistoryInstall(
                  server.desktopId,
                  threadId,
                  nextSnapshot.snapshotSeq,
                );
              } else {
                restored = false;
              }
              bumpRemoteServerSnapshotSeq(server.desktopId, nextSnapshot.snapshotSeq);
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
            if (recoveryQueueOverflowed) restored = false;
            if (restored) {
              // The runtime queue may be holding a bounded tail that
              // arrived after the snapshots were read. Resume it before
              // replaying the transport recovery buffer so those
              // sequenced events cannot be discarded by the UI gate.
              beforeReplay?.();
              const queuedEvents = [...recoveryQueuedEvents].sort(
                (left, right) => left.seq - right.seq,
              );
              for (const queued of queuedEvents) {
                const batches = collectRuntimeEventsFromSupervisoryMessage(queued.event);
                const keptBatches = batches.filter(
                  (batch) =>
                    queued.seq > (recoveryBaselineSeqByThread.get(batch.threadId) ?? -Infinity),
                );
                const replay =
                  batches.length > 0
                    ? keptBatches.length > 0
                      ? { type: "thread-runtime-events-multi", batches: keptBatches }
                      : null
                    : supervisorEventThreadIds(queued.event).some(
                          (threadId) =>
                            queued.seq > (recoveryBaselineSeqByThread.get(threadId) ?? -Infinity),
                        )
                      ? queued.event
                      : null;
                if (replay !== null) {
                  dispatchForwardEvent(replay, queued.seq, true);
                  // Replay is the moment a recovery-queued frame is finally
                  // APPLIED: only here may the resume cursor pass its seq.
                  bumpRemoteServerSnapshotSeq(server.desktopId, queued.seq);
                }
              }
            }
          } catch {
            restored = false;
          }
          return restored;
        })();
        resyncPromiseSocket = socket;
        resyncPromise = promise.finally(() => {
          // A newer connection's recovery may already own the buffers; the
          // stale finally must not wipe them.
          if (resyncPromiseSocket !== socket) return;
          recoveryThreadIds = new Set<string>();
          recoveryQueuedEvents = [];
          recoveryQueuedBytes = 0;
          recoveryQueueOverflowed = false;
          recoveryBaselineSeqByThread = new Map<string, number>();
          resyncPromise = null;
          resyncPromiseSocket = null;
        });
        return resyncPromise;
      };
      const recoverInterestedThreads = async (beforeReplay?: () => void): Promise<boolean> => {
        if (await resyncOpenThread(beforeReplay)) return true;
        if (!isCurrent() || entry.socket !== socket) return false;
        forceReconnect(socket);
        setRemoteServerFailure(server.desktopId, "offline", sharedMsg("remote.server.unreachable"));
        return false;
      };
      const dispatchForwardEvent = (
        forward: unknown,
        sequence: number,
        recoveryReplay = false,
      ): void => {
        for (const threadId of supervisorEventThreadIds(forward)) {
          recordRemoteThreadAppliedSeq(server.desktopId, threadId, sequence);
        }
        dispatchRemoteSupervisorEvent(projectRemoteThreadEvent(server.desktopId, forward), {
          onGitSummaries: (summaries) => syncRemoteGitSummaries(server.desktopId, summaries),
          onGitState: (patch) => syncRemoteGitStatePatch(server.desktopId, patch),
          onRuntimeQueueOverflow: (_threadIds, resume) => recoverInterestedThreads(resume),
          ...(recoveryReplay ? { deliverRuntimeEventsImmediately: true } : {}),
        });
        for (const batch of collectRuntimeEventsFromSupervisoryMessage(forward)) {
          for (const evt of batch.events) {
            if (evt.type !== "runtime.truncated") continue;
            const projectedId = remoteThreadId(server.desktopId, batch.threadId);
            if (isTruncateCheckpointLoaded(projectedId, evt.itemId)) continue;
            requestTruncateAuthoritativeReload(batch.threadId, sequence);
          }
        }
      };
      socket.onmessage = (event) => {
        if (!isCurrent() || entry.socket !== socket) return;
        const raw = String(event.data);
        const dispatchParsed = (message: ReturnType<RemoteDesktopClient["parseSocketMessage"]>) => {
          try {
            if (message.type === "pong") {
              entry.health?.acceptPong(message.id);
              return;
            }
            if (handleRemoteTerminalServerMessage(server.desktopId, message)) {
              return;
            }
            if (getDesktopBrowserMirrorSocket() === socket && handleBrowserServerMessage(message)) {
              return;
            }
            if (message.type === "event") {
              // Expected-seq gap detection (V5 2.1): the server delivers one
              // frame per seq to every connected client, so a jump over the
              // next expected seq means a frame was lost in transit or dropped
              // client-side. Never apply past a gap and never advance the
              // cursor into it — reconnect from the last applied seq instead.
              // While a recovery holds frames in its queue the watermark lags
              // by design, so gap checks are suppressed there.
              if (
                recoveryThreadIds.size === 0 &&
                message.seq > remoteServerSnapshotSeq(server.desktopId) + 1
              ) {
                noteClientDetectedLoss();
                return;
              }
              const open = get().openThread;
              const appState = useAppStore.getState();
              const runtimeThreadIds = cachedThreadIds(
                get().runtime[server.desktopId]?.threads ?? [],
              );
              const additionalRemoteThreadIds = new Set<string>();
              if (Object.keys(appState.provisioningWorktreeThreadIds).length > 0) {
                for (const thread of appState.threads) {
                  if (
                    appState.provisioningWorktreeThreadIds[thread.id] === true &&
                    thread.remoteServerId === server.desktopId &&
                    thread.remoteId
                  ) {
                    additionalRemoteThreadIds.add(thread.remoteId);
                  }
                }
              }
              if (open?.desktopId === server.desktopId) {
                additionalRemoteThreadIds.add(open.threadId);
              }
              // Background visible panes keep independent live subscriptions
              // via additive interests. They must survive even when the
              // single global `openThread` slice holds a different thread
              // (multipane split): without this, a cold multipane restore
              // would drop every background pane's events until its row
              // arrived in the runtime list.
              for (const interest of currentRemoteServerThreadItemInterests(server.desktopId)) {
                additionalRemoteThreadIds.add(interest);
              }
              const remoteThreadIds: ThreadIdMatcher = {
                has: (threadId) =>
                  runtimeThreadIds.has(threadId) || additionalRemoteThreadIds.has(threadId),
              };
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
              if (terminalId && isKnownRemoteTerminal && terminalEvent.type === "thread-reset") {
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
              // True when (part of) this frame was parked in the recovery
              // queue: those seqs advance the cursor only when REPLAYED, so a
              // failed recovery reconnects from before them instead of
              // skipping parked frames.
              let queuedForRecovery = false;
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
              if (forward !== null && recoveryThreadIds.size > 0) {
                const batches = collectRuntimeEventsFromSupervisoryMessage(forward);
                const recoveringBatches = batches.filter((batch) =>
                  recoveryThreadIds.has(batch.threadId),
                );
                if (recoveringBatches.length > 0) {
                  const recoveryEvent = {
                    type: "thread-runtime-events-multi",
                    batches: recoveringBatches,
                  };
                  queuedForRecovery = true;
                  const eventBytes = recoveryTextEncoder.encode(
                    JSON.stringify(recoveryEvent),
                  ).byteLength;
                  if (
                    recoveryQueuedEvents.length >= MAX_RECOVERY_QUEUED_EVENTS ||
                    recoveryQueuedBytes + eventBytes > MAX_RECOVERY_QUEUED_BYTES
                  ) {
                    recoveryQueueOverflowed = true;
                  } else {
                    recoveryQueuedEvents.push({ seq: message.seq, event: recoveryEvent });
                    recoveryQueuedBytes += eventBytes;
                  }
                  const liveBatches = batches.filter(
                    (batch) => !recoveryThreadIds.has(batch.threadId),
                  );
                  forward =
                    liveBatches.length > 0
                      ? { type: "thread-runtime-events-multi", batches: liveBatches }
                      : null;
                } else if (
                  supervisorEventThreadIds(forward).some((threadId) =>
                    recoveryThreadIds.has(threadId),
                  )
                ) {
                  queuedForRecovery = true;
                  const eventBytes = recoveryTextEncoder.encode(JSON.stringify(forward)).byteLength;
                  if (
                    recoveryQueuedEvents.length >= MAX_RECOVERY_QUEUED_EVENTS ||
                    recoveryQueuedBytes + eventBytes > MAX_RECOVERY_QUEUED_BYTES
                  ) {
                    recoveryQueueOverflowed = true;
                  } else {
                    recoveryQueuedEvents.push({ seq: message.seq, event: forward });
                    recoveryQueuedBytes += eventBytes;
                  }
                  forward = null;
                }
              }
              if (forward !== null) {
                dispatchForwardEvent(forward, message.seq);
              } else if (
                message.event &&
                typeof message.event === "object" &&
                (message.event as { type?: unknown }).type === "thread-follow-up-queue"
              ) {
                // Queue state is thread-scoped, but the transcript filter
                // can omit an otherwise valid queue event during initial
                // open. Apply it so an in-flight history response cannot
                // replace the live queue with its older snapshot.
                dispatchRemoteSupervisorEvent(
                  projectRemoteThreadEvent(server.desktopId, message.event),
                );
              }
              if (shouldRefreshRemoteServerAfterEvent(message.event)) {
                // Debounced so a burst of events yields one snapshot GET.
                get().scheduleServerRefresh(server.desktopId, {
                  includeAgentStatuses: shouldRefreshRemoteAgentStatusesAfterEvent(message.event),
                });
              }
              if (!queuedForRecovery) {
                // Applied-cursor rule (V5 2.1): the resume watermark advances
                // only after a frame is consumed — dispatched, replayed, or
                // filtered out — never on receipt. A dropped frame therefore
                // reconnects from the last applied seq and the server replays
                // exactly the missing range.
                bumpRemoteServerSnapshotSeq(server.desktopId, message.seq);
              }
            }
            if (message.type === "resync-required") {
              // The server's in-memory event sequence restarts with the
              // process. Accept its lower cursor before the authoritative
              // snapshots advance it again, or every reconnect will ask
              // for an impossible pre-restart sequence forever.
              setRemoteServerSnapshotSeq(server.desktopId, message.seq);
              // Pre-restart per-thread marks would refuse every fresh
              // (lower-seq) snapshot forever; re-baseline them too.
              clearRemoteThreadAppliedSeqs(server.desktopId);
              // Old-epoch authoritative baselines and bounded reload
              // budgets are meaningless after a restart.
              resetTruncateRecoveryEpoch(server.desktopId);
              markRemoteServerRowResyncPending(server.desktopId);
              get().scheduleServerRefresh(server.desktopId);
              void recoverInterestedThreads();
            }
          } catch {
            // HTTP snapshots remain authoritative; ignore malformed frames.
          }
        };
        if (engine.isWorkerActive()) {
          void engine
            .decodeRemote(raw)
            .then((result) => {
              if (!isCurrent() || entry.socket !== socket || !result.ok) return;
              dispatchParsed(
                result.message as ReturnType<RemoteDesktopClient["parseSocketMessage"]>,
              );
            })
            .catch(() => {
              // The engine rejected this frame in flight (overflow/reset):
              // it is silently lost unless the session reacts. Mark the loss
              // and resync from the last applied seq instead of swallowing it.
              if (!isCurrent() || entry.socket !== socket) return;
              noteClientDetectedLoss();
            });
          return;
        }
        try {
          dispatchParsed(client.parseSocketMessage(raw));
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
          forgetRemoteServerCursorSyncV2(server.desktopId);
          setRemoteTerminalSocketSender(server.desktopId, null);
          setRemoteServerFailure(server.desktopId, "error", sharedMsg("remote.session.expired"));
          scheduleReconnect(REMOTE_SOCKET_POLICY.unauthorizedReconnectMs);
          return;
        }
        disconnectSocket(socket);
      };
      if (options.resyncInterestedThreads || resyncRequired) {
        // A client-detected loss (engine overflow/reset, expected-seq gap)
        // re-baselines interested threads from authoritative snapshots on the
        // fresh connection, in case replay retention already expired.
        resyncRequired = false;
        await recoverInterestedThreads();
      }
    } catch (error) {
      if (!isCurrent()) return;
      if (error instanceof RemoteClientError && error.code === "protocol_version_mismatch") {
        setRemoteServerFailure(server.desktopId, "error", friendlyError(error));
        // Stop automatic attempts, but retain terminal listeners so a
        // later explicit reconnect can install a fresh supported stream.
        deleteRemoteServerEventSocketEntry(server.desktopId);
        forgetRemoteServerCursorSyncV2(server.desktopId);
        setRemoteTerminalSocketSender(server.desktopId, null);
        return;
      }
      if (isUnauthorizedRemoteError(error)) {
        setRemoteServerFailure(server.desktopId, "error", sharedMsg("remote.session.expired"));
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
      if (isCurrent() && !entry.socket && !entry.reconnectTimer) scheduleReconnect();
    }
  };

  await connect();
}

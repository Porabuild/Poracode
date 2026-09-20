import type { RemoteDesktopClient } from "@/shared/remote/client";
import { handleBrowserServerMessage } from "@/renderer/browser/browserMirror";
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
  shouldSuppressTruncatedReplay,
  tryBeginTruncateReload,
} from "@/renderer/state/remote/truncateRecovery";
import { useAppStore } from "@/renderer/state/appStore";
import {
  projectRemoteThreadEvent,
  projectRemoteThreadSnapshot,
  remoteThreadId,
} from "@/renderer/state/remoteProjection";
import {
  emitRemoteTerminalExited,
  emitRemoteTerminalReset,
  handleRemoteTerminalServerMessage,
} from "@/renderer/state/remoteTerminalFeed";
import { noteShellExited } from "@/renderer/utils/shellStartRegistry";
import { getDesktopBrowserMirrorSocket } from "./browserBridge";
import { markRemoteServerRowResyncPending } from "./connectionRefresh";
import type { EventSocketConnectionContext } from "./eventSocketContext";
import {
  bumpRemoteServerSnapshotSeq,
  clearRemoteThreadAppliedSeqs,
  currentRemoteServerThreadItemInterests,
  recordRemoteThreadAppliedSeq,
  remoteServerSnapshotSeq,
  remoteThreadAppliedSeq,
  setRemoteServerSnapshotSeq,
  supervisorEventThreadIds,
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

const MAX_RECOVERY_QUEUED_EVENTS = 512;
const MAX_RECOVERY_QUEUED_BYTES = 2 * 1024 * 1024;
const recoveryTextEncoder = new TextEncoder();

export function bindEventSocketMessages(ctx: EventSocketConnectionContext): () => void {
  const {
    server,
    entry,
    socket,
    client,
    engine,
    get,
    isCurrent,
    noteClientDetectedLoss,
    recovery,
  } = ctx;

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

  ctx.dispatchForwardEvent = (forward, sequence, recoveryReplay = false): void => {
    for (const threadId of supervisorEventThreadIds(forward)) {
      recordRemoteThreadAppliedSeq(server.desktopId, threadId, sequence);
    }
    dispatchRemoteSupervisorEvent(projectRemoteThreadEvent(server.desktopId, forward), {
      onGitSummaries: (summaries) => syncRemoteGitSummaries(server.desktopId, summaries),
      onGitState: (patch) => syncRemoteGitStatePatch(server.desktopId, patch),
      onRuntimeQueueOverflow: (_threadIds, resume) => ctx.recoverInterestedThreads(resume),
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
            recovery.threadIds.size === 0 &&
            message.seq > remoteServerSnapshotSeq(server.desktopId) + 1
          ) {
            noteClientDetectedLoss();
            return;
          }
          const open = get().openThread;
          const appState = useAppStore.getState();
          const runtimeThreadIds = cachedThreadIds(get().runtime[server.desktopId]?.threads ?? []);
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
          if (forward !== null && recovery.threadIds.size > 0) {
            const batches = collectRuntimeEventsFromSupervisoryMessage(forward);
            const recoveringBatches = batches.filter((batch) =>
              recovery.threadIds.has(batch.threadId),
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
                recovery.queuedEvents.length >= MAX_RECOVERY_QUEUED_EVENTS ||
                recovery.queuedBytes + eventBytes > MAX_RECOVERY_QUEUED_BYTES
              ) {
                recovery.overflowed = true;
              } else {
                recovery.queuedEvents.push({ seq: message.seq, event: recoveryEvent });
                recovery.queuedBytes += eventBytes;
              }
              const liveBatches = batches.filter(
                (batch) => !recovery.threadIds.has(batch.threadId),
              );
              forward =
                liveBatches.length > 0
                  ? { type: "thread-runtime-events-multi", batches: liveBatches }
                  : null;
            } else if (
              supervisorEventThreadIds(forward).some((threadId) => recovery.threadIds.has(threadId))
            ) {
              queuedForRecovery = true;
              const eventBytes = recoveryTextEncoder.encode(JSON.stringify(forward)).byteLength;
              if (
                recovery.queuedEvents.length >= MAX_RECOVERY_QUEUED_EVENTS ||
                recovery.queuedBytes + eventBytes > MAX_RECOVERY_QUEUED_BYTES
              ) {
                recovery.overflowed = true;
              } else {
                recovery.queuedEvents.push({ seq: message.seq, event: forward });
                recovery.queuedBytes += eventBytes;
              }
              forward = null;
            }
          }
          if (forward !== null) {
            ctx.dispatchForwardEvent(forward, message.seq);
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
          void ctx.recoverInterestedThreads();
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
          dispatchParsed(result.message as ReturnType<RemoteDesktopClient["parseSocketMessage"]>);
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

  return resumePendingTruncateReloads;
}

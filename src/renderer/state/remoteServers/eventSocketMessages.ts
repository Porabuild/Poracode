import type { RemoteDesktopClient } from "@/shared/remote/client";
import { handleBrowserServerMessage } from "@/renderer/browser/browserMirror";
import { releaseRemoteTerminal, remoteTerminalOwner } from "@/renderer/remoteProcedureRouter";
import { measuredRawBytes } from "@/renderer/state/remote/engine";
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
import {
  noteBoundedCatalogMembershipEvent,
  resetBoundedCatalogForResync,
} from "./catalog/boundedCatalogController";
import {
  forgetBoundedHistoryForServer,
  forgetBoundedHistoryThread,
} from "./catalog/boundedHistoryRegistry";
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
import { remoteConnectionKey } from "./types";

const MAX_RECOVERY_QUEUED_EVENTS = 512;
const MAX_RECOVERY_QUEUED_BYTES = 2 * 1024 * 1024;

export function bindEventSocketMessages(ctx: EventSocketConnectionContext): () => void {
  const { server, entry, socket, client, get, isCurrent, noteClientDetectedLoss, recovery } = ctx;
  const connectionKey = remoteConnectionKey(server);

  const requestTruncateAuthoritativeReload = (
    targetRemoteThreadId: string,
    eventSeq: number,
  ): void => {
    if (get().runtime[connectionKey]?.status !== "online") return;
    if (!get().servers.some((candidate) => remoteConnectionKey(candidate) === connectionKey)) {
      return;
    }
    noteTruncateNeeded(connectionKey, targetRemoteThreadId, eventSeq);
    const lease = tryBeginTruncateReload(connectionKey, targetRemoteThreadId);
    if (!lease) return;
    // The authoritative replacement renumbers completed turns: the recorded
    // `ct1.` continuation proof is stale whether the fetch succeeds or not.
    forgetBoundedHistoryThread(connectionKey, targetRemoteThreadId);
    void (async () => {
      let snapshot: Awaited<ReturnType<RemoteDesktopClient["threadHistory"]>>;
      try {
        snapshot = await client.threadHistory(targetRemoteThreadId);
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
        projectRemoteThreadSnapshot(connectionKey, snapshot),
        {
          fromServer: true,
          lastSeenEventSeq: remoteThreadAppliedSeq(connectionKey, targetRemoteThreadId),
        },
      );
      if (applied.installedAuthoritativeHistory) {
        recordAuthoritativeHistoryInstall(
          connectionKey,
          targetRemoteThreadId,
          snapshot.snapshotSeq,
        );
      }
      bumpRemoteServerSnapshotSeq(connectionKey, snapshot.snapshotSeq);
      const outcome = finishTruncateReload(lease, {
        installed: applied.installedAuthoritativeHistory,
        snapshotSeq: snapshot.snapshotSeq,
      });
      if (!outcome.stale && !outcome.covered) {
        const needed = getTruncateNeededSeq(connectionKey, targetRemoteThreadId);
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
    if (get().runtime[connectionKey]?.status !== "online") return;
    if (!get().servers.some((candidate) => remoteConnectionKey(candidate) === connectionKey)) {
      return;
    }
    const open = get().openThread;
    const interests = currentRemoteServerThreadItemInterests(connectionKey);
    const subscribed = new Set<string>(interests);
    if (open?.desktopId === connectionKey) subscribed.add(open.threadId);
    for (const pending of listPendingTruncateReloads(connectionKey)) {
      if (!subscribed.has(pending.remoteThreadId)) continue;
      requestTruncateAuthoritativeReload(pending.remoteThreadId, pending.neededSeq);
    }
  };

  ctx.dispatchForwardEvent = (forward, sequence, recoveryReplay = false): void => {
    for (const threadId of supervisorEventThreadIds(forward)) {
      recordRemoteThreadAppliedSeq(connectionKey, threadId, sequence);
    }
    dispatchRemoteSupervisorEvent(projectRemoteThreadEvent(connectionKey, forward), {
      onGitSummaries: (summaries) => syncRemoteGitSummaries(connectionKey, summaries),
      onGitState: (patch) => syncRemoteGitStatePatch(connectionKey, patch),
      onRuntimeQueueOverflow: (_threadIds, resume) => ctx.recoverInterestedThreads(resume),
      ...(recoveryReplay ? { deliverRuntimeEventsImmediately: true } : {}),
    });
    for (const batch of collectRuntimeEventsFromSupervisoryMessage(forward)) {
      for (const evt of batch.events) {
        if (evt.type !== "runtime.truncated") continue;
        // An applied (live or replay) truncation deletes the thread's tail:
        // any recorded bounded `ct1.` cursor points into the pre-truncation
        // sequence and must not append rows to the rebuilt transcript.
        forgetBoundedHistoryThread(connectionKey, batch.threadId);
        const projectedId = remoteThreadId(connectionKey, batch.threadId);
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
        if (handleRemoteTerminalServerMessage(connectionKey, message)) {
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
            message.seq > remoteServerSnapshotSeq(connectionKey) + 1
          ) {
            noteClientDetectedLoss();
            return;
          }
          const open = get().openThread;
          const appState = useAppStore.getState();
          const runtimeThreadIds = cachedThreadIds(get().runtime[connectionKey]?.threads ?? []);
          const additionalRemoteThreadIds = new Set<string>();
          if (Object.keys(appState.provisioningWorktreeThreadIds).length > 0) {
            for (const thread of appState.threads) {
              if (
                appState.provisioningWorktreeThreadIds[thread.id] === true &&
                thread.remoteServerId === connectionKey &&
                thread.remoteId
              ) {
                additionalRemoteThreadIds.add(thread.remoteId);
              }
            }
          }
          if (open?.desktopId === connectionKey) {
            additionalRemoteThreadIds.add(open.threadId);
          }
          // Background visible panes keep independent live subscriptions
          // via additive interests. They must survive even when the
          // single global `openThread` slice holds a different thread
          // (multipane split): without this, a cold multipane restore
          // would drop every background pane's events until its row
          // arrived in the runtime list.
          for (const interest of currentRemoteServerThreadItemInterests(connectionKey)) {
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
            (remoteThreadIds.has(terminalId) || remoteTerminalOwner(terminalId) === connectionKey);
          if (terminalId && isKnownRemoteTerminal && terminalEvent.type === "thread-reset") {
            emitRemoteTerminalReset(connectionKey, terminalId);
          } else if (
            terminalId &&
            isKnownRemoteTerminal &&
            terminalEvent.type === "thread-exited"
          ) {
            emitRemoteTerminalExited(
              connectionKey,
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
                    connectionKey,
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
              // A3: the size is measured from the raw wire frame that carried
              // this event (UTF-16 upper bound), not re-serialized here. It is
              // a conservative upper bound for a filtered sub-event.
              const eventBytes = measuredRawBytes(raw.length);
              if (
                recovery.queuedEvents.length >= MAX_RECOVERY_QUEUED_EVENTS ||
                recovery.queuedBytes + eventBytes > MAX_RECOVERY_QUEUED_BYTES
              ) {
                recovery.overflowed = true;
              } else {
                recovery.queuedEvents.push({
                  seq: message.seq,
                  event: recoveryEvent,
                  bytes: eventBytes,
                });
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
              const eventBytes = measuredRawBytes(raw.length);
              if (
                recovery.queuedEvents.length >= MAX_RECOVERY_QUEUED_EVENTS ||
                recovery.queuedBytes + eventBytes > MAX_RECOVERY_QUEUED_BYTES
              ) {
                recovery.overflowed = true;
              } else {
                recovery.queuedEvents.push({ seq: message.seq, event: forward, bytes: eventBytes });
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
            dispatchRemoteSupervisorEvent(projectRemoteThreadEvent(connectionKey, message.event));
          }
          if (shouldRefreshRemoteServerAfterEvent(message.event)) {
            // A membership-changing event schedules a bounded catalog pass in
            // addition to the snapshot refresh; a project event also schedules
            // the thread pass because the host cascades project deletes.
            const eventType =
              message.event && typeof message.event === "object"
                ? (message.event as { type?: unknown }).type
                : undefined;
            if (typeof eventType === "string") {
              noteBoundedCatalogMembershipEvent(connectionKey, eventType);
            }
            // Debounced so a burst of events yields one snapshot GET.
            get().scheduleServerRefresh(connectionKey, {
              includeAgentStatuses: shouldRefreshRemoteAgentStatusesAfterEvent(message.event),
            });
          }
          if (!queuedForRecovery) {
            // Applied-cursor rule (V5 2.1): the resume watermark advances
            // only after a frame is consumed — dispatched, replayed, or
            // filtered out — never on receipt. A dropped frame therefore
            // reconnects from the last applied seq and the server replays
            // exactly the missing range.
            bumpRemoteServerSnapshotSeq(connectionKey, message.seq);
          }
        }
        if (message.type === "resync-required") {
          // The server's in-memory event sequence restarts with the
          // process. Accept its lower cursor before the authoritative
          // snapshots advance it again, or every reconnect will ask
          // for an impossible pre-restart sequence forever.
          setRemoteServerSnapshotSeq(connectionKey, message.seq);
          // Pre-restart per-thread marks would refuse every fresh
          // (lower-seq) snapshot forever; re-baseline them too.
          clearRemoteThreadAppliedSeqs(connectionKey);
          // Old-epoch authoritative baselines and bounded reload
          // budgets are meaningless after a restart.
          resetTruncateRecoveryEpoch(connectionKey);
          markRemoteServerRowResyncPending(connectionKey);
          // A new event epoch invalidates every in-memory walk cursor.
          resetBoundedCatalogForResync(connectionKey);
          // ...and every bounded history proof from the old epoch.
          forgetBoundedHistoryForServer(connectionKey);
          get().scheduleServerRefresh(connectionKey);
          void ctx.recoverInterestedThreads();
        }
      } catch {
        // HTTP snapshots remain authoritative; ignore malformed frames.
      }
    };
    if (ctx.decodeInline) {
      // Platform capability: there is no Worker global at all, so the frame is
      // consumed inline at receive time exactly as the pre-A3 client did. A
      // worker that exists is never bypassed this way.
      try {
        dispatchParsed(
          client.parseSocketMessage(raw) as ReturnType<RemoteDesktopClient["parseSocketMessage"]>,
        );
      } catch {
        // HTTP snapshots remain authoritative; ignore malformed frames.
      }
      return;
    }
    void ctx
      .decodeFrame(raw)
      .then((result) => {
        if (!isCurrent() || entry.socket !== socket || !result.ok) return;
        dispatchParsed(result.message as ReturnType<RemoteDesktopClient["parseSocketMessage"]>);
      })
      .catch(() => {
        // Typed engine rejection (worker unavailable, lane overflow, timeout,
        // protocol mismatch): the frame is lost, so resync from the last
        // APPLIED seq. Bulk frames are never parsed on the UI thread here.
        if (!isCurrent() || entry.socket !== socket) return;
        noteClientDetectedLoss();
      });
  };

  return resumePendingTruncateReloads;
}

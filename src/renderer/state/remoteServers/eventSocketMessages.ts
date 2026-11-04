import { rememberHistoryContentOmissions } from "../historyDelivery";
import { handleAgentVisionServerMessage } from "@/renderer/browser/agentVisionStream";
import type { RemoteDesktopClient } from "@/shared/remote/client";
import { handleBrowserServerMessage } from "@/renderer/browser/browserMirror";
import { releaseRemoteTerminal, remoteTerminalOwner } from "@/renderer/remoteProcedureRouter";
import { HostEventDrain } from "@/renderer/hostTransport/hostEventDrain";
import { resetRemoteThreadProjection } from "@/renderer/state/remote/resetThreadProjection";
import {
  collectRuntimeEventsFromSupervisoryMessage,
  dispatchRemoteSupervisorEvent,
} from "@/renderer/state/remote";
import { useAppStore } from "@/renderer/state/appStore";
import { pruneLiveObservedCrossagentItems } from "@/renderer/state/slices/staleSubAgents";
import { projectRemoteThreadEvent, remoteThreadId } from "@/renderer/state/remoteProjection";
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
import { forgetBoundedHistoryForServer } from "./catalog/boundedHistoryRegistry";
import type { EventSocketConnectionContext } from "./eventSocketContext";
import {
  bumpRemoteServerSnapshotSeq,
  clearRemoteThreadAppliedSeqs,
  currentRemoteServerThreadItemInterests,
  recordRemoteThreadAppliedSeq,
  remoteServerSnapshotEpoch,
  remoteServerSnapshotSeq,
  setRemoteServerSnapshotSeq,
  supervisorEventThreadIds,
  remoteServerHostSession,
} from "./eventSocketRegistry";
import { forgetHistoryBaselines } from "@/renderer/state/historyBaselines";
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

export function bindEventSocketMessages(ctx: EventSocketConnectionContext): void {
  const { server, entry, socket, client, get, isCurrent, noteClientDetectedLoss, recovery } = ctx;
  const connectionKey = remoteConnectionKey(server);
  let socketSequenceFloor = ctx.resumeCursor;
  /** Epoch this socket's `ready` reported; undefined from hosts without one. */
  let socketEpoch: string | undefined;
  /** This socket's `ready` proved a restart under a bound cursor. */
  let socketEpochChanged = false;

  ctx.dispatchForwardEvent = (
    forward,
    sequence,
    recoveryReplay = false,
    omittedRuntimeThreadIds,
  ): void => {
    for (const threadId of supervisorEventThreadIds(forward)) {
      recordRemoteThreadAppliedSeq(connectionKey, threadId, sequence);
    }
    const projected = projectRemoteThreadEvent(connectionKey, forward);
    if (projected && typeof projected === "object" && omittedRuntimeThreadIds)
      rememberHistoryContentOmissions(
        projected,
        omittedRuntimeThreadIds.map((id) => remoteThreadId(connectionKey, id)),
      );
    dispatchRemoteSupervisorEvent(projected, {
      runtimeSequence: sequence,
      onGitSummaries: (summaries) => syncRemoteGitSummaries(connectionKey, summaries),
      onGitState: (patch) => syncRemoteGitStatePatch(connectionKey, patch),
      ...(recoveryReplay ? { deliverRuntimeEventsImmediately: true } : {}),
    });
  };

  /**
   * Re-baselines the stream at the server's head. The server's in-memory
   * event sequence restarts with the process: accept its cursor (bound to the
   * epoch this socket reported) before the authoritative snapshots advance it
   * again, or every reconnect will ask for an impossible pre-restart sequence
   * forever. `restart` also retires the old instance's live projections.
   */
  const applyResync = (seq: number, restart: boolean): void => {
    if (restart) {
      const prefix = remoteThreadId(connectionKey, "");
      pruneLiveObservedCrossagentItems((threadId) => threadId.startsWith(prefix));
      const threadIds = new Set(currentRemoteServerThreadItemInterests(connectionKey));
      const open = get().openThread;
      if (open?.desktopId === connectionKey) threadIds.add(open.threadId);
      for (const threadId of threadIds) {
        resetRemoteThreadProjection(remoteThreadId(connectionKey, threadId));
      }
    }
    socketEpochChanged = false;
    socketSequenceFloor = seq;
    setRemoteServerSnapshotSeq(connectionKey, seq, socketEpoch);
    // Pre-restart per-thread marks would refuse every fresh
    // (lower-seq) snapshot forever; re-baseline them too.
    clearRemoteThreadAppliedSeqs(connectionKey);
    // Old-epoch authoritative baselines are meaningless after a restart.
    forgetHistoryBaselines(remoteServerHostSession(connectionKey));
    markRemoteServerRowResyncPending(connectionKey);
    // A new event epoch invalidates every in-memory walk cursor.
    resetBoundedCatalogForResync(connectionKey);
    // ...and every bounded history proof from the old epoch.
    forgetBoundedHistoryForServer(connectionKey);
    get().scheduleServerRefresh(connectionKey);
    void ctx.recoverInterestedThreads();
  };

  /**
   * `ready` names the epoch of every later frame on this socket (absent from
   * hosts that predate `eventEpoch=v1`). A positive cursor from another or no
   * epoch is refused by the server with `resync-required`, which binds the new
   * epoch: binding here instead would let a lost resync frame leave an old
   * cursor looking current on the next reconnect.
   */
  const noteReady = (seq: number, epoch: string | undefined): void => {
    socketEpoch = epoch;
    const bound = remoteServerSnapshotEpoch(connectionKey);
    if (epoch === bound) return;
    if (bound !== undefined && epoch === undefined) {
      // An epoch-reporting host was replaced by an older build, which cannot
      // verify the cursor: re-baseline once from its head (the binding is
      // cleared, so this never repeats against that host).
      applyResync(seq, true);
      return;
    }
    socketEpochChanged = bound !== undefined;
    if (ctx.resumeCursor > 0) return;
    // A zero cursor verifies nothing: replay starts at this epoch's first
    // event, so bind now. A changed epoch still retires old projections.
    if (socketEpochChanged) applyResync(seq, true);
    else setRemoteServerSnapshotSeq(connectionKey, 0, epoch);
  };

  const dispatchParsed = (
    message: ReturnType<RemoteDesktopClient["parseSocketMessage"]>,
    rawBytes: number,
  ) => {
    try {
      if (message.type === "pong") {
        entry.health?.acceptPong(message.id);
        return;
      }
      if (message.type === "ready") {
        noteReady(message.seq, message.epoch);
        return;
      }
      if (handleAgentVisionServerMessage(connectionKey, message)) return;
      if (handleRemoteTerminalServerMessage(connectionKey, message)) {
        return;
      }
      if (getDesktopBrowserMirrorSocket() === socket && handleBrowserServerMessage(message)) {
        return;
      }
      if (message.type === "event") {
        if (message.omittedRuntimeThreadIds && message.event && typeof message.event === "object")
          rememberHistoryContentOmissions(
            message.event,
            message.omittedRuntimeThreadIds.map((id) => remoteThreadId(connectionKey, id)),
          );
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
        } else if (terminalId && isKnownRemoteTerminal && terminalEvent.type === "thread-exited") {
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
            const eventBytes = rawBytes;
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
                ...(message.omittedRuntimeThreadIds
                  ? { omittedRuntimeThreadIds: message.omittedRuntimeThreadIds }
                  : {}),
              });
              recovery.queuedBytes += eventBytes;
            }
            const liveBatches = batches.filter((batch) => !recovery.threadIds.has(batch.threadId));
            forward =
              liveBatches.length > 0
                ? { type: "thread-runtime-events-multi", batches: liveBatches }
                : null;
          } else if (
            supervisorEventThreadIds(forward).some((threadId) => recovery.threadIds.has(threadId))
          ) {
            queuedForRecovery = true;
            const eventBytes = rawBytes;
            if (
              recovery.queuedEvents.length >= MAX_RECOVERY_QUEUED_EVENTS ||
              recovery.queuedBytes + eventBytes > MAX_RECOVERY_QUEUED_BYTES
            ) {
              recovery.overflowed = true;
            } else {
              recovery.queuedEvents.push({
                seq: message.seq,
                event: forward,
                bytes: eventBytes,
                ...(message.omittedRuntimeThreadIds
                  ? { omittedRuntimeThreadIds: message.omittedRuntimeThreadIds }
                  : {}),
              });
              recovery.queuedBytes += eventBytes;
            }
            forward = null;
          }
        }
        if (forward !== null) {
          ctx.dispatchForwardEvent(forward, message.seq, false, message.omittedRuntimeThreadIds);
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
        socketSequenceFloor = Math.max(socketSequenceFloor, message.seq);
      }
      if (message.type === "resync-required") {
        // HTTP snapshots may already describe a later point on a live
        // host. Only this socket's cursor/frame history, or the epoch its
        // `ready` reported, proves a restart.
        applyResync(message.seq, socketEpochChanged || message.seq < socketSequenceFloor);
      }
    } catch {
      // HTTP snapshots remain authoritative; ignore malformed frames.
    }
  };
  const drain = new HostEventDrain({
    decode: {
      decodeFrame: (raw) =>
        ctx
          .decodeFrame(raw)
          .then((result) =>
            result.ok
              ? (result.message as ReturnType<RemoteDesktopClient["parseSocketMessage"]>)
              : null,
          ),
      renew: ctx.renewDecoder,
      dispose: ctx.renewDecoder,
    },
    onFrame: (message, bytes) => {
      if (isCurrent() && entry.socket === socket) dispatchParsed(message, bytes);
    },
    onUnavailable: () => {
      if (isCurrent() && entry.socket === socket) noteClientDetectedLoss();
    },
  });
  entry.disposeFrames = () => drain.dispose();
  socket.onmessage = (event) => {
    if (!isCurrent() || entry.socket !== socket) return;
    entry.health?.noteActivity();
    const raw = String(event.data);
    if (ctx.decodeInline) {
      // Platform capability: there is no Worker global at all, so the frame is
      // consumed inline at receive time exactly as the pre-A3 client did. A
      // worker that exists is never bypassed this way.
      try {
        dispatchParsed(
          client.parseSocketMessage(raw) as ReturnType<RemoteDesktopClient["parseSocketMessage"]>,
          raw.length * 2,
        );
      } catch {
        // HTTP snapshots remain authoritative; ignore malformed frames.
      }
      return;
    }
    drain.push(raw);
  };
}

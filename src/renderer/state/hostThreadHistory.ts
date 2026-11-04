import { msg } from "@lingui/core/macro";
import {
  REMOTE_BOUNDED_READ_DEFAULT_MAX_DECODE_BYTES,
  REMOTE_BOUNDED_READ_DEFAULT_MAX_WIRE_BYTES,
  RemoteClientError,
  type RemoteBoundedThreadHistoryPage,
  type RemoteDesktopClient,
} from "@/shared/remote/client";
import type { RemoteThreadSnapshot } from "@/shared/remote";
import { i18n } from "@/renderer/i18n/i18n";
import { applyThreadSnapshot } from "./remote";
import { noteRuntimeHistoryBaselines } from "./remote/sync";
import {
  historyBaselineCovers,
  noteHistoryBaseline,
  setHistoryIncorporationCheck,
} from "./historyBaselines";
import {
  isThreadHistoryRecoveryError,
  noteThreadHistoryRecoveryNeeded,
  recordThreadHistoryNoticeRead,
} from "./remote/historyNoticeStore";
import { hostSupportsRuntimeHistoryNoticesFor } from "./remote/historyNoticeCapability";
import { beginHistorySnapshotRead, readHistoryResume } from "./historyResumeRegistry";
import { installHistoryResume } from "./historyResumeInstall";
import { captureThreadFollowUpQueueSnapshot } from "./threadFollowUpQueueStore";
import { readWithHistoryRetries } from "./hostHistoryRead";
import { mergeBoundedTailTurns } from "./remoteServers/catalog/boundedHistory";
import {
  recordHistoryTail,
  forgetBoundedHistoryThreadByViewId,
  invokeRecordedRuntimeItemsPage,
} from "./remoteServers/catalog/boundedHistoryRegistry";
import {
  setHostOlderRuntimePageReader,
  setHostThreadHistoryReader,
  type HostThreadHistoryReadOutcome,
} from "./chatRuntimePersister";
import type { PersistedRuntimeItem } from "@/shared/ipc";
import { readBridge } from "../bridge";
import { setHostHistoryResumer } from "./remote/reducers/hostHistoryRecovery";
import { pendingRemoteThreadOpen } from "./remoteServers/pendingRemoteThreadOpens";
import { entityHost, type EntityHost } from "./entityHost";
import { beginHostHistoryPreview } from "./hostHistoryPreview";
import { isRuntimeHistoryReadHeld } from "./runtimeHistoryReadBarrier";
import { useAppStore } from "./appStore";
import { getThreadMap } from "./useThread";

// Paint the recent viewport first. Continuations keep their normal page size,
// and the host still completes any tool group crossing this initial boundary.
const INITIAL_HISTORY_TIMELINE_ENTRIES = 20;

/** A thread row, or the identity of one a host owns that is not in the store yet. */
export interface HostThreadEntity {
  readonly id: string;
  readonly remoteServerId?: string | undefined;
  readonly remoteId?: string | undefined;
}

export type HostThreadHistoryRead =
  | {
      readonly kind: "installed";
      /** The snapshot as the host served it, in the host's namespace. */
      readonly hostSnapshot: RemoteThreadSnapshot;
      /** The negotiated bounded page, absent from an older host's legacy read. */
      readonly boundedPage?: RemoteBoundedThreadHistoryPage;
      /** The snapshot replaced the transcript (it is the thread's new baseline). */
      readonly authoritative: boolean;
      /** The resident transcript is already newer than the snapshot. */
      readonly declinedForNewerLiveTail: boolean;
    }
  | Exclude<HostThreadHistoryReadOutcome, { readonly kind: "installed" }>;

export interface HostThreadHistoryOptions {
  readonly signal?: AbortSignal;
  /** A page the caller already read from the host (a resume that fell back to a snapshot). */
  readonly page?: RemoteBoundedThreadHistoryPage;
  /** Runs right before the install; returning false abandons it. */
  readonly beforeInstall?: () => boolean;
  /**
   * Reads through this connection's client instead of the host's current
   * one: a reconnect resync stays bound to the socket it recovers.
   */
  readonly client?: RemoteDesktopClient;
  /** The caller's own work is still current (a recovery bound to one epoch). */
  readonly isCurrent?: () => boolean;
}

function readHistoryPage(
  host: EntityHost,
  signal: AbortSignal | undefined,
  client: RemoteDesktopClient | undefined,
): Promise<Awaited<ReturnType<RemoteDesktopClient["boundedThreadHistory"]>>> {
  const options = {
    targetTimelineEntryCount: INITIAL_HISTORY_TIMELINE_ENTRIES,
    compactDetails: true,
    ...(host.omitsHistoryScrollback ? { omitScrollback: true as const } : {}),
    // Declared only when this connection advertised the durable notice: an
    // incapable reader would be refused on a notice thread.
    ...(hostSupportsRuntimeHistoryNoticesFor(host) ? { noticesCapable: true as const } : {}),
    maxBytes: REMOTE_BOUNDED_READ_DEFAULT_MAX_WIRE_BYTES,
    maxDecodeBytes: REMOTE_BOUNDED_READ_DEFAULT_MAX_DECODE_BYTES,
    ...(signal ? { signal } : {}),
  };
  return readWithHistoryRetries(
    () =>
      client
        ? client.boundedThreadHistory(host.hostId, options)
        : host.withClient((current) => current.boundedThreadHistory(host.hostId, options)),
    {
      signal,
      isCurrent: () => host.isCurrent(),
      onReplaced: (listener) => host.onReplaced(listener),
    },
  );
}

/**
 * Reads one thread's authoritative bounded history tail from the host that
 * owns it and installs it, whichever host that is. Every reader of a thread's
 * history uses it: a pane's hydration, a recovery after a reset, a navigation
 * and each background attach.
 *
 * Transient failures retry under the shared policy. A response from a
 * replaced connection is never applied, and an epoch change during the read
 * re-reads on the new one. An empty pane paints the cached tail and holds
 * live deltas until the baseline lands.
 */
export async function readHostThreadHistory(
  entity: HostThreadEntity,
  options: HostThreadHistoryOptions = {},
): Promise<HostThreadHistoryRead> {
  const { signal } = options;
  let page = options.page;
  for (;;) {
    const host = entityHost(entity);
    if (!host?.historyResumeAuthority || !host.authority) {
      const error = new Error(i18n._(msg`The thread's host is not connected.`));
      return { kind: "offline", error };
    }
    const viewThreadId = entity.id;
    const fence = host.session.resumeFence;
    const isConnectionCurrent = () => host.isCurrent() && host.session.resumeFence === fence;
    const resumeRead = beginHistorySnapshotRead(viewThreadId, host.historyResumeAuthority);
    const followUpQueueSnapshotGuard = captureThreadFollowUpQueueSnapshot(viewThreadId);
    const openRequestIdsAtReadStart = new Set(
      (useAppStore.getState().runtimeRequestsByThread[viewThreadId] ?? []).map(
        (request) => request.requestId,
      ),
    );
    const preview = beginHostHistoryPreview(host, viewThreadId, signal);
    let snapshot: RemoteThreadSnapshot;
    let boundedPage: RemoteBoundedThreadHistoryPage | undefined;
    try {
      if (page) {
        snapshot = page;
        boundedPage = page;
        page = undefined;
      } else {
        const result = await readHistoryPage(host, signal, options.client);
        snapshot = result.page;
        if (result.negotiation === "bounded") boundedPage = result.page;
      }
      // A buffered response can resolve despite transport cancellation.
      signal?.throwIfAborted();
    } catch (error) {
      resumeRead.cancel();
      preview.cancel();
      if (signal?.aborted || !host.isCurrent()) return { kind: "stale" };
      // The host's authoritative "no such thread": an unpersisted or removed
      // row has no transcript to lose.
      if (error instanceof RemoteClientError && error.status === 404)
        return { kind: "absent", error };
      // No answer from a host that is not connected: its connection reads
      // the threads panes retain once it is live. A refusal is an answer.
      const answered = error instanceof RemoteClientError && error.status > 0;
      if (!answered && !host.isConnected()) return { kind: "offline", error };
      // Only a typed gap refusal establishes a history recovery signal.
      if (hostSupportsRuntimeHistoryNoticesFor(host) && isThreadHistoryRecoveryError(error))
        noteThreadHistoryRecoveryNeeded(viewThreadId, host.authority);
      return { kind: "failed", error };
    }
    if (!host.isCurrent() || options.isCurrent?.() === false) {
      resumeRead.cancel();
      preview.cancel();
      return { kind: "stale" };
    }
    if (host.session.resumeFence !== fence) {
      // The history may come from a server instance the event stream has
      // since replaced: it must not raise that new epoch's resume cursor.
      resumeRead.cancel();
      preview.cancel();
      if (signal?.aborted) return { kind: "stale" };
      continue;
    }
    if (snapshot.thread.id !== host.hostId) {
      resumeRead.cancel();
      preview.cancel();
      return {
        kind: "failed",
        error: new Error("History response has a different thread identity."),
      };
    }
    try {
      // Only a snapshot from the current connection and epoch can update its notice.
      recordThreadHistoryNoticeRead(viewThreadId, host.authority, snapshot.runtimeNotice);
      // Retain the tail cursor and page proof so older turns and older items
      // continue on this connection.
      if (boundedPage)
        recordHistoryTail(viewThreadId, host.hostId, boundedPage, {
          authority: host.authority,
          isCurrent: isConnectionCurrent,
          withClient: (invoke) => host.withClient(invoke),
        });
      // A legacy read proves no continuation: a recorded one may predate a
      // truncation and must not append older rows to this baseline.
      else forgetBoundedHistoryThreadByViewId(viewThreadId);
      preview.retire();
      if (signal?.aborted || (options.beforeInstall && !options.beforeInstall()))
        return { kind: "stale" };
      const projected = host.projectSnapshot(snapshot);
      const applied = applyThreadSnapshot(mergeBoundedTailTurns(projected, viewThreadId), {
        fromServer: true,
        lastSeenEventSeq: host.session.threadSequence(host.hostId),
        followUpQueueSnapshotGuard,
        openRequestIdsAtReadStart,
        ...(options.beforeInstall !== undefined || isRuntimeHistoryReadHeld(viewThreadId)
          ? { runtimeFramesHeld: true }
          : {}),
        ...(signal ? { installingSignal: signal } : {}),
        ...(host.runsOnThisMachine ? { preserveCrossagentRows: true } : {}),
        ...(boundedPage
          ? {
              committedPrefix: {
                threadId: viewThreadId,
                snapshotSeq: boundedPage.snapshotSeq,
                isCurrent: isConnectionCurrent,
                lastSeenEventSeq: () => host.session.threadSequence(host.hostId),
              },
            }
          : {}),
      });
      if (applied.installedAuthoritativeHistory) {
        resumeRead.finish(snapshot.runtimeResumeCursor, snapshot.snapshotSeq);
        noteHistoryBaseline(host.session, viewThreadId, snapshot.snapshotSeq);
        // This baseline supersedes an earlier failed read or recovery: drop
        // the stale load warning and resume a queue that failure left blocked.
        noteRuntimeHistoryBaselines([viewThreadId]);
        preview.cacheAccepted(projected.runtimeItems);
      }
      host.session.advanceResume(snapshot.snapshotSeq, fence);
      preview.complete(snapshot.snapshotSeq);
      return {
        kind: "installed",
        hostSnapshot: snapshot,
        ...(boundedPage ? { boundedPage } : {}),
        authoritative: applied.installedAuthoritativeHistory,
        declinedForNewerLiveTail: applied.declinedForNewerLiveTail === true,
      };
    } finally {
      // Failed admission must not strand queued live frames behind a cold read.
      preview.cancel();
      resumeRead.cancel();
    }
  }
}

/** The live queue a recovery resumes into, as the reducer that owns it arbitrates it. */
export interface HostHistoryQueueArbitration {
  hasUnsequenced(viewThreadId: string): boolean;
  discardThroughSequence(viewThreadId: string, sequence: number, space: "loopback"): void;
}

export type HostThreadHistoryResume =
  /** Replayed the frames since the recorded cursor. */
  | { readonly kind: "applied"; readonly applied: boolean; readonly snapshotSeq: number }
  /** The host could not resume and served a fresh bounded tail instead. */
  | { readonly kind: "snapshot"; readonly page: RemoteBoundedThreadHistoryPage }
  /** The connection or recovery changed while the host answered. */
  | { readonly kind: "stale" };

/**
 * Resumes one thread's history from its recorded cursor on the host that
 * owns it, whichever host that is: the host replays only the frames this
 * client has not applied, or answers with a fresh tail. Null when the thread
 * has no resumable cursor on this connection (or its queue holds unsequenced
 * frames); the caller then re-reads the tail.
 */
export function resumeHostThreadHistory(
  entity: HostThreadEntity,
  options: {
    readonly arbitration: HostHistoryQueueArbitration;
    /** The caller's recovery is still the current one. */
    readonly isCurrent: () => boolean;
    /** The newest live sequence applied for the thread; defaults to the host session's. */
    readonly lastSeenEventSeq?: () => number | undefined;
    /** Resumes through this connection's client instead of the host's current one. */
    readonly client?: RemoteDesktopClient;
  },
): Promise<HostThreadHistoryResume | null> | null {
  const host = entityHost(getThreadMap(useAppStore.getState().threads).get(entity.id) ?? entity);
  const viewThreadId = entity.id;
  const authority = host?.historyResumeAuthority;
  const captured = authority ? readHistoryResume(viewThreadId, authority) : undefined;
  if (
    !host?.authority ||
    !authority ||
    !captured ||
    options.arbitration.hasUnsequenced(viewThreadId) ||
    useAppStore.getState().runtimeItemIdsByThread[viewThreadId] === undefined
  )
    return null;
  const noticeAuthority = host.authority;
  const fence = host.session.resumeFence;
  const followUpQueueSnapshotGuard = captureThreadFollowUpQueueSnapshot(viewThreadId);
  return (async (): Promise<HostThreadHistoryResume | null> => {
    const resumeOptions = { afterSeq: captured.appliedSeq };
    const result = await (options.client
      ? options.client.resumeThreadHistory(host.hostId, captured.cursor, resumeOptions)
      : host.withClient((client) =>
          client.resumeThreadHistory(host.hostId, captured.cursor, resumeOptions),
        ));
    if (!options.isCurrent() || !host.isCurrent() || host.session.resumeFence !== fence)
      return { kind: "stale" };
    if (result.kind === "snapshot") return { kind: "snapshot", page: result.snapshot };
    if (
      readHistoryResume(viewThreadId, authority) !== captured ||
      options.arbitration.hasUnsequenced(viewThreadId)
    )
      return null;
    const lastSeenEventSeq =
      options.lastSeenEventSeq?.() ?? host.session.threadSequence(host.hostId);
    const applied = installHistoryResume({
      threadId: viewThreadId,
      authority,
      noticeAuthority,
      captured,
      response: { ...result, thread: host.projectThread(result.thread) },
      ...(lastSeenEventSeq !== undefined ? { lastSeenEventSeq } : {}),
      discardThrough: (seq) =>
        options.arbitration.discardThroughSequence(viewThreadId, seq, "loopback"),
      projectEvents: (events) => host.projectRuntimeEvents(events),
      followUpQueueSnapshotGuard,
    });
    if (applied) noteHistoryBaseline(host.session, viewThreadId, result.snapshotSeq);
    host.session.advanceResume(result.snapshotSeq, fence);
    return { kind: "applied", applied, snapshotSeq: result.snapshotSeq };
  })();
}

/**
 * The pane hydration's reader. A navigation or background attach already
 * reading this thread serves the pane too; read again only when that one did
 * not install. A recovery (it clears the transcript first) always reads anew.
 */
setHostThreadHistoryReader((threadId, signal, request) => {
  const row = useAppStore.getState().threads.find((candidate) => candidate.id === threadId);
  if (!row || !entityHost(row)) return undefined;
  const read = (): Promise<HostThreadHistoryReadOutcome> =>
    readHostThreadHistory(row, {
      signal,
      ...(request.page ? { page: request.page } : {}),
      ...(request.beforeInstall ? { beforeInstall: request.beforeInstall } : {}),
    }).then((outcome) => (outcome.kind === "installed" ? { kind: "installed" } : outcome));
  const inFlight =
    request.beforeInstall || request.page ? undefined : pendingRemoteThreadOpen(threadId);
  if (!inFlight) return read();
  return inFlight.then((installed) => (installed ? { kind: "installed" } : read()));
});

/**
 * Older runtime-item pages of a host-owned thread continue its recorded tail
 * through the host that served it. A thread without a recorded tail on a host
 * on another machine falls back to the host's legacy page route: only a host
 * of an older version (necessarily on another machine) negotiates no bounded
 * tail. A host on this machine never falls back to an unbounded local read.
 */
setHostOlderRuntimePageReader((input) => {
  const row = useAppStore.getState().threads.find((candidate) => candidate.id === input.threadId);
  const host = row ? entityHost(row) : undefined;
  if (!host) return undefined;
  return invokeRecordedRuntimeItemsPage(input).then((page) => {
    input.signal?.throwIfAborted();
    if (page)
      return {
        items: host.projectRuntimeItems(page.items as PersistedRuntimeItem[]),
        nextCursor: page.nextCursor,
      };
    if (host.runsOnThisMachine) return undefined;
    const { signal: _signal, ...request } = input;
    return readBridge().dbGetThreadRuntimeItemsPage(request);
  });
});

/** The live reducer's recovery resumes each thread on the host that owns it. */
setHostHistoryResumer({
  resume: resumeHostThreadHistory,
  resumeAuthority: (threadId) =>
    entityHost(getThreadMap(useAppStore.getState().threads).get(threadId) ?? { id: threadId })
      ?.historyResumeAuthority,
});

/** A replayed destructive frame the thread's installed baseline already includes is dropped. */
setHistoryIncorporationCheck((threadId, sequence) => {
  const row = useAppStore.getState().threads.find((candidate) => candidate.id === threadId);
  const host = row ? entityHost(row) : undefined;
  return host ? historyBaselineCovers(host.session, threadId, sequence) : false;
});

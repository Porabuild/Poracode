import type { HistoryResumeResponse } from "@/shared/remote/historyResume";
import { applyThreadSnapshot } from "./remote/sync";
import { useAppStore } from "./appStore";
import { advanceHistoryResume, readHistoryResume } from "./historyResumeRegistry";
import {
  boundVisibleThreadRuntimeWindows,
  evictOversizedInactiveThreadRuntimeItems,
} from "./chatRuntimePersister";
import { recordThreadHistoryNoticeRead } from "./remote/historyNoticeStore";
import type { ThreadFollowUpQueueSnapshotGuard } from "./threadFollowUpQueueStore";
import type { RuntimeEvent } from "@/shared/contracts";
import { mergeBoundedTailTurns } from "./remoteServers/catalog/boundedHistory";
import { isBulkRuntimeContentEvent } from "@/shared/liveEventInterests";
import { notePendingThreadInputCanonicalEvents } from "./pendingThreadInput";

/** Replays only unapplied frames, retaining expanded older history and live controls. */
export function installHistoryResume(input: {
  readonly threadId: string;
  readonly authority: string;
  readonly noticeAuthority: string;
  readonly captured: NonNullable<ReturnType<typeof readHistoryResume>>;
  readonly response: Extract<HistoryResumeResponse, { kind: "events" }>;
  readonly discardThrough: (seq: number) => void;
  readonly projectEvents?: (events: RuntimeEvent[]) => RuntimeEvent[];
  /** Includes separately delivered thread metadata, beyond canonical runtime frames. */
  readonly lastSeenEventSeq?: number;
  readonly followUpQueueSnapshotGuard?: ThreadFollowUpQueueSnapshotGuard;
}): boolean {
  const { threadId, captured, response } = input;
  if (
    readHistoryResume(threadId, input.authority) !== captured ||
    useAppStore.getState().runtimeItemIdsByThread[threadId] === undefined
  )
    return false;
  const appliedBefore = captured.appliedSeq;
  for (const batch of response.batches) {
    notePendingThreadInputCanonicalEvents(threadId, batch.events);
    if (batch.seq <= appliedBefore) continue;
    const unapplied =
      batch.seq > captured.controlSeq
        ? batch.events
        : batch.events.filter(isBulkRuntimeContentEvent);
    if (unapplied.length > 0)
      useAppStore
        .getState()
        .applyRuntimeEvents(threadId, input.projectEvents?.(unapplied) ?? unapplied);
  }
  input.discardThrough(response.snapshotSeq);
  // A newer applied frame wins over metadata from the pinned HTTP prefix.
  const metadataSeq = Math.max(appliedBefore, input.lastSeenEventSeq ?? 0);
  if (metadataSeq <= response.snapshotSeq) {
    applyThreadSnapshot(
      mergeBoundedTailTurns(
        { ...response, runtimeItems: [], updatedAt: new Date().toISOString() },
        threadId,
      ),
      {
        fromServer: true,
        preserveRuntimeHistory: true,
        lastSeenEventSeq: metadataSeq,
        ...(input.followUpQueueSnapshotGuard
          ? { followUpQueueSnapshotGuard: input.followUpQueueSnapshotGuard }
          : {}),
      },
    );
  }
  recordThreadHistoryNoticeRead(threadId, input.noticeAuthority, response.runtimeNotice);
  const advanced = advanceHistoryResume(
    threadId,
    captured,
    response.runtimeResumeCursor,
    response.snapshotSeq,
  );
  evictOversizedInactiveThreadRuntimeItems([threadId]);
  boundVisibleThreadRuntimeWindows([threadId]);
  return advanced;
}

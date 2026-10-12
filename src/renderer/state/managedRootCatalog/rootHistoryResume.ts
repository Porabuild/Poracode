import { managedRootHistoryActivation } from "./rootHistory";
import { readHistoryResume } from "../historyResumeRegistry";
import { installHistoryResume } from "../historyResumeInstall";
import { useAppStore } from "../appStore";
import { captureThreadFollowUpQueueSnapshot } from "../threadFollowUpQueueStore";
import type { RuntimeQueueArbitration } from "../remote/reducers/supervisorEventReducer";

export function resumeManagedRootHistory(
  threadId: string,
  arbitration: RuntimeQueueArbitration,
  isCurrent: () => boolean,
  latestSequence: () => number | undefined,
) {
  const activation = managedRootHistoryActivation();
  const captured = activation && readHistoryResume(threadId, activation.authority);
  if (
    !activation ||
    !captured ||
    arbitration.hasUnsequenced(threadId) ||
    useAppStore.getState().runtimeItemIdsByThread[threadId] === undefined
  )
    return null;
  const followUpQueueSnapshotGuard = captureThreadFollowUpQueueSnapshot(threadId);
  return (async () => {
    const result = await activation.client.resumeThreadHistory(threadId, captured.cursor, {
      afterSeq: captured.appliedSeq,
    });
    if (!isCurrent() || managedRootHistoryActivation() !== activation)
      return { kind: "stale" } as const;
    if (result.kind === "snapshot") return result;
    if (
      readHistoryResume(threadId, activation.authority) !== captured ||
      arbitration.hasUnsequenced(threadId)
    )
      return null;
    return {
      kind: "applied",
      applied: installHistoryResume({
        threadId,
        authority: activation.authority,
        noticeAuthority: activation.authority,
        captured,
        response: result,
        ...(latestSequence() !== undefined ? { lastSeenEventSeq: latestSequence()! } : {}),
        discardThrough: (seq) => arbitration.discardThroughSequence(threadId, seq, "loopback"),
        followUpQueueSnapshotGuard,
      }),
    } as const;
  })();
}

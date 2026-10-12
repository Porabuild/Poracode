import {
  runtimeBatchAppliedSequences,
  runtimeBatchHasPartialFrame,
  runtimeBatchTranscriptComplete,
  type RuntimeEventQueueBatch,
} from "./runtimeEventQueue";
import { noteHistoryRuntimeApplied, historyTranscriptPrefix } from "./historyResumeRegistry";
import { readManagedLoopbackActivation } from "@/renderer/hostTransport/loopbackHttpWsTransport";
import {
  currentRemoteServerGeneration,
  getRemoteServerThreadItemInterests,
} from "./remoteServers/eventSocketRegistry";
import type { Thread, RuntimeEvent } from "@/shared/contracts";
import { isBulkRuntimeContentEvent } from "@/shared/liveEventInterests";
import { isRendererRuntimeInterestWireCovered } from "./rendererEventInterests";
import type { EventSequenceSpace } from "@/shared/eventSequenceSpace";
import { getThreadMap } from "./useThread";

export function remoteHistoryResumeAuthority(serverId: string): string {
  return `remote:${serverId}:${currentRemoteServerGeneration(serverId)}`;
}
export function hasHistoryTranscriptCoverage(
  threadId: string,
  threads: readonly Thread[],
): boolean {
  const owner = getThreadMap(threads).get(threadId);
  return owner?.remoteServerId
    ? !!owner.remoteId &&
        getRemoteServerThreadItemInterests(owner.remoteServerId)?.includes(owner.remoteId) === true
    : isRendererRuntimeInterestWireCovered(threadId);
}
export function appliedHistoryTranscriptSequence(
  threadId: string,
  threads: readonly Thread[],
): number | undefined {
  const owner = getThreadMap(threads).get(threadId);
  const authority = owner?.remoteServerId
    ? remoteHistoryResumeAuthority(owner.remoteServerId)
    : readManagedLoopbackActivation()?.authority;
  return authority ? historyTranscriptPrefix(threadId, authority) : undefined;
}
function noteAppliedSequence(
  threadId: string,
  threads: readonly Thread[],
  sequence: number | null,
  events: readonly RuntimeEvent[],
  transcriptComplete = true,
): void {
  const owner = getThreadMap(threads).get(threadId);
  const authority = owner?.remoteServerId
    ? remoteHistoryResumeAuthority(owner.remoteServerId)
    : readManagedLoopbackActivation()?.authority;
  if (authority)
    noteHistoryRuntimeApplied(threadId, authority, sequence, {
      completeTranscript: transcriptComplete && hasHistoryTranscriptCoverage(threadId, threads),
      containsBulk: events.some(isBulkRuntimeContentEvent),
    });
}

/** Recovery queue frames bypass cooperative draining, but still advance actual delivery. */
export function noteImmediatelyAppliedHistoryBatches(
  batches: readonly { readonly threadId: string; readonly events: readonly RuntimeEvent[] }[],
  threads: readonly Thread[],
  sequence: number | undefined,
  space: EventSequenceSpace,
  omittedRuntimeThreadIds?: ReadonlySet<string>,
): void {
  for (const batch of batches)
    noteAppliedSequence(
      batch.threadId,
      threads,
      space === "loopback" && sequence !== undefined ? sequence : null,
      batch.events,
      !omittedRuntimeThreadIds?.has(batch.threadId),
    );
}
export function noteAppliedHistoryBatches(
  batches: readonly RuntimeEventQueueBatch[],
  threads: readonly Thread[],
): void {
  for (const batch of batches) {
    const sequences = runtimeBatchAppliedSequences(batch);
    if (
      runtimeBatchHasPartialFrame(batch) ||
      sequences === null ||
      (sequences && sequences.ipc !== undefined)
    )
      noteAppliedSequence(
        batch.threadId,
        threads,
        null,
        batch.events,
        runtimeBatchTranscriptComplete(batch),
      );
    else if (sequences?.loopback !== undefined)
      noteAppliedSequence(
        batch.threadId,
        threads,
        sequences.loopback,
        batch.events,
        runtimeBatchTranscriptComplete(batch),
      );
  }
}

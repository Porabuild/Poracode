import {
  runtimeBatchAppliedSequences,
  runtimeBatchHasPartialFrame,
  runtimeBatchTranscriptComplete,
  type RuntimeEventQueueBatch,
} from "./runtimeEventQueue";
import { noteHistoryRuntimeApplied, historyTranscriptPrefix } from "./historyResumeRegistry";
import type { Thread, RuntimeEvent } from "@/shared/contracts";
import { isBulkRuntimeContentEvent } from "@/shared/liveEventInterests";
import { isRendererRuntimeInterestWireCovered } from "./rendererEventInterests";
import type { EventSequenceSpace } from "@/shared/eventSequenceSpace";
import { entityHost } from "./entityHost";
import { getThreadMap } from "./useThread";

/** The resume authority of the connection that delivers this thread's events. */
function historyResumeAuthority(threadId: string, threads: readonly Thread[]): string | undefined {
  return entityHost(getThreadMap(threads).get(threadId) ?? { id: threadId })
    ?.historyResumeAuthority;
}
export function appliedHistoryTranscriptSequence(
  threadId: string,
  threads: readonly Thread[],
): number | undefined {
  const authority = historyResumeAuthority(threadId, threads);
  return authority ? historyTranscriptPrefix(threadId, authority) : undefined;
}
function noteAppliedSequence(
  threadId: string,
  threads: readonly Thread[],
  sequence: number | null,
  events: readonly RuntimeEvent[],
  transcriptComplete = true,
): void {
  const authority = historyResumeAuthority(threadId, threads);
  if (authority)
    noteHistoryRuntimeApplied(threadId, authority, sequence, {
      completeTranscript: transcriptComplete && isRendererRuntimeInterestWireCovered(threadId),
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

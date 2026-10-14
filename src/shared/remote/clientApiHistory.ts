import { RemoteClientExperimentsApi } from "./clientApiExperiments";
import { HISTORY_DETAILS_PROJECTION, historyItemDetailSchema } from "./historyPresentation";
import { parseResponse } from "./clientParse";
import { REMOTE_BOUNDED_READ_DEFAULT_MAX_DECODE_BYTES } from "./clientBoundedReads";
import { historyResumeResponseSchema, historyResumeQuerySchema } from "./historyResume";

/** Capability-gated historical details; every body comes from canonical storage. */
export abstract class RemoteClientHistoryApi extends RemoteClientExperimentsApi {
  async resumeThreadHistory(
    threadId: string,
    cursor: string,
    options: { readonly afterSeq?: number; readonly signal?: AbortSignal } = {},
  ) {
    const query = historyResumeQuerySchema.parse({
      reads: "bounded-v1",
      notices: "v1",
      cursor,
      projection: HISTORY_DETAILS_PROJECTION,
      maxBytes: this.maxResponseBodyBytes,
      maxDecodeBytes: REMOTE_BOUNDED_READ_DEFAULT_MAX_DECODE_BYTES,
      ...(options.afterSeq !== undefined ? { afterSeq: options.afterSeq } : {}),
    });
    const search = new URLSearchParams(
      Object.entries(query).map(([key, value]) => [key, String(value)]),
    );
    const body = await this.requestJson(
      `/api/threads/${encodeURIComponent(threadId)}/history/changes?${search}`,
      options.signal ? { signal: options.signal } : {},
    );
    options.signal?.throwIfAborted();
    const result = parseResponse(historyResumeResponseSchema, body, "thread history resume");
    const owner = result.kind === "snapshot" ? result.snapshot.thread : result.thread;
    if (
      owner.id !== threadId ||
      (result.kind === "events" &&
        result.batches.some(
          (batch) =>
            batch.seq > result.snapshotSeq ||
            batch.events.some((event) => event.threadId !== threadId),
        ))
    )
      throw new Error("History resume response has a different thread or sequence identity.");
    if (
      result.kind === "events" &&
      result.batches.some((batch, index) => index > 0 && batch.seq < result.batches[index - 1]!.seq)
    )
      throw new Error("History resume response is out of sequence.");
    return result;
  }
  async threadHistoryItem(
    threadId: string,
    itemId: string,
    options: { readonly signal?: AbortSignal } = {},
  ) {
    const search = new URLSearchParams({
      notices: "v1",
      maxBytes: String(this.maxResponseBodyBytes),
      maxDecodeBytes: String(REMOTE_BOUNDED_READ_DEFAULT_MAX_DECODE_BYTES),
    });
    const body = await this.requestJson(
      `/api/threads/${encodeURIComponent(threadId)}/history/items/${encodeURIComponent(itemId)}?${search}`,
      options.signal ? { signal: options.signal } : {},
    );
    options.signal?.throwIfAborted();
    const result = parseResponse(historyItemDetailSchema, body, "history item details");
    if (result.item.id !== itemId)
      throw new Error("History detail response has a different item identity.");
    return result.item;
  }
}

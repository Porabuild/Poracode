import { RemoteClientExperimentsApi } from "./clientApiExperiments";
import {
  HISTORY_DEFER_FILE_CHANGE_BODIES,
  HISTORY_DETAILS_PROJECTION,
  historyItemDetailSchema,
  type HistoryItemDetail,
} from "./historyPresentation";
import { persistedPromptIndexSchema } from "../ipc/schemas";
import { parseResponse } from "./clientParse";
import { REMOTE_BOUNDED_READ_DEFAULT_MAX_DECODE_BYTES } from "./clientBoundedReads";
import { historyResumeResponseSchema, historyResumeQuerySchema } from "./historyResume";
import {
  conversationSearchPageSchema,
  conversationSearchQuerySchema,
  CONVERSATION_SEARCH_VERSION,
  type ConversationSearchQuery,
} from "../conversationSearch";

/** Capability-gated historical details; every body comes from canonical storage. */
export abstract class RemoteClientHistoryApi extends RemoteClientExperimentsApi {
  async searchConversations(
    input: Omit<ConversationSearchQuery, "version">,
    options: { signal?: AbortSignal } = {},
  ) {
    const descriptor = await this.environment();
    if (
      !descriptor.capabilities?.conversationSearch?.versions.includes(CONVERSATION_SEARCH_VERSION)
    )
      throw new Error("Conversation search is not supported by this host.");
    const query = conversationSearchQuerySchema.parse({
      ...input,
      version: String(CONVERSATION_SEARCH_VERSION),
    });
    const params = new URLSearchParams(
      Object.entries(query).map(([key, value]) => [key, String(value)]),
    );
    return parseResponse(
      conversationSearchPageSchema,
      await this.requestJson(
        `/api/search/conversations?${params}`,
        options.signal ? { signal: options.signal } : {},
      ),
      "conversation search",
    );
  }
  async resumeThreadHistory(
    threadId: string,
    cursor: string,
    options: {
      readonly afterSeq?: number;
      readonly targetTimelineEntryCount?: number;
      readonly omitScrollback?: boolean;
      readonly signal?: AbortSignal;
    } = {},
  ) {
    const query = historyResumeQuerySchema.parse({
      reads: "bounded-v1",
      notices: "v1",
      cursor,
      projection: HISTORY_DETAILS_PROJECTION,
      deferBodies: HISTORY_DEFER_FILE_CHANGE_BODIES,
      maxBytes: this.maxResponseBodyBytes,
      maxDecodeBytes: REMOTE_BOUNDED_READ_DEFAULT_MAX_DECODE_BYTES,
      ...(options.afterSeq !== undefined ? { afterSeq: options.afterSeq } : {}),
      ...(options.targetTimelineEntryCount !== undefined
        ? { targetTimelineEntryCount: options.targetTimelineEntryCount }
        : {}),
      ...(options.omitScrollback ? { omitScrollback: true } : {}),
    });
    const search = new URLSearchParams(
      Object.entries(query).map(([key, value]) => [
        key,
        typeof value === "boolean" ? (value ? "1" : "0") : String(value),
      ]),
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
  /**
   * The thread's newest prompts without its transcript. A host that predates
   * the route answers 404, which callers treat as "no index available".
   */
  async threadPromptIndex(threadId: string, options: { readonly signal?: AbortSignal } = {}) {
    const body = await this.requestJson(
      `/api/threads/${encodeURIComponent(threadId)}/history/prompts`,
      options.signal ? { signal: options.signal } : {},
    );
    return parseResponse(persistedPromptIndexSchema, body, "history prompt index");
  }
  /** Same authorized, byte-bounded, fenced detail read for both entry points. */
  private async readHistoryItemDetail(
    threadId: string,
    itemId: string,
    options: { readonly signal?: AbortSignal },
  ): Promise<HistoryItemDetail> {
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
    return result;
  }

  /** The stored row only. Preserved for every existing deferred-body caller. */
  async threadHistoryItem(
    threadId: string,
    itemId: string,
    options: { readonly signal?: AbortSignal } = {},
  ) {
    return (await this.readHistoryItemDetail(threadId, itemId, options)).item;
  }

  /**
   * Located item: the same authorized, fenced detail route, also returning the
   * host's canonical `position` when it provides one. An older host omits it;
   * callers then keep bounded paging. Lets a deep conversation match open with
   * one exact item + one item-centered bounded read instead of every older page.
   */
  async threadHistoryLocatedItem(
    threadId: string,
    itemId: string,
    options: { readonly signal?: AbortSignal } = {},
  ): Promise<HistoryItemDetail> {
    return this.readHistoryItemDetail(threadId, itemId, options);
  }
}

import { historyItemDetailSchema } from "@/shared/remote/historyPresentation";
import { dbGetThread } from "@/host/db/projectsThreads";
import { dbReadThreadHistoryItemMetadata } from "@/host/db/historyReads";
import { readRuntimeFence } from "@/host/db/runtimePersistenceRuntime";
import { RemoteHttpError } from "../auth";
import { measureCatalogBody, catalogSizesFit } from "./catalogPageBudget";
import { historyItemTooLarge } from "./historyReadBudget";
import {
  beginRuntimeFence,
  flushHistoryFenceOrThrow,
  mapHistoryPersistenceRefusal,
} from "./historyReadFence";
import { parseHistoryReadNegotiation } from "./historyReadNegotiation";
import { readRuntimeHistoryNoticeForRead } from "./runtimeHistoryNoticeGate";
import { readProjectedHistoryWindow } from "./historyWindow";
import { requirePathParam, type HttpRouteCall } from "./httpRouteHandlers.shared";
import { writeBoundedHistoryResponse } from "./historyReadHandlers";

/** Authenticated, fenced, byte-bounded access to the stored historical body. */
export async function handleHistoryItemDetails(call: HttpRouteCall): Promise<void> {
  await writeBoundedHistoryResponse(call, () => readHistoryItemDetails(call));
}

async function readHistoryItemDetails(call: HttpRouteCall): Promise<string> {
  const { ctx, url } = call;
  const threadId = requirePathParam(call.params, "threadId");
  const itemId = requirePathParam(call.params, "itemId");
  if (!dbGetThread(threadId))
    throw new RemoteHttpError("thread_not_found", "Thread not found.", 404);
  const negotiationUrl = new URL(url);
  negotiationUrl.searchParams.set("reads", "bounded-v1");
  const negotiation = parseHistoryReadNegotiation(negotiationUrl);
  const token = beginRuntimeFence(threadId);
  await flushHistoryFenceOrThrow(threadId, token);
  let body: string;
  try {
    body = readRuntimeFence(token, () => {
      readRuntimeHistoryNoticeForRead(ctx, threadId, negotiation.noticesDeclared);
      const metadata = dbReadThreadHistoryItemMetadata(threadId, itemId);
      if (!metadata)
        throw new RemoteHttpError("runtime_item_not_found", "History item not found.", 404);
      const item = readProjectedHistoryWindow(
        threadId,
        [metadata],
        negotiation.caps.maxWireBytes,
        negotiation.caps,
      ).projectedDesc[0]!;
      const encoded = JSON.stringify(historyItemDetailSchema.parse({ item }));
      const sizes = measureCatalogBody(encoded);
      if (!catalogSizesFit(sizes, negotiation.caps))
        throw historyItemTooLarge("runtime_item", itemId, sizes, negotiation.caps);
      return encoded;
    });
  } catch (error) {
    throw mapHistoryPersistenceRefusal(error);
  }
  return body;
}

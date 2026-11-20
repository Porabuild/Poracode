import { historyItemDetailSchema } from "@/shared/remote/historyPresentation";
import type { RemoteRuntimeHistoryNotice } from "@/shared/remote";
import { dbGetThread } from "@/host/db/projectsThreads";
import { dbReadThreadHistoryItemMetadata } from "@/host/db/historyReads";
import { readRuntimeFence } from "@/host/db/runtimePersistenceRuntime";
import { RemoteHttpError } from "../auth";
import {
  measureCatalogBody,
  catalogSizesFit,
  type CatalogEffectiveCaps,
} from "./catalogPageBudget";
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
  const { ctx, url } = call;
  const threadId = requirePathParam(call.params, "threadId");
  const itemId = requirePathParam(call.params, "itemId");
  const negotiationUrl = new URL(url);
  negotiationUrl.searchParams.set("reads", "bounded-v1");
  await writeBoundedHistoryResponse(call, async () => {
    const { caps, noticesDeclared } = parseHistoryReadNegotiation(negotiationUrl);
    const { body } = await readHistoryItemDetails({ threadId, itemId, caps }, () =>
      readRuntimeHistoryNoticeForRead(ctx, threadId, noticesDeclared),
    );
    return body;
  });
}

export async function readHistoryItemDetails(
  { threadId, itemId, caps }: { threadId: string; itemId: string; caps: CatalogEffectiveCaps },
  readNotice: () => RemoteRuntimeHistoryNotice | undefined,
): Promise<{ body: string; runtimeNotice: RemoteRuntimeHistoryNotice | undefined }> {
  if (!dbGetThread(threadId))
    throw new RemoteHttpError("thread_not_found", "Thread not found.", 404);
  const token = beginRuntimeFence(threadId);
  await flushHistoryFenceOrThrow(threadId, token);
  try {
    return readRuntimeFence(token, () => {
      const runtimeNotice = readNotice();
      const metadata = dbReadThreadHistoryItemMetadata(threadId, itemId);
      if (!metadata)
        throw new RemoteHttpError("runtime_item_not_found", "History item not found.", 404);
      const item = readProjectedHistoryWindow(threadId, [metadata], caps.maxWireBytes, caps)
        .projectedDesc[0]!;
      const encoded = JSON.stringify(historyItemDetailSchema.parse({ item }));
      const sizes = measureCatalogBody(encoded);
      if (!catalogSizesFit(sizes, caps))
        throw historyItemTooLarge("runtime_item", itemId, sizes, caps);
      return { body: encoded, runtimeNotice };
    });
  } catch (error) {
    throw mapHistoryPersistenceRefusal(error);
  }
}

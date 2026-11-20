import {
  presentRuntimeCommand,
  presentRuntimeMcpTool,
  presentRuntimeWorkflow,
  presentRuntimeWorkflowView,
  presentRuntimeToolBody,
} from "./runtimeItemPresentationProjection";
import { dbGetThread } from "@/host/db/projectsThreads";
import { dbReadRuntimePresentationSource } from "@/host/db/runtimePresentationReads";
import {
  runtimeItemPresentationRequestSchema,
  runtimeItemPresentationResponseSchema,
  type RuntimeItemPresentationEntry,
  type RuntimeToolPresentationEntry,
  type RuntimeWorkflowPresentationEntry,
  type RuntimeWorkflowViewEntry,
  type RuntimeToolBodyEntry,
} from "@/shared/contracts/runtimeItemPresentation";
import { RemoteHttpError } from "../auth";
import {
  beginRuntimeFence,
  flushHistoryFenceOrThrow,
  mapHistoryPersistenceRefusal,
} from "./historyReadFence";
import { readRuntimeFence } from "@/host/db/runtimePersistenceRuntime";
import { readRuntimeHistoryNoticeForRead } from "./runtimeHistoryNoticeGate";
import { parseHistoryReadNegotiation } from "./historyReadNegotiation";
import { measureCatalogBody, catalogSizesFit } from "./catalogPageBudget";
import { readJsonBody } from "./requestBody";
import { requirePathParam, type HttpRouteCall } from "./httpRouteHandlers.shared";
import { writeBoundedHistoryResponse } from "./historyReadHandlers";

const MAX_SOURCE_BYTES = 4 * 1024 * 1024;
const MAX_BATCH_SOURCE_BYTES = 16 * 1024 * 1024;

export async function handleRuntimeItemPresentations(call: HttpRouteCall): Promise<void> {
  const request = runtimeItemPresentationRequestSchema.parse(await readJsonBody(call.req));
  if (new Set(request.items.map((item) => item.itemId)).size !== request.items.length)
    throw new RemoteHttpError(
      "invalid_presentation_request",
      "Presentation item ids must be distinct.",
      400,
    );
  await writeBoundedHistoryResponse(call, async () => {
    const threadId = requirePathParam(call.params, "threadId");
    if (!dbGetThread(threadId))
      throw new RemoteHttpError("thread_not_found", "Thread not found.", 404);
    const url = new URL(call.url);
    url.searchParams.set("reads", "bounded-v1");
    const negotiation = parseHistoryReadNegotiation(url);
    if (!negotiation.noticesDeclared)
      throw new RemoteHttpError(
        "invalid_notices_capability",
        "Item presentations require notices=v1.",
        400,
      );
    const fence = beginRuntimeFence(threadId);
    await flushHistoryFenceOrThrow(threadId, fence);
    try {
      return readRuntimeFence(fence, () => {
        readRuntimeHistoryNoticeForRead(call.ctx, threadId, negotiation.noticesDeclared);
        let remaining = MAX_BATCH_SOURCE_BYTES;
        const items = request.items.map(
          ({
            itemId,
            inputDigest,
          }):
            | RuntimeItemPresentationEntry
            | RuntimeToolPresentationEntry
            | RuntimeWorkflowPresentationEntry
            | RuntimeWorkflowViewEntry
            | RuntimeToolBodyEntry => {
            const source = dbReadRuntimePresentationSource(
              threadId,
              itemId,
              Math.min(MAX_SOURCE_BYTES, remaining),
              request.version === 1
                ? ["command_execution"]
                : ["tool_call", "dynamic_tool_call", "mcp_tool_call"],
            );
            if (source.status === "unavailable") return { ...source, itemId };
            remaining -= source.sourceBytes;
            return (
              request.version === 1
                ? presentRuntimeCommand
                : request.version === 2
                  ? presentRuntimeMcpTool
                  : request.version === 3
                    ? presentRuntimeWorkflow
                    : request.version === 4
                      ? presentRuntimeWorkflowView
                      : presentRuntimeToolBody
            )(itemId, source.type, source.state, source.payload, inputDigest);
          },
        );
        const body = JSON.stringify(
          runtimeItemPresentationResponseSchema.parse({ version: request.version, items }),
        );
        if (!catalogSizesFit(measureCatalogBody(body), negotiation.caps))
          throw new RemoteHttpError(
            "presentation_too_large",
            "Presentation exceeds the negotiated response budget.",
            413,
          );
        return body;
      });
    } catch (error) {
      throw mapHistoryPersistenceRefusal(error);
    }
  });
}

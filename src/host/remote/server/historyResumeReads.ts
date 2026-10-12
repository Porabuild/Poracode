import {
  historyResumeQuerySchema,
  historyResumeResponseSchema,
} from "@/shared/remote/historyResume";
import { queryCodecsForRoute, decodeQueryValue } from "@/shared/remote/contract/queryCodecs";
import {
  HISTORY_ITEMS_SOFT_PACK_WIRE_BYTES,
  HISTORY_TURNS_SOFT_PACK_WIRE_BYTES,
  encodeCompletedTurnCursor,
} from "@/shared/remote/historyReadContract";
import { dbGetThread } from "@/host/db/projectsThreads";
import { runtimeHistoryRevision } from "@/host/db/runtimeHistoryRevision";
import { dbGetThreadContextUsage } from "@/host/db/runtimeItems";
import { dbReadCompletedTurnPhase1, dbReadCompletedTurnPhase2 } from "@/host/db/completedTurnPages";
import { readRuntimeFence } from "@/host/db/runtimePersistenceRuntime";
import {
  beginRuntimeFence,
  flushHistoryFenceOrThrow,
  mapHistoryPersistenceRefusal,
} from "./historyReadFence";
import { parseHistoryReadNegotiation } from "./historyReadNegotiation";
import { readRuntimeHistoryNoticeForRead } from "./runtimeHistoryNoticeGate";
import { buildBoundedThreadSnapshot } from "./historyReadBuilders";
import {
  packCompletedTurnsWithinSoftTarget,
  refuseOversizedCompletedTurn,
} from "./historyReadBudget";
import { catalogSizesFit, measureCatalogBody } from "./catalogPageBudget";
import { requirePathParam, type HttpRouteCall } from "./httpRouteHandlers.shared";
import { writeBoundedHistoryResponse } from "./historyReadHandlers";
import { RemoteHttpError } from "../auth";

/** One response: thread-local replay, or a normal-sized authoritative tail after expiry/reset. */
export async function handleThreadHistoryResume(call: HttpRouteCall): Promise<void> {
  await writeBoundedHistoryResponse(call, () => readThreadHistoryResume(call));
}

async function readThreadHistoryResume(call: HttpRouteCall): Promise<string> {
  const { ctx, url } = call;
  const threadId = requirePathParam(call.params, "threadId");
  const decoded: Record<string, unknown> = {};
  try {
    for (const codec of queryCodecsForRoute("thread-history-changes")) {
      const raw = url.searchParams.get(codec.name);
      if (raw !== null) decoded[codec.name] = decodeQueryValue(codec.kind, raw);
    }
  } catch {
    throw new RemoteHttpError("invalid_reads_request", "Invalid history resume query.", 400);
  }
  const parsed = historyResumeQuerySchema.safeParse(decoded);
  if (!parsed.success)
    throw new RemoteHttpError("invalid_reads_request", "Invalid history resume query.", 400);
  const negotiation = parseHistoryReadNegotiation(url);
  const fallback = async () => {
    // Reserve the additive wrapper inside the same negotiated hard budget.
    const snapshot = await buildBoundedThreadSnapshot(ctx, threadId, {
      ...negotiation,
      caps: {
        ...negotiation.caps,
        maxWireBytes: Math.max(1, negotiation.caps.maxWireBytes - 64),
        maxDecodeBytes: Math.max(1, negotiation.caps.maxDecodeBytes - 128),
      },
    });
    return `{"kind":"snapshot","snapshot":${snapshot.trim()}}`;
  };
  if (!dbGetThread(threadId))
    throw new RemoteHttpError("thread_not_found", "Thread not found.", 404);
  const token = beginRuntimeFence(threadId);
  const snapshotSeq = ctx.seq;
  const revision = runtimeHistoryRevision(threadId);
  const replay = ctx.threadHistoryReplay.read(
    threadId,
    parsed.data.cursor,
    snapshotSeq,
    parsed.data.afterSeq,
    revision,
  );
  await flushHistoryFenceOrThrow(threadId, token);
  let body: string | null;
  try {
    body = readRuntimeFence(token, () => {
      const runtimeNotice = readRuntimeHistoryNoticeForRead(ctx, threadId, true);
      if (
        runtimeNotice ||
        revision !== runtimeHistoryRevision(threadId) ||
        !replay ||
        !ctx.threadHistoryReplay.isCurrent(threadId, replay)
      )
        return null;
      const thread = dbGetThread(threadId);
      if (!thread) throw new RemoteHttpError("thread_not_found", "Thread not found.", 404);
      const phase1 = dbReadCompletedTurnPhase1(threadId, {
        limit: negotiation.completedTurnsLimit,
      });
      const packed = packCompletedTurnsWithinSoftTarget(
        phase1.rows,
        HISTORY_TURNS_SOFT_PACK_WIRE_BYTES,
      );
      refuseOversizedCompletedTurn(packed.packed[0], negotiation.caps);
      const turns = dbReadCompletedTurnPhase2(
        threadId,
        packed.packed.map((turn) => turn.idx),
      );
      const oldest = turns.at(-1);
      const completedTurnsNextCursor =
        (phase1.moreBeyondWindow || turns.length < phase1.rows.length) && oldest
          ? encodeCompletedTurnCursor(oldest.idx)
          : null;
      return JSON.stringify(
        historyResumeResponseSchema.parse({
          kind: "events",
          snapshotSeq,
          runtimeResumeCursor: replay.cursor,
          batches: replay.batches,
          thread: ctx.sessionConfigInventory.enrichThreadRow(thread),
          completedTurns: turns
            .reverse()
            .map(({ startedAt, endedAt, anchorItemId }) => ({ startedAt, endedAt, anchorItemId })),
          completedTurnsNextCursor,
          contextUsage: dbGetThreadContextUsage(threadId),
          backgroundTasks: [...(ctx.backgroundTasksByThread.get(threadId) ?? [])],
          followUpQueue: ctx.threadLiveReadState.queueFor(threadId) ?? null,
          ...(runtimeNotice ? { runtimeNotice } : {}),
        }),
      );
    });
  } catch (error) {
    throw mapHistoryPersistenceRefusal(error);
  }
  if (
    body === null ||
    Buffer.byteLength(body, "utf8") > HISTORY_ITEMS_SOFT_PACK_WIRE_BYTES ||
    !catalogSizesFit(measureCatalogBody(body), negotiation.caps)
  )
    return fallback();
  return body;
}

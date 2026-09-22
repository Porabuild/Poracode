import {
  CATALOG_READS_CAPABILITY,
  HistoryCursorError,
  decodeCompletedTurnCursor,
  historyItemTooLargeBodySchema,
} from "@/shared/remote/historyReadContract";
import {
  remoteRuntimeItemsPageRequestSchema,
  remoteTimelineEntryCountSchema,
} from "@/shared/remote";
import { RemoteHttpError } from "../auth";
import { writeNegotiatedJson } from "./httpCompression";
import { requirePathParam, type HttpRouteCall } from "./httpRouteHandlers.shared";
import { writeJson, writeNegotiatedJsonResponse } from "./httpResponses";
import {
  buildBoundedCompletedTurnPage,
  buildBoundedThreadHistoryItems,
  buildBoundedThreadSnapshot,
} from "./historyReadBuilders";
import { HistoryItemTooLargeError } from "./historyReadBudget";
import { mapHistoryPersistenceRefusal } from "./historyReadFence";
import {
  parseBeforePosition,
  parseHistoryReadNegotiation,
  parseItemsLimit,
  parseTargetTimelineEntryCount,
  parseTurnsLimit,
} from "./historyReadNegotiation";
import { readRuntimeHistoryNoticeForRead } from "./runtimeHistoryNoticeGate";
import { buildThreadRuntimeItemsPage, buildThreadSnapshot } from "./snapshots";

/**
 * B4 bounded history HTTP handlers (thread-history, thread-history-items,
 * thread-turns). C0/C1 wire these standalone handlers into the route table;
 * until then nothing advertises `reads=bounded-v1`. Each handler preserves the
 * legacy path byte-for-byte for undeclared clients by delegating to the
 * existing builders, and serves the bounded path only when the request echoes
 * `reads=bounded-v1`.
 */

async function writeBoundedHistoryResponse(
  call: HttpRouteCall,
  build: () => string | Promise<string>,
): Promise<void> {
  let body: string;
  try {
    body = await build();
  } catch (error) {
    if (error instanceof HistoryItemTooLargeError) {
      writeJson(call.res, 422, historyItemTooLargeBodySchema.parse(error.body));
      return;
    }
    if (error instanceof HistoryCursorError) {
      throw new RemoteHttpError("invalid_thread_cursor", error.message, 400);
    }
    throw mapHistoryPersistenceRefusal(error);
  }
  await writeNegotiatedJson(call.req, call.res, 200, body);
}

/** The undeclared (legacy) selection parameters of `thread-history`. */
export interface LegacyThreadHistoryOptions {
  readonly runtimePage: boolean;
  readonly omitScrollback?: boolean;
  readonly targetTimelineEntryCount?: number;
}

/**
 * Parses the undeclared (legacy) `thread-history` selection: `runtimePage=1`
 * pages the newest item tail, `omitScrollback=1` skips the stored transcript,
 * and `targetTimelineEntryCount` is schema-validated exactly like the legacy
 * handler always did (an invalid value is a 400 `invalid_request`). Shared by
 * the handler and the legacy bulk-read wrapper, which validates with this helper
 * before its reservation pre-check so invalid bounds stay the handler's 400
 * instead of being masked by a 503.
 */
export function parseLegacyThreadHistoryOptions(url: URL): LegacyThreadHistoryOptions {
  const targetTimelineEntryCount = url.searchParams.get("targetTimelineEntryCount");
  return {
    runtimePage: url.searchParams.get("runtimePage") === "1",
    ...(url.searchParams.get("omitScrollback") === "1" ? { omitScrollback: true } : {}),
    ...(targetTimelineEntryCount !== null
      ? {
          targetTimelineEntryCount: remoteTimelineEntryCountSchema.parse(
            Number(targetTimelineEntryCount),
          ),
        }
      : {}),
  };
}

/** Standalone handler for `thread-history` (wired by C0/C1). */
export async function handleBoundedThreadHistory(call: HttpRouteCall): Promise<void> {
  const { ctx, req, res, url } = call;
  const threadId = requirePathParam(call.params, "threadId");
  const negotiation = parseHistoryReadNegotiation(url);
  if (!negotiation.declared) {
    await writeNegotiatedJsonResponse(
      req,
      res,
      200,
      await buildThreadSnapshot(ctx, threadId, {
        ...parseLegacyThreadHistoryOptions(url),
        noticesDeclared: negotiation.noticesDeclared,
      }),
    );
    return;
  }
  const omitScrollback = url.searchParams.get("omitScrollback") === "1";
  const targetTimelineEntryCount = parseTargetTimelineEntryCount(
    url.searchParams.get("targetTimelineEntryCount"),
  );
  await writeBoundedHistoryResponse(call, () =>
    buildBoundedThreadSnapshot(ctx, threadId, negotiation, {
      ...(omitScrollback ? { omitScrollback } : {}),
      ...(targetTimelineEntryCount !== undefined ? { targetTimelineEntryCount } : {}),
    }),
  );
}

/** Standalone handler for `thread-history-items` (wired by C0/C1). */
export async function handleBoundedThreadHistoryItems(call: HttpRouteCall): Promise<void> {
  const { ctx, req, res, url } = call;
  const threadId = requirePathParam(call.params, "threadId");
  const negotiation = parseHistoryReadNegotiation(url);
  // B1: read + gate the durable notice synchronously before any await, so the
  // notice is never older than the page this response carries. The page's own
  // fenced read refuses a thread with an open (unacknowledged) gap.
  const runtimeNotice = readRuntimeHistoryNoticeForRead(ctx, threadId, negotiation.noticesDeclared);
  if (!negotiation.declared) {
    const beforePosition = url.searchParams.get("beforePosition");
    const targetTimelineEntryCount = url.searchParams.get("targetTimelineEntryCount");
    const input = remoteRuntimeItemsPageRequestSchema.parse({
      threadId,
      limit: Number(url.searchParams.get("limit")),
      ...(beforePosition !== null ? { beforePosition: Number(beforePosition) } : {}),
      ...(targetTimelineEntryCount !== null
        ? { targetTimelineEntryCount: Number(targetTimelineEntryCount) }
        : {}),
    });
    await writeNegotiatedJsonResponse(
      req,
      res,
      200,
      await buildThreadRuntimeItemsPage(input, {
        ...(runtimeNotice ? { runtimeNotice } : {}),
      }),
    );
    return;
  }
  const limit = parseItemsLimit(url);
  const beforePosition = parseBeforePosition(url.searchParams.get("beforePosition"));
  const targetTimelineEntryCount = parseTargetTimelineEntryCount(
    url.searchParams.get("targetTimelineEntryCount"),
  );
  await writeBoundedHistoryResponse(call, () =>
    buildBoundedThreadHistoryItems(
      {
        threadId,
        limit,
        ...(beforePosition !== undefined ? { beforePosition } : {}),
        ...(targetTimelineEntryCount !== undefined ? { targetTimelineEntryCount } : {}),
      },
      negotiation.caps,
      runtimeNotice,
    ),
  );
}

/** Standalone handler for the new `thread-turns` route (wired by C0/C1).
 * Only declared clients learn the route, so an undeclared request is a
 * protocol error exactly like `project-list`. */
export async function handleBoundedThreadTurns(call: HttpRouteCall): Promise<void> {
  const { ctx, res, url } = call;
  const threadId = requirePathParam(call.params, "threadId");
  const negotiation = parseHistoryReadNegotiation(url);
  if (!negotiation.declared) {
    throw new RemoteHttpError(
      "invalid_reads_capability",
      `thread-turns requires reads=${CATALOG_READS_CAPABILITY}.`,
      400,
    );
  }
  // B1: same declared-reader gate as the other transcript reads. The turns page
  // carries no notice field (hydration already received it); an incapable
  // reader is refused instead of paginating a thread it cannot reconcile.
  readRuntimeHistoryNoticeForRead(ctx, threadId, negotiation.noticesDeclared);
  const cursorRaw = url.searchParams.get("cursor");
  let cursorIdx: number | undefined;
  try {
    cursorIdx = cursorRaw !== null ? decodeCompletedTurnCursor(cursorRaw) : undefined;
  } catch (error) {
    if (error instanceof HistoryCursorError) {
      throw new RemoteHttpError("invalid_thread_cursor", error.message, 400);
    }
    throw error;
  }
  const limit = parseTurnsLimit(url, negotiation);
  let body: string;
  try {
    body = buildBoundedCompletedTurnPage({
      threadId,
      limit,
      caps: negotiation.caps,
      ...(cursorIdx !== undefined ? { cursorIdx } : {}),
    });
  } catch (error) {
    if (error instanceof HistoryItemTooLargeError) {
      writeJson(res, 422, historyItemTooLargeBodySchema.parse(error.body));
      return;
    }
    throw mapHistoryPersistenceRefusal(error);
  }
  await writeNegotiatedJson(call.req, call.res, 200, body);
}

import { readDatabaseAsync } from "@/host/db/asyncReads";
import {
  readBoundedHistorySnapshotData,
  readBoundedHistoryItems,
} from "./boundedHistoryDatabaseReads";
import {
  CATALOG_READS_CAPABILITY,
  HISTORY_TIMELINE_ENTRY_DEFAULT,
  encodeCompletedTurnCursor,
} from "@/shared/remote/historyReadContract";
import type { RemoteRuntimeHistoryNotice } from "@/shared/remote";
import { HISTORY_DETAILS_PROJECTION } from "@/shared/remote/historyPresentation";
import { dbGetThread } from "@/host/db/projectsThreads";
import { runtimeHistoryRevision } from "@/host/db/runtimeHistoryRevision";
import { readRuntimeFenceAsync } from "@/host/db/runtimePersistenceRuntime";
import { RemoteHttpError } from "../auth";
import {
  catalogSizesFit,
  measureCatalogBody,
  type CatalogEffectiveCaps,
} from "./catalogPageBudget";
import type { RemoteServerContext } from "./context";
import {
  historyEnvelopeTooLarge,
  historyItemTooLarge,
  maxFittingCount,
  trimHistoryPrefixToCaps,
} from "./historyReadBudget";
import {
  beginRuntimeFence,
  flushHistoryFenceOrThrow,
  mapHistoryPersistenceRefusal,
} from "./historyReadFence";
import type { HistoryReadNegotiation } from "./historyReadNegotiation";
import { boundedThreadSnapshotSchema } from "./historyReadSchemas";
import { projectRuntimeItemsImageRefs } from "./imageRefProjection";
import { readRuntimeHistoryNoticeForRead } from "./runtimeHistoryNoticeGate";
import { withStableUpdatedAt } from "./stableUpdatedAt";

/**
 * B4 bounded-history page builders. Each builder owns the fence lifecycle: the
 * intake prefix and `ctx.seq` are captured in the same synchronous turn before
 * the awaited flush, and phase 1 + phase 2 run inside the held fence. Bodies
 * are exact-measured against the negotiated caps before they are returned.
 */

export interface BoundedHistorySnapshotOptions {
  readonly omitScrollback?: boolean;
  readonly targetTimelineEntryCount?: number;
}

/**
 * Bounded `thread-history`: the same snapshot shape as the legacy route, but
 * the runtime tail and completed-turn tail are phase-1 packed, fetched by key,
 * and exact-measured against the negotiated caps. `runtimeNextCursor` remains
 * the oldest returned item position and `completedTurnsNextCursor` is the
 * `ct1.<idx>` of the oldest returned turn, so continuation is exact.
 */
export async function buildBoundedThreadSnapshot(
  ctx: RemoteServerContext,
  threadId: string,
  negotiation: HistoryReadNegotiation,
  options: BoundedHistorySnapshotOptions = {},
): Promise<string> {
  const initialThread = dbGetThread(threadId);
  if (!initialThread) {
    throw new RemoteHttpError("thread_not_found", "Thread not found.", 404);
  }
  const readsTerminal = initialThread.presentationMode !== "gui";
  // Asynchronous committed-prefix fence: pin the intake prefix and capture the
  // published cursor in the SAME synchronous turn, then commit the prefix in
  // chunks, then read phase 1 + phase 2 behind the held fence. Content is
  // exactly the published canonical domain at or below `snapshotSeq`.
  const fenceToken = beginRuntimeFence(threadId);
  const snapshotSeq = ctx.seq;
  const runtimeResumeCursor = ctx.threadHistoryReplay.cursor(
    threadId,
    snapshotSeq,
    runtimeHistoryRevision(threadId),
  );
  await flushHistoryFenceOrThrow(threadId, fenceToken);

  const caps = negotiation.caps;
  const targetTimelineEntryCount =
    options.targetTimelineEntryCount ?? HISTORY_TIMELINE_ENTRY_DEFAULT;

  let fenced;
  try {
    fenced = await readRuntimeFenceAsync(fenceToken, async () => {
      const runtimeNotice = readRuntimeHistoryNoticeForRead(
        ctx,
        threadId,
        negotiation.noticesDeclared,
      );
      const input = {
        compactDetails: negotiation.compactDetails === true,
        includeTerminalScrollback: readsTerminal && !options.omitScrollback,
        completedTurnsLimit: negotiation.completedTurnsLimit,
        targetTimelineEntryCount,
        caps,
      };
      const data = await readDatabaseAsync("boundedSnapshot", [threadId, input], () =>
        readBoundedHistorySnapshotData(threadId, input),
      );
      return { ...data, runtimeNotice };
    });
  } catch (error) {
    throw mapHistoryPersistenceRefusal(error);
  }

  // Stored history and latest host-projected controls are independent of
  // supervisor/agent readiness. Live terminal contents arrive through the
  // separately subscribed terminal watch; a cold snapshot uses its durable tail.
  const terminalScrollback = fenced.terminalScrollback || undefined;
  const backgroundTasks = [...(ctx.backgroundTasksByThread.get(threadId) ?? [])];
  const followUpQueue = readsTerminal ? null : ctx.threadLiveReadState.queueFor(threadId);

  const thread = dbGetThread(threadId);
  if (!thread) {
    throw new RemoteHttpError("thread_not_found", "Thread not found.", 404);
  }

  const projectedDesc = fenced.projectedDesc;
  const goalInPage =
    fenced.goal !== null && projectedDesc.some((item) => item.id === fenced.goal!.id);
  const projectedGoal =
    fenced.goal !== null && !goalInPage
      ? projectRuntimeItemsImageRefs(threadId, [fenced.goal])[0]!
      : null;
  const pageItemsAsc = [...projectedDesc].reverse();
  const itemCountAvailable = pageItemsAsc.length;
  const turnsAsc = [...fenced.turnsMeta].reverse();
  const turnsTotal = turnsAsc.length;

  const nextRuntimeCursor = (count: number): number | null => {
    const omitted = fenced.itemsOmitted || count < itemCountAvailable;
    if (!omitted) return null;
    if (count > 0) return fenced.keptMeta[count - 1]!.position;
    if (fenced.newestCandidatePosition !== undefined) return fenced.newestCandidatePosition + 1;
    return null;
  };
  const nextTurnsCursor = (count: number): string | null => {
    const omitted = fenced.turnsOmitted || count < turnsTotal;
    if (!omitted) return null;
    if (count > 0) return encodeCompletedTurnCursor(turnsAsc[turnsTotal - count]!.idx);
    if (turnsTotal > 0) return encodeCompletedTurnCursor(turnsAsc[turnsTotal - 1]!.idx + 1);
    return null;
  };
  const turnSlice = (count: number) =>
    turnsAsc
      .slice(turnsTotal - count)
      .map(({ startedAt, endedAt, anchorItemId }) => ({ startedAt, endedAt, anchorItemId }));

  const serialize = (itemCount: number, turnCount: number): string =>
    `${JSON.stringify(
      boundedThreadSnapshotSchema.parse(
        withStableUpdatedAt(`thread:${threadId}`, {
          snapshotSeq,
          runtimeResumeCursor,
          ...ctx.threadLiveReadState.projectSnapshotRuntime(
            ctx.sessionConfigInventory.enrichThreadRow(thread),
          ),
          reads: CATALOG_READS_CAPABILITY,
          ...(negotiation.compactDetails ? { historyProjection: HISTORY_DETAILS_PROJECTION } : {}),
          runtimeItems: projectedGoal
            ? [projectedGoal, ...pageItemsAsc.slice(itemCountAvailable - itemCount)]
            : pageItemsAsc.slice(itemCountAvailable - itemCount),
          runtimeNextCursor: nextRuntimeCursor(itemCount),
          completedTurns: turnSlice(turnCount),
          completedTurnsNextCursor: nextTurnsCursor(turnCount),
          contextUsage: fenced.contextUsage,
          backgroundTasks,
          ...(terminalScrollback ? { terminalScrollback } : {}),
          ...(followUpQueue !== undefined ? { followUpQueue } : {}),
          ...(fenced.runtimeNotice ? { runtimeNotice: fenced.runtimeNotice } : {}),
        }),
      ),
    )}\n`;

  const fits = (itemCount: number, turnCount: number): boolean =>
    catalogSizesFit(measureCatalogBody(serialize(itemCount, turnCount)), caps);
  const fullBody = serialize(itemCountAvailable, turnsTotal);
  if (catalogSizesFit(measureCatalogBody(fullBody), caps)) {
    return fullBody;
  }
  const emptySizes = measureCatalogBody(serialize(0, 0));
  if (!catalogSizesFit(emptySizes, caps)) {
    throw historyEnvelopeTooLarge(emptySizes, caps);
  }
  const trimmed = trimHistoryPrefixToCaps({
    rows: fenced.keptMeta,
    serialize: (count) => serialize(count, 0),
    caps,
  });
  if ("singleSizes" in trimmed) {
    if (itemCountAvailable > 0) {
      throw historyItemTooLarge(
        "runtime_item",
        fenced.keptMeta[0]!.itemId,
        trimmed.singleSizes,
        caps,
      );
    }
    if (turnsTotal > 0) {
      throw historyItemTooLarge(
        "turn",
        String(turnsAsc[turnsTotal - 1]!.idx),
        measureCatalogBody(serialize(0, 1)),
        caps,
      );
    }
    throw historyEnvelopeTooLarge(emptySizes, caps);
  }
  const maxTurns = maxFittingCount(0, turnsTotal, (count) => fits(trimmed.count, count)) ?? 0;
  return serialize(trimmed.count, maxTurns);
}

export interface BoundedHistoryItemsInput {
  readonly threadId: string;
  readonly beforePosition?: number;
  readonly limit: number;
  readonly targetTimelineEntryCount?: number;
}

/** Bounded `thread-history-items`: older items pages stay position-cursored and
 * gain the phase-1/phase-2 byte budget. `nextCursor` is the oldest returned
 * position; a byte cut moves it to the last included row, never a hole. The
 * caller reads + gates the durable notice synchronously (`notices=v1`) and
 * passes its wire projection here, so both paths of the route carry it. */
export async function buildBoundedThreadHistoryItems(
  input: BoundedHistoryItemsInput,
  caps: CatalogEffectiveCaps,
  runtimeNotice?: RemoteRuntimeHistoryNotice,
  compactDetails = false,
): Promise<string> {
  if (!dbGetThread(input.threadId)) {
    throw new RemoteHttpError("thread_not_found", "Thread not found.", 404);
  }
  const fenceToken = beginRuntimeFence(input.threadId);
  await flushHistoryFenceOrThrow(input.threadId, fenceToken);
  try {
    return await readRuntimeFenceAsync(fenceToken, () =>
      readDatabaseAsync("boundedItems", [input, caps, runtimeNotice, compactDetails], () =>
        readBoundedHistoryItems(input, caps, runtimeNotice, compactDetails),
      ),
    );
  } catch (error) {
    throw mapHistoryPersistenceRefusal(error);
  }
}

/**
 * Bounded `thread-turns`: older completed turns ascending by `idx` with the
 * exact next `ct1.` cursor. Turns without an `anchor_item_id` are included;
 * the cursor is exclusive (`idx < cursor`), so continuation has no holes.
 * Read committed-only like the other completed-turn projections.
 */
export { readBoundedCompletedTurnPage as buildBoundedCompletedTurnPage } from "./boundedHistoryDatabaseReads";
